import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createAgentRoutes } from "../agent";
import type { InvokeRequest } from "../../types";

function createApp(mockAgentInvoke?: Function) {
  const routes = createAgentRoutes(
    mockAgentInvoke
      ? { createAgent: (_config) => ({ invoke: mockAgentInvoke as any }) }
      : undefined,
  );
  const app = new Hono();
  app.route("/", routes);
  return app;
}

const validRequest: InvokeRequest = {
  message: { role: "user", content: [{ type: "text", text: "Hello" }] },
  history: [],
  files: [],
  config: {
    model: "claude-sonnet-4-20250514",
    apiKey: "sk-test",
    prompt: "You are helpful.",
  },
};

function parseSSE(text: string): unknown[] {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) return null;
      return JSON.parse(dataLine.replace("data: ", ""));
    })
    .filter(Boolean);
}

// --- /health ---

describe("GET /health", () => {
  it("should return status ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

// --- /stop ---

describe("POST /stop", () => {
  it("should return ok false when no agent is running", async () => {
    const app = createApp();
    const res = await app.request("/stop", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false });
  });
});

// --- /invoke ---

describe("POST /invoke", () => {
  it("should return 409 if agent is already running", async () => {
    const neverResolve = async function* () {
      await new Promise(() => {});
    };

    const app = createApp(neverResolve);

    // Start first invoke (don't await — it hangs by design)
    app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    await new Promise((r) => setTimeout(r, 10));

    const second = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(second.status).toBe(409);
  });

  it("should stream assistant and tool messages as SSE", async () => {
    const assistantMsg = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello!" }],
    };
    const toolMsg = {
      role: "tool" as const,
      content: [{ type: "tool_result" as const, tool_use_id: "c1", content: "OK" }],
    };

    const fakeInvoke = async function* () {
      yield assistantMsg;
      yield toolMsg;
    };

    const app = createApp(fakeInvoke);
    const res = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSSE(await res.text());

    expect((events[0] as any).type).toBe("assistant");
    expect((events[0] as any).message).toEqual(assistantMsg);
    expect((events[1] as any).type).toBe("tool");
    expect((events[1] as any).message).toEqual(toolMsg);
    expect((events[events.length - 1] as any).type).toBe("done");
  });

  it("should emit error event on agent failure", async () => {
    const fakeInvoke = async function* () {
      throw new Error("LLM timeout");
    };

    const app = createApp(fakeInvoke);
    const res = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    const events = parseSSE(await res.text());
    const errorEvent = events.find((e: any) => (e as any).type === "error") as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toContain("LLM timeout");
  });

  it("should reset running state after invoke completes", async () => {
    const fakeInvoke = async function* () {
      yield {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Done" }],
      };
    };

    const app = createApp(fakeInvoke);

    const res1 = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });
    await res1.text();

    // Second invoke should succeed (not 409)
    const res2 = await app.request("/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest),
    });
    expect(res2.status).toBe(200);
  });
});
