# 发布与数据库集成设计方案（7 天 → 8 天，含 Day 5.5）

> 让用户一键把对话里造出的 app 发布成可访问的真 URL，且支持持久化数据。
> **方案核心**：BYO（Bring-Your-Own）—— 用户授权自己的 Vercel 与 Supabase，code-artisan 通过 OAuth 调他们的 API 完成 provisioning + 部署。
> **目标**：0 三方账单 / 支持 fullstack（Hono server）/ 简历级架构叙事。

---

## 一、为什么这套方案

| 备选 | 致命问题 | 结论 |
|---|---|---|
| 静态自托管（Supabase Storage + Hono `/p/:slug/*`）| 不支持带 server 的 fullstack 项目，砍掉 `hono-fullstack` 默认 skill | ❌ |
| Cloudflare Workers + Static Assets | 需要把 Bun build target retarget 到 Workers，skill 要改造 | ❌ |
| 沙箱地址当分享链接 | E2B 生命周期 1h，撑不住分享语义 | ❌ |
| 用户只读分享（无运行时）| 访客看不到能跑的 app，作品集叙事弱 | ❌ |
| **BYO Vercel + BYO Supabase（OAuth）** | **首次 onboarding 双授权**（一次性成本，可接受）| ✅ |

收益：

- Vercel 原生支持 Hono（`@hono/vercel`），fullstack 部署不用 retarget
- Supabase 自带 RLS + Auth + Storage，前端直连即可
- 你 0 基础设施成本（除 E2B）
- 自定义域名 / Inspect / Analytics 全交给 Vercel 自家 dashboard
- 简历叙事："AI agent orchestrates dual OAuth integrations + auto-provisioning + fullstack 部署"

---

## 二、终态架构

```text
首次 onboarding（一次性）：
  Settings → Connect Supabase（OAuth）→ 存 access/refresh token
           → Connect Vercel（OAuth）  → 存 access/refresh token

每个会话/app：
  agent 写代码
    ├─ supabase_create_project 在 user's org 自动开 DB
    ├─ supabase_sql 建表 + RLS policy
    └─ 代码用 import.meta.env.VITE_SUPABASE_* 读 keys

点 Publish：
  build in sandbox
    └─ vercel deploy --token=$VERCEL_TOKEN
       ├─ 注入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
       └─ Hono server 走 @hono/vercel adapter
  → 落 deployments 行 + 更新 conversation.deployUrl
  → 返回 https://<project>.vercel.app
```

---

## 三、关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| Vercel 部署调用方式 | **sandbox 内跑 `vercel deploy --token`** | 比 REST 上传文件简单 10 倍；`vercel` CLI 是官方工具，最稳；token 通过 env 注入 sandbox 即可 |
| Supabase project 粒度 | **每个 conversation 一个 project** | 真隔离；fork 时给 forker 重新开 project 干净。Free 限 2 active project，UI 上要清晰展示配额 + 提供 pause 旧 project 的入口 |
| Token 存储 | `settings` 表加密 JSONB | 复用现有 KV 表；`access_token` + `refresh_token` + `expires_at`；落盘前 AES-GCM 加密，密钥从 env 读 |
| Hono 部署形态 | `api/index.ts` + `vercel.json` | `@hono/vercel` adapter 标准做法；skill 模板里加这两个文件，dev 模式 (`vite` + `@hono/vite-dev-server`) 完全不受影响 |
| 静态项目部署 | 同一条 `vercel deploy` 链路 | Vercel 自动检测 Vite，无 `api/` 目录就当纯静态发，不用分两条管线 |

---

## 四、数据模型

```sql
-- 现有 conversations 表加列
ALTER TABLE conversations
  ADD COLUMN supabase_project_ref text,    -- 用户 Supabase 里这个会话对应的 project ref
  ADD COLUMN vercel_project_id    text;    -- 用户 Vercel 里对应的 project id
-- 已有 deploy_url 沿用

-- 新表
deployments
  id                uuid PK
  conversation_id   uuid FK
  version_id        uuid FK NULL          -- 关联到 versions 表（已存在），记录这次发的是哪一版
  status            text                  -- 'pending' | 'building' | 'uploading' | 'live' | 'failed'
  public_url        text NULL
  vercel_deploy_id  text NULL             -- Vercel 那边的 deployment id（拉日志用）
  error_message     text NULL
  created_at        timestamptz

-- settings 表已有，加两个 key：
--   "supabase_oauth": { access_token, refresh_token, expires_at, org_id }
--   "vercel_oauth":   { access_token, refresh_token, expires_at, team_id }
-- 整个 value 字段加密落盘
```

---

## 五、7 天落地计划

> 每天交付一个**可独立验证的里程碑**，不会出现"做到一半啥都看不见"的状态。
> 起始日期 2026-05-04（周一），完成日期 2026-05-12（周二，含 Day 5.5 的 1 天插入）。

### Day 1 · 2026-05-05（Tue · 实际起手日）· Vercel OAuth 通 ✅

**为什么先做 Vercel**：跑通"点按钮 → 拿到 URL"是整套方案的脊梁，先把它 derisk；Supabase 集成是增强项，可以晚两天上。

**任务**：
- [x] 在 Vercel Dashboard 注册 OAuth integration，拿到 `client_id` / `client_secret` / **URL Slug**，配置 redirect URI（用 `:3000` 前端口，Vite 代理转 `:3001` 后端）
- [x] backend：`routes/integration.ts` —— `GET/DELETE /vercel`（状态/解绑）+ `GET /vercel/connect`（302 + state cookie）+ `GET /vercel/callback`（state 校验 + code 交换 + identity + 存）
- [x] backend：`services/integration/{crypto,oauth-storage}.ts` —— AES-GCM-256 加密层 + KV 读写（5 个 round-trip 单测全过）
- [x] backend：`services/integration/vercel-client.ts` —— install URL builder（用 URL Slug 不是 client_id）+ token 交换 + identity fetch
- [x] frontend：设置页加 Integrations section + Vercel 卡片 + popup 流（`window.open` + BroadcastChannel + `/oauth/return` 桥接页 + 关不掉时 Close 按钮兜底）

**交付**：✅ 用户点 Connect Vercel → popup 弹出 → Vercel 授权 → popup 显示成功页自动关 → 设置页卡片即时切到 "Connected to lihaozecq's projects (team)"。整链路 e2e 验证。

**实际差异**：
- 原计划 Day 1 = 5/4，**实际今日（5/5）才起手**——后续每日顺延 1 天
- 后端 `vercel-client.ts` 没做 refresh token 逻辑（Vercel integration token 是长寿的，没 expires_in）
- 401 失效检测延后到 Day 2（届时有真 API 调用才触发得到）

---

### Day 2 · 2026-05-05（Tue · 与 Day 1 同日完成）· 部署主链路 MVP ✅

**任务**：
- [x] DB schema：`conversations` 加 `vercel_project_id` + `supabase_project_ref` 两列；新建 `deployments` 表（id / conversation_id / version_id / status enum / public_url / vercel_deploy_id / error_message / created_at）
- [x] `services/deploy-service/index.ts`：完整流程 —— acquire sandbox → 检查/创建 Vercel project（自动 + 落库 `vercel_project_id`）→ 写 `.vercel/project.json`（projectId + orgId）→ `bun install` if no node_modules → `npx vercel@latest deploy --prod --yes --token` → 正则 parse `*.vercel.app` URL → 落 `deployments` 行 + 更新 `conversation.deployUrl`
- [x] `services/integration/vercel-client.ts`：加 `createVercelProject` / `getVercelProject` / `VercelTokenInvalidError` + 401/403 自动清理 token + `VercelNotConnectedError`
- [x] `routes/deployment.ts`：`POST /:conversationId`（触发部署）+ `GET /:conversationId`（查列表，按 createdAt desc）

**交付**：✅ curl POST 触发部署，**53 秒一次过**，返回真实 `https://code-artisan-c21b3e7f77d2.vercel.app`，对应 Vercel 账号下真创建了 project + 跑了 production deploy。

**已知差异（Day 6 修）**：当前 fullstack（`hono-fullstack` skill 的）项目部署后页面渲染错的是 server bundle 而非 SPA HTML —— 因为 `package.json` build 脚本同时产 `dist/index.html` 和 `dist/index.js`。Vercel auto-detect 框架后路由错乱。Day 6 用 `@hono/vercel` adapter + `vercel.json` 修。

---

### Day 3 · 2026-05-05（Tue · 三日同日完成）· Publish UI + 流式进度 ✅

**任务**：
- [x] backend：`deployConversation` 改成 `AsyncGenerator<DeployEvent, void>`，事件类型 status / log / done / error；POST 用 `streamSSE` 推送（heartbeat 15s 防超时）
- [x] shared：把 `Deployment` / `DeployEvent` / `DeploymentStatus` / `DeployErrorCode` 提到 `@code-artisan/shared/types.ts`，前后端 single source of truth；backend `toWire(row)` 把 drizzle Row → wire shape（Date → ISO，status narrow）
- [x] frontend：`stores/deploy.ts` —— Zustand store per-conversation 隔离状态机（idle / running / success / failed），SSE 流式消费 + 自动 invalidate list 查询
- [x] frontend：`components/workspace/publish-popover.tsx` —— 6 状态机覆盖
  - loading / not-connected（"Connect Vercel"大按钮 → popup OAuth）
  - first-deploy（"Deploy"按钮）
  - running（4 步骤实时✓→⟳→○：Preparing / Building / Deploying / Live）
  - deployed（URL chip + Copy / Open / Re-deploy 三连按钮）
  - failed-generic（错误信息 + Dismiss / Retry）
  - **failed-auth**（401/403 不弹通用错，直接换"Reconnect Vercel"大按钮）
- [x] frontend：BroadcastChannel 监听 → 重授权后自动 reset error，用户一键回到 Deploy 状态
- [x] frontend：Header 加 `<PublishPopover />` —— `Publish ●`（绿点 = 已部署）/ `Publishing ⟳`（流式中）

**交付**：✅ 完整 UI 闭环 —— 点 Publish → popover 实时进度 → ~50s 后变绿 chip + URL + Copy/Open/Re-deploy。authorization 失效路径也跑过：Disconnect 后再点 Publish 自动引导 Reconnect → 一键重授权 → 立刻可重试 deploy，无需进 Settings。

---

### Day 4 · 2026-05-07（Thu）· Supabase OAuth 通 ✅

**任务**（结构上是 Day 1 的复刻，可以大量复用代码）：
- [x] 在 Supabase Dashboard 注册 OAuth app（任一 Org → Org Settings → OAuth Apps → New Application）；Redirect URL 填 `http://localhost:3000/api/integration/supabase/callback`
- [x] backend：复用 `oauth-storage.ts`（`SETTINGS_KEY_SUPABASE_OAUTH` 已就位）+ `crypto.ts` 加密层
- [x] backend：`integration.ts` 加 `/supabase` `/supabase/connect` `/supabase/callback` `DELETE /supabase` 四个路由
- [x] backend：`services/integration/supabase-client.ts` —— OAuth 2.0 code 交换 + **refresh token 续期**（access_token 1h 过期；`getValidSupabaseAccessToken` 提前 60s 自动 refresh，refresh 失败 → 清 token + 抛 `SupabaseTokenInvalidError`）+ `fetchSupabaseIdentity` 取 `/v1/organizations` 第一个 org 落 identity
- [x] backend：env.ts 加 4 个 var（`SUPABASE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI/SCOPE`）+ `.env.example` 同步
- [x] frontend：`api/queries/integrations.ts` + `api/mutations/integrations.ts` 加 `supabaseIntegrationOptions` / `useDisconnectSupabase`
- [x] frontend：设置页 `SupabaseIntegrationCard` 从 dashed 占位升级成真卡片（Connect / Disconnect / 显示 org 名）；`useIntegrationCallbackBus` + `ReturnFlash` 改成 provider-aware（vercel/supabase 共用同一条 BroadcastChannel + `/oauth/return` 桥接页）

**交付**：✅ 用户点 Connect Supabase → popup → 选 org 授权 → popup 自动关 + 设置页卡片切到 "Connected to <org name>"。Token 落进 `settings` KV（AES-GCM 加密），1h access_token + refresh_token，`getValidSupabaseAccessToken(userId)` 是后续所有 Management API 调用的入口。

**与 Day 1 的差异点**：
- Supabase 走标准 OAuth 2.0 code flow（带 `expires_in` + `refresh_token`），不是 Vercel 那种 install-url + 长寿 token；refresh 链路在 `getValidSupabaseAccessToken` 里
- Authorization URL 是 `https://api.supabase.com/v1/oauth/authorize`，不需要 integration slug
- Identity = OAuth 授权时选定的那个 org（一个 OAuth 安装绑定一个 org，跟 Vercel 的 team 概念类似）

---

### Day 5 · 2026-05-08（Fri）· Supabase Agent 工具 + Sandbox 注入

**任务**：
- [ ] backend：`services/integration/supabase-client.ts` 扩展 Management API helpers ——
  - `createSupabaseProject({ userId, name, region, orgId? })`：POST `/v1/projects` + 轮询 `GET /v1/projects/{ref}` 直到 `status === 'ACTIVE_HEALTHY'`（30-60s，超 90s 报错），返回 `{ ref, url }`
  - `getSupabaseProjectKeys({ userId, projectRef })`：GET `/v1/projects/{ref}/api-keys`，返回 `{ anonKey, serviceRoleKey }`
  - `runSupabaseSql({ userId, projectRef, query })`：POST `/v1/projects/{ref}/database/query` + OAuth Bearer，返回 rows。**不需要 service-role key**——OAuth scope 含 Database(RW) 就够
- [ ] DB schema：`conversations` 加 `supabase_url` + `supabase_anon_key` 两列（落在 row 上，sandbox 冷启动注入 env 时不用回查 Management API）
- [ ] backend：`services/web-tools/supabase-create-project.ts` —— agent 工具，调上述 helper；落 `supabase_project_ref` + `supabase_url` + `supabase_anon_key`；幂等（已有 ref 直接返回）；建完后 kill 当前 dev session，下一次轮询/expose 会触发 bootstrap，新 `.env.local` 被新一轮 Vite 读到
- [ ] backend：`services/web-tools/supabase-sql.ts` —— agent 工具，调 `runSupabaseSql`；conversation 无 ref 时拒绝并提示 agent 先建 project
- [ ] backend：`acquireConversationSandbox` 修改 —— 启动 sandbox 时如果 conversation 有 `supabase_url` + `supabase_anon_key`，幂等写 `${workspaceRoot}/.env.local`（含 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`），再走 `maybeBootstrapDevServer`
- [ ] backend：把两个新工具注册到 `agent-turn.ts` 的 tools 数组（闭包传 `userId` + `conversationId`）
- [ ] backend prompts：`PROJECT_CONVENTIONS` 加 Supabase 章节——何时调 `supabase_create_project` / 用 `import.meta.env.VITE_SUPABASE_*` 而非自己写 `.env.local` / 默认开 RLS + `auth.uid()` policy / 不要尝试 expose service-role key

**交付**：在 dev sandbox 里让 agent 造一个"带登录的 todo app"，验证：
- 自动调 `supabase_create_project` 开 project，60s 内 ready
- `supabase_sql` 建 `todos` 表 + RLS policy（owner = `auth.uid()`）
- 生成的 app 在 preview 里能注册账号 + CRUD todo，数据真的进了用户的 Supabase Project

---

### Day 5.5 · 2026-05-09（Sat）· Database 面板（CRUD Table Editor）

**为什么单列一天**：Day 5 完成后每个 conversation 都对应真实 Supabase project；workspace 右栏 Database tab 直接做成 Studio Table Editor 的 lite 版，让用户在 code-artisan 里就能查 / 改 / 删数据，不用跳 supabase.com。简历叙事更闭环。

**任务**：
- [ ] backend：`routes/database.ts` —— 把 Management API SQL 端点封装成稳定的内部 API：
  - `GET /:conversationId/tables`：列 `public` schema 所有表
  - `GET /:conversationId/tables/:name/columns`：introspect 列定义（走 `information_schema.columns`）
  - `GET /:conversationId/tables/:name/rows?limit&offset&order`：分页读
  - `POST /:conversationId/tables/:name/rows`：insert
  - `PATCH /:conversationId/tables/:name/rows/:pk`：update
  - `DELETE /:conversationId/tables/:name/rows/:pk`：delete
  - 全部内部用 `runSupabaseSql` 跑参数化 SQL；conversation 无 ref → 404 + 友好提示
- [ ] frontend：workspace 右栏 Database tab 实装——表列表 sidebar + 选中后 grid（inline edit / add / delete）+ 列头显示类型 / nullable + Empty state（"This conversation has no Supabase project yet"）
- [ ] frontend：tab 头加 "Open in Supabase" 跳链兜底（跳到 supabase.com 该 project console）

**交付**：选中一个有 todos 表的 conversation，Database tab 看见 rows、改一行、加一行、删一行，全部走 OAuth Bearer，无服务端 service-role key。

---

### Day 6 · 2026-05-10（Sun）· Fullstack 部署 + Build-time 注入

**任务**：
- [ ] 修改 `hono-fullstack` skill 模板：
  - 加 `api/index.ts`：`import { handle } from '@hono/vercel'; import app from '../server'; export const GET = handle(app); export const POST = handle(app); ...`
  - 加 `vercel.json`：rewrites 把 `/api/*` 路由到 `api/index.ts`
  - `package.json` 加 `@hono/vercel` 依赖
  - 验证 dev 模式（`vite` + `@hono/vite-dev-server`）完全不受影响
- [ ] deploy-service：build 前给 sandbox 写 `.env.production`，包含 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`（从 `conversations.supabase_project_ref` 查出）；Vercel CLI 自动把 `.env.production` 用作 build env
- [ ] 在 deploy-service 里检测项目类型：
  - 有 `api/` 或 `server/` 目录 → fullstack 部署
  - 无 → 静态部署
  - 两条都走同一条 `vercel deploy` 命令，区别只在 build 检查上

**交付**：在 dev 里造一个 fullstack todo app（前端 + Hono `/api/todos` + Supabase 持久化），点发布，访客打开能注册、能 CRUD、Hono API 工作正常。**这是整个项目的 magic moment**。

---

### Day 7 · 2026-05-11/12（Mon/Tue）· 端到端测试 + 收尾

**任务**：
- [ ] 端到端跑通至少 3 类项目的完整流程：
  - 纯静态 landing page
  - SPA + Supabase Auth + RLS
  - Fullstack（Hono `/api` + Supabase）
- [ ] 错误路径处理：
  - Vercel token 过期（refresh 失败）→ UI 提示重新连接
  - Supabase project 配额满 → UI 展示已用 project 列表 + pause 入口
  - Build 失败 → 把 `vercel deploy` 的 stderr 完整透传到 UI
- [ ] 前端：dashboard 页加 deployments 列表（每个 conversation 显示最近一次 deployment + URL + 状态）
- [ ] README + screenshots 更新（这是简历重点）
- [ ] TODO.md 把"部署能力"和"DB 能力"两条标完成

**交付**：录一段完整的 demo 视频（造 app → 发布 → 访客可用），更新 README，准备好放进简历。

---

## 六、风险与开放问题

| 项 | 内容 | 处置 |
|---|---|---|
| Vercel OAuth 注册要绑回调域名 | 本地开发要 ngrok 或自己接 dev redirect 域名 | Day 1 优先解决；可以在生产域名里专门留 `/api/integration/*/callback` |
| Supabase project 创建是异步的（30-60s）| Day 5 的 agent 工具要轮询；agent UI 上要有友好的"正在 provision"提示 | `supabase_create_project` 工具内部 poll，对外是同步语义；超过 90s 报错 |
| Vercel Hobby plan 限商用 | 用户作品集 demo 合规；商用要他们自己升 Pro | 设置页加一行小字说明，不做强制 |
| Supabase Free 限 2 active project | 用户多玩几个 demo 就要 pause 旧的 | Day 7 dashboard 显示配额 + pause 入口 |
| OAuth secret 加密密钥 (`INTEGRATION_SECRET_KEY`) 怎么管 | 生产环境从 Railway env 读；本地 dev `.env` | Day 1 落地时一并写文档 |
| 部署期间 sandbox 是否被其他事件抢占 | deploy-service 跑 `vercel deploy` 期间，agent 不应该接受新轮次 | conversation 加 `deployingAt` 字段，UI 期间禁用输入；或复用 `agentRunning` 同样的锁机制 |
| Fork 能力是否进 V1 | 双 OAuth 都通后，fork 实现成本中等（给 forker 重新开 project + 复制代码）| **不进 V1**，标到 P2；本周聚焦发布主链路 |

---

## 七、不在范围内（明确砍掉）

- **自定义域名管理**：用户自己去 Vercel 挂，UI 上提供"Open in Vercel"跳链就够
- **Inspect / Analytics 自建**：跳 Vercel dashboard
- **Fork to my workspace**：V2
- **多人协作 / 团队**：V2+
- **付费 plan / 配额计费**：当前是开发者工具，无商业化打算

---

## 八、依赖追踪

外部账号侧需要 Haoze 提前完成（与 Day 1 并行）：

- [x] Vercel：登录 Dashboard → Integrations → Create Integration（Connectable Account · Community badge）
- [ ] Supabase：登录 Dashboard → 任一 Org → Org Settings → OAuth Apps → New Application；Redirect URL 填 `http://localhost:3000/api/integration/supabase/callback`，scope 选 `all`，client_id/secret 填进 backend `.env` 的 `SUPABASE_OAUTH_*`（Day 4 代码已就绪，等这步）
- [x] ~~为本地开发准备一个稳定的 callback 域名~~ —— 直接用 `localhost:3000`，Vercel 文档明确允许；prod 需要时再建第二个 integration
- [x] 生成 `INTEGRATION_SECRET_KEY`（32 字节随机），写入 backend `.env`

**Prod 部署待办**（Railway env vars）：当前 `.env` 里的 4 个 Vercel 相关 var 只在 local 配了。Railway prod 上没设，所以推上去 prod 的 IntegrationsSection 卡片点 Connect 会回 `status=not-configured`。Day 7 上线前需要：
- 在 Vercel form 改 Redirect URL 到 prod 域名（或建第二个 integration）
- 在 Railway env vars 里补齐 `INTEGRATION_SECRET_KEY` / `VERCEL_OAUTH_*` / `VERCEL_INTEGRATION_SLUG`
