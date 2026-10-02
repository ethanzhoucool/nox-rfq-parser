import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromText } from "@/lib/input";
import { parseRfq } from "@/lib/parse";

describe("parseRfq with MOCK_LLM", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_LLM", "1");
    vi.stubEnv("NOX_API_KEY", "");
    vi.stubEnv("LLM_PROVIDER", "claude");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs extraction, normalization, validation and payload building end to end", async () => {
    const result = await parseRfq(fromText("anything", "po.txt"));

    expect(result.meta).toMatchObject({ model: expect.stringContaining("mock"), filename: "po.txt" });
    expect(result.blocking).toBe(true);
    expect(result.excluded_refs).toEqual(["30", "50"]);
    expect(result.payload.lines.map((l) => l.ref)).toEqual(["10", "20", "40"]);

    const [plate, , metric] = result.payload.lines;
    expect(plate).toMatchObject({ alloy: "6061", temper: "T651" });
    expect(metric).toMatchObject({ thickness: 0.5, width: 11.811, length: 23.622 });

    const keys = result.flags.map((f) => `${f.severity}:${f.line_ref}:${f.field}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        "warning:10:temper",
        "error:30:quantity",
        "warning:30:temper",
        "error:50:alloy",
        "warning:null:required_date",
        "warning:20:compliance",
      ]),
    );
  });

  it("explains how to fix a missing Anthropic key", async () => {
    vi.stubEnv("MOCK_LLM", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(parseRfq(fromText("6061 plate"))).rejects.toMatchObject({ status: 500, code: "anthropic_key_missing" });
  });
});
