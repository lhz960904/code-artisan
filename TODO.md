# TODO

## P0 — 核心功能（Agent-in-Sandbox + Server 迁移）

### Agent SDK — ToolContext 改造
- [x] `ToolContext` 类型（signal）
- [x] `invoke(input, context: ToolContext)` 签名统一
- [x] 所有内置工具 + 测试适配新签名
- [x] Agent 构建 ToolContext 传递给工具

### Agent Runner（sandbox 内 HTTP server）
- [x] 设计通信协议（invoke → SSE 流式返回 AssistantMessage / ToolMessage）
- [x] 实现 agent-runner HTTP server（POST /invoke, POST /stop, GET /health）
- [x] mtime 文件扫描（invoke 结束后扫描变更文件，批量返回）
- [ ] E2B sandbox 镜像（预装 bun + agent 包）
- [ ] Server 端 sandbox 生命周期管理（创建/复用/重建）
- [ ] 对话历史恢复（sandbox 重建后传入 history）

### Server 迁移（Backend → Agent SDK）
- [ ] Server 变薄：转发用户消息到 sandbox /invoke
- [ ] 收流式事件 → 写 DB + 转发 SSE 给前端
- [ ] 适配 abort（通知 sandbox 停止）
- [ ] 文件快照（mtime 扫描返回的 files 写入 DB）
- [ ] 删除 `backend/src/agent/` 自建 agent 实现
- [ ] 端到端验证

## P1 — 生产可用性

### Sandbox 长驻进程支持
- [ ] Sandbox 接口新增 `spawn()`：启动长驻进程，返回 Process 句柄（pull-based 输出读取、isAlive、kill、wait、端口暴露）
- [ ] LocalSandbox 实现（本地端口直通 localhost）
- [ ] E2BSandbox 实现（利用 E2B background cmd + getHost(port) 生成公网 URL）
- [ ] 恢复 `start_server` 工具（backend 独有，依赖 `spawn` + `getPortUrl`），当前 backend 迁移期间暂时搁置

### 中间件
- [ ] 上下文压缩 — MicroCompact（裁剪旧 tool output）+ AutoCompact（LLM 摘要压缩）
- [ ] 循环检测 — 哈希滑动窗口，重复 tool call 警告/停止
- [ ] 悬空工具调用 — 中断恢复，未完成 tool call 标记为 error
- [ ] MCP 集成 — 动态加载外部 MCP 服务器工具

### 前端
- [ ] Step 7: Landing Page 重设计（居中 Hero / 动态 placeholder / 蓝色光晕）
- [ ] Step 8: 动画 + Loading + Empty States
- [ ] ChatInput 边框科技感
- [ ] 可拖拽面板宽度（react-resizable-panels v4 兼容问题）

## P2 — 增强功能

- [ ] Confirm 模式（工具审批流程）
- [ ] Streaming 优化（invoke 完整功能后再做 stream 体验）
- [ ] Token 用量追踪中间件
- [ ] Skills 功能（预置 + 用户自定义，注入 system prompt）
- [ ] Custom Rules（用户自定义 system prompt 规则）
- [ ] 多 LLM Provider（OpenAI / DeepSeek）

## P3 — 部署 & 求职

- [ ] Auth（Supabase Auth 登录）
- [ ] Railway 重新部署
- [ ] 域名绑定（Cloudflare）
- [ ] Demo 视频（2-3 分钟）
- [ ] README + 架构图
- [ ] 简历项目描述
- [ ] 面试准备

## 已完成（归档）

<details>
<summary>Backend</summary>

- [x] Agent stop API: `POST /conversations/:id/stop`
- [x] 后端 tool_use/tool_result 不匹配 bug
- [x] SQL injection fix — `updatePart` 参数化查询
</details>

<details>
<summary>Frontend</summary>

- [x] Sidebar 独立组件
- [x] Step 6: 右侧面板组件
- [x] Fix: tool call 流式阶段显示 undefined
</details>

<details>
<summary>Features</summary>

- [x] 附件支持（用户上传图片/文件给 Agent）
- [x] Tools 补充（web_search + web_fetch）
- [x] MCP 支持（通用 MCP Client + 配置页面）
- [x] TODO 功能（agent SDK 层已实现）
</details>
