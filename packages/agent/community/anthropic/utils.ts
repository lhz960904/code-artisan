import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import type { AssistantMessage, Message } from "../../types/messages";
import type { Tool } from "../../tools/tool";

/**
 * Converts foundation messages to Anthropic API message params.
 * System messages are extracted separately since Anthropic takes them as a top-level param.
 */
export function convertToAnthropicMessages(messages: Message[]): {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
} {
  const system: Anthropic.TextBlockParam[] = [];
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      for (const content of message.content) {
        system.push({ type: "text", text: content.text });
      }
    } else if (message.role === "user") {
      const contentBlocks: Anthropic.ContentBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "text") {
          contentBlocks.push({ type: "text", text: content.text });
        } else if (content.type === "image_url") {
          contentBlocks.push({
            type: "image",
            source: { type: "url", url: content.image_url.url },
          });
        }
      }
      anthropicMessages.push({ role: "user", content: contentBlocks });
    } else if (message.role === "assistant") {
      const contentBlocks: Anthropic.ContentBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "thinking") {
          contentBlocks.push({ type: "thinking", thinking: content.thinking, signature: content.signature ?? "" });
        } else if (content.type === "tool_use") {
          contentBlocks.push({
            type: "tool_use",
            id: content.id,
            name: content.name,
            input: content.input,
          });
        } else if (content.type === "text") {
          contentBlocks.push({ type: "text", text: content.text });
        }
      }
      anthropicMessages.push({ role: "assistant", content: contentBlocks });
    } else if (message.role === "tool") {
      const contentBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const content of message.content) {
        if (content.type === "tool_result") {
          contentBlocks.push({
            type: "tool_result",
            tool_use_id: content.tool_use_id,
            content: content.content,
          });
        }
      }
      anthropicMessages.push({ role: "user", content: contentBlocks });
    }
  }

  return { system, messages: anthropicMessages };
}

/**
 * Parses an Anthropic API response into a foundation AssistantMessage.
 */
export function parseAssistantMessage(response: Anthropic.Message): AssistantMessage {
  const result: AssistantMessage = {
    role: "assistant",
    content: [],
  };

  for (const block of response.content) {
    if (block.type === "text") {
      result.content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      result.content.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "tool_use") {
      result.content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  if (response.usage) {
    result.usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  return result;
}

/**
 * Converts foundation tools to Anthropic tool definitions.
 */
export function convertToAnthropicTools(tools?: Tool[]): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.parameters) as Anthropic.Tool.InputSchema,
  }));
}
