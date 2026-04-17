# Web AI Coding Agent SSE 流式接口性能优化全流程

> 本篇记录 `code-artisan` 在 2026-04 一次性能调优的完整过程：从用户体感问题出发，通过埋点定位瓶颈，再到逐项优化与边界设计。可作为后续博客的素材底稿。

---

## 0. 项目背景

`code-artisan` 是一个 Web 端 AI Coding Agent：

- **后端** Hono + Bun，托管 `@code-artisan/agent`，通过 `streamSSE` 把 agent 事件推给前端
- **沙箱** E2B（Firecracker microVM），每个 conversation 复用一个 sandbox
- **DB** Supabase（Postgres，初期部署在海外区）
- **核心入口** `POST /message/:conversationId` → `AgentTurnService.run()` → `agent.stream()`

每次用户发消息，后端要做：

1. 校验会话 / 写入 user message
2. 从 DB 拉历史消息，拼成 agent `Message[]`
3. 取 / 创建 sandbox，从 DB 恢复文件快照
4. 启动 agent loop，按事件流回前端

---

## 1. 问题描述

> 用户原话：「发送消息后，该接口 pending 很久，然后迅速发出好多 event，像是执行完然后 mock 的流，不像是真正的流。」

**体感**：

- SSE 接口建立后长时间没有任何事件
- 等到第一个事件出现时，agent 其实已经跑了很多步
- 后续事件几乎一瞬间全部 flush

这种体验破坏了"流式"承诺。问题不在前端渲染，而在**首字节延迟（TTFB）过长**：在第一个 LLM token 真正产出之前，后端做了大量串行 I/O。

---

## 2. 诊断：先打日志，再下手

凭直觉不行，必须看数据。在三个层面加埋点：

### 2.1 SSE 路由层

`packages/backend/src/routes/message.ts` —— 记录请求进入、第一次 `writeSSE`、整体耗时。

### 2.2 AgentTurnService

`packages/backend/src/services/agent-turn.ts` —— 拆解 `run()` 内部各阶段：
- `_buildAgentMessages`：DB 拉历史
- `_setupSandbox`：sandbox acquire / 文件快照恢复
- `_buildAgent`：构造 agent 实例

### 2.3 Agent 包内部

`packages/agent/core/agent.ts` —— 记录 `_beforeAgentRun`、`_beforeAgentStep`、`_thinkStream` 各阶段，以及每个 middleware 的执行耗时（用 `mw[i] = Xms` 的形式输出）。

### 2.4 测试方式

让用户用 **Apifox** 直接打接口（带浏览器 DevTools 拷出来的 `better-auth.session_token` cookie），分别测：

- **冷起 sandbox**（首次发消息 / sandbox 过期）
- **热 sandbox**（同会话连续发消息）

---

## 3. 数据揭示的真相

第一轮日志贴回来后，瓶颈一目了然：

| 阶段 | 冷起耗时 | 热 sandbox 耗时 |
|---|---|---|
| `_insertMessage`（写 user message） | ~700ms | ~700ms |
| `_buildAgentMessages`（读历史） | ~750ms | ~750ms |
| `_setupSandbox`（DB snapshots + acquire） | ~1500ms | ~800ms |
| `_buildAgent` + middlewares 初始化 | <10ms | <10ms |
| `mw[6]` = fileTracker 冷扫描 | 1700~2600ms | 1700ms |
| `mw[checkQuota]` beforeModel | 700ms | 700ms |
| **TTFB 合计** | **~5s** | **~4s** |

**核心结论**：

1. 不是 sandbox 慢，是 **DB 慢**——Supabase 在海外，单次 round-trip 700~800ms
2. 串行的 4~5 次 DB 调用直接吃掉 3 秒以上
3. fileTracker 的冷扫描每次都跑一遍 `find + readFile`，1.6s+
4. checkQuota 中间件每次 model 调用前都查一次 DB

---

## 4. 优化方案与效果

按"投入产出比"从高到低，依次实施。每一项都基于实测数据，不做无依据的猜测优化。

### 4.1 并行化独立 I/O

**问题**：`AgentTurnService.run()` 里三件事原本串行：

```ts
await this._insertMessage(userMessage);
const resumeMessages = await this._buildAgentMessages();
const sandboxResult = await this._setupSandbox();
```

三者之间没有数据依赖，但要等 ~2.2s 才进入 agent loop。

**改法**：`Promise.all` 并行。

```ts
const [, resumeMessages, sandboxResult] = await Promise.all([
  this._insertMessage(userMessage),
  this._buildAgentMessages(),
  this._setupSandbox(),
]);
```

**效果**：3 次 DB 调用从串行 ~2.2s 压到并行 ~800ms（取最慢一条）。

同样思路用在 `_setupSandbox` 内部：

```ts
const [sandbox, snapshots] = await Promise.all([
  pool.acquire(this.conversation.sandboxId ?? undefined),
  db.select().from(fileSnapshots).where(...),
]);
```

无论冷热 sandbox，DB 查询都和 sandbox acquire 同时跑——反正 sandbox 内部状态在两次 turn 之间不会变，提前拉 snapshot 不会脏读。

### 4.2 fileTracker 引入 `initialManifest` 快路径

**问题**：`fileTrackerMiddleware` 在 `beforeAgentRun` 里默认会做：

```ts
// 列出 sandbox 所有文件
const paths = await listAllPaths(sandbox);
// 一个个 readFile + sha256
for (const p of paths) { ... }
```

这是一次彻底的远程扫描，1.6s+ 起步。但在大多数 turn 里，DB 已经存了上一轮的 snapshots，sandbox 状态本来就是"我们刚写下去"的，再扫一遍纯属浪费。

**改法**：让上层把已知的 manifest 注入进来，跳过远程扫描：

```ts
beforeAgentRun: async () => {
  if (opts.initialManifest && opts.initialManifest.size > 0) {
    for (const [absPath, content] of opts.initialManifest) {
      manifest.set(toRel(absPath), { hash: await hashString(content), content });
    }
    await touchMarker(opts.sandbox);
    return;
  }
  // fallback: 远程扫描
}
```

`AgentTurnService._setupSandbox` 把刚拿到的 snapshots 直接喂给 fileTracker：

```ts
const initialFiles = snapshots.length > 0
  ? new Map(snapshots.map((s) => [s.path, s.content]))
  : null;
```

**效果**：`mw[fileTracker]` 从 1700ms 降到 ~50ms（只剩本地 hash 时间）。冷起也受益——只要 sandbox 是从已有 conversation 重连且有 snapshots，就走快路径。

### 4.3 fileTracker 的增量扫描

**问题**：bash 工具调用后，需要 reconcile 哪些文件被修改/删除。原方案是再跑一次完整的 `find + sha256sum`，每次 bash call 都要付一次 1.6s。

**改法**：

1. 引入 `/tmp/.agent-scan-marker` 作为 mtime 基线
2. `find -newer marker` 只列出基线之后被改动的文件，再 hash
3. `listAllPaths`（不 hash，只列路径）单独并行跑——用集合差集探测**删除**

```ts
async function reconcileBash(): Promise<void> {
  const [currentPaths, changedHashes] = await Promise.all([
    listAllPaths(opts.sandbox),
    scanChangedSince(opts.sandbox, SCAN_MARKER_PATH),
  ]);
  // ...处理 updates 和 deletes
  await touchMarker(opts.sandbox); // 推进基线
}
```

**为什么是这两段并行而不是一段全做**：

- `find -newer + sha256sum` 只返回**变更**的文件，没法知道"原来有但现在没了"
- `listAllPaths` 不 hash，只是路径枚举，本身就很快（10~100ms）
- 两条命令在 sandbox 里并行执行，付的是 max 而不是 sum

**效果**：bash 后的 reconcile 从 1.6s 降到 100~300ms（取决于改动量）。**未改动的文件付零 I/O**。

### 4.4 checkQuota 引入 LRU 内存缓存

**问题**：`beforeModel` 每次 LLM 调用前都查一次 `userQuotas` 表，700ms。一个 turn 跑 5 步就是 3.5s 纯白白等 DB。

**改法**：用 `lru-cache` 包做进程内缓存。

```ts
const quotaCache = new LRUCache<string, CachedQuota>({
  max: 1000,
  ttl: 30 * 60 * 1000,    // 30 分钟，admin 改额度后能自动生效
  updateAgeOnGet: true,
});
const inflightLoads = new Map<string, Promise<CachedQuota>>();
```

三个细节：

- **inflight coalescing**：同一个 user 并发 load 时，多请求合并成一次 DB 查询
- **`afterModel` 直接更新缓存**，让下一次 `beforeModel` 立即看到最新值
- **DB 写 fire-and-forget**：用 `void (async () => {...})()`，不阻塞 agent loop。SQL 用 `usedTokens + N` DB 端自增，并发 turn 也能正确收敛

```ts
afterModel: async ({ message }) => {
  const cached = quotaCache.get(userId);
  if (cached) cached.usedTokens += totalTokenCost;
  void (async () => {
    await db.update(userQuotas).set({
      usedTokens: sql`${userQuotas.usedTokens} + ${totalTokenCost}`
    }).where(eq(userQuotas.userId, userId));
  })();
}
```

**取舍声明**：

- admin 改额度需要等 TTL 过期或进程重启才生效——MVP 阶段可接受
- 进程崩溃时未持久化的 token 数会丢——用户多用一点点，不出大问题

**用户的关键纠正**：「**别自己实现 LRU，用开源的 package**」——一开始我倾向手撸，被否掉。`lru-cache` 提供 TTL、`updateAgeOnGet`、容量上限等都是免费送的，不该重新发明轮子。

**效果**：第一次 ~700ms，后续 ~0ms。

### 4.5 E2B `sdk.files.write` 批量写

**问题**：snapshot 恢复时一个 for 循环逐个 `writeFile`，N 次远程 RPC。

**改法**：E2B SDK 支持 `WriteEntry[]` 批量入参：

```ts
await sandbox.sdk.files.write(
  snapshots.map((s) => ({ path: s.path, data: s.content }))
);
```

**效果**：N 次 RPC → 1 次。对大 snapshots 集合（10+ 文件）省下数百 ms。

### 4.6 sandbox 复用与重连

`E2BSandboxPool.acquire(existingId?)` 优先 reconnect 已存在的 sandbox：

```ts
if (existingId) {
  try {
    const reconnected = await E2BSandbox.connect(existingId);
    return reconnected;
  } catch {
    // sandbox expired，再 create
  }
}
const fresh = await E2BSandbox.create();
```

热路径下 connect 比 create 快很多（避免 microVM 冷启动）。这块在本次优化前就已存在，但是和 `_setupSandbox` 并行化配合后效果更明显。

### 4.7 移除诊断日志

优化完成后所有 `[SSE]` / `[mw]` / `[agent]` 时间日志统一删除。日志本身有 stdout I/O 开销，并且会污染生产日志。**埋点只在调优期间存在，不要留下"以后说不定有用"的代码。**

---

## 5. 衍生需求：工作区隔离

调优过程中，用户截图发现前端文件树出现 `.bashrc`、`.profile` 等 `/home/user` 下的脏文件。fileTracker 默认从 `/home/user` 开始扫，把 sandbox 自带的 dotfile 也吸进了 manifest 和 DB snapshots。

**方案**：定义一个"项目工作区"，让所有读写、扫描、持久化都收敛到这一根目录下。

### 5.1 新建 shared constants

`packages/shared/src/constants.ts`：

```ts
export const SANDBOX_WORKSPACE_ROOT = "/home/user/project";

export const SANDBOX_IGNORED_DIRS = [
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  ".turbo", ".cache", "coverage", ".venv", "__pycache__",
] as const;
```

后端、前端、agent 提示词三方共用同一份常量——这是关键：**任何"约定"如果只写在一处，迟早会漂移**。

### 5.2 三层防线

| 层 | 措施 | 兜底场景 |
|---|---|---|
| **Agent 系统提示** | 明确告诉 LLM 工作区路径，所有路径用绝对路径 | 模型自觉性 |
| **fileTracker** | `find` 默认 `cwd: SANDBOX_WORKSPACE_ROOT`；single file write 加 out-of-workspace 守卫 | LLM 抽风时拦截 |
| **前端 file-tree** | `buildTree` 剥前缀 + 过滤 `IGNORED_SET` | 历史脏数据兜底 |

```ts
// fileTracker 守卫
if (absPath !== workspaceRoot && !absPath.startsWith(workspaceRoot + "/")) {
  console.warn(`[FileTracker] ignoring out-of-workspace write: ${absPath}`);
  return;
}
```

```ts
// 前端
function buildTree(paths: string[]): TreeNode[] {
  const prefix = SANDBOX_WORKSPACE_ROOT + "/";
  for (const filePath of paths.slice().sort()) {
    if (!filePath.startsWith(prefix)) continue;
    const parts = filePath.slice(prefix.length).split("/");
    if (parts.some((p) => IGNORED_SET.has(p))) continue;
    // ...
  }
}
```

### 5.3 关于 node_modules 的弯路

中间一度想把 `node_modules` 在 watcher 层屏蔽（学 vscode 的 `files.watcherExclude`）。深入调研后结论：

- E2B / Daytona / Modal 等远程沙箱**没有**给 watcher-level ignore
- inotify 在 microVM 里有 watch 数上限（默认 8192），递归 watch `node_modules` 一定爆
- 各家方案统一是 **snapshot-diff**，不走 inotify

最终决定：**不上 watch，继续用 snapshot-diff，但用 ignore 列表 + 工作区根目录把扫描面缩到最小**。`node_modules` 在沙箱里每次都是远端重 install，本来就不需要持久化到 DB。

> 用户原话：「Layer1 如果可以完美覆盖，就不用 layer2。后续 undo 我们可以在 agentRun 之后除了存 DB，还记录 version。这样就可以按照 agentRun 回滚了。」

---

## 6. 优化前后对比

按"用户发完消息到看到第一个 SSE event"的 wall clock 算（Supabase 海外区，普通会话）：

| 场景 | 优化前 TTFB | 优化后 TTFB |
|---|---|---|
| 冷起 sandbox（无 snapshots） | ~5.0s | ~2.5s |
| 冷起 sandbox（有 snapshots） | ~5.5s | ~2.0s |
| 热 sandbox | ~4.0s | **~0.8s** |

热路径下 5x 提升，体感从"卡顿到怀疑挂了"变成"几乎瞬时开始流"。

后续用户把 Supabase 迁到亚太区，single round-trip 从 700ms 降到 80ms，所有数字会再砍一刀——但**架构层面的并行 / 缓存 / 增量优化是和 DB 延迟正交的**，迁区是补丁，架构是地基。

---

## 7. 关键学习

### 7.1 不打日志不要优化

最初我有冲动直接改 sandbox 池子或者塞 worker。但凭感觉优化大概率是空炮。先埋点、跑数据、看哪个数字最大，再下手——5 个优化点全都是数据点出来的。

### 7.2 串行变并行是最便宜的优化

DB 查询、网络 I/O、远程命令，只要数据无依赖，统统 `Promise.all`。一行代码，吃掉一半延迟。

### 7.3 缓存的代价是过期问题，但要给自己留口子

quotaCache 牺牲了 admin 改额度的实时性。**但通过 TTL + `updateAgeOnGet` + `sql\`+ N\``** 这三件套，把可观测的副作用控制在"30 分钟内 admin 操作不生效 / 用户多用一点点 token"——MVP 完全可以接受。

### 7.4 fire-and-forget 是有代价的，但合适的时候很值

`afterModel` 里的 DB 写不阻塞 agent，但要求 SQL 必须是收敛运算（`+= N` 在 DB 端做）而不是 read-modify-write，否则并发会丢数据。

### 7.5 远程沙箱不要幻想 inotify

社区解法收敛在 snapshot-diff。增量扫描的关键是 **mtime baseline + `-newer`**，不是更聪明的 watcher。

### 7.6 共享常量比共享文档可靠

工作区路径、ignore 列表如果只在 README 里写一句"约定 `/home/user/project`"，半年后一定有人忘记。直接放 `@code-artisan/shared`，TS 类型 + 编译期错误兜底。

### 7.7 用户的红线很重要

- 「别自己实现 LRU」——避免无意义造轮子
- 「先删除 custom template」——避免在错误方向上沉没成本
- 「先删除诊断日志」——优化完了别留垃圾

---

## 8. 文件改动清单

| 文件 | 性质 | 关键变更 |
|---|---|---|
| `packages/shared/src/constants.ts` | 新增 | `SANDBOX_WORKSPACE_ROOT` / `SANDBOX_IGNORED_DIRS` |
| `packages/shared/src/types.ts` | 修改 | re-export constants |
| `packages/backend/src/services/agent-turn.ts` | 重构 | `Promise.all` 并行；构造器接 `Conversation`；prompt 加 workspace 说明 |
| `packages/backend/src/services/middlewares/track-file-changes.ts` | 重写 | `initialManifest` 快路径 + `-newer marker` 增量扫描 + workspace 守卫 |
| `packages/backend/src/services/middlewares/check-quota.ts` | 重写 | `lru-cache` + inflight coalescing + fire-and-forget DB 写 |
| `packages/backend/src/routes/message.ts` | 简化 | 删除诊断日志；构造器调用更精简 |
| `packages/frontend/src/components/workspace/file-tree.tsx` | 修改 | 剥 workspace 前缀 + 过滤 ignored dirs |
| `packages/backend/package.json` | 依赖 | `+ lru-cache` |

---

## 9. 后续可以做的事

- **Supabase 迁亚太区**：一刀切的延迟降低
- **Agent run version**：给 snapshot 加版本，支持按 agent run 回滚
- **自定义 E2B template**：预装项目常用依赖，进一步压冷启动
- **监控埋点**：把 TTFB / fileTracker 耗时 / quota cache hit rate 接入 telemetry，回归测试用
