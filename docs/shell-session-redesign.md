# Sandbox 长驻进程重设计方案

> 重设计今早落地的 `Sandbox.spawn` + SSE terminal bridge（7f6a3c9）。\
> **目标**：把"长驻进程"从 SSE 单向旁路升级为一等公民 Shell Session（PTY-backed + WebSocket 双向），解决 AI 感知不到错误、颜色失真、无法交互三个核心问题。

---

## 一、当前实现回顾

今早落地的路径：

```
Agent → bash(run_in_background=true)
  → E2BSandbox.spawn()
    → sdk.commands.run({background:true, onStdout, onStderr})
      → StreamQueue → onProcessStart 回调
        → AgentTurnService.pendingEvents ← SSE terminal_start/chunk/exit
          → 前端 terminalBus → xterm.write()
```

前端 `terminal-panel.tsx` 硬塞 `\x1b[36m$ command\x1b[0m`（青）和 `\x1b[31m[exited]\x1b[0m`（红），用户输入仅 echo 到本地。

---

## 二、三个真实痛点与根因

| 痛点 | 表现 | 根因 |
|------|------|------|
| **AI 感知不到错误** | 让 AI 启动 dev server，缺 install 导致立刻退出，AI 继续以为服务在跑 | `bash run_in_background` 返回即走人。stdout/stderr 和退出码都只去了前端 terminal，没回到 agent 的 tool result；后续轮次 AI 也没有 API 去查 |
| **终端颜色假** | npm/vite 输出灰白一片，`$` 前缀和 exit 后缀是前端硬着色 | `commands.run({background:true})` 不是 TTY，工具检测 `!process.stdout.isTTY` 后自动关 ANSI。前端只能拿到裸字符，于是补造着色，但跟真实 shell 体验不一致 |
| **无交互通道** | 用户不能在 terminal 打命令（当前只是本地 echo，回车后直接丢弃），未来要支持用户编辑文件也没有实时反向通道 | SSE 是 server→client 单向。agent 生命周期 + terminal I/O 生命周期被混在同一个流里，互相约束 |

---

## 三、新架构总览

> **核心抽象**：`ShellSession` — 一个 PTY-backed 的长连会话，由 `ShellSessionManager` 统一持有，agent 和 user 都是它的订阅者。

### 3.1 分层边界（重点：PTY 不进 Agent SDK 抽象）

Agent SDK 的 `Sandbox` 接口是环境抽象（LocalSandbox / E2BSandbox / 未来 docker），目的是让 agent 在不同宿主里跑。**PTY 本质是"给 xterm 看的终端模拟"，只有 web 产品需要**，CLI 用户自己就在真实 shell 里，agent 不需要后台进程概念。

| 层 | 职责 | 知道 PTY 吗 |
|----|------|-------------|
| `@code-artisan/agent` · `Sandbox` 接口 | 只保留 `exec` + 文件 API + glob/grep | ❌ 不知道 |
| `@code-artisan/agent` · 内置 `bash` 工具 | 只有 foreground 一条路径，调 `sandbox.exec` | ❌ 不知道 |
| `@code-artisan/backend` · `E2BSandbox` 具体类 | 额外挂 `pty.*` 方法（自家公开 API，不在接口里） | ✅ 实现方 |
| `@code-artisan/backend` · `ShellSessionManager` | PTY 多路复用 + ring buffer | ✅ 持有者 |
| `@code-artisan/backend` · 注入的 `webBashTool` / `bash_output` / `kill_shell` | 通过 `createAgent({ tools: [...] })` 传入；内部 `ctx.sandbox as E2BSandbox` 直接用 PTY | ✅ 消费方 |

这样 agent SDK 完全不知道"后台进程"、"PTY"、"shell session"这些概念，CLI 场景不受污染；web 产品独立演进。**今早加到 SDK 的 `Sandbox.spawn` / `ProcessHandle` / `onProcessStart` 全部下沉到 `E2BSandbox` 或干脆删掉**。

### 3.2 拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend TerminalPanel                                     │
│  ─ xterm × N（DEV tab + 用户 tabs）                          │
│  ─ onData → ws.send({op:"input"}); onResize → ws.send()     │
└──────────────┬──────────────────────────────────────────────┘
               │ WebSocket /ws/terminal?conversationId=...
┌──────────────▼──────────────────────────────────────────────┐
│  Backend WebSocket Gateway                                  │
│  ─ attach / create / input / resize / kill                  │
│  ─ 广播 data / exit / sessions                              │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  ShellSessionManager（per conversation）                     │
│  ─ sessions: Map<sid, { pid, cmd, cols, rows, ring, owner,  │
│                          exitCode, subscribers }>           │
│  ─ ring buffer 64KB：供 AI bash_output 读 tail               │
│  ─ event bus：PTY onData → 所有订阅者                        │
└──────────────┬──────────────────────────────────────────────┘
               │ 直接调用（不经过 Sandbox 接口）
┌──────────────▼──────────────────────────────────────────────┐
│  E2BSandbox (backend-specific)                              │
│  ─ exec()        ← 实现 Sandbox 接口                         │
│  ─ pty.create()  ← 自家 API，接口不感知                      │
└─────────────────────────────────────────────────────────────┘

         注入工具（createAgent({ tools: [...] }))
         ┌────────────────────────────────────┐
         │  webBashTool (background 分支)     │ → ShellSessionManager.create
         │  bash_output                        │ → ShellSessionManager.readTail
         │  kill_shell                         │ → ShellSessionManager.kill
         └────────────────────────────────────┘
```

### 3.3 两条独立 Transport

| 通道 | 职责 | 为什么不合并 |
|------|------|--------------|
| **SSE `/api/message/:id`**（保留） | agent 轮次流：partial / message / file_update / file_delete / title_update / quota_exceeded / error；新增轻量元数据 session_started / session_exited | HTTP + 一轮一次 server-push，现有逻辑稳定，对 LB/CDN 友好；不承载终端 I/O |
| **WebSocket `/ws/terminal`**（新增） | 终端 I/O：attach / create / input / resize / kill；snapshot / data / exit 回推 | 终端要双向 + 长连 + 即时回音；agent 空闲时用户仍可用 terminal，生命周期独立 |

> **用户改文件不走 WS**：继续用已有 `PUT /api/snapshot/:conversationId` 路径。WS 只干 terminal。

---

## 四、关键决策与取舍

### 4.1 为什么一定要 PTY

`E2BSandbox` 换到 `sdk.pty.create()`：

- **着色真实**：PTY 下 `isTTY===true` + `TERM=xterm-256color`，npm/vite/eslint/tsc 默认上 ANSI，xterm 直接渲染，不再需要前端加戏
- **TUI 可用**：`less`、`top`、交互式 `npm init` 这类能正常跑
- **resize 感知**：xterm FitAddon 算出 cols/rows → ws → `sdk.pty.resize(pid, {cols, rows})`，分栏、表格输出不会断行错乱
- **键盘透传**：`Ctrl+C`、`↑/↓` 历史、Tab 补全都能到 sandbox 内的 bash

### 4.2 AI 感知错误的方案

**采用 Claude Code 的范式**：spawn 立即返回 `sessionId`，给 AI 一个 `bash_output` 工具主动轮询。不把 stdout 塞进 tool_result，原因：

- 不可预测长度会把 context 撑爆
- 轮次解耦：AI 可以先做别的事、过一会儿再回来看

| 工具 | 签名 | 作用 |
|------|------|------|
| `bash` | `(command, run_in_background?=false, timeout_ms?)` | fg → `sandbox.exec`（非 PTY，快，拿完整 stdout）；bg → `sandbox.pty.create` + manager.register → 返回 `"Started session=abc123 pid=42. Use bash_output to read."` |
| `bash_output` 🆕 | `(session_id, since_offset?, max_bytes?=4096, filter?)` | 返回 `{ data, new_offset, status: "running"\|"exited", exitCode?, truncated }`；AI 拿 offset 滚动读 |
| `kill_shell` 🆕 | `(session_id, signal?="SIGTERM")` | 主动终止会话 |

**Prompt 补一句**：

> "When you start a server in background, wait ~2 seconds and call `bash_output` to verify it booted. If the session already exited with non-zero code, read the tail to diagnose before retrying."

### 4.3 Session Ownership 与 Tab 视觉

| owner | 谁创建 | 前端表现 |
|-------|--------|----------|
| `agent` | bash run_in_background | DEV tab（闪电图标），一个 tab 聚合所有 agent session（多个时横向 switch 或 merged view 二选一，暂选聚合） |
| `user` | 用户点 "+" 新建 | 独立 tab，attach 到一个新 PTY（默认 `bash -l`），完全交互；最多 3 个 |

### 4.4 Ring Buffer 尺寸

每 session 64KB 循环缓冲 + 总上限（整个 conversation）1MB。超限丢最老。理由：

- 64KB ≈ vite dev 启动全量日志够用
- AI 读 tail 用 `max_bytes=4096` 默认，4KB 刚好够"是否起来了"的判断
- 前端 attach 时只回放最后 32KB，避免大文件初始化慢

### 4.5 生命周期对齐

| 事件 | 处理 | UI 反馈 |
|------|------|---------|
| 切会话 | 关闭当前 WS → 新会话开新 WS | xterm.clear + 拉新 sessions list |
| Sandbox pool 回收（10 分钟 idle） | 所有 PTY 随之关闭；manager 广播 `exit` | tab 上打 "sandbox expired" 徽标，`+` 按钮可复活 |
| Session 非零退出 | manager 保留最近 4KB buffer + exitCode，session 状态改 `exited` | tab 徽标 `exit 1`（红）；AI `bash_output` 仍可读最后的日志 |
| 用户关 tab | WS send `kill`；manager 发 SIGTERM，300ms 后 SIGKILL | tab 消失 |

---

## 五、核心接口契约

### 5.1 Agent SDK — `Sandbox` 接口保持纯净

```ts
// @code-artisan/agent：只保留通用能力，不感知 PTY / background
interface Sandbox {
  exec(cmd, opts): Promise<ExecResult>;
  readFile / writeFile / listDir / glob / grep / ...
}
```

> **删除今早加的** `Sandbox.spawn` / `SpawnOptions` / `ProcessHandle` / `onProcessStart`、LocalSandbox 的 Bun.spawn 实现、以及 builtins/bash.ts 里的 `run_in_background` 参数。回到 SDK 只管 foreground exec 的干净状态。

### 5.2 Backend — `E2BSandbox` 私有 PTY API

```ts
class E2BSandbox implements Sandbox {
  readonly sdk: E2BSDK;

  async exec(cmd, opts): Promise<ExecResult> { /* 保留 */ }

  // ⬇⬇⬇ backend-only，不在 Sandbox 接口里
  readonly pty = {
    create: async (opts: {
      cols: number; rows: number; cwd?: string;
      env?: Record<string, string>;
      onData: (chunk: string) => void;
      onExit: (code: number) => void;
    }): Promise<PtyHandle> => { /* sdk.pty.create(...) */ },
  };
}

interface PtyHandle {
  readonly pid: number;
  sendInput(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  kill(signal?: "SIGTERM" | "SIGKILL"): Promise<void>;
  isAlive(): boolean;
}
```

### 5.3 Backend — `ShellSessionManager`

```ts
class ShellSessionManager {
  create(opts: {
    command: string; owner: "agent" | "user";
    cols: number; rows: number; cwd?: string;
  }): Promise<Session>;

  get(sessionId: string): Session | null;
  list(conversationId: string): SessionMeta[];
  readTail(sid: string, sinceOffset?: number, maxBytes?: number): TailResult;
  sendInput(sid: string, data: string): Promise<void>;
  resize(sid: string, cols: number, rows: number): Promise<void>;
  kill(sid: string, signal?: Signal): Promise<void>;
  subscribe(sid: string, cb: (ev: SessionEvent) => void): Unsubscribe;
}

type SessionEvent =
  | { kind: "data"; data: string; offset: number }
  | { kind: "exit"; exitCode: number };
```

### 5.4 Web 层注入的 Agent 工具

`AgentTurnService` 在 `createAgent` 时传入自定义工具（不依赖 SDK 默认 `bash`）：

```ts
const webBashTool = defineTool({
  name: "bash",
  parameters: { command: string, run_in_background?: boolean, timeout_ms?: number },
  invoke: async ({ command, run_in_background }, ctx) => {
    const sandbox = ctx.sandbox as E2BSandbox;  // web 层保证一定是 E2B
    if (run_in_background) {
      const session = await shellManager.create({
        command, owner: "agent", cols: 80, rows: 24,
      });
      return `Started session=${session.id} pid=${session.pid}. Use bash_output to read.`;
    }
    return await sandbox.exec(command, { timeoutMs: timeout_ms });
  },
});

const bashOutputTool = defineTool({ /* shellManager.readTail */ });
const killShellTool = defineTool({ /* shellManager.kill */ });

createAgent({ sandbox, tools: [webBashTool, bashOutputTool, killShellTool, ...], ... });
```

### 5.5 WebSocket 协议

| 方向 | op | payload |
|------|----|---------|
| C→S | `hello` | `{ conversationId }` → 回 `{ sessions: SessionMeta[] }` |
| C→S | `attach` | `{ sessionId, cols, rows }` → 回 `snapshot { buffer }` + 后续 `data` |
| C→S | `create` | `{ command?, cols, rows, cwd? }` → 回 `{ sessionId, pid }` |
| C→S | `input` | `{ sessionId, data }`（原始 keystrokes） |
| C→S | `resize` | `{ sessionId, cols, rows }` |
| C→S | `kill` | `{ sessionId, signal? }` |
| S→C | `data` | `{ sessionId, data, offset }`（含 ANSI 原文） |
| S→C | `exit` | `{ sessionId, exitCode }` |
| S→C | `session_started` / `session_ended` | 被 agent 启动/结束时广播给已 attach 的客户端 |

鉴权复用 better-auth cookie（Hono WS 支持 upgrade 时读取 session）。

---

## 六、前端改造要点

| 文件 | 改动 | 产物 |
|------|------|------|
| `lib/terminal-bus.ts` | 删除（SSE 桥路径淘汰） | - |
| `lib/terminal-ws.ts` 🆕 | WebSocket 客户端封装，支持 reconnect + 按 sessionId 分发 | `attach(sid, xterm)` / `create(cmd)` / `kill(sid)` |
| `components/workspace/terminal-panel.tsx` | ① 删掉 `$ command` 和 `[exited]` 的前端着色；② `onData` 接到 ws.sendInput；③ 挂 ResizeObserver 到 ws.resize；④ 首次 attach 渲染 snapshot.buffer | 真实 shell 体验 |
| `stores/workspace.ts` | `terminalSessions` 只存轻量 meta（id / command / owner / status / exitCode）；chunk 数据不进 store | 零重渲染压力 |
| `hooks/use-chat.ts` | 移除 terminal_start/chunk/exit case；保留轻量 session_started/ended 只用于 store meta 更新 | SSE 瘦身 |

---

## 七、迁移路径（串行，每步可独立验证）

> 每步独立 commit、独立可跑，避免一锅粥。
> **本阶段只做 terminal 本身（1-7 步）**。沙箱生命周期（§8.1）先不动，等终端跑通后再独立调研 E2B pause/resume 的真实成本与行为，单独拉一轮方案。

1. **清理 SDK 污染** — 删除 agent SDK 里的 `Sandbox.spawn` / `ProcessHandle` / `onProcessStart` / LocalSandbox.spawn；`bash` 工具回到只有 foreground 一条路径（`run_in_background` 参数暂时移除）
2. **`E2BSandbox.pty` 私有 API** — 在 backend 的 `E2BSandbox` 上挂 `pty.create`，实现基于 `sdk.pty.create()`，单测（ANSI 保留 / resize / kill / exit code）
3. **`ShellSessionManager`** — 内存 Map + 64KB ring buffer + 订阅分发；session meta 落 DB（`shell_sessions` 表）；单测（多路 subscribe / tail offset / 级联关闭）
4. **Web 层工具注入** — `AgentTurnService` 里 `createAgent({ tools: [webBashTool, bashOutputTool, killShellTool, ...] })`；调整系统 prompt 教 AI 用 bash_output 验证服务是否起来
5. **WebSocket 网关** — Hono WS 挂 `/ws/terminal`，cookie 鉴权；wscat 手工验证协议
6. **前端 terminal-panel** — 切到 WS；删 terminal-bus；删硬着色；用户输入/resize/create/kill 全部打通
7. **清理 SSE** — 删除 terminal_start/chunk/exit 三个事件类型；文档用本文替换旧版 `docs/terminal-panel-streaming.md`

**⏸ 分阶段验收点**：上述 7 步完成后，terminal 形态应与 bolt.new / Claude Code 一致（PTY 真彩色 + 键盘交互 + AI 可感知 + 多 tab）。此时先上线试用，收集真实问题后再开启下一阶段。

### 下一阶段：沙箱生命周期（待调研）

等 terminal 稳定后，单独调研：

- E2B pause 的计费细节（存储费？每小时？vs 直接 kill 重建的成本）
- `lifecycle: { onTimeout: 'pause' }` 在实际使用中的行为
- `Sandbox.connect(sandboxId)` 对已 paused 沙箱的恢复成功率与延迟
- PTY 进程在 pause/resume 后能否真正完整保留（E2B 文档说"running processes"被保留，但需要实测）

产出一份独立的 `docs/sandbox-lifecycle.md`，再决定 active/idle/cold 三档策略的具体实现方式。**在此之前现状不变**：沙箱靠 `pool.acquire` 的 10 分钟 idle kill + agent run 时被动续期。

---

## 八、风险与待定

### 8.1 E2B 沙箱过期（重点）

**现状**：`DEFAULT_SANDBOX_LIFETIME_MS = 10 * 60 * 1000`，沙箱 idle 10 分钟自动 kill。当前代码只在 agent run 过程中隐式延长（pool.acquire 时 connect 会重置计时）。

**两个真实场景**：

| 场景 | 当前行为 | 问题 |
|------|----------|------|
| 用户停在 `/chat/:id` 但不发消息，超过 10 分钟 | 沙箱被 kill | 后端 ShellSessionManager 里的 session 挂起，前端 WS 收到 `exit -1`；下次 agent run 要重新创建沙箱 + 从 snapshot 恢复文件；**PTY dev server 状态丢了** |
| 用户打开 **历史对话**（几小时/几天前的） | `conversation.sandboxId` 仍在，但沙箱早已 kill | `E2BSandbox.connect(sandboxId)` 会抛错；当前代码里 `_setupSandbox` 会 fallback 到重新从 snapshot 恢复，但代价高 |

**E2B 提供的三把武器**：

1. `sandbox.setTimeout(ms)` — 从当前时刻重置 idle kill 计时（最多 24h Pro / 1h Hobby）
2. `sandbox.pause()` — 把内存+文件系统+运行中进程整体快照（~4s/GiB），**paused 状态无限期保留**，费用低于 running
3. `Sandbox.connect(sandboxId)` — 从 paused 状态 resume，约 1s，完整恢复（PTY 进程也在跑）
4. 可选：`lifecycle: { onTimeout: 'pause' }` —— 超时自动 pause 而不是 kill

**推荐策略**（分三档）：

| 状态 | 触发 | 动作 |
|------|------|------|
| **Active** | 用户在 `/chat/:id` 且有 WS 连接或 agent 正在跑 | 前端每 5 分钟 `POST /api/sandbox/:convId/keepalive` → 后端 `setTimeout(10min)` 续期 |
| **Idle** | 用户离开页面 / WS 断开 / agent 空闲超过 10 分钟 | 后端 `sandbox.pause()`，DB 标记 `conversations.sandboxState = 'paused'` |
| **Cold** | 用户重开历史会话 | `/chat/:id` loader 先 `POST /api/sandbox/:convId/resume` → 后端 `Sandbox.connect(sandboxId)` + setTimeout；若 connect 失败则 fallback 从 snapshot 重建新沙箱（PTY session 全丢，前端显示 "sessions expired, click to restart"） |

这套方案的额外好处：agent 的 dev server + 文件热状态在用户刷新页面或短期离开后能完整保留。

**待定**：E2B pause 在计费上是否便宜到值得常开？需要对照价格表测算。如果 pause 本身有存储费，可能简化成"离开超过 30 min 直接 kill，下次重建"。

### 8.2 其他风险

| 风险 | 缓解 | 状态 |
|------|------|------|
| AI 滥用 bash_output 导致 context 膨胀 | 默认 `max_bytes=4096` + `filter`（grep 式）；返回里带 `truncated` 标志 | 设计已覆盖 |
| Backend 进程重启导致 ShellSessionManager 内存丢失（即使沙箱 PTY 还在跑） | session meta 落 DB（id/pid/command/owner/cwd），重启后按 `conversation.sandboxId` 恢复 manager，重新 subscribe PTY onData；ring buffer 不恢复，直接从 resume 后的新输出开始 | 需要新表 `shell_sessions` |
| 用户在 user-tab 里 `rm -rf /` | sandbox 本身就隔离，丢了就丢了；UI 文案说明"user tab 与 AI 共享文件系统" | 产品文案 |
| WebSocket 在反代环境下 upgrade 失败 | 自有部署路径控制；后期上 CF 时走 WS-over-TLS | 部署期处理 |

---

## 九、TL;DR

1. **加 PTY**：`Sandbox.pty.create` 取代 `spawn`，颜色和键盘一并解决
2. **加 SessionManager + ring buffer**：后端成为 session 的权威
3. **加 `bash_output` / `kill_shell` 工具**：AI 能主动感知和控制长驻进程
4. **加 WebSocket `/ws/terminal`**：terminal I/O 走独立双向通道；SSE 只管 agent 轮次
5. **删前端硬着色 + 本地 echo**：PTY 自己会显 shell prompt，xterm 原样渲染

不破坏现有 SSE；新能力和旧路径彻底解耦，改完即可删除今早的 `spawn`/`onProcessStart` 临时接口。
