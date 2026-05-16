// Minimal interface so AgentRunnerRegistryService doesn't need to know about
// AgentTurn (would be a circular dependency: registry → AgentTurn → registry).
export interface Cancelable {
  cancel(reason?: unknown): void;
}
