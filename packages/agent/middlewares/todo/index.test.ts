import { describe, it, expect } from "bun:test";
import { createTodoSystem } from "./index";
import type { AgentContext, ModelContext } from "../../types/agent";
import type { LLMProvider } from "../../types/provider";
import type { ToolContext } from "../../tools/tool";
import { LocalSandbox } from "../../sandbox/local";

const ctx: ToolContext = { sandbox: new LocalSandbox() };

const noopModel = {
  invoke: async () => ({ role: "assistant" as const, content: [{ type: "text" as const, text: "" }] }),
  stream: async function* () {},
} as unknown as LLMProvider;

function makeModelContext(prompt = "test prompt"): ModelContext {
  return { prompt, tools: [], messages: [] };
}

function makeAgentContext(): AgentContext {
  return { prompt: "", tools: [], messages: [], model: noopModel };
}

describe("createTodoSystem (todo)", () => {
  describe("tool", () => {
    it("should have correct name", () => {
      const { tool } = createTodoSystem();
      expect(tool.name).toBe("todo_write");
    });

    it("should create todos with merge=false (replace mode)", async () => {
      const { tool } = createTodoSystem();

      const result = await tool.invoke({
        name: "demo",
        todos: [
          { id: "1", content: "Task A", status: "pending" },
          { id: "2", content: "Task B", status: "in_progress" },
        ],
        merge: false,
      }, ctx);

      expect(result).toContain("0/2 completed");
      expect(result).toContain("[ ] Task A");
      expect(result).toContain("[>] Task B");
    });

    it("should add todos with merge=true", async () => {
      const { tool } = createTodoSystem();

      const result = await tool.invoke({
        name: "demo",
        todos: [
          { id: "1", content: "Task A", status: "pending" },
          { id: "2", content: "Task B", status: "completed" },
        ],
        merge: true,
      }, ctx);

      expect(result).toContain("1/2 completed");
      expect(result).toContain("Task A");
      expect(result).toContain("Task B");
    });

    it("should update existing items by id when merge=true", async () => {
      const { tool } = createTodoSystem();

      // Add initial items
      await tool.invoke({
        name: "demo",
        todos: [
          { id: "1", content: "Task A", status: "pending" },
          { id: "2", content: "Task B", status: "pending" },
        ],
        merge: true,
      }, ctx);

      // Update one item
      const result = await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "completed" }],
        merge: true,
      }, ctx);

      expect(result).toContain("1/2 completed");
      expect(result).toContain("[x] Task A");
      expect(result).toContain("[ ] Task B");
    });

    it("should append new items when merge=true and id is new", async () => {
      const { tool } = createTodoSystem();

      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      const result = await tool.invoke({
        name: "demo",
        todos: [{ id: "2", content: "Task B", status: "in_progress" }],
        merge: true,
      }, ctx);

      expect(result).toContain("0/2 completed");
      expect(result).toContain("Task A");
      expect(result).toContain("Task B");
    });

    it("should show correct status markers", async () => {
      const { tool } = createTodoSystem();

      const result = await tool.invoke({
        name: "demo",
        todos: [
          { id: "1", content: "Pending", status: "pending" },
          { id: "2", content: "InProgress", status: "in_progress" },
          { id: "3", content: "Done", status: "completed" },
        ],
        merge: true,
      }, ctx);

      expect(result).toContain("[ ] Pending");
      expect(result).toContain("[>] InProgress");
      expect(result).toContain("[x] Done");
      expect(result).toContain("1/3 completed");
    });

    it("should echo the plan name in the summary", async () => {
      const { tool } = createTodoSystem();

      const result = await tool.invoke({
        name: "Onboarding flow",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: false,
      }, ctx);

      expect(result).toContain('Plan "Onboarding flow"');
    });
  });

  describe("middleware.beforeModel", () => {
    it("should not inject reminder when no todos exist", async () => {
      const { middleware } = createTodoSystem();
      const modelContext = makeModelContext();

      // Simulate many steps
      for (let i = 0; i < 20; i++) {
        await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
      }

      // No reminder since todo list is empty
      expect(modelContext.prompt).toBe("test prompt");
    });

    it("should inject reminder after enough steps without todo_write", async () => {
      const { middleware, tool } = createTodoSystem();

      // Create some todos
      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      const modelContext = makeModelContext();

      // Simulate 11 steps (threshold is 10)
      let reminderInjected = false;
      for (let i = 0; i < 11; i++) {
        const result = await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
        if (result?.prompt && result.prompt.includes("todo_reminder")) {
          reminderInjected = true;
        }
      }

      expect(reminderInjected).toBe(true);
    });

    it("should not inject reminder right after todo_write is used", async () => {
      const { middleware, tool } = createTodoSystem();

      // Create todos
      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      const modelContext = makeModelContext();

      // Only a few steps — well within threshold
      for (let i = 0; i < 5; i++) {
        const result = await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
        expect(result?.prompt?.includes("todo_reminder") ?? false).toBe(false);
      }
    });

    it("should respect STEPS_BETWEEN_REMINDERS gap", async () => {
      const { middleware, tool } = createTodoSystem();

      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      const modelContext = makeModelContext();
      let reminderCount = 0;

      // Run 25 steps — should get at most 2 reminders (at ~step 11 and ~step 21)
      for (let i = 0; i < 25; i++) {
        const result = await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
        if (result?.prompt && result.prompt.includes("todo_reminder")) {
          reminderCount++;
        }
      }

      expect(reminderCount).toBeLessThanOrEqual(2);
      expect(reminderCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("middleware.afterToolUse", () => {
    it("should reset stepsSinceLastWrite when todo_write is called", async () => {
      const { middleware, tool } = createTodoSystem();

      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      const modelContext = makeModelContext();

      // Simulate 9 steps (just under threshold)
      for (let i = 0; i < 9; i++) {
        await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
      }

      // Simulate a todo_write tool use — resets counter
      await middleware.afterToolUse!({
        agentContext: makeAgentContext(),
        toolUse: { type: "tool_use", id: "call_1", name: "todo_write", input: {} },
        toolResult: "ok",
      });

      // Another 9 steps — still under threshold, no reminder
      for (let i = 0; i < 9; i++) {
        const result = await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
        expect(result?.prompt?.includes("todo_reminder") ?? false).toBe(false);
      }
    });

    it("should not reset counter for other tools", async () => {
      const { middleware, tool } = createTodoSystem();

      await tool.invoke({
        name: "demo",
        todos: [{ id: "1", content: "Task A", status: "pending" }],
        merge: true,
      }, ctx);

      // Simulate afterToolUse with a different tool
      await middleware.afterToolUse!({
        agentContext: makeAgentContext(),
        toolUse: { type: "tool_use", id: "call_1", name: "bash", input: {} },
        toolResult: "ok",
      });

      const modelContext = makeModelContext();
      let reminderInjected = false;

      for (let i = 0; i < 12; i++) {
        const result = await middleware.beforeModel!({ agentContext: makeAgentContext(), modelContext });
        if (result?.prompt && result.prompt.includes("todo_reminder")) {
          reminderInjected = true;
        }
      }

      expect(reminderInjected).toBe(true);
    });
  });
});
