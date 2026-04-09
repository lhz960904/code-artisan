import type { AgentOptions } from "../types";
import { Agent } from "./agent";

export function createAgent(options: AgentOptions): Agent {
  return new Agent(options);
}
