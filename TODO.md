# TODO

## P1

- [ ] 部署能力(集成 Vercel) —— Day 1-3 主链路通；详见 `docs/publish-design.md`
  - [x] OAuth + AES-GCM token 存储 + Settings UI（Day 1）
  - [x] Vercel project 自动创建 + `vercel deploy` SSE 流式 + Publish popover（Day 2-3）
  - [ ] Fullstack 项目部署内容正确（`@hono/vercel` adapter，Day 6）
  - [ ] Prod Railway env vars + Vercel form redirect URL 切到 prod 域名（Day 7）
- [ ] 分享/开放功能 + dashboard 内容丰富
- [x] 版本控制（preview / restore / chip / banner 全链路；事件化 restore + active chain AI 上下文裁剪）
- [ ] DB 能力(集成 Supabase?) —— Day 4-5 做，详见 `docs/publish-design.md`
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
