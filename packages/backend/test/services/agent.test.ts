import { describe, it, expect } from "vitest";
import { AgentService, type AgentEventData } from "../../src/services/agent.js";

describe("AgentService", () => {
  it("should run a simple agent loop and return events", async () => {
    const collectedEvents: Array<{
      type: string;
      data: AgentEventData;
    }> = [];

    const agent = new AgentService({
      onEvent: (type, data) => {
        collectedEvents.push({ type, data });
      },
    });

    await agent.run("Create a file /tmp/hello.txt with content 'hello world', then read it back.");

    // Should have tool_call events for write_file and read_file
    const toolCalls = collectedEvents.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);

    // Should have tool_result events
    const toolResults = collectedEvents.filter((e) => e.type === "tool_result");
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    // Should end with an ai_text event
    const lastEvent = collectedEvents[collectedEvents.length - 1];
    expect(lastEvent.type).toBe("ai_text");
  }, 120000);
});
