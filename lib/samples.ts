import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const SAMPLES_DIR = path.join(process.cwd(), "samples");
const EXPECTED_DIR = path.join(SAMPLES_DIR, "expected");

export type SampleInfo = { name: string; bytes: number; hasExpected: boolean };

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".eml": "message/rfc822",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function listSamples(): Promise<SampleInfo[]> {
  const entries = await readdir(SAMPLES_DIR, { withFileTypes: true }).catch(() => []);
  const expected = new Set(await readdir(EXPECTED_DIR).catch(() => [] as string[]));
  const files = entries.filter((e) => e.isFile() && !/^[._]/.test(e.name) && !e.name.endsWith(".md")).map((e) => e.name).sort();

  return Promise.all(
    files.map(async (name) => ({
      name,
      bytes: (await stat(path.join(SAMPLES_DIR, name))).size,
      hasExpected: expected.has(expectedFileName(name)),
    })),
  );
}

/** Only names returned by listSamples are served, which rules out path traversal. */
export async function readSample(name: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const known = (await listSamples()).some((s) => s.name === name);
  if (!known) return null;
  return {
    bytes: await readFile(path.join(SAMPLES_DIR, name)),
    contentType: CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream",
  };
}

export async function readExpected(name: string): Promise<unknown | null> {
  const file = path.join(EXPECTED_DIR, expectedFileName(name));
  const text = await readFile(file, "utf8").catch(() => null);
  return text === null ? null : JSON.parse(text);
}

function expectedFileName(sampleName: string): string {
  return `${path.parse(sampleName).name}.json`;
}
