import { chatgptStatus } from "./chatgpt-auth";
import { MODEL, config } from "./config";
import { HttpError } from "./errors";

export type LlmProvider = "claude" | "claude-code" | "openai" | "chatgpt";

export async function llmSettings() {
  const chatgpt = await chatgptStatus();
  const planReady = chatgpt.connected || Boolean(config.openaiAccessToken);
  const selected = process.env.LLM_PROVIDER;
  if (selected && !["claude", "claude-code", "openai", "chatgpt"].includes(selected)) {
    throw new HttpError(500, "llm_provider_invalid", "LLM_PROVIDER must be claude, openai, or chatgpt.");
  }
  const provider: LlmProvider = (selected as LlmProvider | undefined) || (planReady ? "chatgpt" : config.openaiKey ? "openai" : "claude");
  return {
    provider, model: provider === "claude" ? MODEL : provider === "claude-code" ? "your Claude plan" : config.openaiModel,
    ready: provider === "claude-code" ? true : provider === "claude" ? Boolean(config.anthropicKey) : provider === "openai" ? Boolean(config.openaiKey) : planReady,
    chatgpt: { ...chatgpt, environmentToken: Boolean(config.openaiAccessToken) },
  };
}
