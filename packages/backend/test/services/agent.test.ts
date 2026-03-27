import { describe, it, expect } from "vitest";
import { AgentService } from "../../src/services/agent.js";
import { db } from "../../src/db/index.js";
import { conversations, events } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("AgentService", () => {
  it("should run agent loop and persist events to DB", async () => {
    // Create a test conversation
    const [conv] = await db
      .insert(conversations)
      .values({
        userId: "00000000-0000-0000-0000-000000000000",
        title: "Test Agent",
      })
      .returning();

    const agent = new AgentService();

    await agent.run({
      conversationId: conv.id,
      userMessage: "Create a file /tmp/hello.txt with content 'hello world', then read it back.",
    });

    // Query events from DB
    const dbEvents = await db
      .select()
      .from(events)
      .where(eq(events.conversationId, conv.id))
      .orderBy(events.seq);

    // Should have user_message as first event
    expect(dbEvents[0].type).toBe("user_message");

    // Should have tool_call events
    const toolCalls = dbEvents.filter((e) => e.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);

    // Should have tool_result events
    const toolResults = dbEvents.filter((e) => e.type === "tool_result");
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    // Should end with an ai_text event
    const lastEvent = dbEvents[dbEvents.length - 1];
    expect(lastEvent.type).toBe("ai_text");

    // Cleanup
    await db.delete(events).where(eq(events.conversationId, conv.id));
    await db.delete(conversations).where(eq(conversations.id, conv.id));
  }, 120000);
});
