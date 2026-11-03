import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analyze";
import { normalize } from "@/lib/normalize";
import { TODAY, catalog, known, line, rfq, unknown } from "./fixtures";

describe("analyze", () => {
  it("holds back only the repeated line that has an error, not every line sharing its ref", () => {
    const { rfq: normalized, flags } = normalize(
      rfq({ lines: [line({ ref: "10" }), line({ ref: "10", alloy: known("7075"), quantity: unknown() })] }),
      catalog,
    );
    const result = analyze(normalized, flags, catalog, TODAY);
    expect(result.excluded_refs).toEqual(["10-2"]);
    expect(result.payload.lines.map((l) => l.ref)).toEqual(["10"]);
  });
});
