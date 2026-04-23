export type ModelProvider = "anthropic" | "moonshot";

export interface ModelInfo {
  id: string;
  label: string;
  provider: ModelProvider;
  /** Reserved for user-tier gating. v1 always false. */
  locked?: boolean;
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-7", label: "Opus 4.7", provider: "anthropic" },
  { id: "claude-opus-4-7-think", label: "Opus 4.7 Thinking", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-6-think", label: "Sonnet 4.6 Thinking", provider: "anthropic" },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "moonshot" },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export function findModel(id: string): ModelInfo | undefined {
  return SUPPORTED_MODELS.find((m) => m.id === id);
}
