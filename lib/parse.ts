import { analyze } from "./analyze";
import { getCatalog } from "./catalog";
import { MODEL, config } from "./config";
import { todayIso } from "./dates";
import { extractWithClaude, type ExtractionRun } from "./extract";
import { extractWithOpenAI } from "./extract-openai";
import { cacheKey, readCachedExtraction, writeCachedExtraction, type CachedExtraction } from "./extraction-cache";
import { fromLlm } from "./flags";
import type { RfqInput } from "./input";
import { llmSettings } from "./llm";
import { MOCK_MODEL, mockExtraction } from "./mock";
import { normalize } from "./normalize";
import type { Catalog, ParseResult } from "./schema";

export async function parseRfq(input: RfqInput, { fresh = false }: { fresh?: boolean } = {}): Promise<ParseResult> {
  const started = Date.now();
  const today = todayIso();
  const catalog = await getCatalog();

  let run: ExtractionRun;
  let cached: CachedExtraction | null = null;
  if (config.mockLlm) run = { extraction: mockExtraction(today) };
  else {
    const key = cacheKey(input);
    cached = fresh ? null : await readCachedExtraction(key);
    run = cached ?? (await extractLive(input, catalog, today));
    if (!cached) {
      await writeCachedExtraction(key, { ...run, model: run.model || MODEL, extraction_ms: Date.now() - started, cached_at: new Date().toISOString() });
    }
  }

  const { rfq, flags: normalizationFlags } = normalize(run.extraction.rfq, catalog);
  const extractionFlags = [...normalizationFlags, ...fromLlm(run.extraction.flags)];

  return {
    extracted: rfq,
    extraction_flags: extractionFlags,
    ...analyze(rfq, extractionFlags, catalog, today),
    meta: {
      model: config.mockLlm ? MOCK_MODEL : run.model || MODEL,
      ms: Date.now() - started,
      ...(!cached && run.usage),
      filename: input.filename,
      ...(cached && { cached_at: cached.cached_at }),
    },
  };
}

async function extractLive(input: RfqInput, catalog: Catalog, today: string): Promise<ExtractionRun> {
  const { provider } = await llmSettings();
  return provider === "claude" ? extractWithClaude(input, catalog, today) : extractWithOpenAI(input, catalog, today, provider === "chatgpt");
}
