import { describe, expect, it } from "vitest";
import { addBusinessDays, isIsoDate } from "@/lib/dates";

describe("isIsoDate", () => {
  it("accepts real calendar days", () => {
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects days that don't exist and other formats", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("10/05/2026")).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends", () => {
    expect(addBusinessDays("2026-10-02", 1)).toBe("2026-10-05");
    expect(addBusinessDays("2026-10-02", 2)).toBe("2026-10-06");
  });
});
