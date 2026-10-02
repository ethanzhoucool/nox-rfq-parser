import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/normalize";
import { catalog, known, line, rfq, unknown } from "./fixtures";

const normalizeLine = (overrides: Parameters<typeof line>[0], notes: string | null = null) => {
  const result = normalize(rfq({ lines: [line(overrides)], general_notes: notes }), catalog);
  return { line: result.rfq.lines[0], flags: result.flags, rfq: result.rfq };
};

describe("normalize", () => {
  it("splits a temper glued onto the alloy", () => {
    expect(normalizeLine({ alloy: known("7075T7351"), temper: unknown() }).line).toMatchObject({
      alloy: { value: "7075" },
      temper: { value: "T7351" },
    });
    expect(normalizeLine({ alloy: known("6061-T651"), temper: unknown() }).line.alloy.value).toBe("6061");
  });

  it("leaves hyphenated alloy codes like MIC-6 alone", () => {
    expect(normalizeLine({ alloy: known("MIC-6"), temper: unknown() }).line.alloy.value).toBe("MIC-6");
  });

  it("maps T6 plate to the stocked T651 and flags it for confirmation", () => {
    const { line: result, flags } = normalizeLine({ temper: known("T6") });
    expect(result.temper).toMatchObject({ value: "T651", confidence: "medium" });
    expect(flags).toContainEqual(expect.objectContaining({ severity: "warning", field: "temper", line_ref: "L1" }));
    expect(flags[0].message).toContain("T6 requested on plate; Nox stocks 6061 plate as T651");
  });

  it("fills alloy, temper and form from a spec callout", () => {
    const { line: result } = normalizeLine({
      alloy: unknown(),
      temper: unknown(),
      product_type: unknown(),
      certifications: [{ family: "AMS", designation: "AMS-QQ-A-250/12", source: "PER AMS-QQ-A-250/12" }],
    });
    expect(result.alloy).toMatchObject({ value: "7075", confidence: "medium" });
    expect(result.product_type.value).toBe("Plate");
    expect(result.certifications[0]).toMatchObject({ family: "QQ", designation: "QQ-A-250/12" });
  });

  it("flags a spec that contradicts the stated alloy", () => {
    const { flags } = normalizeLine({ certifications: [{ family: "AMS", designation: "AMS 4078", source: null }] });
    expect(flags).toContainEqual(expect.objectContaining({ field: "alloy", severity: "warning" }));
  });

  it("flags stainless specs as outside the catalog", () => {
    const { flags } = normalizeLine({
      alloy: unknown(),
      certifications: [{ family: "AMS", designation: "AMS 5643", source: null }],
    });
    expect(flags).toContainEqual(expect.objectContaining({ field: "certifications", severity: "error" }));
  });

  it("converts unconverted millimetre dimensions and reorders plate dims", () => {
    const { line: result, flags } = normalizeLine({
      thickness_in: known(300, "300MM"),
      width_in: known(12.7, "12.7MM"),
      length_in: known(23.622, "600 mm"),
    });
    expect(result.thickness_in.value).toBe(0.5);
    expect(result.width_in.value).toBe(11.811);
    expect(result.length_in.value).toBe(23.622);
    expect(flags.filter((f) => f.message.includes("converted from mm"))).toHaveLength(3);
    expect(flags).toContainEqual(expect.objectContaining({ field: "thickness_in", message: expect.stringContaining("reordered") }));
  });

  it("puts the smallest plate dimension in thickness", () => {
    const { line: result } = normalizeLine({ thickness_in: known(12), width_in: known(0.5), length_in: known(24) });
    expect([result.thickness_in.value, result.width_in.value, result.length_in.value]).toEqual([0.5, 12, 24]);
    expect(result.thickness_in.confidence).toBe("medium");
  });

  it("infers DFARS from line text and from document notes", () => {
    expect(normalizeLine({ description_raw: "7050 plate, melted in USA" }).line.compliance).toMatchObject({ value: "dfars", confidence: "high" });
    expect(normalizeLine({}, "All material per DFARS 252.225-7009").line.compliance).toMatchObject({ value: "dfars", confidence: "medium" });
    expect(normalizeLine({ description_raw: "USA origin only" }).line.compliance.value).toBe("domestic");
    expect(normalizeLine({ description_raw: "6061 plate" }).line.compliance.value).toBeNull();
  });

  it("detects mill cert requests in notes", () => {
    expect(normalizeLine({}, "certs pls").rfq.mill_certs_required.value).toBe(true);
    expect(normalizeLine({}, "MTR required").rfq.mill_certs_required.value).toBe(true);
    expect(normalizeLine({}, "thanks").rfq.mill_certs_required.value).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = rfq({ lines: [line({ temper: known("T6") })] });
    normalize(input, catalog);
    expect(input.lines[0].temper.value).toBe("T6");
  });
});
