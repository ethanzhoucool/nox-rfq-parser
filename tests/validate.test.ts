import { describe, expect, it } from "vitest";
import type { Flag } from "@/lib/schema";
import { validate } from "@/lib/validate";
import { TODAY, catalog, known, line, rfq, unknown } from "./fixtures";

const flagsFor = (...lines: ReturnType<typeof line>[]) => validate(rfq({ lines }), catalog, TODAY);
const summary = (flags: Flag[]) => flags.map((f) => `${f.severity}:${f.line_ref ?? "-"}:${f.field}`);

describe("validate", () => {
  it("passes a complete, stocked plate line", () => {
    expect(flagsFor(line())).toEqual([]);
  });

  it("errors on missing alloy and quantity, warns on missing temper", () => {
    expect(summary(flagsFor(line({ alloy: unknown(), temper: unknown(), quantity: unknown() })))).toEqual([
      "error:L1:alloy",
      "error:L1:quantity",
    ]);
    const missingTemper = flagsFor(line({ temper: unknown() }));
    expect(summary(missingTemper)).toEqual(["warning:L1:temper"]);
    expect(missingTemper[0].suggested_question).toContain("OK to quote 6061-T651?");
  });

  it("errors on quantities outside 1..200", () => {
    const [over] = flagsFor(line({ quantity: known(250) }));
    expect(over).toMatchObject({ severity: "error", field: "quantity" });
    expect(over.message).toContain("Split into 2 lines");
    expect(summary(flagsFor(line({ quantity: known(0) })))).toEqual(["error:L1:quantity"]);
    expect(flagsFor(line({ quantity: known(200) }))).toEqual([]);
  });

  it("requires the dimensions for each shape", () => {
    expect(summary(flagsFor(line({ width_in: unknown() })))).toEqual(["error:L1:width_in"]);
    const roundBar = line({
      product_type: known("Bar"),
      shape: known("Round"),
      temper: known("T6511"),
      thickness_in: unknown(),
      width_in: unknown(),
      diameter_in: known(2.5),
      length_in: unknown(),
    });
    expect(summary(flagsFor(roundBar))).toEqual(["error:L1:length_in"]);
    expect(summary(flagsFor(line({ product_type: known("Bar"), shape: unknown(), temper: known("T6511") })))).toEqual(["error:L1:shape"]);
  });

  it("errors on alloys and tempers outside the catalog", () => {
    expect(summary(flagsFor(line({ alloy: known("17-4PH"), product_type: known("Bar"), shape: known("Round"), diameter_in: known(1) })))).toContain(
      "error:L1:alloy",
    );
    expect(summary(flagsFor(line({ temper: known("T6") })))).toEqual(["error:L1:temper"]);
    expect(summary(flagsFor(line({ product_type: known("Tube"), shape: known("Round"), outer_diameter_in: known(2), wall_thickness_in: known(0.125) })))).toContain(
      "error:L1:alloy",
    );
  });

  it("adds a compliance error when DFARS is required on an unstocked alloy", () => {
    expect(summary(flagsFor(line({ alloy: known("6082"), compliance: known("dfars") })))).toEqual([
      "error:L1:alloy",
      "error:L1:compliance",
    ]);
  });

  it("warns on a plate thickness Nox doesn't stock instead of rounding it", () => {
    const [flag] = flagsFor(line({ alloy: known("7075"), thickness_in: known(0.375) }));
    expect(flag).toMatchObject({ severity: "warning", field: "thickness_in" });
    expect(flag.message).toContain('nearest: 0.25" or 0.5"');
    expect(flagsFor(line({ alloy: known("6061"), thickness_in: known(0.375) }))).toEqual([]);
    expect(flagsFor(line({ alloy: known("7075"), thickness_in: known(0.75) }))).toEqual([]);
  });

  it("errors on a dimension that isn't greater than zero", () => {
    const [flag] = flagsFor(line({ width_in: known(0) }));
    expect(flag).toMatchObject({ severity: "error", field: "width_in" });
    expect(flag.message).toContain('Width 0" isn\'t a size');
    expect(summary(flagsFor(line({ thickness_in: known(-0.5) })))).toEqual(["error:L1:thickness_in"]);
  });

  it("warns about a dimension the form doesn't use, since the payload drops it", () => {
    const roundBar = line({
      product_type: known("Bar"),
      shape: known("Round"),
      temper: known("T6511"),
      thickness_in: unknown(),
      width_in: known(2),
      diameter_in: known(2.5),
    });
    const flags = flagsFor(roundBar);
    expect(summary(flags)).toEqual(["warning:L1:width_in"]);
    expect(flags[0].message).toBe('Width 2" doesn\'t apply to round bar and won\'t be sent to Nox. Check the form and size.');
  });

  it("warns when a line has more spec callouts than the API accepts", () => {
    const certifications = Array.from({ length: 12 }, (_, i) => ({ family: "AMS" as const, designation: `AMS ${4000 + i}`, source: null }));
    const [flag] = flagsFor(line({ certifications }));
    expect(flag).toMatchObject({ severity: "warning", field: "certifications" });
    expect(flag.message).toContain("AMS 4010, AMS 4011 go in the job detail");
  });

  it("warns on unusual plate thickness", () => {
    expect(summary(flagsFor(line({ thickness_in: known(8) })))).toEqual(["warning:L1:thickness_in"]);
    expect(summary(flagsFor(line({ thickness_in: known(0.063) })))).toEqual(["warning:L1:thickness_in"]);
  });

  it("warns on low-confidence values", () => {
    const flags = flagsFor(line({ quantity: { value: 10, confidence: "low", source: "ten-ish" } }));
    expect(summary(flags)).toEqual(["warning:L1:quantity"]);
    expect(flags[0].message).toContain('"ten-ish"');
  });

  it("warns when the need-by date is inside two business days", () => {
    const check = (date: string) => summary(validate(rfq({ required_date: known(date) }), catalog, TODAY));
    expect(check("2026-10-05")).toEqual(["warning:-:required_date"]);
    expect(check("2026-10-06")).toEqual([]);
    expect(check("next week")).toEqual(["warning:-:required_date"]);
  });

  it("says a need-by date has passed instead of calling it tight", () => {
    const [flag] = validate(rfq({ required_date: known("2026-09-30") }), catalog, TODAY);
    expect(flag).toMatchObject({ id: "rules:header:required_date:date-past", severity: "warning" });
    expect(flag.message).toBe("Need-by 2026-09-30 has already passed. Check the date.");
  });

  it("doesn't accept a calendar day that doesn't exist", () => {
    const [flag] = validate(rfq({ required_date: known("2026-11-31") }), catalog, TODAY);
    expect(flag).toMatchObject({ id: "rules:header:required_date:date-unparsed" });
  });

  it("errors when no lines were found", () => {
    expect(summary(validate(rfq({ lines: [] }), catalog, TODAY))).toEqual(["error:-:lines"]);
  });
});
