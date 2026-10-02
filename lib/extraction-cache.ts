import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtractionRun } from "./extract";
import type { RfqInput } from "./input";
import { ExtractionSchema } from "./schema";

/** Bump when the prompt or extraction schema changes so stale entries stop matching. */
const CACHE_VERSION = 1;

export type CachedExtraction = ExtractionRun & { model: string; extraction_ms: number; cached_at: string };

/** Committed extractions for the bundled samples, so the demo runs without an AI provider. */
const demoDir = () => path.join(process.cwd(), "samples", "extractions");
/** Everything else. Gitignored, because uploads can be real customer documents. */
const localDir = () => process.env.EXTRACTION_CACHE_DIR || path.join(process.cwd(), ".cache", "extractions");

export function cacheKey(input: RfqInput): string {
  const content = input.kind === "text" ? input.text : input.data;
  return createHash("sha256").update(`v${CACHE_VERSION}\0${input.kind}\0${content}`).digest("hex").slice(0, 32);
}

export async function readCachedExtraction(key: string): Promise<CachedExtraction | null> {
  for (const dir of [localDir(), demoDir()]) {
    const raw = await readFile(path.join(dir, `${key}.json`), "utf8").catch(() => null);
    if (!raw) continue;
    const entry = JSON.parse(raw) as CachedExtraction;
    const extraction = ExtractionSchema.safeParse(entry.extraction);
    if (extraction.success) return { ...entry, extraction: extraction.data };
  }
  return null;
}

export async function writeCachedExtraction(key: string, entry: CachedExtraction): Promise<void> {
  const dir = localDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`);
}
