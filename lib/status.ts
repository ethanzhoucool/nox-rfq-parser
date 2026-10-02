import { getCatalog } from "./catalog";
import { MODEL, config } from "./config";
import { todayIso } from "./dates";
import { MOCK_MODEL } from "./mock";
import type { Catalog } from "./schema";

export type AppStatus = {
  model: string;
  llm: "ready" | "mock" | "missing_key";
  nox: { mode: "live" | "dry-run"; baseUrl: string };
  catalog: Catalog;
  today: string;
};

export async function readStatus(): Promise<AppStatus> {
  return {
    model: config.mockLlm ? MOCK_MODEL : MODEL,
    llm: config.mockLlm ? "mock" : config.anthropicKey ? "ready" : "missing_key",
    nox: { mode: config.noxKey ? "live" : "dry-run", baseUrl: config.noxBaseUrl },
    catalog: await getCatalog(),
    today: todayIso(),
  };
}
