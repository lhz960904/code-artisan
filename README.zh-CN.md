<div align="center">
  <img src="./packages/frontend/public/favicon.svg" alt="CodeArtisan" width="84" height="84" />

# CodeArtisan

一个 Web Coding Agent + 可复用的 Agent SDK —— 自研 ReAct 循环、Middleware、Tool、可插拔的 Sandbox 抽象。从第一性原理写起（不依赖 vercel ai sdk / langchain），通过实战搞清楚现代 coding agent 到底是怎么跑的。

[English](./README.md) · [简体中文](./README.zh-CN.md)

  <p>
    <a href="https://code-artisan-production.up.railway.app"><img src="https://img.shields.io/badge/live%20demo-online-emerald?style=flat" alt="Live demo" /></a>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node" />
  </p>
</div>

## 🎬 Demo

**在线体验**：<https://code-artisan-production.up.railway.app>

https://github.com/user-attachments/assets/449acf6a-e12d-4dd5-a826-5ae6d825d68a

## ✨ 项目特点

- **自研 Agent SDK。** 没有使用 vercel ai sdk 或 langchain 等现成框架，从第一性原理写的 ReAct 循环，多 Provider 支持、Middleware（自动压缩、配额、文件追踪、循环检测）、Tool、Sandbox 抽象，全部可插拔。

- **支持第三方集成（Vercel / Supabase），实现全栈项目的生成与部署。** Agent 可以开通真实的 Supabase 项目、用 SQL 建表 + 配 RLS，并通过 `@hono/vercel` adapter 部署 Hono 后端。沙箱到生产的 env vars 同步开箱即用。

- **可分享的工作区。** 一键生成 unlisted 公开链接 —— 访客可以浏览完整对话、文件树、并直接运行已部署的 app，只读模式无需登录。适合作品集和 bug 反馈。

- **内置版本控制。** 每一轮 Agent 对话都是一个 checkpoint。chat 内联 chip 上预览历史版本、按需 restore；restore 是事件化的，AI 上下文会裁剪到激活链路。

- **支持 MCP。** 内置 MCP marketplace，安装即用，Agent 在下一轮自动接入新工具。

- **内置 Skills 系统。** 包含全栈项目脚手架、Supabase 数据库操作等技能，Agent 按需读取以加速常见任务。

- **沙箱隔离。** 每段对话独立运行在 [E2B](https://e2b.dev) 沙箱中，文件快照让冷启动也能恢复完整工作区。单独使用 Agent SDK 时可切换到本地运行（`LocalSandbox`）。

- **完善的工作区。** 实时预览、Monaco 编辑器、PTY 驱动的 xterm 终端（Agent 与用户共享同一个 session 管理器）、文件树 + 全文搜索、**元素选取器**（在预览中点任意 DOM 节点，自动作为上下文带给 AI）、**运行时错误捕获**（一键"让 AI 修一下"），全部走会话级别的 WebSocket。

## 🏛️ 架构

<p align="center">
  <img src="./docs/screenshots/architecture.zh-CN.svg" alt="系统架构图" width="1100" />
</p>

### Monorepo 包结构

| 包 | 职责 |
|---|---|
| [`@code-artisan/agent`](./packages/agent) | 环境无关的 Agent SDK —— ReAct 循环、Provider、Tool、Middleware、Sandbox 抽象 |
| [`@code-artisan/backend`](./packages/backend) | Hono + Bun 服务端 —— 单轮编排、持久化、BYO OAuth、沙箱生命周期、PTY 会话 |
| [`@code-artisan/frontend`](./packages/frontend) | Vite + React 19 单页应用 —— 工作区 UI、Monaco、xterm、实时预览、分享页 |
| [`@code-artisan/iframe-runtime`](./packages/iframe-runtime) | 注入到沙箱 app 的 Vite 插件 —— 通过 postMessage 上报运行时错误 + 驱动元素选取 |
| [`@code-artisan/cli`](./packages/cli) | Agent SDK 的终端 UI（基于 Ink），项目准备阶段，后续考虑 CLI 层实现 |
| [`@code-artisan/shared`](./packages/shared) | 共享类型：消息块、模型目录、会话结构、iframe 协议 |

## 🛠️ 技术栈

**前端** — Vite 6 · React 19 · TypeScript 5.9 · Tailwind v4 · shadcn/ui · TanStack Router · TanStack Query · Zustand · Monaco · xterm.js · react-resizable-panels

**后端** — Bun · Hono 4 · Drizzle ORM · Postgres · better-auth（GitHub OAuth）· `@vercel/sdk` · `@supabase/supabase-js` · anthropic-ai/sdk · modelcontextprotocol/sdk

**沙箱** — E2B Code Interpreter（PTY API）

**基础设施** — Supabase（Postgres + 对象存储）· Railway / Docker（部署）

**模型** — 任何 Anthropic 或 OpenAI 兼容网关（通过 `LLM_BASE_URL` 切换）

## 🚀 快速开始

### 前置条件

- **Node.js** ≥ 20，**pnpm** ≥ 9，**Bun** ≥ 1.x
- **[E2B](https://e2b.dev)** API key
- **[Supabase](https://supabase.com)** 项目（Postgres + 名为 `attachments` 的存储桶）
- **LLM API key** —— Anthropic 官方，或任意 OpenAI 兼容网关
- **GitHub OAuth App**（用于用户登录）
- **Vercel + Supabase OAuth App**（用于 BYO 部署 / 数据库集成）—— 注册链接见 [`.env.example`](./.env.example)

### 安装

```bash
git clone https://github.com/lhz960904/code-artisan.git
cd code-artisan
pnpm install

# 配置环境变量
cp .env.example .env
# 填写 DATABASE_URL、SUPABASE_*、LLM_API_KEY、E2B_API_KEY、GitHub/Vercel/Supabase OAuth ...

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

## 🤝 Issue 和 PR

欢迎随时提 issue 或 PR。有不清楚的、想聊聊实现思路、或者就是想交流，欢迎加作者微信：

<p align="center">
  <img src="./packages/frontend/public/wechat-qr.jpg" alt="WeChat QR" width="220" />
</p>

## 📄 License

MIT © [lhz960904](https://github.com/lhz960904)
