# TODO

## P1

- [ ] 部署能力(集成 Vercel)
- [ ] 分享/开放功能 + dashboard 内容丰富
- [ ] 版本控制
- [ ] DB 能力(集成 Supabase?)
- [ ] i18n 框架（消息组件文案 Thinking/Thought、文件 chip 等）
- [ ] Custom Rules（用户自定义 system prompt 规则, Agents.md）

## P3

- [ ] Vite 编译错误自动捕获（监听 vite-error-overlay → 走错误徽章流程）
- [ ] 中间件 悬空工具调用：中断恢复时未完成 tool_use 标记为 error
- [ ] 刷新页面后 Resume 流数据
- [ ] Plan 模式
- [ ] Sub Agent 功能、后台任务
- [ ] 增加用户 Confirm 操作
- [ ] 记忆系统

## Done

- [x] Dev server 自动启动：基于 `.code-artisan/manifest.json` 在沙箱 cold-start / 新会话首轮 / WS 自愈三条路径触发，端口探活后自动 expose preview，preview 出现时自动切到 preview 面板