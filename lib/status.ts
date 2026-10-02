import { getCatalog } from "./catalog";
import { config } from "./config";
import { llmSettings, type LlmProvider } from "./llm";
import { todayIso } from "./dates";
import { MOCK_MODEL } from "./mock";
import type { Catalog } from "./schema";

export type AppStatus = {
  model: string;
  llm: "ready" | "mock" | "missing_key";
  provider: LlmProvider;
  chatgpt: Awaited<ReturnType<typeof llmSettings>>["chatgpt"];
  nox: { mode: "live" | "dry-run"; baseUrl: string };
  catalog: Catalog;
  today: string;
};

export async function readStatus(): Promise<AppStatus> {
  const settings = await llmSettings();
  return {
    model: config.mockLlm ? MOCK_MODEL : settings.model,
    llm: config.mockLlm ? "mock" : settings.ready ? "ready" : "missing_key",
    provider: settings.provider,
    chatgpt: settings.chatgpt,
    nox: { mode: config.noxKey ? "live" : "dry-run", baseUrl: config.noxBaseUrl },
    catalog: await getCatalog(),
    today: todayIso(),
  };
}
