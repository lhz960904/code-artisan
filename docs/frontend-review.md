# Frontend 代码勘察报告

*生成时间：2026-04-16 · 审查 commit：447ebc7*

## 结论摘要（TL;DR）

1. 整体骨架（Vite + TanStack Router + TanStack Query + Zustand）方向正确，但正处在**多范式混用的中间态**：Zustand 刚进来，旧的 `useState/useRef`、Context 还残留，`useChat` hook 自管消息状态与 SSE、绕过 React Query，形成了三套事实上的状态源。
2. 数据流最大隐患在 `use-chat.ts` 的 SSE 层：**无重连、无心跳、无 backoff、依赖 `EventSource`（不能带自定义 header，刷新页面就丢 stream）、`onerror` 只触发一次回读**；加上乐观消息靠 id 前缀 `opt-` 匹配，duplicate/race 场景易错乱。
3. 组件尺寸整体健康（最大 `mcp-servers.tsx` 346 行），但 `ChatPanel` 把"消息渲染 + 文件/终端/预览副作用投影"两件事塞在一起，属于职责不分。副作用投影逻辑（`processAssistantSideEffects`）是后续拆 worker / 迁 server 的首要目标。
4. 类型安全存在**接口漂移**：`useConversationUpdate` 的 payload 类型里没有 `mode`，但 `Header` 已经在 `mutate({ id, mode })`（见 `header.tsx:21` vs `conversations.ts:98`），TS 却不会报错——因为 `mode` 被 `...updates` 吞掉。类似的 `state: {...} as never`（`chat.$conversationId.tsx:20`）也在掩盖类型。
5. 依赖和 shadcn 管理偏糙：`react-resizable-panels`、`@supabase/supabase-js` 装了基本没用；`ui/tabs.tsx` `ui/tooltip.tsx` `ui/separator.tsx` 里很多是装着没用的 shadcn 组件；`@types/react-syntax-highlighter` 放错到了 `dependencies`。**另：`lucide-react@^1.7.0`、`react-syntax-highlighter@^16.1.1`、`@xterm/xterm@^6.0.0`、`react-resizable-panels@^4.8.0` 四个版本号高度可疑（远高于官方 latest），需要核查是否为 AI 幻觉出来的错误版本。**

---

## 整体架构

### 现状
- 目录：`routes/`（file-based 路由）+ `components/{chat, workspace, layout, common, ui}/` + `hooks/` + `stores/` + `contexts/` + `lib/{apis, auth-client, supabase, utils}`。
- 入口链：`main.tsx` → `app.tsx`（`QueryClientProvider` → `ThemeProvider` → `RouterProvider`）→ `routes/__root.tsx`（做 auth gate + 布局分叉）→ 具体 route。
- 三个 route：`/`（HomePage）、`/login`、`/mcp-servers`、`/chat/$conversationId`。
- 状态源有四个：TanStack Query、`useWorkspaceStore`、`useChat` 内部的 `useState`、`ThemeContext`。

### 问题
- 🟡 **`useChat` 既管 UI 状态（messages/status）又自己开 SSE 自己 refetch**（`use-chat.ts:47-234`），这既不是 React Query 的"server state"也不是 Zustand 的"client state"，它游离在外。后续 URL 切换/多 tab 时会首先在这里崩。
- 🟡 **聊天消息侧边效应写到 workspace store 的逻辑**散落在两个地方：SSE 事件的 `onFileChange/onFileDelete`（`chat-panel.tsx:57-65`）和基于 messages 的 `processAssistantSideEffects`（`chat-panel.tsx:86-99, 150-189`）。这等同于事件驱动 + 轮询驱动双路径，容易出现"同一次写文件写两次"（SSE `file_update` 走一次，随后 `read_file` tool_result 再走一次）。
- 🟢 `contexts/` 目录现在只有 `theme-context.tsx`，无价值的独立目录。可以并入 `stores/` 或 `components/theme-provider.tsx`。
- 🟢 `components/layout/home-page.tsx` 其实是一个路由页面组件，放 `layout/` 语义不对；`home-page` 应该直接作为 route 组件或搬到 `routes/`/`features/home/`。
- 🟢 `lib/supabase.ts` 目前全项目**无人引用**，是死文件，但 `message-bubble.tsx:157` 又硬编码访问了 `import.meta.env.SUPABASE_URL`，这两处应该合到一起或都干掉。

### 建议
- 考虑引入 `features/` 切面：`features/chat/`, `features/workspace/`, `features/mcp/`，把同一个领域下的 hook/ui/api 聚拢。现在按"类型（hook/component/lib）"组织，领域下沉后更易重构。
- 把 SSE 视为"server state 的推送通道"，把消息 state 让回 React Query：让 `useMessages` 变成权威，SSE 只负责增量 `setQueryData` 和 invalidate。这能一次性解决 `useChat` 里冗余的乐观 id 逻辑、`initialMessages` 同步逻辑。

---

## 1. 目录与职责

- **现状**：见上。`common/` 目前只有 `markdown-renderer.tsx`，`hooks/` 两个（`use-chat`, `use-file-upload`）。
- 🟢 **问题**：`chat-panel.tsx:150-189` 的 `processAssistantSideEffects` 是纯函数但紧耦合 store actions，应抽到 `features/workspace/lib/project-tool-side-effects.ts` 并写单测。
- 🟢 `buildToolResultLookup` 从 `message-bubble.tsx:144-153` 导出供 `chat-panel.tsx` 使用——逻辑归组件有点勉强，适合挪到 `lib/tool-results.ts`。

---

## 2. 状态管理

### 现状
- Zustand store：`stores/workspace.ts`，管 files/openTabs/activeTab/terminalHistory/previewUrl。使用了细粒度 selector（`chat-panel.tsx:41-46`）以及 `useShallow`（`editor-panel.tsx:37-46`, `file-tree.tsx:104-106`）——姿势正确。
- React Query：默认 `staleTime: 30_000`、关闭 `refetchOnWindowFocus`（`app.tsx:6-13`），缓存 key 规范（`["conversations", id, "messages"]`）。
- `useChat` 自己持有 messages，`initialMessages` 从 React Query 同步过来（`use-chat.ts:63-71`）——形成"两份 messages"。

### 问题
- 🔴 **`useChat` 的 messages 和 `useMessages` 的 cache 不同步**：`use-chat.ts:66` 用 `prev.some(m => m.id.startsWith("opt-"))` 判断要不要覆盖，一旦乐观消息还没被 SSE 真实消息替换又恰好 `useMessages` refetch（比如网络波动）就会出现 "optimistic 被迟到的空消息覆盖/被老列表覆盖"。`use-chat.ts:73-79` 的 `refetchMessages` 直接 `setMessages`，绕开了 React Query 的 cache —— 其他地方如果用了 `useMessages`，会读到过期值。
- 🟡 `useConversationUpdate` 类型（`conversations.ts:98`）签名是 `{ id: string; title?: string }`，但 `header.tsx:21` 传了 `{ id, mode }`，TS 不报错（被 `...updates` spread 吸收）。接口漂移，建议 payload 显式字段。
- 🟡 `RightPanel` 的 `activeTab` 是组件内 `useState`（`right-panel.tsx:14`），但它和 `previewUrl` 的联动用 `useEffect`（`right-panel.tsx:16-18`）——预览 URL 到达就切到 preview 这一行为属于跨组件策略，适合放进 store（或者用 derived state），这样 Header 的"在新窗口打开"等按钮也能协同。
- 🟡 `chat-panel.tsx:70` 的 `processedRef = useRef(new Set<string>())` 是一个隐式的"已处理消息 id"缓存，**不会随 conversationId 重置**（只有组件卸载时才清）。切换会话如果路由 key 没让组件卸载，旧 conversation 的 message id 会继续在 set 里，极端情况下 id 冲突会漏投影。应改成按 `conversationId` 重置。
- 🔴 `stores/workspace.ts:28-34` 的 `initialState` 是一个共享对象引用，`reset()` 直接 `set(initialState)` 把同一个 `Map` 实例塞回去——第二次 reset 后 Map 里还是上次的数据。**潜在 bug**：应该在 `reset` 内部新建 Map/数组，或 `initialState` 改工厂函数。

### 建议
- 让 `useChat` 只负责 SSE 连接和发起 mutation；消息本身用 `queryClient.setQueryData(["conversations", id, "messages"], draft)` 增量写回。
- `useConversationUpdate` 的 variables 接 `Partial<Pick<ConversationResponse, "title" | "mode">>`，让 TS 真正守住。
- `reset` 改成 `set({ files: new Map(), openTabs: [], activeTab: null, terminalHistory: [], previewUrl: null })`，或把 `initialState` 改成 `() => ({...})`。

---

## 3. 数据流 & SSE

### 现状（`use-chat.ts`）
- 连接：`new EventSource(streamUrl)`，只在 `conversationId` 变化或 `sendMessage` 后 `connectSSE()`。
- 事件处理：`message` / `file_update` / `file_delete` / `done` / `error` 五类（`use-chat.ts:83-131`）。
- 错误：`es.onerror` 关闭连接并 `refetchMessages`，**不重连**（`use-chat.ts:153-157`）。
- 乐观消息：`opt-${Date.now()}` 前缀，SSE 到达时 `filter(m => !m.id.startsWith("opt-"))`（`use-chat.ts:90`）。

### 问题
- 🔴 **`EventSource` 无法带自定义 header**，better-auth 基于 cookie 勉强能过，但一旦需要 `Authorization` 就卡死。建议用 `fetch` + `ReadableStream` 自己做 SSE 解析，顺便可以带 `AbortController`、支持 `Last-Event-ID` 断点续传。
- 🔴 **无重连、无 backoff、无心跳**。`onerror` 关闭后等用户重新发消息才会再 `connectSSE`（`use-chat.ts:212`），如果 agent 还在跑，前端就"睡死"了。需要：指数退避重连 + 服务端心跳 `ping` + 客户端 15s 没收到 ping 主动重连。
- 🟡 **重复事件容忍**：`message` 用 id 去重（`use-chat.ts:91-96`）OK；但 `file_update` 直接回调 `onFileChange`（`use-chat.ts:100-102`），加之 `processAssistantSideEffects` 在 message 到达时又会根据 tool_use 写一遍 —— 同一个 write_file 可能写两次（一次 SSE、一次 tool_use 重放）。幂等没问题但浪费，最坏情况如果 tool_use 的 input 和实际写入不一致，会覆盖真实内容。
- 🟡 **乐观消息容错**：`opt-` 前缀和 `use-chat.ts:66` 的 `prev.some(startsWith("opt-"))` 组合意味着"只要有任何 optimistic 就不吃 initialMessages"。切会话时如果上一个会话残留 optimistic，初始化会挂住。
- 🟡 `use-chat.ts:60`: `optionsRef.current = options` 每次 render 都无条件覆盖——OK 但没有 guard，如果 options 里的回调是匿名函数每次 render 都变，实际效果等同于直接用 `options`。这是常见做法，但等同于文档化"我在用最新值"。
- 🟢 `use-chat.ts:176` `if (!conversationId || sendInFlightRef.current) return;` **静默失败**——用户连按会被吞，UI 无反馈。应抛错或 toast。
- 🟢 `use-chat.ts:148` 解析失败 `catch {}` 吞错，DevEx 很差。至少 `console.warn`。

### 建议
- 用 `fetchEventSource`（@microsoft/fetch-event-source 或自研）替换 `EventSource`。
- SSE 层增加：`Last-Event-ID`、心跳、重连 backoff。
- 把 SSE 事件处理集中到一个 reducer：`applyEvent(state, event): state`，配 unit test。
- 把"tool_use 驱动的文件投影"和"SSE `file_update` 驱动的文件投影"合并成一个 pipeline，走 SSE 权威、tool_use 仅作 fallback。

---

## 4. 组件设计

### 尺寸热点
- `routes/mcp-servers.tsx` 346 行：一个文件四个组件（`McpServersPage` / `ServerCard` / `InstallDialog` / `EditDialog` / `EnvVarInput`）。🟡 建议拆到 `features/mcp/` 下。
- `components/chat/chat-input.tsx` 250 行：自定义 dropdown（`menuRef` outside-click）、拖拽、粘贴、文件 input、auto-resize、model selector 全塞一个文件。🟡 可以抽：
  - `useAutoResizeTextarea`
  - `usePasteFiles` / `useDragDropFiles`
  - 用 shadcn `DropdownMenu` 代替手写 menu（需新增 ui/dropdown-menu）。
- `chat-panel.tsx` 189 行，🟡 关键问题是副作用投影和渲染混一。
- `message-bubble.tsx` 160 行，内部分 `UserBubble`/`AssistantBubble`/`ThinkingBlock`/`buildToolResultLookup`/`resolveImageUrl`，职责基本清晰。

### 重复逻辑
- 🟡 `editor-panel.tsx:7-31` 的 `getLanguage` 和 `file-tree.tsx:54-100` 的 `getFileIcon` 各有一套"按扩展名分流"，可以共用 `lib/file-extensions.ts`。
- 🟢 `HomePage`（`home-page.tsx`）和 `ChatInput` 都手写 `Enter/Shift+Enter` 处理、都有 textarea —— 可以抽 `<PromptTextarea>`。

### Props drilling
- 🟢 `workspace-layout.tsx` → `ChatPanel` 透传 `conversationId`、`initialMessage`，后者又只为了首屏用户消息而一路透传（两层），可以塞进路由 state 由 `ChatPanel` 自己拉取。
- 🟢 `RightPanel` 不接受任何 props（全部从 store 拉），👍 最干净。

---

## 5. 性能风险

- 🟡 `chat-panel.tsx:86-99` 的 `useEffect` 依赖 `[messages, toolResultLookup, updateFile, openFile, appendTerminal, setPreviewUrl]`。每次 messages 新增一条就重算 `toolResultLookup`（`useMemo` OK）并扫一遍整个数组。目前通过 `processedRef` 避免重复投影，但仍在主线程 O(n) 地扫——长会话会卡。建议只处理最后 K 条或维护游标。
- 🟡 `file-tree.tsx:151` 每次 render 都 `Array.from(files.keys())` + `buildTree` 重建整棵树。文件多时掉 FPS。加 `useMemo`。
- 🟡 `editor-panel.tsx:47` `files.get(activeTab)` 每次父组件 render 执行——OK，但外层 `@monaco-editor/react` 每次收到新 `value` 会 diff 整个 buffer，频繁 SSE 下会浪费。考虑 `useDeferredValue`。
- 🟢 `terminal-panel.tsx` 已经用 `writtenCountRef` 做增量 writeln，👍。但 `ResizeObserver` 回调里直接 `fit.fit()` 可以 rAF 节流。
- 🟢 Monaco 在每次 conversation 切换都会重新挂载（`ChatPage` 的 `reset`→`openTabs=[]`→`EditorPanel` 走空态）。这是正确行为但意味着切会话有 200-500ms 的白屏。可以考虑 Monaco 单例跨会话复用。

---

## 6. 类型安全

- 🟡 `header.tsx:21` `updateConv.mutate({ id, mode: newMode })` 但 `useConversationUpdate` 签名没有 `mode`（`conversations.ts:98`）。已述。
- 🟡 `home-page.tsx:20` `state: { initialMessage: content } as never` —— 粗暴断言。TanStack Router 1.95 支持 `validateSearch` / typed state，应补上。
- 🟡 `chat.$conversationId.tsx:13` `select: (s) => (s.location.state as { initialMessage?: string })?.initialMessage` —— 同上。
- 🟡 `chat-panel.tsx:163` `const input = tu.input as Record<string, unknown>` 紧接着 `typeof input.path === "string"` —— OK，但 shared 里应该为每种 tool 暴露 discriminated union（`{ name:"write_file"; input:{path,content} }`），前端消费就不用判断 typeof。
- 🟡 `message-bubble.tsx:157` `const baseUrl = import.meta.env.SUPABASE_URL as string;` —— `.env` 变量如果缺失会返回 `undefined`，`as string` 只是安抚 TS。应该 runtime 校验 + fallback。
- 🟢 `routeTree.gen.ts` 里有 `as any` —— 生成文件，忽略。
- 🟢 `lib/apis/client.ts:3` `apiFetch<T>` 默认返回 `res.json()` 但没有 runtime schema 验证，任何后端字段漂移都到 UI 崩才被发现。上 `zod`/`valibot` 做 boundary。

---

## 7. 代码质量 & 可维护性

- 🟢 命名总体一致（camelCase hooks / PascalCase components / kebab-case files）。
- 🟢 注释足够（`use-chat.ts` 有良好英文注释）。
- 🟡 `user-profile.tsx:39` 硬编码中文 `"免费版"`，其他地方都是英文 UI——i18n 需要规划。
- 🟡 魔数：`chat-input.tsx:40` `200`（最大高度）、`use-file-upload.ts:14-15` `MAX_FILES=5, MAX_SIZE=10MB`、`terminal-panel.tsx:41` `scrollback: 5000`、`app.tsx:9` `staleTime: 30_000`、`workspace-layout.tsx:15` `w-[400px]`。集中到 `lib/constants.ts`。
- 🟡 错误处理不一致：`use-chat.ts:78` `.catch(() => {})` 吞；`chat-input.tsx` 文件超大时就塞个 `!` 图标（`attachment-preview.tsx:49`）没有 toast；`login.tsx:20-24` 仅 `console.error`。缺一个全局 toast/error-boundary。
- 🟢 `lib/supabase.ts` 整文件是死代码。
- 🟢 `routes/__root.tsx:7-16` 在 `beforeLoad` 调用 `getSession()`，每次路由切换都会去 better-auth 验证一次。考虑 React Query 缓存 session。

---

## 8. UI / UX

- 🔴 **加载态覆盖不足**：`ChatPanel` 初次加载消息没有 skeleton（`useMessages.isLoading` 没用）；`AppSidebar` 会话列表没有 skeleton；`Header` 的 `conv` 和 `quota` 没 fallback 骨架。
- 🟡 **错误态**：`useChat` 出错只进 `status: "error"`，UI 只把 send 按钮变 disabled（`chat-panel.tsx:101`），看不到错误消息。
- 🟡 **空态**：`preview-panel.tsx`、`editor-panel.tsx`、`file-tree.tsx` 有空态 👍。`RightPanel` 无会话文件时整个 tab 栏会只剩 Code + Terminal，且 `useEffect` 会把 activeTab 留在 `code`——可以考虑统一的空 workspace 欢迎页。
- 🟡 **键盘可达性**：`message-bubble.tsx:125` 的 Thinking 折叠用 `<button>` 👍；`tool-call-item.tsx` 同；但 `chat-input.tsx:174` 的自定义 dropdown 没有 aria-role/expanded、没键盘导航，用 shadcn `DropdownMenu` 就免费拿到。
- 🟡 **焦点管理**：发消息后 textarea 不会自动 refocus（`chat-input.tsx:55-60`）。
- 🟢 **移动端**：`workspace-layout.tsx:15` 固定 400px 左栏、右侧 `flex-1`——<768px 会挤爆。目前看产品定位是桌面，无需强求。
- 🟢 `MarkdownRenderer` 没装 `remark-gfm`，表格/任务列表不会渲染；如果 LLM 输出常见，建议加上。

---

## 9. 安全 & 健壮性

- 🟡 **XSS**：`markdown-renderer.tsx` 基于 react-markdown，**默认已禁用原始 HTML**（需要显式开启 `rehype-raw` 才能注入），✅。但 `message-bubble.tsx:64` 的 `img src={resolveImageUrl(c.image_url.url)}` 直接吃 LLM 或用户给的 URL——如果 URL 是 `javascript:`，`<img src>` 不执行 JS，安全；但 `resolveImageUrl` 没有白名单校验 host，可以被当 tracking pixel。建议白名单 `files/...` 或 `https://...`。
- 🔴 **iframe sandbox**：`preview-panel.tsx:51` `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` —— `allow-scripts` + `allow-same-origin` 同时出现时 iframe 可以脱出 sandbox 访问父页面 cookie/localStorage，**这是 MDN 明确的危险组合**。建议：preview 跑在独立 origin（`*.preview.example.com`）上，然后只保留 `allow-scripts allow-forms allow-popups`。
- 🟡 **iframe 刷新逻辑**：`preview-panel.tsx:28-31` 用 `document.querySelector` 找 iframe DOM 并直接写 `src` —— 反 React 模式。应该用 `ref` + `key` 重置。
- 🟡 **文件上传校验**：`use-file-upload.ts:31` 只校验大小，没校验 mime 白名单，后端必须兜底。
- 🟡 **Auth gate**：`__root.tsx:7-16` 做了 beforeLoad 重定向 ✅。但 `upload.ts:8` 调 `/api/upload` **没有带 `credentials: "include"`**（而 `apiFetch` 有），若后端认证依赖 cookie 会 401。

---

## 10. 依赖使用

- 🟡 **无用依赖**：
  - `react-resizable-panels@4.8.0`：`Grep "react-resizable-panels"` 零命中，应删。
  - `@supabase/supabase-js@2.49.1`：只在 `lib/supabase.ts` 被 import 但该文件无人用，要么接入要么删。
- 🟡 **依赖位置错**：`@types/react-syntax-highlighter` 在 `dependencies` 里（`package.json:20`），应挪到 `devDependencies`。
- 🔴 **版本号疑似幻觉**（官方 npm latest 对照）：
  - `lucide-react@^1.7.0` —— lucide-react 官方最新是 `0.5xx.x` 系列，`1.7.0` 高度可疑（且前面已证实缺失品牌图标）。
  - `react-syntax-highlighter@^16.1.1` —— 官方最新是 15.x。
  - `@xterm/xterm@^6.0.0` —— `@xterm/*` scope 下最新是 5.x。
  - `react-resizable-panels@^4.8.0` —— 官方最新 2.x。
  
  四个包都锁在了远高于官方 latest 的版本，非常像 AI 生成 package.json 时幻觉出来的版本号。建议 `bun pm view <pkg>` 核实后回滚到真实最新版。

- 🟡 **shadcn 管理**：`components.json` 正确配置，`ui/` 下组件像 cli 装的（`data-slot`、`"use client"` pragma）。装了没用的：
  - `ui/tabs.tsx` — 无人 import。
  - `ui/tooltip.tsx` — 无人 import。
  - `ui/separator.tsx` — 无人 import。
  - `ui/scroll-area.tsx` — `app-sidebar.tsx` 用了，保留。
  - `button/input/textarea/badge/dialog` 有用。
  清理一下，不要养没人用的组件。

---

## 重构优先级 Roadmap

### P0（立即，安全/数据完整性）
1. **审核并纠正 4 个疑似幻觉版本**：`lucide-react`, `react-syntax-highlighter`, `@xterm/xterm`, `react-resizable-panels`。
2. **iframe sandbox**：去掉 `allow-same-origin` 或将预览移到独立 origin（`preview-panel.tsx:51`）。
3. **SSE 可靠性**：`useChat` 替换为 `fetchEventSource`，加重连 + 心跳 + `Last-Event-ID`。
4. **`stores/workspace.ts` reset bug**：`initialState` 改工厂函数或 `reset` 里新建 Map，避免跨次 reset 共享 Map 实例。
5. **`useConversationUpdate` 类型补齐 `mode`**，消除 header 的静默漂移。

### P1（两周内，质量）
6. 把 `useChat` 的消息 state 并回 React Query（`setQueryData` + SSE 增量）。
7. 抽 `features/chat/`, `features/workspace/`, `features/mcp/`，把 `processAssistantSideEffects` 移出组件并加测试。
8. 删除死代码：`lib/supabase.ts` 或落地使用；`react-resizable-panels`, `@supabase/supabase-js`（如不用）。
9. 加全局 ErrorBoundary + toast 系统（`sonner` 或 shadcn 自带）；SSE / upload / mutation 错误统一提示。
10. 骨架屏：ChatPanel / AppSidebar / Header quota。
11. `upload.ts` 补 `credentials: "include"`。
12. `chat-input.tsx` 换成 shadcn `DropdownMenu`；抽 `useAutoResizeTextarea`。

### P2（有空改）
13. 把 `editor-panel/file-tree` 的扩展名查表合并成 `lib/file-extensions.ts`。
14. `constants.ts` 收敛魔数。
15. `apiFetch` 加 zod runtime 校验。
16. Monaco/xterm 单例跨会话复用，消除切会话白屏。
17. i18n 方案（目前只有 `"免费版"` 一处中文）。
18. `MarkdownRenderer` 加 `remark-gfm`。
19. 清理无用 shadcn 组件（`tabs`, `tooltip`, `separator`）。
20. 路由 state 用 typed state 替换 `as never`。

---

## 附录：文件清单

| 文件 | 行数 | 功能 |
|---|---:|---|
| `src/main.tsx` | 10 | React 根挂载 |
| `src/app.tsx` | 31 | Providers（Query / Theme / Router）|
| `src/index.css` | - | Tailwind v4 入口 |
| `src/routes/__root.tsx` | 41 | 根布局 + auth gate + sidebar 条件渲染 |
| `src/routes/index.tsx` | 6 | Home 路由（shim → HomePage）|
| `src/routes/login.tsx` | 135 | 登录页（GitHub OAuth + 占位）|
| `src/routes/mcp-servers.tsx` | 346 | MCP 市场/安装/卸载，含 InstallDialog / EditDialog |
| `src/routes/chat.$conversationId.tsx` | 23 | 会话路由，处理 initialMessage + workspace reset |
| `src/routeTree.gen.ts` | 113 | 自动生成 |
| `src/contexts/theme-context.tsx` | 60 | 主题 Provider（dark/light/system + localStorage）|
| `src/stores/workspace.ts` | 86 | Zustand workspace store（files/tabs/terminal/preview）|
| `src/hooks/use-chat.ts` | 234 | SSE + messages + optimistic + sendMessage |
| `src/hooks/use-file-upload.ts` | 102 | 本地文件队列 + 上传 |
| `src/lib/apis/client.ts` | 18 | `apiFetch` 通用 fetch 封装 |
| `src/lib/apis/conversations.ts` | 140 | 会话 + 消息 + 文件快照 API + hooks |
| `src/lib/apis/mcp-servers.ts` | 69 | MCP CRUD hooks |
| `src/lib/apis/upload.ts` | 19 | 文件上传（multipart）|
| `src/lib/apis/quota.ts` | 23 | token 配额 |
| `src/lib/apis/index.ts` | 24 | barrel |
| `src/lib/utils.ts` | 6 | `cn(clsx+twMerge)` |
| `src/lib/auth-client.ts` | 8 | better-auth 客户端 |
| `src/lib/supabase.ts` | 6 | **未使用** |
| `src/components/layout/home-page.tsx` | 60 | Home 页面（创建会话 + 首 prompt）|
| `src/components/layout/app-sidebar.tsx` | 85 | 侧栏（会话列表 + 导航 + UserProfile）|
| `src/components/layout/header.tsx` | 68 | 顶栏（title / mode toggle / quota / preview）|
| `src/components/layout/user-profile.tsx` | 50 | 头像 + 登出 |
| `src/components/chat/chat-panel.tsx` | 189 | 消息列表 + 输入 + 副作用投影（巨石）|
| `src/components/chat/chat-input.tsx` | 250 | Textarea + 拖拽 + 粘贴 + dropdown + 附件预览 |
| `src/components/chat/message-bubble.tsx` | 160 | user/assistant/thinking + toolResultLookup |
| `src/components/chat/tool-call-item.tsx` | 73 | tool_use 折叠卡片 |
| `src/components/chat/attachment-preview.tsx` | 63 | 附件气泡 |
| `src/components/common/markdown-renderer.tsx` | 59 | react-markdown + prism |
| `src/components/workspace/workspace-layout.tsx` | 26 | 左聊天右工作区的布局 |
| `src/components/workspace/right-panel.tsx` | 87 | Preview / Code / Terminal tab 切换 |
| `src/components/workspace/file-tree.tsx` | 165 | 文件树（构树 + 图标 + 展开）|
| `src/components/workspace/editor-panel.tsx` | 107 | Monaco + tab 栏（只读）|
| `src/components/workspace/terminal-panel.tsx` | 87 | xterm + 增量 writeln |
| `src/components/workspace/preview-panel.tsx` | 56 | iframe 预览 |
| `src/components/ui/button.tsx` | 64 | shadcn Button |
| `src/components/ui/input.tsx` | 21 | shadcn Input |
| `src/components/ui/textarea.tsx` | 18 | shadcn Textarea |
| `src/components/ui/badge.tsx` | 48 | shadcn Badge |
| `src/components/ui/dialog.tsx` | 156 | shadcn Dialog |
| `src/components/ui/scroll-area.tsx` | 58 | shadcn ScrollArea |
| `src/components/ui/tabs.tsx` | 89 | shadcn Tabs（**未使用**）|
| `src/components/ui/tooltip.tsx` | 57 | shadcn Tooltip（**未使用**）|
| `src/components/ui/separator.tsx` | 26 | shadcn Separator（**未使用**）|

**合计**：~3,776 行（含 `routeTree.gen.ts` 113 行）。
