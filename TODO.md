# TODO

## P0 — Web 稳定性

- [ ] Runner 单测覆盖：`buildAgentMessages` 悬空 tool_use 修复、`conversation-runner` 主流程、`title-generation` 幂等

## P1 — 生产可用性

### Sandbox 长驻进程

- [ ] Sandbox 接口加 `spawn()`：Process 句柄（pull 输出、isAlive、kill、wait、端口暴露）
- [ ] LocalSandbox 实现（直通 localhost）
- [ ] E2BSandbox 实现（background cmd + `getHost(port)` 公网 URL）
- [ ] 恢复 `start_server` 工具

### 中间件

- [ ] 悬空工具调用：中断恢复时未完成 tool_use 标记为 error

### 任务恢复

- [ ] **中断对话恢复**：用户重新打开存在 in_progress todo / 无 result 的 tool_use 的会话时，TodoListCard 已显示 `Interrupted` 标签（静态展示），需新增 "Resume" 按钮触发后端从最后一个未完成步骤继续 ReAct loop

### 前端体验

- [ ] Landing Page 重设计（居中 Hero / 动态 placeholder / 蓝色光晕）
- [ ] 动画 + Empty States（Dashboard 空对话列表、首次进入欢迎页等）
- [ ] ChatInput 边框科技感

## P2 — 增强

- [ ] Confirm 模式（工具审批流程）
- [ ] 多 LLM Provider（OpenAI / DeepSeek）
- [ ] Skills 功能（预置 + 用户自定义，注入 system prompt）
- [ ] Custom Rules（用户自定义 system prompt 规则）
- [ ] i18n 框架（消息组件文案 Thinking/Thought、文件 chip 等）

## P3 — 部署 & 求职

- [ ] Auth（Supabase Auth 登录）
- [ ] Railway 重新部署
- [ ] 域名绑定（Cloudflare）
- [ ] Demo 视频（2-3 分钟）
- [ ] README + 架构图
- [ ] 简历项目描述
- [ ] 面试准备
