import type {
  MessageParam,
  ChatResponse,
  ChatStreamEvent,
  BaseInvokeParams,
  BaseProvider,
  Tool,
  ToolCall,
  AssistantMessage,
  ToolMessage,
} from "./providers/base";
import type { CreateAgentParams } from "./types";
import type { DefinedTool } from "./tools/tool";
import type { ToolRuntime } from "./tools/types";
import { LocalSandbox } from "./sandboxs/local/index";

const DEFAULT_MAX_ITERATIONS = 100;

export class Agent {
  private provider: BaseProvider;
  private toolDefs: Tool[] | undefined;
  private toolMap: Map<string, DefinedTool>;
  private runtime: ToolRuntime;
  private maxIterations: number;

  constructor(params: CreateAgentParams) {
    this.provider = params.model;
    this.maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const sandbox = params.sandbox ?? new LocalSandbox();
    this.runtime = { sandbox };

    this.toolMap = new Map();
    if (params.tools?.length) {
      this.toolDefs = params.tools.map((t) => t.toToolDefinition());
      for (const t of params.tools) {
        this.toolMap.set(t.name, t);
      }
    }
  }

  async invoke(messages: MessageParam[], options?: Omit<Partial<BaseInvokeParams>, "messages">): Promise<ChatResponse> {
    let currentMessages = [...messages];
    let lastResponse: ChatResponse | undefined;

    for (let i = 0; i < this.maxIterations; i++) {
      lastResponse = await this.provider.invoke({
        messages: currentMessages,
        ...(this.toolDefs ? { tools: this.toolDefs } : {}),
        ...options,
      });

      if (!lastResponse.tool_calls.length) {
        return lastResponse;
      }

      if (i === this.maxIterations - 1) {
        return lastResponse;
      }

      const toolResults = await this.executeToolCalls(lastResponse);

      const assistantMsg: AssistantMessage = {
        role: "assistant",
        content: lastResponse.content,
        tool_calls: lastResponse.tool_calls,
      };

      currentMessages = [...currentMessages, assistantMsg, ...toolResults];
    }

    return lastResponse!;
  }

  async *stream(
    messages: MessageParam[],
    options?: Omit<Partial<BaseInvokeParams>, "messages">,
  ): AsyncIterable<ChatStreamEvent> {
    let currentMessages = [...messages];

    for (let i = 0; i < this.maxIterations; i++) {
      // Collect tool calls from stream
      const pendingToolCalls: Map<string, { name: string; arguments: string }> = new Map();
      let finishReason: string | undefined;

      for await (const event of this.provider.stream({
        messages: currentMessages,
        ...(this.toolDefs ? { tools: this.toolDefs } : {}),
        ...options,
      })) {
        // Track tool calls
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

      // No tool calls — done
      if (!pendingToolCalls.size || finishReason !== "tool_use") {
        return;
      }

      // Last iteration — stop
      if (i === this.maxIterations - 1) {
        return;
      }

      // Build tool calls array
      const toolCalls: ToolCall[] = [...pendingToolCalls.entries()].map(
        ([id, { name, arguments: args }]) => ({
          id,
          type: "function" as const,
          function: { name, arguments: args },
        }),
      );

      // Execute and yield results
      const assistantMsg: AssistantMessage = {
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      };

      const toolResults: ToolMessage[] = [];
      for (const tc of toolCalls) {
        const tool = this.toolMap.get(tc.function.name);
        if (!tool) {
          const msg: ToolMessage = {
            role: "tool",
            tool_call_id: tc.id,
            content: `Tool "${tc.function.name}" not found.`,
          };
          toolResults.push(msg);
          yield { type: "tool_result", id: tc.id, name: tc.function.name, output: msg.content };
          continue;
        }

        let input: unknown;
        try {
          input = JSON.parse(tc.function.arguments);
        } catch {
          input = {};
        }

        const result = await tool.call(this.runtime, input);
        const msg: ToolMessage = {
          role: "tool",
          tool_call_id: tc.id,
          content: result.output,
        };
        toolResults.push(msg);
        yield { type: "tool_result", id: tc.id, name: tc.function.name, output: result.output };
      }

      currentMessages = [...currentMessages, assistantMsg, ...toolResults];
    }
  }

  private async executeToolCalls(response: ChatResponse): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];

    for (const tc of response.tool_calls) {
      const tool = this.toolMap.get(tc.function.name);
      if (!tool) {
        results.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Tool "${tc.function.name}" not found. Available tools: ${[...this.toolMap.keys()].join(", ")}`,
        });
        continue;
      }

      let input: unknown;
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = {};
      }

      const result = await tool.call(this.runtime, input);
      results.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.output,
      });
    }

    return results;
  }
}

export function createAgent(params: CreateAgentParams): Agent {
  return new Agent(params);
}
