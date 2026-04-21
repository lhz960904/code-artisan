# TODO

## P0 — BUG

- [x] dashboard、home 页面 sender 输入进入详情页，流式接口被取消，无法实时渲染
- [x] backend 持久化文件，目前不支持图片，但有时候 AI 下载的模板中会出现图片，是否需要支持图片持久化

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

- [x] 新建聊天的名字修改，采取 backend 流式返回 title 事件，做更改
- [x] workspace file tree UI 交互优化，即时响应流式数据
- [ ] workspace editor panel UI 交互优化，即时响应流式数据
- [ ] workspace terminal panel UI 交互优化，即时响应流式数据

### 工程化

- [ ] Prompt 优化
- [ ] `SANDBOX_IGNORED_DIRS` 换成 [`ignore`](https://www.npmjs.com/package/ignore) 包，读项目 `.gitignore` 过滤；空项目 fallback 一个 baseline（node_modules/dist/…）

## P2 — 增强

- [ ] Confirm 模式（工具审批流程）
- [ ] 多 LLM Provider（OpenAI / DeepSeek）
- [ ] Skills 功能（预置 + 用户自定义，注入 system prompt）
- [ ] Custom Rules（用户自定义 system prompt 规则）
- [ ] i18n 框架（消息组件文案 Thinking/Thought、文件 chip 等）
- [ ] 支持 mcp 工具

## P3 — 部署 & 求职

- [ ] 域名绑定（Cloudflare）
- [ ] Demo 视频（2-3 分钟）
- [ ] README + 架构图
- [ ] 简历项目描述
