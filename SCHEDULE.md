# CodeArtisan 项目排期（3/26 - 5/31）

---

## Phase 1-2｜3/26–3/28 · 脚手架 + AI Tool Calling ✅

- [x] Vite + React + TS + Tailwind + TanStack Router 前端
- [x] Hono.js 后端 + Supabase DB
- [x] E2B 沙箱接入，执行命令
- [x] Claude API 接入，流式消息
- [x] 4 个工具：read_file / write_file / execute_command / list_files
- [x] Agent 循环（多轮 tool call）
- [x] 基础 Chat UI + 流式输出

## Phase 3｜3/28 · 编辑器 + 文件树 ✅

- [x] Monaco Editor（语法高亮、多文件 tab）
- [x] 文件树组件
- [x] xterm.js 终端 Panel
- [x] Tab 切换布局（Preview / Code / Terminal）

## Phase 4｜3/28 · Confirm Mode + Token Quota ✅

- [x] Confirm 执行模式（审批 / 拒绝工具调用）
- [x] Token 配额追踪
- [x] start_server 工具（后台进程 + 预览 URL）

## Phase 5｜3/29 · SSE Streaming + Markdown + Preview ✅

- [x] EventBus + SSE 替代 Supabase Realtime
- [x] react-markdown 渲染 AI 回复
- [x] iframe 预览面板

## Phase 6｜3/29 · Railway 部署 ✅

- [x] Docker 多阶段构建
- [x] 单服务部署（Hono serve API + 静态文件）
- [x] Supabase Session Pooler（IPv4 兼容）
- [x] 线上可访问：code-artisan-production.up.railway.app

---

## 架构重构｜3/29-3/30 ✅

深度调研 DeerFlow / LangChain / Vercel AI SDK / Gemini CLI / Neovate Code / OpenHands / SWE-agent / Bolt.new 等项目，完成核心架构重构：

### Sandbox 重构 ✅
- [x] Sandbox 抽象接口 + E2BProvider（acquire/get/release）
- [x] listDir 对齐 DeerFlow（find + 17 个 ignore patterns）
- [x] Singleton 管理（getSandboxProvider / shutdownSandboxProvider）

### Tools 重构 ✅
- [x] BaseTool 抽象基类（Zod schema + 模板方法 _call）
- [x] ToolRegistry（register / get / toToolDefinitions / toPromptSection）
- [x] 6 个 builtin：bash, ls, read_file, write_file, str_replace, start_server
- [x] Zod v4 原生 z.toJSONSchema() 转 JSON Schema
- [x] description 参数强制 LLM chain-of-thought（学 DeerFlow）

### Agent 重构 ✅
- [x] Agent 类 + Middleware pipeline（beforeAgent/beforeModel/afterModel/afterToolExecution/onError/afterAgent）
- [x] 多 tool_use 并行执行（Promise.allSettled）
- [x] 4 个内置 middleware：DanglingToolCall / TokenUsage / LoopDetection / TitleGeneration
- [x] 工具执行错误恢复（try-catch → error message → LLM 重试）
- [x] runHook 用 keyof Omit 自动类型同步

### Part 类型体系 + Messages 表 ✅
- [x] 统一 Part 类型（TextPart / ImagePart / DocumentPart / ThinkingPart / ToolCallPart / StepStartPart / StepEndPart / ErrorPart）
- [x] 四角色：system / user / assistant / tool
- [x] messages 表替代 events 表（JSONB parts）
- [x] MessageStore（addMessage / getMessages / updatePart）
- [x] ToolCallPart 状态机：partial-call → call → result / error
- [x] SSE StreamEvent / StreamTextDelta 直接用 Part 类型
- [x] 前端适配新类型体系

### LLM Provider 抽象 ✅
- [x] LLMProvider 接口（chat + generateText）
- [x] AnthropicProvider（消息转换 / 工具格式化 / 响应解析 / extended thinking）
- [x] AgentRuntime.provider — middleware 通过 runtime 访问 LLM
- [x] Agent / middleware / types.ts 零 Anthropic 引用（除 providers/anthropic/）
- [x] model / lightModel 可配置

### 测试 + CI ✅
- [x] 45 个单元测试（toAnthropicMessages 8, Agent loop 8, 4 middlewares 18, BaseTool 7, Registry 4）
- [x] GitHub Actions CI（type check → unit test → build）
- [x] Bug 修复：thinking signature、runtime.messages 内存同步、多 tool 消息转换、dangling-tool-call 适配

---

## 待完成

### P0 — 核心功能
- [x] ~~端到端测试验证（重构后全场景跑通）~~ 已验证
- [x] ~~Supabase 清空重建表（schema 已变）~~ 已完成
- [x] ~~SSE 首发消息时序修复（navigate 顺序）~~ 已修复

### P1 — 体验优化
- [ ] Thinking 流式支持（streaming thinking deltas）
- [ ] 工具输出截断（学 SWE-agent ACI，防 context 溢出）
- [ ] 历史压缩 middleware（pruning + LLM compaction）
- [ ] UI 打磨（loading 状态、空状态、动画）

### P2 — 功能扩展
- [ ] Auth（Supabase Auth 登录）
- [ ] MCP 工具支持
- [ ] 多 LLM Provider（OpenAI / DeepSeek）
- [ ] 域名绑定（Cloudflare）
- [ ] Railway 重新部署

### P3 — 求职准备
- [ ] Demo 视频（2-3分钟）
- [ ] README + 架构图
- [ ] 简历项目描述
- [ ] 面试准备

---

## 关键里程碑

| 日期 | 里程碑 | 状态 |
|------|--------|------|
| 3/28 | AI 能自主写代码并执行 | ✅ |
| 3/29 | 线上可访问 | ✅ |
| 3/30 | 核心架构重构完成 | ✅ |
| 4/7  | 端到端验证 + Auth + UI 打磨 | |
| 4/14 | MCP 工具 + 多 Provider | |
| 5/6  | 全功能上线 | |
| 5/31 | 简历材料就绪 | |
