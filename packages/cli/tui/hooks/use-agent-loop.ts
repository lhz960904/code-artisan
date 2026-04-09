import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type {
  Agent,
  NonSystemMessage,
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

  const onSubmit = useCallback(
    async (text: string) => {
      if (text === "exit" || text === "quit" || text === "/exit" || text === "/quit") {
        process.exit(0);
      }

      if (text === "/clear") {
        setMessages([]);
        return;
      }

      if (loadingRef.current) return;
      setLoading(true);

      try {
        const userMessage: UserMessage = { role: "user", content: [{ type: "text", text }] };
        setMessages((prev) => [...prev, userMessage]);

        for await (const message of agent.invoke(userMessage)) {
          setMessages((prev) => [...prev, message]);
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
