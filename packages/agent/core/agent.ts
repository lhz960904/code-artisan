import * as z from "zod";
import type { Message, AssistantMessage, ToolMessage, StreamEvent, ToolUseContent, ToolResultContent } from "../types/messages";
import type { BaseInvokeParams } from "../types/provider/base";
import { BaseProvider } from "../types/provider/base";
import type { CreateAgentParams, AgentContext } from "../types";
import type { FunctionTool } from "../tools/tool";
import { LocalSandbox } from "../sandbox/local/index";

const DEFAULT_MAX_ITERATIONS = 100;
const MAX_OUTPUT_CHARS = 12000;
const HEAD_RATIO = 0.8;
const TAIL_RATIO = 0.2;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function truncateOutput(output: string, maxChars = MAX_OUTPUT_CHARS): string {
  if (output.length <= maxChars) return output;
  const headChars = Math.floor(maxChars * HEAD_RATIO);
  const tailChars = Math.floor(maxChars * TAIL_RATIO);
  const head = output.slice(0, headChars);
  const tail = output.slice(-tailChars);
  const omitted = output.length - headChars - tailChars;
  return `${head}\n\n[... ${omitted} characters omitted (${output.length} total) ...]\n\n${tail}`;
}

function hasToolUse(msg: AssistantMessage): boolean {
  return msg.content.some((c) => c.type === "tool_use");
}

function getToolUseBlocks(msg: AssistantMessage): ToolUseContent[] {
  return msg.content.filter((c): c is ToolUseContent => c.type === "tool_use");
}

export class Agent {
  private provider: BaseProvider;
  private toolDefs: ToolDefinition[] | undefined;
  private toolMap: Map<string, FunctionTool>;
  private context: AgentContext;
  private maxIterations: number;

  constructor(params: CreateAgentParams) {
    this.provider = params.model;
    this.maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const sandbox = params.sandbox ?? new LocalSandbox();
    this.context = { sandbox };

    this.toolMap = new Map();
    if (params.tools?.length) {
      this.toolDefs = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: z.toJSONSchema(t.parameters) as Record<string, unknown>,
      }));
      for (const t of params.tools) {
        this.toolMap.set(t.name, t);
      }
    }
  }

  async invoke(messages: Message[], options?: Omit<Partial<BaseInvokeParams>, "messages">): Promise<AssistantMessage> {
    let currentMessages = [...messages];
    let lastResponse: AssistantMessage | undefined;

    for (let i = 0; i < this.maxIterations; i++) {
      lastResponse = await this.provider.invoke({
        messages: currentMessages,
        ...(this.toolDefs ? { tools: this.toolDefs } : {}),
        ...options,
      });

      if (!hasToolUse(lastResponse)) {
        return lastResponse;
      }

      if (i === this.maxIterations - 1) {
        return lastResponse;
      }

      const toolResults = await this.executeToolCalls(lastResponse);

      currentMessages = [...currentMessages, lastResponse, ...toolResults];
    }

    return lastResponse!;
  }

  async *stream(
    messages: Message[],
    options?: Omit<Partial<BaseInvokeParams>, "messages">,
  ): AsyncIterable<StreamEvent> {
    let currentMessages = [...messages];

    for (let i = 0; i < this.maxIterations; i++) {
      const pendingToolCalls: Map<string, { name: string; arguments: string }> = new Map();
      let finishReason: string | undefined;

      for await (const event of this.provider.stream({
        messages: currentMessages,
        ...(this.toolDefs ? { tools: this.toolDefs } : {}),
        ...options,
      })) {
        if (event.type === "tool_call_start") {
          pendingToolCalls.set(event.id, { name: event.name, arguments: "" });
        } else if (event.type === "tool_call_delta") {
          const tc = pendingToolCalls.get(event.id);
          if (tc) tc.arguments += event.arguments;
        } else if (event.type === "done") {
          finishReason = event.finish_reason;
        }

        yield event;
      }

      if (!pendingToolCalls.size || finishReason !== "tool_use") {
        return;
      }

      if (i === this.maxIterations - 1) {
        return;
      }

      // Build AssistantMessage with ToolUseContent blocks
      const assistantMsg: AssistantMessage = {
        role: "assistant",
        content: [...pendingToolCalls.entries()].map(([id, { name, arguments: args }]) => {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(args); } catch {}
          return { type: "tool_use" as const, id, name, input };
        }),
      };

      // Execute tools and build ToolMessages
      const toolResults: ToolMessage[] = [];
      for (const tc of getToolUseBlocks(assistantMsg)) {
        const output = await this.executeSingleTool(tc.name, tc.input);
        const msg: ToolMessage = {
          role: "tool",
          content: [{ type: "tool_result", tool_use_id: tc.id, content: output }],
        };
        toolResults.push(msg);
        yield { type: "tool_result", id: tc.id, name: tc.name, output };
      }

      currentMessages = [...currentMessages, assistantMsg, ...toolResults];
    }
  }

  private async executeToolCalls(response: AssistantMessage): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];

    for (const tc of getToolUseBlocks(response)) {
      const output = await this.executeSingleTool(tc.name, tc.input);
      results.push({
        role: "tool",
        content: [{ type: "tool_result", tool_use_id: tc.id, content: output }],
      });
    }

    return results;
  }

  private async executeSingleTool(name: string, rawInput: unknown): Promise<string> {
    const tool = this.toolMap.get(name);
    if (!tool) {
      return `Tool "${name}" not found. Available tools: ${[...this.toolMap.keys()].join(", ")}`;
    }

    const parsed = tool.parameters.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i: { message: string }) => i.message).join(", ");
      return `Validation error: ${issues}`;
    }

    try {
      const result = await tool.invoke(parsed.data);
      const output = typeof result === "string" ? result : JSON.stringify(result);
      return truncateOutput(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Tool error: ${message}`;
    }
  }
}

export function createAgent(params: CreateAgentParams): Agent {
  return new Agent(params);
}
