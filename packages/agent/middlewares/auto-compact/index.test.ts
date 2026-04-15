import { describe, it, expect, mock } from "bun:test";
import { autoCompactMiddleware } from "./index";
import type { AgentContext, ModelContext } from "../../types/agent";
import type { AssistantMessage, Message, UserMessage } from "../../types/messages";
import type { LLMProvider } from "../../types/provider";

function makeModelContext(): ModelContext {
  return { prompt: "", messages: [], tools: [] };
}

function textAssistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}

function makeProvider(summary: string): { provider: LLMProvider; invoke: ReturnType<typeof mock> } {
  const invoke = mock(async () => textAssistant(summary));
  return { provider: { invoke } as unknown as LLMProvider, invoke };
}

/** Satisfies AgentContext.model when the test never invokes the main agent LLM. */
function unusedMainModel(): LLMProvider {
  return {
    invoke: mock(async () => textAssistant("unused")),
    stream: async function* () {},
  } as unknown as LLMProvider;
}

function bigMessages(approxTokens: number): Message[] {
  // ~4 chars per token → produce a single user msg with enough text
  const chars = approxTokens * 4;
  return [{ role: "user", content: [{ type: "text", text: "x".repeat(chars) }] }];
}

describe("autoCompactMiddleware", () => {
  it("does not compact when estimated tokens are below threshold", async () => {
    const { provider, invoke } = makeProvider("SUMMARY");
    const mw = autoCompactMiddleware({ summaryModel: provider, threshold: 100_000 });

    const agentContext: AgentContext = {
      prompt: "",
      messages: [{ role: "user", content: [{ type: "text", text: "short" }] }],
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(invoke).not.toHaveBeenCalled();
    expect(agentContext.messages).toHaveLength(1);
  });

  it("uses agentContext.model when summaryModel is omitted", async () => {
    const { provider, invoke } = makeProvider("from main model");
    const mw = autoCompactMiddleware({ threshold: 1_000 });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(2_000),
      tools: [],
      model: provider,
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(agentContext.messages).toHaveLength(2);
    const firstBlock = (agentContext.messages[0] as UserMessage).content[0];
    expect(firstBlock?.type).toBe("text");
    expect(firstBlock && firstBlock.type === "text" ? firstBlock.text : "").toContain("from main model");
  });

  it("calls the summary model and replaces messages when threshold is crossed", async () => {
    const { provider, invoke } = makeProvider("the summary text");
    const mw = autoCompactMiddleware({ summaryModel: provider, threshold: 1_000 });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(2_000),
      tools: [],
      model: unusedMainModel(),
    };
    const originalRef = agentContext.messages;

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(invoke).toHaveBeenCalledTimes(1);
    // Array reference preserved (important: tools/other middleware hold this ref).
    expect(agentContext.messages).toBe(originalRef);
    expect(agentContext.messages).toHaveLength(2);

    const [summaryUser, ackAssistant] = agentContext.messages;
    expect(summaryUser?.role).toBe("user");
    expect((summaryUser as any).content[0].text).toContain("the summary text");
    expect((summaryUser as any).content[0].text).toContain("[Conversation Summary]");
    expect(ackAssistant?.role).toBe("assistant");
  });

  it("passes a system prompt and compact prompt to the summary model", async () => {
    const { provider, invoke } = makeProvider("SUMMARY");
    const mw = autoCompactMiddleware({ summaryModel: provider, threshold: 1_000 });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(2_000),
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    const call = invoke.mock.calls[0]?.[0] as any;
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[0].content[0].text).toContain("summarizer");
    expect(call.messages[1].role).toBe("user");
    expect(call.messages[1].content[0].text).toContain("Summarize");
  });

  it("invokes onCompacted with the replacement pair", async () => {
    const { provider } = makeProvider("SUMMARY");
    const onCompacted = mock(() => Promise.resolve());
    const mw = autoCompactMiddleware({
      summaryModel: provider,
      threshold: 1_000,
      onCompacted,
    });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(2_000),
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(onCompacted).toHaveBeenCalledTimes(1);
    const [pair] = onCompacted.mock.calls[0] as any;
    expect(pair).toHaveLength(2);
    expect(pair[0].role).toBe("user");
    expect(pair[1].role).toBe("assistant");
  });

  it("uses a custom countTokens function when provided", async () => {
    const { provider, invoke } = makeProvider("SUMMARY");
    const countTokens = mock((_msgs: Message[]) => 999_999); // always over threshold
    const mw = autoCompactMiddleware({
      summaryModel: provider,
      threshold: 100_000,
      countTokens,
    });

    const agentContext: AgentContext = {
      prompt: "",
      // Small message, but custom counter says it's huge → compaction should trigger.
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(agentContext.messages).toHaveLength(2);
  });

  it("awaits async countTokens", async () => {
    const { provider, invoke } = makeProvider("SUMMARY");
    const mw = autoCompactMiddleware({
      summaryModel: provider,
      threshold: 1_000,
      countTokens: async () => 50, // under threshold → no compaction
    });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(10_000), // would trigger default counter, but async says 50
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect(invoke).not.toHaveBeenCalled();
    expect(agentContext.messages).toHaveLength(1);
  });

  it("handles empty summary response gracefully", async () => {
    const { provider } = makeProvider("");
    const mw = autoCompactMiddleware({ summaryModel: provider, threshold: 1_000 });

    const agentContext: AgentContext = {
      prompt: "",
      messages: bigMessages(2_000),
      tools: [],
      model: unusedMainModel(),
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    const summaryText = (agentContext.messages[0] as any).content[0].text;
    expect(summaryText).toContain("(summary unavailable)");
  });
});
