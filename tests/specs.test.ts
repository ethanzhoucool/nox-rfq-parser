import { describe, expect, it } from "vitest";
import { canonicalDesignation, lookupSpec } from "@/lib/specs";

describe("canonicalDesignation", () => {
  it.each([
    ["AMS-QQ-A-250/12", "QQ-A-250/12"],
    ["qq-a-250/11", "QQ-A-250/11"],
    ["AMS4027", "AMS 4027"],
    ["AMS 4027N", "AMS 4027"],
    ["ASTM B209-14", "ASTM B209"],
  ])("%s → %s", (raw, canonical) => {
    expect(canonicalDesignation(raw)).toBe(canonical);
  });
});

describe("lookupSpec", () => {
  it("maps callouts to alloy, temper and form", () => {
    expect(lookupSpec("AMS 4078")).toMatchObject({ alloy: "7075", temper: "T7351", product_type: "Plate" });
    expect(lookupSpec("AMS-QQ-A-250/12")).toMatchObject({ family: "QQ", alloy: "7075" });
    expect(lookupSpec("ASTM B209")).toMatchObject({ alloy: null });
  });

  it("marks stainless specs as outside the catalog", () => {
    expect(lookupSpec("AMS 5643")?.outsideCatalog).toBe(true);
  });

  it("returns null for unknown specs", () => {
    expect(lookupSpec("MIL-STD-1234")).toBeNull();
  });
});
