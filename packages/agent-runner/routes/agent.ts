import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createAgent as sdkCreateAgent, AnthropicProvider } from "@code-artisan/agent";
import type { AssistantMessage, ToolMessage, UserMessage } from "@code-artisan/agent";
import type { InvokeRequest, InvokeConfig, RunnerEvent } from "../types";
import { getModifiedFiles } from "../services/file-scanner";

const WORK_DIR = process.env.WORK_DIR ?? "/home/project";

interface AgentFactory {
  createAgent: (config: InvokeConfig) => {
    invoke: (msg: UserMessage) => AsyncGenerator<AssistantMessage | ToolMessage>;
  };
}

const defaultFactory: AgentFactory = {
  createAgent: (config) => {
    const provider = new AnthropicProvider(config.model, {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    return sdkCreateAgent({
      model: provider,
      prompt: config.prompt,
      maxSteps: config.maxSteps,
      skillsDirs: [],
    });
  },
};

export function createAgentRoutes(factory: AgentFactory = defaultFactory): Hono {
  let runningAbortController: AbortController | null = null;
  const routes = new Hono();

  routes.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  routes.post("/stop", (c) => {
    if (!runningAbortController) {
      return c.json({ ok: false });
    }
    runningAbortController.abort();
    runningAbortController = null;
    return c.json({ ok: true });
  });

  routes.post("/invoke", async (c) => {
    if (runningAbortController) {
      return c.json({ error: "Agent is already running" }, 409);
    }

    const body = (await c.req.json()) as InvokeRequest;
    const { message, files, config } = body;

    // Restore files to disk
    for (const file of files) {
      const dir = file.path.substring(0, file.path.lastIndexOf("/"));
      await Bun.spawn(["mkdir", "-p", dir]).exited;
      await Bun.write(file.path, file.content);
    }

    const agent = factory.createAgent(config);
    const ac = new AbortController();
    runningAbortController = ac;
    const invokeStartTime = Date.now();

    return streamSSE(c, async (stream) => {
      let totalUsage = { inputTokens: 0, outputTokens: 0 };

      try {
        for await (const msg of agent.invoke(message)) {
          if (ac.signal.aborted) break;

          const event: RunnerEvent = {
            type: msg.role as "assistant" | "tool",
            message: msg,
          } as RunnerEvent;
          await stream.writeSSE({ data: JSON.stringify(event) });

          if (msg.role === "assistant" && (msg as AssistantMessage).usage) {
            const u = (msg as AssistantMessage).usage!;
            totalUsage.inputTokens += u.inputTokens;
            totalUsage.outputTokens += u.outputTokens;
          }
        }

        // Scan for modified files after agent finishes
        try {
          const modifiedFiles = await getModifiedFiles(WORK_DIR, invokeStartTime);
          if (modifiedFiles.length > 0) {
            const fileEvent: RunnerEvent = { type: "file", files: modifiedFiles };
            await stream.writeSSE({ data: JSON.stringify(fileEvent) });
          }
        } catch {
          // WORK_DIR may not exist in test environments, skip file scan
        }

        const doneEvent: RunnerEvent = { type: "done", usage: totalUsage };
        await stream.writeSSE({ data: JSON.stringify(doneEvent) });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorEvent: RunnerEvent = { type: "error", error: errMsg };
        await stream.writeSSE({ data: JSON.stringify(errorEvent) });
      } finally {
        runningAbortController = null;
      }
    });
  });

  return routes;
}

export const agentRoutes = createAgentRoutes();
