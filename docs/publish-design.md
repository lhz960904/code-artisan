# 发布与数据库集成设计方案

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
> 起始日期 2026-05-04（周一），完成日期 2026-05-10（周日）。

### Day 1 · 2026-05-04（Mon）· Vercel OAuth 通

**为什么先做 Vercel**：跑通"点按钮 → 拿到 URL"是整套方案的脊梁，先把它 derisk；Supabase 集成是增强项，可以晚两天上。

**任务**：
- [ ] 在 Vercel Dashboard 注册 OAuth integration，拿到 `client_id` / `client_secret`，配置 redirect URI
- [ ] backend：新增 `routes/integration.ts`，实现 `GET /api/integration/vercel/connect`（重定向到 Vercel）+ `GET /api/integration/vercel/callback`（换 token + 存 settings）
- [ ] backend：`services/integration/oauth-storage.ts` —— 加密读写 OAuth token（AES-GCM，密钥从 `INTEGRATION_SECRET_KEY` env 读）
- [ ] backend：`services/integration/vercel-client.ts` 骨架 —— 封装 `fetch` + 自动 refresh token
- [ ] frontend：设置页加"Integrations"区块，"Connect Vercel"按钮 + 已连接状态展示

**交付**：用户点 Connect Vercel，跳转授权，回来后设置页显示 "Connected to Vercel as <username>"。

---

### Day 2 · 2026-05-05（Tue）· 部署主链路 MVP

**任务**：
- [ ] DB migration：建 `deployments` 表 + 给 `conversations` 加两列
- [ ] `services/deploy-service/index.ts`：核心流程
  1. acquire sandbox（复用现有 `acquireConversationSandbox`）
  2. 拿 Vercel token，注入 sandbox env
  3. 检查 conversation 是否有 `vercel_project_id`，没有就调 Vercel API 创建 project + 落库
  4. sandbox 内跑 `pnpm install` + `vercel deploy --prod --token=$TOKEN --yes`（cwd = workspace root）
  5. 解析输出拿到 deploy URL，落 `deployments` 行 + 更新 `conversation.deployUrl`
- [ ] `routes/deployment.ts`：`POST /api/deployment/:conversationId` 触发 + `GET /api/deployment/:conversationId` 查列表

**交付**：拿一个手写的 Vite SPA 项目，curl 触发部署接口，能在终端看到完整流程跑通，最后返回一个能在浏览器打开的 `vercel.app` URL。

---

### Day 3 · 2026-05-06（Wed）· Publish UI + 流式进度

**任务**：
- [ ] backend：把 deploy-service 改成 async generator，`POST /api/deployment/...` 用 SSE 流式返回 `{ status, message }` 事件
- [ ] frontend：顶栏加"发布"按钮（参考 V0 截图）
- [ ] frontend：Publish popover 组件
  - Loading 状态条（building / uploading / live 三态）
  - 成功后展示 URL + 复制按钮 + "Open in Vercel" 跳链
  - 失败时展示 error_message + Retry
  - 已发布过的会话：默认展示最新 deployment URL + Re-deploy 按钮
- [ ] 前端 store：`useDeploymentStore`，订阅 SSE，更新状态

**交付**：能在 UI 上完整走"点发布 → 看进度 → 拿到链接 → 打开看到 app"的流程。

---

### Day 4 · 2026-05-07（Thu）· Supabase OAuth 通

**任务**（结构上是 Day 1 的复刻，可以大量复用代码）：
- [ ] 在 Supabase Dashboard 注册 OAuth app（Org Settings → OAuth Apps）
- [ ] backend：复用 `oauth-storage.ts`，加 supabase_oauth 这个 key 的读写
- [ ] backend：`integration.ts` 加 supabase 的 connect/callback 路由
- [ ] backend：`services/integration/supabase-client.ts` —— 封装 Management API 调用 + 自动 refresh
- [ ] frontend：设置页加"Connect Supabase"按钮 + 状态

**交付**：双授权状态都通；设置页能看到两边都连上了。

---

### Day 5 · 2026-05-08（Fri）· Supabase Agent 工具 + Sandbox 注入

**任务**：
- [ ] backend：`services/web-tools/supabase-create-project.ts` —— agent 工具，调 Management API 创建 project，落 `conversations.supabase_project_ref`，等 project provision 完成（通常 30-60s，要轮询 status）
- [ ] backend：`services/web-tools/supabase-sql.ts` —— agent 工具，用 service role key 跑 DDL/seed SQL
- [ ] backend：`acquireConversationSandbox` 修改 —— 启动 sandbox 时如果 conversation 已有 supabase_project_ref，注入 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 到 dev server env（通过 manifest 启动逻辑传）
- [ ] backend：把两个新工具注册到 `agent-turn.ts` 的工具列表
- [ ] backend prompts：`PROJECT_CONVENTIONS` 加 Supabase 章节，告诉 agent 何时该建 project / 怎么用 RLS
- [ ] 写一个新 skill `supabase-app`（或在 `hono-fullstack` 里加 Supabase 章节），教 agent 怎么用 Supabase Auth + RLS + Client SDK

**交付**：在 dev sandbox 里让 agent 造一个"带登录的 todo app"，验证它能自动开 project、建表、写 RLS、生成的 app 在 preview 里能注册账号 + 写数据，数据真的进了用户 Supabase。

---

### Day 6 · 2026-05-09（Sat）· Fullstack 部署 + Build-time 注入

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

### Day 7 · 2026-05-10（Sun）· 端到端测试 + 收尾

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

- [ ] Vercel：登录 Dashboard → Integrations → Create Integration（Type: Generic / Internal）
- [ ] Supabase：登录 Dashboard → 任一 Org → Org Settings → OAuth Apps → New Application
- [ ] 为本地开发准备一个稳定的 callback 域名（ngrok / dev.code-artisan.app / 自建反代）
- [ ] 生成 `INTEGRATION_SECRET_KEY`（32 字节随机），写入 backend `.env`
