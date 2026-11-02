import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromFile } from "@/lib/input";
import { parseRfq } from "@/lib/parse";
import type { ExtractedLine, ParseResult } from "@/lib/schema";
import { SAMPLES_DIR } from "@/lib/samples";

/**
 * Runs the bundled samples that have a committed extraction (samples/extractions) through the whole
 * pipeline with no AI provider, and checks the result against samples/expected. The extraction is fixed,
 * so any change here comes from normalize, validate or the payload builder.
 */

type ExpectedLine = { ref: string } & Partial<Record<keyof ExtractedLine, unknown>>;
type ExpectedFile = {
  expected: { lines: ExpectedLine[] };
  expected_flags: { line_ref: string | null; field: string | null; severity: string }[];
};

const CASES = [
  {
    sample: "02-aerospace-po.pdf",
    ruleFlags: ["rules:header:required_date:date-tight"],
    excluded: [],
  },
  {
    sample: "05-rfq-out-of-catalog.pdf",
    ruleFlags: [
      "rules:1:quantity:range",
      "rules:2:alloy:not-stocked",
      "rules:2:certifications:outside-catalog",
      "rules:2:compliance:dfars-not-stocked",
    ],
    excluded: ["1", "2"],
  },
  {
    sample: "06-scanned-note.png",
    ruleFlags: [
      "rules:L1:product_type:low-confidence",
      "rules:L1:shape:low-confidence",
      "rules:L2:thickness_in:non-stock-thickness",
      "rules:L3:temper:missing",
      "rules:header:required_date:date-tight",
    ],
    excluded: [],
  },
  {
    sample: "09-launch-vehicle-po.pdf",
    ruleFlags: ["rules:10:alloy:not-stocked", "rules:40:alloy:not-stocked", "rules:40:compliance:dfars-not-stocked", "rules:50:temper:missing"],
    excluded: ["10", "40"],
  },
];

const COMPARED_FIELDS = [
  "alloy",
  "temper",
  "product_type",
  "shape",
  "thickness_in",
  "width_in",
  "length_in",
  "height_in",
  "diameter_in",
  "quantity",
] as const;

const results = new Map<string, ParseResult>();

beforeAll(async () => {
  // samples/README.md: "today" for every sample is Fri 2026-10-02 (noon in Detroit).
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T16:00:00Z") });
  vi.stubEnv("MOCK_LLM", "");
  vi.stubEnv("NOX_API_KEY", "");
  // A cache miss fails fast on the missing key instead of calling a provider.
  vi.stubEnv("LLM_PROVIDER", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("EXTRACTION_CACHE_DIR", path.join(tmpdir(), "rfq-parser-tests-empty-cache"));

  for (const { sample } of CASES) {
    const input = fromFile(sample, await readFile(path.join(SAMPLES_DIR, sample)));
    results.set(sample, await parseRfq(input));
  }
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function expectedFor(sample: string): Promise<ExpectedFile> {
  return JSON.parse(await readFile(path.join(SAMPLES_DIR, "expected", `${path.parse(sample).name}.json`), "utf8"));
}

const loose = (value: unknown) => (typeof value === "string" ? value.toUpperCase().replace(/[\s-]+/g, "") : value);

describe.each(CASES)("$sample", ({ sample, ruleFlags, excluded }) => {
  it("opens from the committed extraction", () => {
    expect(results.get(sample)!.meta.cached_at).toBeTruthy();
  });

  it("reads every line the way samples/expected does", async () => {
    const { extracted } = results.get(sample)!;
    const { expected } = await expectedFor(sample);
    expect(extracted.lines.map((line) => line.ref)).toEqual(expected.lines.map((line) => line.ref));

    for (const want of expected.lines) {
      const line = extracted.lines.find((l) => l.ref === want.ref)!;
      for (const field of COMPARED_FIELDS) {
        // A temper the document doesn't give is the model's call (e.g. "SOLN TREATED" on 718); only compare stated ones.
        if (!(field in want) || (field === "temper" && want.temper === null)) continue;
        const got = line[field].value;
        if (typeof want[field] === "number") expect(got, `line ${want.ref} ${field}`).toBeCloseTo(want[field] as number, 3);
        else expect(loose(got), `line ${want.ref} ${field}`).toEqual(loose(want[field]));
      }
    }
  });

  it("raises the same rule flags", () => {
    const ids = results
      .get(sample)!
      .flags.filter((flag) => flag.source === "rules")
      .map((flag) => flag.id)
      .sort();
    expect(ids).toEqual(ruleFlags);
  });

  it("recalls every blocking flag in samples/expected", async () => {
    const { flags } = results.get(sample)!;
    for (const want of (await expectedFor(sample)).expected_flags.filter((f) => f.severity === "error")) {
      expect(flags, JSON.stringify(want)).toContainEqual(expect.objectContaining({ severity: "error", line_ref: want.line_ref, field: want.field }));
    }
  });

  it("holds back exactly the blocked lines and sends the rest", () => {
    const { payload, excluded_refs, extracted } = results.get(sample)!;
    expect(excluded_refs).toEqual(excluded);
    expect(payload.lines.map((line) => line.ref)).toEqual(extracted.lines.map((line) => line.ref).filter((ref) => !excluded.includes(ref)));
    for (const dto of payload.lines) {
      const line = extracted.lines.find((l) => l.ref === dto.ref)!;
      expect(dto).toMatchObject({ alloy: line.alloy.value, requested_quantity: line.quantity.value });
    }
  });
});

describe("the README's comparison with Upload PO", () => {
  it("keeps the handwritten 0.375\" thickness and names the nearest stock sizes", () => {
    const { payload, flags } = results.get("06-scanned-note.png")!;
    expect(payload.lines.find((line) => line.ref === "L2")).toMatchObject({ alloy: "7075", thickness: 0.375 });
    expect(flags).toContainEqual(expect.objectContaining({ line_ref: "L2", message: expect.stringContaining('nearest: 0.25" or 0.5"') }));
  });

  it("keeps the 5083 line and asks H116 or H321", () => {
    const { payload, flags } = results.get("06-scanned-note.png")!;
    expect(payload.lines.map((line) => line.ref)).toContain("L3");
    expect(flags).toContainEqual(expect.objectContaining({ line_ref: "L3", suggested_question: expect.stringContaining("H116, H321") }));
  });

  it("flags the expedited 10/05 need-by date as tight", () => {
    const { flags } = results.get("06-scanned-note.png")!;
    expect(flags).toContainEqual(expect.objectContaining({ id: "rules:header:required_date:date-tight", message: expect.stringContaining("2026-10-05") }));
  });
});
