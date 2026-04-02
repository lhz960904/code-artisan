# TODO

## Backend
- [x] Agent stop API: `POST /conversations/:id/stop` — 外部信号终止 agent loop
- [x] 后端 tool_use/tool_result 不匹配 bug — `toAnthropicMessages` 对 `state="call"` 的处理边界 case
- [x] SQL injection fix — `updatePart` 参数化查询
- [ ] PostgreSQL `timeoutMs` 语法错误 — sandbox 相关 DB 操作

## Frontend
- [x] Sidebar 独立组件（从 `__root.tsx` 提取，`useConversations` 移入）
- [x] Step 6: 右侧面板组件（Preview 空状态 / FileTree lucide icons / Terminal 样式）
- [x] Fix: tool call 流式阶段显示 undefined（tool-input-end 未解析 input + label fallback）
- [ ] Step 7: Landing Page 重设计（居中 Hero / 动态 placeholder / 蓝色光晕）
- [ ] Step 8: 动画 + Loading + Empty States
- [ ] ChatInput 边框科技感（待打磨）
- [ ] 可拖拽面板宽度（react-resizable-panels v4 兼容问题待解决）

## Features Backlog
- [x] 附件支持（用户上传图片/文件给 Agent）— 待创建 Supabase `attachments` bucket
- [ ] Tools 补充（web_search）
- [ ] MCP 支持（通用 MCP Client + 配置页面，优先集成 context7）
- [ ] Skills 功能（预置 + 用户自定义，注入 system prompt）
- [ ] TODO 功能（项目内 TODO 管理）
- [ ] Custom Rules（用户自定义 system prompt 规则）
- [ ] DB 集成（项目内持久化 + 管理面板，类似 bolt.new/v0）
