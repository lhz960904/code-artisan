import { Box, Text } from "ink";

import type { AssistantMessage, NonSystemMessage, ToolUseContent, UserMessage } from "@code-artisan/agent";

import { currentTheme } from "../themes/index";

import { Markdown } from "./markdown";

export function MessageHistory({ messages }: { messages: NonSystemMessage[]; isBusy: boolean }) {
  return (
    <Box flexDirection="column" rowGap={1} overflowY="visible" width="100%">
      {messages.map((message, i) => {
        switch (message.role) {
          case "user":
            return <UserMessageItem key={i} message={message} />;
          case "assistant":
            return <AssistantMessageItem key={i} message={message} />;
          default:
            return null;
        }
      })}
    </Box>
  );
}

export function UserMessageItem({ message }: { message: UserMessage }) {
  return (
    <Box columnGap={1} width="100%" backgroundColor={currentTheme.colors.secondaryBackground}>
      <Text color="white" bold>
        ❯
      </Text>
      <Text color="white">
        {message.content.map((content) => (content.type === "text" ? content.text : "[image]")).join("\n")}
      </Text>
    </Box>
  );
}

export function AssistantMessageItem({ message }: { message: AssistantMessage }) {
  return (
    <Box flexDirection="column" width="100%">
      {message.content.map((content, i) => {
        switch (content.type) {
          case "text":
            if (content.text) {
              return (
                <Box key={i} columnGap={1}>
                  <Text color={currentTheme.colors.highlightedText}>⏺</Text>
                  <Box flexDirection="column">
                    <Markdown>{content.text}</Markdown>
                  </Box>
                </Box>
              );
            }
            return null;
          case "tool_use":
            if (content.name === "todo_write") return null;
            return (
              <Box key={i} columnGap={1}>
                <Text color={currentTheme.colors.secondaryText}>⏺</Text>
                <Box flexDirection="column">
                  <ToolUseContentItem content={content} />
                </Box>
              </Box>
            );
          default:
            return null;
        }
      })}
    </Box>
  );
}

export function ToolUseContentItem({ content }: { content: ToolUseContent }) {
  switch (content.name) {
    case "bash":
      return (
        <Box flexDirection="column">
          <Text color={currentTheme.colors.secondaryText}>{content.input.description as string}</Text>
          <Text color={currentTheme.colors.secondaryText}>└─ {content.input.command as string}</Text>
        </Box>
      );
    case "str_replace":
    case "read_file":
    case "write_file":
      return (
        <Box flexDirection="column">
          <Text color={currentTheme.colors.secondaryText}>{content.input.description as string}</Text>
          <Text color={currentTheme.colors.secondaryText}>└─ {content.input.path as string}</Text>
        </Box>
      );
    default:
      return (
        <Box flexDirection="column">
          <Text color={currentTheme.colors.secondaryText}>
            {content.name}: {JSON.stringify(content.input).slice(0, 100)}
          </Text>
        </Box>
      );
  }
}
