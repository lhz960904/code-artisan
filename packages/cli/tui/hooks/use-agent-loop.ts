import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  Agent,
  AssistantMessage,
  AssistantMessageContent,
  Message,
  NonSystemMessage,

  ToolMessage,
  UserMessage,
} from "@code-artisan/agent";

const AgentLoopContext = createContext<Agent | null>(null);

export function AgentLoopProvider({ agent, children }: { agent: Agent; children: ReactNode }) {
  const value = useMemo(() => agent, [agent]);
  return createElement(AgentLoopContext.Provider, { value }, children);
}

function useAgent(): Agent {
  const agent = useContext(AgentLoopContext);
  if (!agent) {
    throw new Error("useAgentLoop() must be used within <AgentLoopProvider agent={...}>");
  }
  return agent;
}

export function useAgentLoop() {
  const agent = useAgent();

  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<NonSystemMessage[]>([]);

  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const historyRef = useRef<Message[]>([]);

  const onSubmit = useCallback(
    async (text: string) => {
      if (text === "exit" || text === "quit" || text === "/exit" || text === "/quit") {
        process.exit(0);
      }

      if (text === "/clear") {
        setMessages([]);
        historyRef.current = [];
        return;
      }

      if (loadingRef.current) return;
      setLoading(true);

      try {
        const userMessage: UserMessage = { role: "user", content: [{ type: "text", text }] };
        historyRef.current = [...historyRef.current, userMessage];
        setMessages((prev) => [...prev, userMessage]);

        // Accumulation state for building messages from StreamEvents
        let currentContent: AssistantMessageContent = [];
        let currentText = "";
        const pendingToolCalls = new Map<string, { name: string; arguments: string }>();
        const roundMessages: (AssistantMessage | ToolMessage)[] = [];

        const updateAssistantDisplay = () => {
          const displayContent: AssistantMessageContent = [
            ...currentContent,
            ...(currentText ? [{ type: "text" as const, text: currentText }] : []),
          ];
          if (displayContent.length === 0) return;

          const assistantMsg: AssistantMessage = { role: "assistant", content: displayContent };
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), assistantMsg];
            }
            return [...prev, assistantMsg];
          });
        };

        const flushRound = (finishReason: string) => {
          // Flush remaining text
          if (currentText) {
            currentContent.push({ type: "text", text: currentText });
            currentText = "";
          }

          if (currentContent.length > 0) {
            const assistantMsg: AssistantMessage = { role: "assistant", content: [...currentContent] };
            roundMessages.push(assistantMsg);
          }

          // Reset for next round if tool_use
          if (finishReason === "tool_use") {
            currentContent = [];
            currentText = "";
          }
        };

        const stream = agent.stream(historyRef.current);

        for await (const event of stream) {
          switch (event.type) {
            case "text":
              currentText += event.text;
              updateAssistantDisplay();
              break;

            case "tool_call_start":
              pendingToolCalls.set(event.id, { name: event.name, arguments: "" });
              break;

            case "tool_call_delta": {
              const tc = pendingToolCalls.get(event.id);
              if (tc) tc.arguments += event.arguments;
              break;
            }

            case "tool_call_end": {
              // Flush current text
              if (currentText) {
                currentContent.push({ type: "text", text: currentText });
                currentText = "";
              }
              const toolCall = pendingToolCalls.get(event.id);
              if (toolCall) {
                let input: Record<string, unknown> = {};
                try {
                  input = JSON.parse(toolCall.arguments);
                } catch {}
                currentContent.push({
                  type: "tool_use",
                  id: event.id,
                  name: toolCall.name,
                  input,
                });
                pendingToolCalls.delete(event.id);
              }
              updateAssistantDisplay();
              break;
            }

            case "tool_result": {
              const toolMsg: ToolMessage = {
                role: "tool",
                content: [{ type: "tool_result", tool_use_id: event.id, content: event.output }],
              };
              roundMessages.push(toolMsg);
              break;
            }

            case "done":
              flushRound(event.finish_reason);
              break;
          }
        }

        // Update history with all messages from this turn
        for (const msg of roundMessages) {
          historyRef.current = [...historyRef.current, msg];
        }
      } catch (error) {
        if (isAbortError(error)) return;
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [agent],
  );

  return { loading, messages, onSubmit };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof Error && error.constructor.name === "APIUserAbortError") return true;
  return false;
}
