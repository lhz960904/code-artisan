# 版本控制设计方案

> Agent 每轮跑完产出一个 checkpoint。用户可以预览历史版本、回滚到任一历史版本继续对话。
> **目标**：以最小架构改动 + 最优存储成本支持版本切换 / 回滚，复用现有 `fileTracker` 的 turn 边界与 sandbox 文件批量恢复链路。

---

## 一、当前架构梳理

| 模块 | 现状 | 与版本控制的关系 |
|---|---|---|
| `fileTracker` 中间件 (`afterAgentRun`) | 持有完整 manifest，调 `onPersist` 写入 `fileSnapshots` | **天然的 checkpoint 切点** — 每轮跑完都有一份完整文件态 |
| `fileSnapshots` 表 | `unique(conversationId, path)` — latest 镜像，覆盖式写 | **不是版本化** — 历史态全部丢失 |
| `acquireConversationSandbox` | 沙箱冷启动时从 `fileSnapshots` 全量恢复（`sandbox.sdk.files.write(batch)`） | **批量恢复链路可复用** — 切版本就是「按目标 manifest 重新 batch write」 |
| E2B sandbox | 单实例，dev server 长驻，`expose_port` 暴露唯一 preview URL | 切版本必须改沙箱磁盘 → Vite HMR 自动重编 → preview iframe 反映新内容；**不能并行预览多版本** |
| `messages` 表 | 按 `createdAt` 顺序持久化 | 回滚以 **append 一条 restore 事件** 方式建模（不删历史，不改 schema） |

---

## 二、核心设计

### 2.1 数据模型（content-addressed + manifest）

```text
file_blobs                          内容寻址 blob 池（跨 version / 跨 conversation 去重）
  hash         varchar PK          sha256 of content
  content      text                NUL-free, ≤500KB（沿用 fileTracker 上限）
  size         int
  created_at   timestamptz

versions                            checkpoint 节点
  id                     uuid PK
  conversation_id        uuid FK
  parent_version_id      uuid FK NULL          上一个版本（线性历史；回滚后下一轮的 parent = 回滚到的版本）
  created_by_message_id  uuid FK NULL          产生这个版本的那个 user message（UI 挂 badge 用）
  label                  text NULL             用户可改名："v3 - 加了登录页"
  file_count             int
  total_bytes            bigint
  created_at             timestamptz

version_files                       版本 → 文件清单
  version_id   uuid FK
  path         text
  blob_hash    varchar FK → file_blobs.hash
  PRIMARY KEY (version_id, path)

-- 增量改动现有表（仅 1 列）：
ALTER TABLE conversations
  ADD COLUMN current_version_id uuid REFERENCES versions(id);

-- messages 表完全不动 — restore 复用现有 messages 表
```

**为什么用 content-addressed**：50 轮 conversation 改 5 个文件，简单方案存 50× 全量；blob 去重后只多存 5×N（N=变更次数）。增量只是多一张表 + 一次 join，收益巨大。

**为什么 messages 表不加 `discarded_at`**：见 §2.3 — restore 用 **append 事件** 建模而非 **截断软删**，messages 不需要任何变更。

**`fileSnapshots` 表如何处置**：
- **保留**：作为 `current_version_id` 的物化缓存，沙箱冷启动直接读，避免每次都 join `versions + version_files + file_blobs`
- 维护策略：每次 `afterAgentRun` 写新 version 时，**同时**重写 `fileSnapshots`（语义不变）
- 长期可删，让 cold start 走 versions 表 join — 等性能成为问题再优化

### 2.2 版本生成（替换 `_persistFileSnapshots`）

`AgentTurnService.afterAgentRun` 拿到 `manifest: Map<absPath, content>` 之后：

1. 计算每个文件 hash（fileTracker 已经在做了，可以把 hash 一并传出来避免重算）
2. **批量 upsert blobs**：`INSERT ... ON CONFLICT (hash) DO NOTHING` — 已存在的自动跳过
3. **写新 version 行**：`parent_version_id = conversation.current_version_id`，`created_by_message_id = thisTurnUserMessageId`
4. **批量插 `version_files`**：每条 (versionId, path, blobHash)
5. **更新 conversation**：`current_version_id = newVersionId`
6. **重写 `fileSnapshots` 缓存**（沿用现有 upsert + delete-not-in 逻辑）

整个事务化（一个 `db.transaction`），失败回滚。性能：blob upsert 全用单条 multi-VALUES，version_files 一次性 batch insert，预期增量 < 50ms。

**何时不生成新版本**：
- Manifest 与上一版完全相同（没改任何文件）→ skip，复用 `parent_version_id`
- Agent 中途被 cancel / 报错 → 仍生成版本（用户能看到「这是 AI 中断时的状态」），但 label 加 `[interrupted]`

### 2.3 三类操作语义（关键：Bolt 风格的事件化 restore）

| 操作 | 沙箱文件 | conversation 状态 | messages 表 | UI |
|---|---|---|---|---|
| **View latest（默认）** | 等于 `current_version_id` 的 manifest | 不变 | 不变 | 正常 |
| **Preview a prior version** | 切换为目标版本的 manifest | 不变 — `current_version_id` 不动；新增 ephemeral `previewing_version_id`（前端 state，不入 DB） | 不变 | sender 区域横幅"You are viewing v3 (read-only)" + Exit preview 按钮；**输入框 disabled**（决策 1A：preview 期间不允许新对话） |
| **Restore to version** | 切换为目标版本的 manifest | `current_version_id = targetVersion` | **Append 一条 restore 事件消息**（见下） | 历史完整保留；restore 节点渲染成一个 chip："Restored to v3 · 12 files reverted" |

**Restore message 形态**（复用现有 `messages` 表，零 schema 改动）：

```ts
{
  id: uuid,
  conversationId,
  role: "system",                                        // 新角色用法
  content: [{ type: "text", text: "Restored to v3" }],   // 占位，UI 不渲染 text，只看 metadata 渲染 chip
  metadata: {
    type: "restore_checkpoint",
    restoredToVersionId: "...",      // 回到了哪个 version
    fromVersionId: "...",            // 从哪个 version 回的（撤销用）
    revertedFileCount: 12,           // 给 UI chip 显示
  },
  createdAt
}
```

**为什么 Bolt 方式（事件化）优于截断软删**：

| 维度 | 截断软删（已废弃） | 事件化 restore（采用） |
|---|---|---|
| 数据模型 | 需要 `messages.discarded_at` 列 + 撤销窗口 + GC | **零新列** — restore 是一条 message |
| 多次回滚链路 | A→v3→A→v1：discarded_at 多层栈管理复杂 | 每次都是 append 一条，自然链式 |
| 撤销操作 | 专门 `/restore-discarded` API + 24h 窗口 + 期间不能有新 turn | 撤销 = 再 restore 到上一版本，**对称操作**；无窗口 |
| UI 心智 | "12 条消息已丢弃" — 用户疑惑被删了什么 | 完整时间线，每次 restore 显式可见 |
| 代码量 | 软删过滤 + 折叠组件 + 撤销 API + GC | 一种新 message metadata，渲染一个 chip |

**为什么 Preview 也要锁输入**（决策 1A 修订）：原表述"防 AI 基于旧文件继续工作"是多余顾虑（AI 在 preview 模式根本不跑）。真正理由是 **防止文件态不一致下提交新指令** —— 用户在预览旧版本时，沙箱磁盘已经是旧态，此时若允许发消息，agent 会基于旧态回复但用户语境可能还在最新态，错位易致混乱。明确 "Restore 后才能继续聊" 是更清晰的状态机。

**为什么 Restore 不删 messages**：审计完整、用户可见、撤销对称、零数据丢失。Lovable / Bolt.new 验证过的模式。

### 2.4 AI 上下文裁剪（Bolt 方式的关键技术点）

事件化 restore 后，messages 表里同时存在「被回滚掉的对话」和「回滚后的对话」。**给 AI 的上下文必须只有 active 链**，否则 AI 会困惑（"我刚加的登录功能为什么文件里没有"）。

**`AgentTurnService._buildAgentMessages` 修改**：

```text
1. 拉所有 messages（按 createdAt asc）
2. 从末尾往前找最近一次 metadata.type === "restore_checkpoint"
3. 若有 → 切片：[restoreNode 之后的所有 message]
   若无 → 返回全部
4. restoreNode 自己不传给 AI（它是 host-side 元事件）
5. 将切片喂给 buildAgentMessages（attachments 展开等沿用）
```

**与 auto-compact 的关系**：现有 `metadata.compacted` 边界已经有同款 "找最近边界、之前不要" 的逻辑（见 `auto-compact` middleware）。`restore_checkpoint` 是同一种边界的另一种触发方式 —— 把判定函数抽出来：

```ts
const isHistoryBoundary = (m: Message): boolean =>
  m.metadata?.compacted === true ||
  m.metadata?.type === "restore_checkpoint";
```

**多次回滚示例**：

```text
messages timeline (DB 真实顺序):
  u1 a1 u2 a2 u3 a3 [restore→v1] u4 a4 [restore→v3] u5 ...
                       ^                  ^
                       这次切之前丢      最近一次 restore，从这切

AI 收到的上下文 = [u5, ...]    // 只有最近 restore 之后
UI 展示 = 全部                 // 用户能看到完整故事
```

**Token 节省**：和原截断方案完全等价，但 UI 完整、撤销对称、代码更简单。

### 2.5 沙箱同步算法（`syncSandboxToVersion`）

```text
input: targetVersionId
1. 拉 target manifest:    SELECT path, blob_hash, content
                          FROM version_files JOIN file_blobs ...
                          WHERE version_id = targetVersionId
2. 拉 current manifest:   从内存 fileTracker.manifest（快路径），
                          否则从 fileSnapshots 表（兜底）
3. diff:
     toWrite  = paths in target where blob_hash differs OR not present
     toDelete = paths in current not in target
4. 并行执行:
     sandbox.sdk.files.write(toWrite.map → {path, data})         单次 batch RPC
     Promise.all(toDelete.map(p → sandbox.sdk.files.remove(p)))  E2B 暂无 batch delete
5. 重建 fileTracker manifest（in-place）→ 触摸 SCAN_MARKER
6. 触发前端 file_update + file_delete SSE event（如果是 active conversation）
```

**沙箱挂了怎么办**：`acquireConversationSandbox` 冷启动路径已有 batch restore — 改成读 `current_version_id` 的 manifest 即可（或继续读 `fileSnapshots` 缓存，等价）。不需要为版本切换写新代码。

**性能预算**：典型 web app 50-200 文件，diff 后实际变更通常 < 10 文件，单次 E2B `files.write` batch RPC < 1s。

### 2.6 版本图（DAG）

```text
v0 ──── v1 ──── v2 ──── v3 ──── v4   ← 用户在 v2 上 Restore（messages: append [restore→v2]）
         │
         └── v5 (next turn after restore, parent=v2)
              └── v6 ...
```

- `parent_version_id` 形成 DAG，但 conversation 的"主线"由 `current_version_id` 倒序回溯 `parent_version_id` 决定
- 旧分支的 v3 / v4 仍在 DB（messages 仍可见、blobs 仍 ref'd）— UI 默认不展示它们的 file 内容，但可以做 "查看历史分支" 入口（v2 后置）
- 因为 messages 不删，所以**不需要 GC 24h 撤销窗口** — restore 永久可逆

---

## 三、API 设计

```text
GET  /api/conversation/:id/versions
     → [{ id, parentVersionId, createdByMessageId, label, fileCount, totalBytes, createdAt, isCurrent }]
     按 createdAt asc，前端自己根据 current_version_id 标 "current"

GET  /api/conversation/:id/versions/:versionId/files
     → [{ path, content }]   read-only fetch；preview UI 用来填 file-tree

POST /api/conversation/:id/versions/:versionId/preview
     body: {}
     效果: syncSandboxToVersion(versionId)；不改 conversation 状态；不写 messages
     返回: { syncedFiles: number, deletedFiles: number }

POST /api/conversation/:id/versions/:versionId/restore
     body: {}
     效果: 事务内 — syncSandboxToVersion + UPDATE conversation.current_version_id +
           INSERT 一条 role:system, metadata.type:"restore_checkpoint" 消息
     约束: 期间 conversation.agent_running = false（agent 跑着拒绝 restore，409）
     返回: { restoredVersion, restoreMessageId }

PATCH /api/conversation/:id/versions/:versionId
     body: { label }
     效果: 重命名版本
```

**注意没有 `/restore-discarded`** — 撤销回滚就是再调一次 `/restore` 到上一版本。

**流式同步**：preview / restore 触发的 file 变更，复用现有 SSE `file_update` / `file_delete` 链路 — `pendingEvents` push 即可，前端无新代码。

---

## 四、前端 UX

### 4.1 入口

| 入口 | 位置 | 内容 |
|---|---|---|
| **每条 user message 旁的 checkpoint 标签** | `message-bubble.tsx` UserBubble 右上角 | `v5 · 2 files`；hover 出 popover（`[Preview] [Restore] [Rename]`）；下拉显示该版本变更的 file 列表 |
| **Restore 节点 chip** | `message-list.tsx` 渲染消息时遇到 `metadata.type === "restore_checkpoint"` | 灰色细线 + 居中 chip："↻ Restored to v3 · 12 files reverted"；hover 显示精确时间 + From v5 → To v3 |
| **Workspace header 版本 dropdown** | `header.tsx` | timeline 列表：`v1 v2 v3* v4`（`*` = current）；当前 preview 高亮 |
| **Preview 模式横幅** | sender 上方 | "You are viewing v3 (read-only)"；按钮：`Exit preview` / `Restore this version` |

### 4.2 状态机

```text
viewMode: "current" | "previewing"
previewingVersionId: string | null   (Zustand workspace store)

current → previewing:
  1. POST /preview → 等待 200
  2. setViewMode("previewing") + setPreviewingVersionId(v)
  3. fetch versions/:v/files → workspace.replaceAllFiles(map)
  4. Sender disabled                                              ← 决策 1A

previewing → current (Exit preview):
  1. POST /preview with currentVersionId
  2. setViewMode("current")
  3. workspace.files 由 SSE file_update 自动追上

previewing → restore:
  1. POST /restore
  2. invalidate messages query → 拿到含新 restore 节点的列表（直接重排）
  3. 退回 viewMode("current")，currentVersionId = targetVersion
  4. Sender 重新启用
```

`workspace.files` 已有 `updateFile` / `deleteFile`，新增 `replaceAllFiles(map: Map<path, content>)` 即可。

### 4.3 Sender 锁（决策 1A）

`workspace.viewMode === "previewing"` 时 ChatPanel 把 `disabled` 透给 Sender，placeholder 改为 "Exit preview to send messages"。

### 4.4 Message 渲染流水线接入

`message-chunks.ts` 的 `buildChunks` 加一种 `RestoreChunk`：

```ts
// 遇到 metadata.type === "restore_checkpoint" → 直接 push RestoreChunk{ ... }
// 不参与 todoList / loose tool 折叠逻辑
```

`ChunkRenderer` 新增 dispatch：`RestoreChunk → <RestoreNodeChip />`。

---

## 五、迁移与上线

### 5.1 迁移

```sql
-- migration 1: 新表
CREATE TABLE file_blobs (...);
CREATE TABLE versions (...);
CREATE TABLE version_files (...);

-- migration 2: 改 conversations（仅 1 列）
ALTER TABLE conversations ADD COLUMN current_version_id uuid REFERENCES versions(id);

-- migration 3: 一次性回填（让历史 conversation 有 v0）
-- 对每个 conversation：把当前 fileSnapshots 视为 v0，绑到第一个 user message
--   1. INSERT INTO file_blobs (hash, content, size) ... ON CONFLICT DO NOTHING
--   2. INSERT INTO versions (..., created_by_message_id = first_user_msg.id) RETURNING id
--   3. INSERT INTO version_files SELECT v0.id, path, hash FROM ...
--   4. UPDATE conversations SET current_version_id = v0.id
-- 用 backend script，幂等
```

### 5.2 灰度

- Phase 1：后台写 versions（影子写），前端不展示版本入口 → 验证写入正确性 + 存储增长
- Phase 2：开版本 dropdown + Preview（read-only，最安全）
- Phase 3：开 Restore（破坏性弱化版 — 因为可对称撤销，不需要二次确认对话框，但 toast 提示 "Undo by restoring previous version"）

### 5.3 GC

只剩 blob 层面的 GC（messages 永不删）：

```text
nightly job:
  1. 标记没被任何 version 引用的 blobs
     ref_count = (SELECT COUNT(*) FROM version_files WHERE blob_hash = X)
  2. ref_count = 0 → 删 blob
```

可选：`file_blobs` 列加物化的 `ref_count`，trigger 维护，避免每次 GC 全表扫。先不做，YAGNI。

**注意**：因为 restore 不删历史，旧版本（如 v3 v4）仍被 conversation 引用 — 它们的 blob 永远有 ref。这是预期行为，等于"用户的所有版本永久保留"。如果后续要做"清理 90 天前的废弃分支"再加策略。

---

## 六、不在本方案里的事（明确范围）

- **沙箱 fork / pause-resume**：E2B 的 snapshot API 单次操作秒级，per-turn 用代价过高；DB 层 manifest 已经够用
- **多版本并行预览**：单沙箱 + 单 dev server 物理上做不到；想做需要 per-version 起独立 sandbox（成本 ×N，先不考虑）
- **真 git 集成**：未来对接 GitHub 时再说（Lovable 路线）；现在每个 version 已经是 commit-shaped，迁移到 git 是平滑的
- **diff 可视化**：UI 仅展示「N files changed」，逐行 diff 后置（可用 monaco diff editor，但放 v2）
- **版本搜索 / 标签 / 收藏**：YAGNI

---

## 七、与既有约定一致性 check

| 约定 | 本方案 |
|---|---|
| Routes 薄、orchestration 在 services | 新增 `services/version-service.ts`，routes 只做 validate + delegate |
| Folder-per-module | `services/version-service/` 下 `manifest.ts` / `sync.ts` / `gc.ts` |
| Block-based 消息模型 | 不动 messages.content 形态；`role: "system"` + `metadata.type: "restore_checkpoint"` 是一种新元事件用法 |
| Cooperative stop | Restore 不打断正在跑的 agent — 后端检查 `agent_running` flag，跑着直接 409 |
| 中间件 / 服务都用 class for stateful logic | `VersionService` 类持有 transaction helper；`syncSandboxToVersion` 是纯函数 |
| 注释规范 | 仅写 non-obvious why（如 ctime vs mtime 的现有注释风格）|

---

## 八、实施顺序（建议）

1. **DB schema + migration**（drizzle）+ 单元测试 blob 去重
2. **`VersionService.createFromManifest`** + 接到 `AgentTurnService._persistFileSnapshots`（影子写）
3. **回填脚本** + 跑一遍现有 conversation
4. **`syncSandboxToVersion`** + `/preview` API + 前端 viewMode + Sender 锁
5. **`/restore`** + restore 事件 message 写入 + AI 上下文裁剪（`_buildAgentMessages` 找最近 restore 边界）+ RestoreChunk 渲染
6. **GC job**（cron 或手动触发，先用 vitest 验证）— blob ref_count
7. **UI 抛光**：checkpoint badge / dropdown / restore chip 样式

每步都可独立交付，不破坏现有功能。

**关键风险点**：第 5 步 AI 上下文裁剪必须配合 restore 事件写入一起上线 —— 只要先一只脚（写了 restore 但 AI 还看全部），AI 就会基于不存在的文件回复。务必同 PR 推。
