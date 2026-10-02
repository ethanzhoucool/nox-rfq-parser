import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { toHttpError } from "@/lib/errors";
import { fromFile } from "@/lib/input";
import { parseRfq } from "@/lib/parse";
import { SAMPLES_DIR, listSamples, readExpected } from "@/lib/samples";
import type { ExtractedLine, ExtractedRfq, Flag, Severity } from "@/lib/schema";
import { canonicalDesignation } from "@/lib/specs";

type ExpectedLine = Record<string, unknown> & { ref?: string };
type ExpectedFile = {
  expected: Record<string, unknown> & { lines?: ExpectedLine[] };
  expected_flags: { line_ref: string | null; field: string | null; severity: Severity }[];
};
type Mismatch = { path: string; expected: unknown; actual: unknown };

type SampleReport = {
  sample: string;
  fields: { correct: number; total: number; mismatches: Mismatch[] };
  flags: { recalled: number; fieldMatched: number; total: number; missed: ExpectedFile["expected_flags"] };
  ms: number;
  error?: string;
};

const NUMBER_TOLERANCE = 0.01;

async function main() {
  if (!config.mockLlm && !config.anthropicKey) {
    console.error("Set ANTHROPIC_API_KEY (or MOCK_LLM=1 to exercise the pipeline with a canned extraction).");
    process.exit(1);
  }

  const samples = (await listSamples()).filter((s) => s.hasExpected);
  const reports: SampleReport[] = [];
  for (const sample of samples) {
    const expected = (await readExpected(sample.name)) as ExpectedFile;
    reports.push(await evaluate(sample.name, expected));
    printRow(reports.at(-1)!);
  }
  printTotals(reports);

  const reportPath = path.join(process.cwd(), "eval-report.json");
  await writeFile(reportPath, JSON.stringify({ mock: config.mockLlm, reports }, null, 2));
  console.log(`\nWrote ${path.relative(process.cwd(), reportPath)}`);
}

async function evaluate(name: string, expected: ExpectedFile): Promise<SampleReport> {
  const started = Date.now();
  const empty = { sample: name, fields: { correct: 0, total: 0, mismatches: [] }, flags: { recalled: 0, fieldMatched: 0, total: expected.expected_flags.length, missed: expected.expected_flags } };
  try {
    const bytes = await readFile(path.join(SAMPLES_DIR, name));
    const result = await parseRfq(fromFile(name, bytes));
    const lineRefs = matchLines(expected.expected.lines ?? [], result.extracted.lines);
    return {
      sample: name,
      fields: compareFields(expected.expected, result.extracted, lineRefs),
      flags: scoreFlags(expected.expected_flags, result.flags, lineRefs),
      ms: Date.now() - started,
    };
  } catch (error) {
    return { ...empty, ms: Date.now() - started, error: toHttpError(error).message };
  }
}

/** Maps each expected line ref to the parsed line it is scored against: by ref when every ref matches, otherwise by order. */
function matchLines(expected: ExpectedLine[], actual: ExtractedLine[]): Map<string, ExtractedLine | undefined> {
  const byRef = new Map(actual.map((line) => [line.ref, line]));
  const refsAgree = expected.every((line) => line.ref !== undefined && byRef.has(line.ref));
  return new Map(expected.map((line, i) => [line.ref ?? `#${i}`, refsAgree ? byRef.get(line.ref!) : actual[i]]));
}

function compareFields(expected: ExpectedFile["expected"], actual: ExtractedRfq, lines: Map<string, ExtractedLine | undefined>) {
  const mismatches: Mismatch[] = [];
  let total = 0;
  const check = (pathName: string, want: unknown, got: unknown) => {
    total++;
    if (!sameValue(pathName, want, got)) mismatches.push({ path: pathName, expected: want, actual: got });
  };

  for (const [key, want] of Object.entries(expected)) {
    if (key === "lines") continue;
    if (key === "customer" && want && typeof want === "object") {
      for (const [field, value] of Object.entries(want)) check(`customer.${field}`, value, valueOf(actual.customer[field as keyof ExtractedRfq["customer"]]));
    } else {
      check(key, want, valueOf(actual[key as keyof ExtractedRfq]));
    }
  }

  check("lines.length", expected.lines?.length ?? 0, actual.lines.length);
  (expected.lines ?? []).forEach((line, i) => {
    const parsed = lines.get(line.ref ?? `#${i}`);
    for (const [field, want] of Object.entries(line)) {
      if (field === "ref") continue;
      const got = parsed ? valueOf(parsed[field as keyof ExtractedLine]) : undefined;
      check(`lines[${line.ref ?? i}].${field}`, want, got);
    }
  });

  return { correct: total - mismatches.length, total, mismatches };
}

function scoreFlags(expected: ExpectedFile["expected_flags"], actual: Flag[], lines: Map<string, ExtractedLine | undefined>) {
  const actualRef = (ref: string | null) => (ref === null ? null : (lines.get(ref)?.ref ?? ref));
  const candidates = (want: ExpectedFile["expected_flags"][number]) =>
    actual.filter((flag) => flag.line_ref === actualRef(want.line_ref) && flag.severity === want.severity);

  const missed = expected.filter((want) => candidates(want).length === 0);
  const fieldMatched = expected.filter((want) => candidates(want).some((flag) => !want.field || flag.field === want.field)).length;
  return { recalled: expected.length - missed.length, fieldMatched, total: expected.length, missed };
}

function valueOf(value: unknown): unknown {
  if (value && typeof value === "object" && "confidence" in value && "value" in value) return value.value;
  return value;
}

function sameValue(pathName: string, want: unknown, got: unknown): boolean {
  if (pathName.endsWith(".compliance")) return (want ?? "none") === (got ?? "none");
  if (pathName.endsWith(".certifications")) return sameCertifications(want, got);
  if (typeof want === "number" && typeof got === "number") return Math.abs(want - got) <= NUMBER_TOLERANCE;
  if (typeof want === "string" && typeof got === "string") return normalizeText(want) === normalizeText(got);
  return want === got || (want === null && got === undefined);
}

function sameCertifications(want: unknown, got: unknown): boolean {
  const designations = (list: unknown) =>
    Array.isArray(list) ? list.map((c: { designation: string }) => canonicalDesignation(c.designation)).sort().join("|") : "";
  return designations(want) === designations(got);
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(0).padStart(4)}%`);

function printRow(r: SampleReport) {
  const status = r.error ? `ERROR ${r.error}` : `${(r.ms / 1000).toFixed(1)}s`;
  console.log(
    `${r.sample.padEnd(30)} fields ${pct(r.fields.correct, r.fields.total)} (${r.fields.correct}/${r.fields.total})  ` +
      `flags ${pct(r.flags.recalled, r.flags.total)} (${r.flags.recalled}/${r.flags.total}, field ${r.flags.fieldMatched})  ${status}`,
  );
}

function printTotals(reports: SampleReport[]) {
  const sum = (pick: (r: SampleReport) => number) => reports.reduce((acc, r) => acc + pick(r), 0);
  const fields = [sum((r) => r.fields.correct), sum((r) => r.fields.total)] as const;
  const flags = [sum((r) => r.flags.recalled), sum((r) => r.flags.total)] as const;
  console.log("-".repeat(96));
  console.log(`${"TOTAL".padEnd(30)} fields ${pct(...fields)} (${fields.join("/")})  flags ${pct(...flags)} (${flags.join("/")})`);
  if (config.mockLlm) console.log("MOCK_LLM=1: every sample returns the same canned extraction, so these scores only prove the harness runs.");
}

main();
