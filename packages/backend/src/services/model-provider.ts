import { AnthropicProvider, OpenAIProvider, type LLMProvider } from "@code-artisan/agent";
import { findModel } from "@code-artisan/shared";

/**
 * Resolve an LLM provider for the given model id. Provider class is picked
 * by the catalog entry's `provider` field; API key + base URL come from
 * `LLM_API_KEY` / `LLM_BASE_URL` (both shared across providers since we
 * route everything through a single OpenAI/Anthropic-compatible gateway).
 */
export function createModelProvider(modelId: string): LLMProvider {
  const info = findModel(modelId);
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;

  if (info?.provider === "moonshot") {
    return new OpenAIProvider(modelId, { apiKey, baseURL });
  }
  return new AnthropicProvider(modelId, { apiKey, baseURL });
}
