import { describe, it, expect } from "bun:test";
import { microCompactMiddleware } from "./index";
import type { AgentContext, ModelContext } from "../../types/agent";
import type { AssistantMessage, Message, ToolMessage } from "../../types/messages";

function makeModelContext(): ModelContext {
  return { prompt: "", messages: [], tools: [] };
}

function pair(id: string, toolName: string, output: string): [AssistantMessage, ToolMessage] {
  const assistant: AssistantMessage = {
    role: "assistant",
    content: [{ type: "tool_use", id, name: toolName, input: {} }],
  };
  const tool: ToolMessage = {
    role: "tool",
    content: [{ type: "tool_result", tool_use_id: id, content: output }],
  };
  return [assistant, tool];
}

describe("microCompactMiddleware", () => {
  it("keeps all tool results when count <= keepRecent", async () => {
    const mw = microCompactMiddleware({ keepRecent: 5 });
    const messages: Message[] = [];
    for (let i = 0; i < 3; i++) {
      const [a, t] = pair(`c${i}`, "greet", `output-${i}`);
      messages.push(a, t);
    }
    const agentContext: AgentContext = { prompt: "", messages, tools: [] };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    for (let i = 0; i < 3; i++) {
      const t = messages[i * 2 + 1] as ToolMessage;
      expect(t.content[0]?.content).toBe(`output-${i}`);
    }
  });

  it("replaces older tool outputs with placeholders when count > keepRecent", async () => {
    const mw = microCompactMiddleware({ keepRecent: 2 });
    const messages: Message[] = [];
    for (let i = 0; i < 5; i++) {
      const [a, t] = pair(`c${i}`, "bash", `output-${i}`);
      messages.push(a, t);
    }
    const agentContext: AgentContext = { prompt: "", messages, tools: [] };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    // First 3 should be stubbed
    for (let i = 0; i < 3; i++) {
      const t = messages[i * 2 + 1] as ToolMessage;
      expect(t.content[0]?.content).toContain("Previous tool call output omitted");
      expect(t.content[0]?.content).toContain("bash");
    }
    // Last 2 kept verbatim
    for (let i = 3; i < 5; i++) {
      const t = messages[i * 2 + 1] as ToolMessage;
      expect(t.content[0]?.content).toBe(`output-${i}`);
    }
  });

  it("uses the actual tool name in the placeholder", async () => {
    const mw = microCompactMiddleware({ keepRecent: 1 });
    const [a1, t1] = pair("c1", "read_file", "file contents here");
    const [a2, t2] = pair("c2", "bash", "cmd output here");
    const agentContext: AgentContext = {
      prompt: "",
      messages: [a1, t1, a2, t2],
      tools: [],
    };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });

    expect((t1.content[0] as any).content).toContain("read_file");
    expect((t2.content[0] as any).content).toBe("cmd output here");
  });

  it("does not re-stub already-stubbed outputs", async () => {
    const mw = microCompactMiddleware({ keepRecent: 1 });
    const messages: Message[] = [];
    for (let i = 0; i < 4; i++) {
      const [a, t] = pair(`c${i}`, "x", `output-${i}`);
      messages.push(a, t);
    }
    const agentContext: AgentContext = { prompt: "", messages, tools: [] };

    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });
    const stubbedOnce = (messages[1] as ToolMessage).content[0]?.content;

    // Run again — content should remain the single-stub form
    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });
    expect((messages[1] as ToolMessage).content[0]?.content).toBe(stubbedOnce);
  });

  it("ignores messages with no tool results", async () => {
    const mw = microCompactMiddleware({ keepRecent: 1 });
    const agentContext: AgentContext = {
      prompt: "",
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "text", text: "hello" }] },
      ],
      tools: [],
    };

    // Should not throw
    await mw.beforeModel!({ agentContext, modelContext: makeModelContext() });
    expect(agentContext.messages).toHaveLength(2);
  });
});
