import { analyze } from "./analyze";
import { getCatalog } from "./catalog";
import { MODEL, config } from "./config";
import { todayIso } from "./dates";
import { extractWithClaude, type ExtractionRun } from "./extract";
import { fromLlm } from "./flags";
import type { RfqInput } from "./input";
import { MOCK_MODEL, mockExtraction } from "./mock";
import { normalize } from "./normalize";
import type { ParseResult } from "./schema";

export async function parseRfq(input: RfqInput): Promise<ParseResult> {
  const started = Date.now();
  const today = todayIso();
  const catalog = await getCatalog();

  const run: ExtractionRun = config.mockLlm
    ? { extraction: mockExtraction(today) }
    : await extractWithClaude(input, catalog, today);

  const { rfq, flags: normalizationFlags } = normalize(run.extraction.rfq, catalog);
  const extractionFlags = [...normalizationFlags, ...fromLlm(run.extraction.flags)];

  return {
    extracted: rfq,
    extraction_flags: extractionFlags,
    ...analyze(rfq, extractionFlags, catalog, today),
    meta: {
      model: config.mockLlm ? MOCK_MODEL : MODEL,
      ms: Date.now() - started,
      ...run.usage,
      filename: input.filename,
    },
  };
}
