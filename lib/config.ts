export const MODEL = "claude-opus-5-5";
export const DEFAULT_NOX_BASE_URL = "https://developer-api.noxmetals.co";

export const config = {
  get openaiKey() { return process.env.OPENAI_API_KEY || null; },
  get openaiAccessToken() { return process.env.OPENAI_ACCESS_TOKEN || null; },
  get openaiModel() { return process.env.OPENAI_MODEL || "gpt-6.1-sol"; },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY || null;
  },
  get noxKey() {
    return process.env.NOX_API_KEY || null;
  },
  get noxBaseUrl() {
    return (process.env.NOX_API_BASE_URL || DEFAULT_NOX_BASE_URL).replace(/\/+$/, "");
  },
  get mockLlm() {
    return process.env.MOCK_LLM === "1";
  },
};
