# TODO

## P0 — Web 稳定性

- [ ] SSE 单端点化：POST /messages 直接流式返回，删 GET /stream + `event-bus.ts`；前端 `use-chat.ts` 换 fetch + ReadableStream
- [ ] Runner 切 `mode: "token"` 下发 partial；前端按 message id 替换渲染
- [ ] Runner 单测覆盖：`buildAgentMessages` 悬空 tool_use 修复、`conversation-runner` 主流程、`title-generation` 幂等

## P1 — 生产可用性

### Sandbox 长驻进程
- [ ] Sandbox 接口加 `spawn()`：Process 句柄（pull 输出、isAlive、kill、wait、端口暴露）
- [ ] LocalSandbox 实现（直通 localhost）
- [ ] E2BSandbox 实现（background cmd + `getHost(port)` 公网 URL）
- [ ] 恢复 `start_server` 工具

### 中间件
- [ ] 悬空工具调用：中断恢复时未完成 tool_use 标记为 error

### 前端
- [ ] **整体重构（配合 backend 路由 / SSE / API 信封改造）**
  - URL 全部单数化：`/conversation/*`、`/message/*`、`/snapshot/*`、`/attachment`、`/user/quota`、`/setting/*`
  - `chat-panel.tsx` 删 `EventSource` + GET `/stream`，改 fetch POST `/api/message/:id` 消费 ReadableStream
  - `apis/conversations.ts` 拆分到对应单数 router；`mcp-servers.ts` 适配 `serverId` 作为路径参数
  - 适配新响应信封 `{ statusCode, data, message }` / `{ statusCode, message, error }`
- [ ] Landing Page 重设计（居中 Hero / 动态 placeholder / 蓝色光晕）
- [ ] 动画 + Loading + Empty States
- [ ] ChatInput 边框科技感
- [ ] 可拖拽面板宽度（react-resizable-panels v4 兼容）

## P2 — 增强

- [ ] Confirm 模式（工具审批流程）
- [ ] 多 LLM Provider（OpenAI / DeepSeek）
- [ ] Skills 功能（预置 + 用户自定义，注入 system prompt）
- [ ] Custom Rules（用户自定义 system prompt 规则）

## P3 — 部署 & 求职

- [ ] Auth（Supabase Auth 登录）
- [ ] Railway 重新部署
- [ ] 域名绑定（Cloudflare）
- [ ] Demo 视频（2-3 分钟）
- [ ] README + 架构图
- [ ] 简历项目描述
- [ ] 面试准备
