import { AnthropicProvider, OpenAIProvider, type LLMProvider } from "@code-artisan/agent";
import { findModel } from "@code-artisan/shared";

/**
 * Resolve an LLM provider for the given model id. Provider class is picked
 * by the catalog entry's `provider` field; credentials come from a single
 * shared pair: `LLM_API_KEY` + `LLM_BASE_URL` (gateway root).
 *
 * The two SDKs disagree on how `baseURL` is laid out:
 *   - Anthropic SDK treats it as the domain root and appends `/v1/messages`
 *   - OpenAI SDK treats it as the versioned root and appends
 *     `/chat/completions`
 * Normalize once here so `LLM_BASE_URL` stays a single, user-facing
 * gateway root (e.g. `https://aihubmix.com`).
 *
 * TODO: once more than two providers land, drive this from a per-model
 * config (endpoint layout, default headers, …) rather than a switch.
 */
export function createModelProvider(modelId: string): LLMProvider {
  const info = findModel(modelId);
  const apiKey = process.env.LLM_API_KEY;
  const root = process.env.LLM_BASE_URL;

  if (info?.provider === "moonshot" || info?.provider === "deepseek") {
    return new OpenAIProvider(modelId, {
      apiKey,
      baseURL: root ? `${root.replace(/\/+$/, "")}/v1` : undefined,
    });
  }
  return new AnthropicProvider(modelId, { apiKey, baseURL: root });
}
