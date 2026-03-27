import { Hono } from "hono";
import { AgentService, type AgentEventData } from "../services/agent.js";

const conversations = new Hono();

// Phase 1: Simplified endpoint — no auth, no DB persistence, just run agent and return events
conversations.post("/messages", async (c) => {
  const { content } = await c.req.json<{ content: string }>();

  if (!content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  const collectedEvents: Array<{ type: string; data: AgentEventData }> = [];

  const agent = new AgentService({
    onEvent: (type, data) => {
      collectedEvents.push({ type, data });
    },
  });

  const { totalTokens } = await agent.run(content);

  return c.json({
    conversationId: "temp-phase1",
    events: collectedEvents,
    usage: { totalTokens },
  });
});

export { conversations };
