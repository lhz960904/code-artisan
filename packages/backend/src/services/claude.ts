import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "@web-ai-coding-agent/shared";
import { env } from "../env.js";

type MessageParam = Anthropic.MessageParam;

interface TextResponse {
  type: "text";
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

interface ToolUseResponse {
  type: "tool_use";
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, string>;
  textContent: string;
  usage: { inputTokens: number; outputTokens: number };
}

export type ClaudeResponse = TextResponse | ToolUseResponse;

const SYSTEM_PROMPT = `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
- read_file: Read file contents
- write_file: Create or overwrite files
- execute_command: Run shell commands (bash) — for short-lived commands only
- list_files: List directory contents
- start_server: Start a long-running server process in the background and get a public preview URL. Use this instead of execute_command for any command that starts a web server (e.g. node server.js, python -m http.server). You must specify the port the server listens on.

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then execute_command to run it. For web servers, use start_server to launch them and provide the preview URL. Be concise in your text responses.`;

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chat(messages: MessageParam[]): Promise<ClaudeResponse> {
    const response = await this.client.messages.create({
      model: "claude-opus-4-5-20250414",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const toolBlock = response.content.find(
      (block) => block.type === "tool_use",
    );
    const textBlock = response.content.find((block) => block.type === "text");

    if (toolBlock && toolBlock.type === "tool_use") {
      return {
        type: "tool_use",
        toolCallId: toolBlock.id,
        toolName: toolBlock.name,
        toolInput: toolBlock.input as Record<string, string>,
        textContent: textBlock?.type === "text" ? textBlock.text : "",
        usage,
      };
    }

    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("\n");

    return { type: "text", content: textContent, usage };
  }

  async chatStream(
    messages: MessageParam[],
    onText: (fullText: string) => void,
  ): Promise<ClaudeResponse> {
    const stream = this.client.messages.stream({
      model: "claude-opus-4-5-20250414",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    let fullText = "";

    stream.on("text", (text) => {
      fullText += text;
      onText(fullText);
    });

    const response = await stream.finalMessage();

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const toolBlock = response.content.find(
      (block) => block.type === "tool_use",
    );
    const textBlock = response.content.find((block) => block.type === "text");

    if (toolBlock && toolBlock.type === "tool_use") {
      return {
        type: "tool_use",
        toolCallId: toolBlock.id,
        toolName: toolBlock.name,
        toolInput: toolBlock.input as Record<string, string>,
        textContent: textBlock?.type === "text" ? textBlock.text : "",
        usage,
      };
    }

    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as Anthropic.TextBlock).text)
      .join("\n");

    return { type: "text", content: textContent, usage };
  }
}
