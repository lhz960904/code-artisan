# TODO

## P1

- [ ] 部署能力(集成 Vercel) —— Day 1-6 已通；详见 `docs/publish-design.md`
  - [x] OAuth + AES-GCM token 存储 + Settings UI（Day 1）
  - [x] Vercel project 自动创建 + `vercel deploy` SSE 流式 + Publish popover（Day 2-3）
  - [x] Fullstack 项目部署：`@hono/vercel` adapter + vercel.json + Supabase env 自动同步到 Vercel project（Day 6）
  - [ ] E2E 手测：frontend-starter / frontend-starter+Supabase / hono-fullstack 三条路径都能 deploy 出可用 URL
  - [ ] Prod 部署 onboarding：Railway env vars 补齐 + Vercel/Supabase OAuth Redirect URL 切到 prod 域名（Day 7）
- [ ] 分享/开放功能 + dashboard 内容丰富
- [x] 版本控制（preview / restore / chip / banner 全链路；事件化 restore + active chain AI 上下文裁剪）
- [x] DB 能力（Supabase BYO OAuth + `supabase_create_project` / `supabase_sql` agent tools + sandbox `.env.local` 注入 + `supabase` skill；scope hardcoded `all`，autoconfirm 自动开）—— Day 4-5
- [x] DB 面板（3 态：未连 OAuth / 未 provision project / 正常；左 sidebar 表列表 + 主区 TanStack Table 列宽拖拽 + 翻页 + 手动刷新）—— Day 5.5
- [ ] `supabase_create_project` 加 health check：当 conversation 的 `supabaseProjectRef` 已存在但项目被用户在 Supabase Dashboard 手动删了（410/REMOVED），清掉字段并重建，避免 stale ref 导致 deploy 后 CORS 假象
- [ ] i18n 框架（消息组件文案 Thinking/Thought、文件 chip 等）
- [ ] Custom Rules（用户自定义 system prompt 规则, Agents.md）

## P2

- [ ] 版本控制性能优化：fileSnapshots 重写移出事务异步做（砍 ~500ms tx 时间）；调研废弃 fileSnapshots 表改用 versions JOIN 拉 manifest（架构改动）
- [ ] 版本控制 GC：blob ref_count 清理（数据小时 YAGNI；累到一定量再做）
- [ ] 版本 label rename UI
- [ ] 版本 timeline / 分支可视化（多次 restore 后看清主线和废弃分支）

## P3

- [ ] Vite 编译错误自动捕获（监听 vite-error-overlay → 走错误徽章流程）
- [ ] 中间件 悬空工具调用：中断恢复时未完成 tool_use 标记为 error
- [ ] 刷新页面后 Resume 流数据
- [ ] Plan 模式
- [ ] Sub Agent 功能、后台任务
- [ ] 增加用户 Confirm 操作
- [ ] 记忆系统
