# Web AI Coding Agent — 产品需求文档

> 目标：5月31日前上线，供他人直接体验；用于年中求职简历亮点。

---

## 一句话定义

用户在浏览器中描述编程需求，AI 自动写代码并在沙箱中执行，实时返回结果。

---

## 核心用户旅程

```
用户输入需求
    → AI 理解需求，生成代码
    → 代码写入沙箱文件系统
    → 沙箱执行代码
    → 终端输出返回给用户
    → 用户查看/修改代码，继续对话
```

---

## 功能模块

### MVP 必须有

| 模块 | 描述 |
|------|------|
| **对话界面** | 左侧 Chat panel，用户与 AI 对话，支持 Markdown 渲染 |
| **代码编辑器** | Monaco Editor，右侧主区域，多文件支持 |
| **文件树** | 左侧/顶部展示沙箱内文件结构，可点击切换 |
| **终端输出** | 底部 Terminal panel，实时展示命令执行结果（流式） |
| **AI Agent 循环** | AI 通过 tool calling 自主调用：read_file / write_file / execute_command |
| **沙箱环境** | E2B 托管沙箱，完整 Linux FS + shell，支持 Python/Node |
| **用户认证** | Supabase Auth，邮箱登录，保存用户会话 |
| **对话历史** | 持久化到 Supabase，刷新页面不丢失 |
| **文件持久化** | 沙箱文件在会话内持久，关键文件存 Supabase |

### Nice-to-have（时间允许再做）

- 支持选择语言/运行时（Python / Node）
- 代码 diff 视图
- 分享会话链接
- 沙箱超时自动重连

---

## AI Agent 工具集

```
read_file(path)          → 读取沙箱文件内容
write_file(path, content) → 写入/覆盖文件
execute_command(cmd)     → 执行 shell 命令，返回 stdout/stderr
list_files(path)         → 列出目录结构
等
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite + React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| 路由+请求 | TanStack Router |
| 编辑器 | Monaco Editor |
| 后端 | Hono.js (Cloudflare Workers) |
| AI | Claude API (claude-sonnet-4-5 / claude-opus-4-5) |
| 沙箱 | E2B |
| 数据库/认证 | Supabase |
| 部署 | Vercel（前端）+ Cloudflare Workers（后端） |

---

## 非功能需求

- 首屏加载 < 3s
- AI 响应流式输出（不能等全部生成完再显示）
- 沙箱执行超时设置（最长 30s）
- 移动端不做适配（桌面优先）

---

## 交付物（5月31日）

- [ ] 线上可访问的 URL
- [ ] GitHub 仓库（代码公开）
- [ ] README 含项目介绍 + 技术架构图
- [ ] Demo 视频（2-3分钟，录屏）
- [ ] 简历描述草稿 
