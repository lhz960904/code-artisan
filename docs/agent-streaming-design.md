# Agent Streaming 设计文档

## 背景

`@code-artisan/agent` 包当前只有 `invoke(): Promise<Message[]>`，调用方必须等整轮 agent loop 跑完才拿到结果。Web 端需要边跑边渲染：文本增量、工具调用进展、思考内容。本文档定义 agent 包加 `stream()` 能力的契约与实现。

## 目标

1. 调用方通过 `for await` 消费事件，无回调、无 EventEmitter
2. 每个事件都是**自包含的合法状态**（snapshot），前端可直接 `replace by id` 渲染
3. 持久化层只需要看到最终态消息即可落库（中间态可丢）
4. 与现有 middleware 体系正交：before/after 钩子不因流式而改变
5. 支持 AbortSignal 取消

## 非目标

- 不做 token-level fine-grained delta（Vercel AI SDK 那一套）—— 前端自己累积 delta 太麻烦，snapshot 简单得多
- 不做断线续流（resume）—— v1 单端点够用，后续需要再加 in-memory ring buffer
- 不在 agent 包做 SSE/HTTP 适配 —— 那是 backend runner 的职责

## 事件模型

### AgentEvent

```ts
export type AgentEvent =
  | AgentPartialEvent       // 当前助手消息的中间快照
  | AgentMessageEvent;      // 一条完整消息落定
// done 隐式（generator 自然终止）
// error 隐式（generator throw）

export interface AgentMessageEvent {
  type: "message";
  message: AssistantMessage | ToolMessage;
  // 这条消息是本 step 的最终态
}

export interface AgentPartialEvent {
  type: "partial";
  // 当前正在生成的 AssistantMessage 快照
  // 每次 yield 都是合法的、可渲染的完整消息（content 数组是当前累积态）
  // 注意：只对 AssistantMessage 流式；ToolMessage 是本地原子产出的，没有中间态，
  // 永远只走 AgentMessageEvent 一次性下发。未来如果需要流式工具输出（如 bash stdout
  // 实时下发），应走独立的 tool-stream 事件类型，不塞进 partial。
  message: AssistantMessage;
}

```

### 为什么换掉 helixent 的 "thinking" / "tool" subtype

helixent 的 `AgentProgressEvent` 分 `thinking` 和 `tool` 两种 subtype，问题：

| 问题 | 说明 |
|---|---|
| 命名冲突 | Anthropic 有正式的 `thinking` content block（extended thinking），subtype 叫 thinking 容易和 content.type === "thinking" 混淆 |
| payload 不对称 | thinking 无 payload，tool 有 {name, input}，前端要分支处理 |
| 表达力不够 | 文本流式和思考流式混为一谈；拿不到当前文本内容 |
| 冗余 | subtype 可以从 `message.content` 最后一项的 type 推断 |

**我们的方案：统一 `AgentPartialEvent`，只带完整 message 快照**。前端看 `message.content` 最后一项：
- `type === "text"` → 渲染流式文本
- `type === "thinking"` → 渲染思考块
- `type === "tool_use"` → 渲染工具调用（input 可能是部分 JSON）

一个事件形状解决所有中间态，前端分支在渲染层而不是事件层。

## Agent API

现状：当前 `Agent.invoke` 已经是 `AsyncGenerator<AssistantMessage | ToolMessage>`，yield 完整消息。本次重构改为**非流式 + 流式双接口并存**。

```ts
class Agent {
  // 非流式：跑完一整轮，返回所有本轮新增的 assistant/tool 消息
  async invoke(input: UserMessage): Promise<Array<AssistantMessage | ToolMessage>>;

  // 流式：yield AgentEvent（partial + message），让调用方可以渐进渲染
  async *stream(
    input: UserMessage,
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<AgentEvent>;
}
```

**实现关系**：`invoke` 内部消费 `stream()`，收集 `type === "message"` 的事件后一次性返回数组。两者共享同一套 middleware、context、tool loop，由 `stream` 作为底层实现。

**事件精简**：不再有 `done` / `error` 事件——generator 自然终止即 done，抛异常即 error，更 idiomatic。只保留两种：

```ts
export type AgentEvent = AgentPartialEvent | AgentMessageEvent;
```

## Provider 契约变化

```ts
interface LLMProvider {
  invoke(ctx: ModelContext): Promise<AssistantMessage>;
  // 新增：yield 逐步完整的 AssistantMessage 快照
  // 最后一次 yield 的结果必须等价于 invoke() 的结果
  stream(ctx: ModelContext, signal?: AbortSignal): AsyncGenerator<AssistantMessage>;
}
```

**快照语义**：每次 yield 都是当前已累积内容的完整 AssistantMessage。例如：
1. yield `{ content: [{ type: "text", text: "Hel" }] }`
2. yield `{ content: [{ type: "text", text: "Hello" }] }`
3. yield `{ content: [{ type: "text", text: "Hello" }, { type: "tool_use", id: "t1", name: "read_file", input: {} }] }`
4. yield `{ content: [{ type: "text", text: "Hello" }, { type: "tool_use", id: "t1", name: "read_file", input: { path: "src" } }] }`

工具调用 input JSON 拼接中途解析失败时 fallback `{}`（参考 helixent `stream-utils.ts:100-102`）。

AnthropicProvider 基于 `@anthropic-ai/sdk` 的 `client.messages.stream()`，把底层 event 流转成快照流。

## Agent 内部实现

```ts
async *stream(input) {
  const agentCtx = this.buildContext(input);
  await runBeforeAgentRun(agentCtx);

  for (let step = 0; step < this.maxSteps; step++) {
    if (agentCtx.shouldStop || options.signal?.aborted) break;

    await runBeforeAgentStep(agentCtx);
    const modelCtx = this.buildModelContext(agentCtx);
    await runBeforeModel(modelCtx);

    // === 流式模型调用 ===
    let lastSnapshot: AssistantMessage | null = null;
    for await (const snapshot of this.model.stream(modelCtx, options.signal)) {
      lastSnapshot = snapshot;
      yield { type: "partial", message: snapshot };
    }

    await runAfterModel(modelCtx, lastSnapshot);
    this.messages.push(lastSnapshot);
    yield { type: "message", message: lastSnapshot };

    // === 工具调用 ===
    const toolUses = extractToolUses(lastSnapshot);
    if (toolUses.length === 0) {
      yield { type: "done", stopReason: "end_turn" };
      break;
    }

    const toolMessage = await this.executeTools(toolUses, agentCtx);
    this.messages.push(toolMessage);
    yield { type: "message", message: toolMessage };

    await runAfterAgentStep(agentCtx);
  }

  await runAfterAgentRun(agentCtx);
}
```

**注意**：partial 事件**不落 history**；只有 `message` 事件的消息进入 `this.messages` 和持久化。

## Middleware 兼容性

所有钩子签名不变：
- `beforeModel / afterModel` 包着流式调用，在流开始前和快照全部完成后执行
- `beforeToolUse / afterToolUse` 在工具执行前后执行，与流式无关
- `beforeAgentStep / afterAgentStep` 每步前后
- `beforeAgentRun / afterAgentRun` 整轮前后

现有 6 个 middleware（loop-detection、micro-compact、auto-compact、external-abort、file-tracker、token-usage）零改动。

## Backend Runner 适配（后续阶段，不在本期）

`conversation-runner.ts` 从当前 `runConversation(): Promise<void>` 改为：

```ts
export async function *runConversation(params): AsyncGenerator<SseEvent> {
  // pre: title 生成、sandbox 获取
  for await (const event of agent.stream(userMsg, { signal })) {
    if (event.type === "message") {
      const stored = await messageStore.add(event.message);
      yield { type: "message", message: stored };
    } else if (event.type === "partial") {
      // 可选：节流后下发（或完全不下发，让前端只看 message）
      yield { type: "partial", message: event.message };
    } else if (event.type === "done") {
      break;
    } else if (event.type === "error") {
      yield { type: "error", error: event.error.message };
      return;
    }
  }
  // post: 持久化 file snapshots
  yield { type: "done" };
}
```

Hono route 直接 `for await` 这个 generator，`streamSSE` 下发。删除 `event-bus.ts` 和 GET /stream。

## 实施步骤

1. **Phase A** — agent 包加事件类型、Provider.stream 契约、AnthropicProvider 实现、Agent.stream 方法
2. **Phase B** — 补单测：快照累积正确性、tool input 部分 JSON 容错、abort 行为、middleware 触发次数
3. **Phase C**（非本期）— backend runner 改 generator + route 单端点 POST SSE + 前端 fetch ReadableStream

## 风险与权衡

| 风险 | 缓解 |
|---|---|
| partial 事件频率太高，前端卡顿 | runner 层可节流（debounce 50ms，参考 helixent TUI）或干脆不透出 partial 给前端，只给 message |
| Provider 实现复杂度上升 | 只需包装官方 SDK 的 stream 方法，AnthropicProvider 约 100 LOC |
| invoke 重构成"消费 stream"可能引入回归 | 保留原 invoke 实现，新 stream 并存；后续再合并 |

## 关键约定（已确认）

- **partial 多次发射**：provider 内部做底层 SDK event → 快照的累加，`model.stream()` 对外就是"符合本协议的快照流"。agent 层逐一 yield `partial`，前端/runner 按 id 替换渲染。不发射 partial 等于放弃流式价值，与 invoke 无异。
- **provider 是累加的唯一责任方**：agent.stream 和 runner 都不再做增量拼接，只消费快照。

## 待确认

- AnthropicProvider 的 stream 是否需要处理 extended thinking block 的增量？（目前我们没开 extended thinking，可以先不处理，后续开启时再补）
