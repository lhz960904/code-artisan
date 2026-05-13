# TODO

## P1

- [ ] 分享/开放功能 + dashboard 内容丰富
  - [ ] DB migration + share/unshare API + 顶栏 Share popover
  - [ ] Public DTO + public API + `/s/$slug` 路由骨架
  - [ ] workspace 组件加 `readOnly` 模式（消息/文件/预览适配，版本面板隐藏）
  - [ ] tool_use 默认折叠 + iframe 失败兜底 banner
  - [ ] 联调 + 真实分享自己项目验证（隐身窗口走完整流程）

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
