import type { LLMProvider } from "./provider";
import type { Tool } from "../tools/tool";
import type { Message, NonSystemMessage } from "./messages";
import type { AgentMiddleware } from "./middleware";

/**
 * The options for the ReactAgent.
 */
export interface AgentOptions {
  /** The system prompt to use to invoke the agent. */
  prompt: string;
  /** The tools to use to invoke the agent. */
  tools?: Tool[];
  /** The LLM provider to use. */
  model: LLMProvider;
  /** The maximum number of steps to take. */
  maxSteps?: number;
  /** The LLM provider to use. */
  middlewares?: AgentMiddleware[];
}

/**
 * Runtime context injected into tool execute functions.
 * Provided by the agent loop at execution time, not at definition time.
 */
export interface AgentContext {
  /** The system prompt to use to invoke the agent. */
  prompt: string;
  /** The messages to use to invoke the agent. */
  messages: Message[];
  /** The tools to use to invoke the agent. */
  tools?: Tool[];
  /** The skills to use to invoke the agent. */
}
