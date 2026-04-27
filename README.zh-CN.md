<div align="center">
  <img src="./packages/frontend/public/favicon.svg" alt="CodeArtisan" width="84" height="84" />

# CodeArtisan

一个 Web Coding Agent 项目，类似于 bolt.new、v0.dev 等项目，通过实战学习 Agent 相关开发知识

[English](./README.md) · [简体中文](./README.zh-CN.md)

  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  </p>
</div>

## 🎬 Demo

https://github.com/user-attachments/assets/449acf6a-e12d-4dd5-a826-5ae6d825d68a

## ✨ 项目特点

- **自研 Agent SDK。** 没有使用 vercel ai sdk 或 langchain 等现成框架，从第一性原理写的 ReAct 循环，多 Provider 支持、Middleware、Tool、Sandbox 抽象，全部可插拔。

- **支持 MCP**。内置 MCP marketplace 安装即用，Agent 自动接入 MCP 相关工具。

- **内置 Skills 系统。** 包含全栈项目开发等技能，Agent 可以读取技能快速完成相关任务。

- **沙箱安全隔离**。每段对话独立运行在 [E2B](https://e2b.dev) 沙箱中，文件快照机制让冷启动也能恢复完整工作区。单独使用 Agent SDK 也可以切换到本地运行(localSandbox)。

- **完善的工作区。** 实时预览、Monaco 编辑器、PTY 驱动的 xterm 终端（Agent 与用户共享同一个 session 管理器）、文件树 + 全文搜索，会话级别的 WebSocket 通信。

## 🏛️ 架构

<p align="center">
  <img src="./docs/screenshots/architecture.zh-CN.svg" alt="系统架构图" width="1100" />
</p>

### Monorepo 包结构

| 包 | 职责 |
|---|---|
| [`@code-artisan/agent`](./packages/agent) | 环境无关的 Agent SDK —— ReAct 循环、Provider、Tool、Middleware、Sandbox 抽象 |
| [`@code-artisan/backend`](./packages/backend) | Hono + Bun 服务端 —— 单轮编排、持久化、鉴权、沙箱生命周期、PTY 会话 |
| [`@code-artisan/frontend`](./packages/frontend) | Vite + React 19 单页应用 —— 工作区 UI、Monaco、xterm、实时预览 |
| [`@code-artisan/cli`](./packages/cli) | Agent SDK 的终端 UI（基于 Ink），项目准备阶段，后续考虑 CLI 层实现 |
| [`@code-artisan/shared`](./packages/shared) | 共享类型：消息块、模型目录、会话结构 |

## 🛠️ 技术栈

**前端** — Vite 6 · React 19 · TypeScript 5.9 · Tailwind v4 · shadcn/ui · TanStack Router · TanStack Query · Zustand · Monaco · xterm.js · react-resizable-panels

**后端** — Bun · Hono 4 · Drizzle ORM · Postgres · better-auth（GitHub OAuth）· anthropic-ai/sdk · modelcontextprotocol/sdk

**沙箱** — E2B Code Interpreter（PTY API）

**基础设施** — Supabase（Postgres + 对象存储）· Railway / Docker（部署）

**模型** — 任何 Anthropic 或 OpenAI 兼容网关（通过 `LLM_BASE_URL` 切换）

## 🚀 快速开始

### 前置条件

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Bun** ≥ 1.x
- 一个 **[E2B](https://e2b.dev)** API key
- 一个 **[Supabase](https://supabase.com)** 项目（Postgres + 名为 `attachments` 的存储桶）
- **LLM API key** —— Anthropic 官方，或任意 OpenAI 兼容网关
- **GitHub OAuth App** 

### 安装

```bash
git clone https://github.com/lhz960904/code-artisan.git
cd code-artisan
pnpm install

# 配置环境变量
cp .env.example .env
# 填写 DATABASE_URL、SUPABASE_*、LLM_API_KEY、E2B_API_KEY、GitHub OAuth ...

# 推送数据库 schema
pnpm --filter @code-artisan/backend run db:push

# 仅首次：构建 E2B 沙箱模板
pnpm sandbox:build

# 同时启动前端 (:3000) 与后端 (:3001)
pnpm dev
```

打开 <http://localhost:3000> 即可。

### 生产构建

```bash
pnpm build
pnpm --filter @code-artisan/backend run start
```

仓库内附 `Dockerfile`，开箱即可部署到 Railway 等平台。

## 🗺️ Roadmap

完整列表见 [TODO.md](./TODO.md)

- [ ] Plan 模式
- [ ] 版本控制
- [ ] 支持一键部署
- [ ] 内置数据库能力
- [ ] 分享链接  
- [ ] 调试功能-页面选择元素进行回填
- [ ] i18n 框架

## 🤝 Issue 和 PR

欢迎随时提 issue 或 PR。有不清楚的、想聊聊实现思路、或者就是想交流，欢迎加作者微信：

<p align="center">
  <img src="./packages/frontend/public/wechat-qr.jpg" alt="WeChat QR" width="220" />
</p>

## 📄 License

MIT © [lhz960904](https://github.com/lhz960904)
