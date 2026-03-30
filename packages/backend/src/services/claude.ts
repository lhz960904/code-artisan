import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import { toolRegistry } from "../tools/index.js";
import type { LLMResponse } from "../agent/types.js";

type MessageParam = Anthropic.MessageParam;

function buildSystemPrompt(): string {
  const toolSection = toolRegistry.toPromptSection();
  return `You are an AI coding agent running in a sandboxed Linux environment. You help users write code, execute commands, and build projects.

You have access to these tools:
${toolSection}

Always use tools to interact with the filesystem. When the user asks you to write code, use write_file to create the file, then bash to run it. For web servers, use start_server to launch them and provide the preview URL. Use str_replace to make targeted edits to existing files instead of rewriting the entire file. Be concise in your text responses.`;
}

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async chatStream(
    messages: MessageParam[],
    onText: (fullText: string) => void,
  ): Promise<LLMResponse> {
    const stream = this.client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: buildSystemPrompt(),
      tools: toolRegistry.toJsonTools() as Anthropic.Tool[],
      messages,
    });

    let fullText = "";
    stream.on("text", (text) => {
      fullText += text;
      onText(fullText);
    });

    return stream.finalMessage();
  }
}
