export type ModelProvider = "anthropic" | "moonshot" | "deepseek";

export interface ModelInfo {
  id: string;
  label: string;
  provider: ModelProvider;
  /** Quota multiplier applied to inputTokens + outputTokens at billing time. Defaults to 1. */
  tokenMultiplier?: number;
  /** Reserved for user-tier gating. v1 always false. */
  locked?: boolean;
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-7", label: "Opus 4.7", provider: "anthropic", tokenMultiplier: 20 },
  { id: "claude-opus-4-7-think", label: "Opus 4.7 Thinking", provider: "anthropic", tokenMultiplier: 20 },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic", tokenMultiplier: 5 },
  { id: "claude-sonnet-4-6-think", label: "Sonnet 4.6 Thinking", provider: "anthropic", tokenMultiplier: 5 },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "moonshot", tokenMultiplier: 2 },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek", tokenMultiplier: 1 },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek", tokenMultiplier: 1 },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export function findModel(id: string): ModelInfo | undefined {
  return SUPPORTED_MODELS.find((m) => m.id === id);
}
