# TODO

## Backend
- [ ] Agent stop API: `POST /conversations/:id/stop` — 外部信号终止 agent loop（当前 `stop()` 只断前端 SSE，后端 agent 继续运行）
- [ ] 后端 tool_use/tool_result 不匹配 bug — `toAnthropicMessages` 对 `state="call"` 的处理边界 case
- [ ] PostgreSQL `timeoutMs` 语法错误 — sandbox 相关 DB 操作

## Frontend
- [ ] Sidebar 独立组件（从 `__root.tsx` 提取，`useConversations` 移入）
- [ ] Step 6: 右侧面板组件（Preview 空状态 / FileTree lucide icons / Terminal 样式）
- [ ] Step 7: Landing Page 重设计（居中 Hero / 动态 placeholder / 蓝色光晕）
- [ ] Step 8: 动画 + Loading + Empty States
- [ ] ChatInput 边框科技感（待打磨）
- [ ] 可拖拽面板宽度（react-resizable-panels v4 兼容问题待解决）
