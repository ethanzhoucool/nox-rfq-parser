import { mergeFlags } from "./flags";
import { buildPayload } from "./payload";
import type { Catalog, ExtractedRfq, Flag, ParseResult } from "./schema";
import { validate } from "./validate";

export type Analysis = Pick<ParseResult, "flags" | "payload" | "excluded_refs" | "blocking">;

/** Validates an extraction and builds the Nox payload; lines with blocking errors are left out of the payload. */
export function analyze(rfq: ExtractedRfq, extractionFlags: Flag[], catalog: Catalog, today: string): Analysis {
  const refs = new Set(rfq.lines.map((line) => line.ref));
  const current = extractionFlags.filter((f) => f.line_ref === null || refs.has(f.line_ref));
  const ruleFlags = [...current.filter((f) => f.source === "rules"), ...validate(rfq, catalog, today)];
  const flags = mergeFlags(ruleFlags, current.filter((f) => f.source === "llm"));

  const blockedRefs = new Set(flags.filter((f) => f.severity === "error" && f.line_ref).map((f) => f.line_ref!));
  const excluded = rfq.lines.filter((line) => blockedRefs.has(line.ref)).map((line) => line.ref);
  const payload = buildPayload({ ...rfq, lines: rfq.lines.filter((line) => !blockedRefs.has(line.ref)) });

  return { flags, payload, excluded_refs: excluded, blocking: flags.some((f) => f.severity === "error") };
}
