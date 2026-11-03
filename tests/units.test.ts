import { describe, expect, it } from "vitest";
import { millimetreSource, millimetreValues, parseMeasurement } from "@/lib/units";

describe("parseMeasurement", () => {
  it.each([
    ['1/2"', 0.5],
    ["1-1/2", 1.5],
    ["1 1/2 in", 1.5],
    [".500", 0.5],
    ["0.5in", 0.5],
    ["3/4 thk", 0.75],
    ["2.5 dia", 2.5],
    ["12", 12],
  ])("reads %s as %d inches", (text, inches) => {
    expect(parseMeasurement(text)).toEqual({ inches, fromMm: false });
  });

  it("converts millimetres to inches", () => {
    expect(parseMeasurement("12.7 mm")).toEqual({ inches: 0.5, fromMm: true });
    expect(parseMeasurement("300MM")).toEqual({ inches: 11.811, fromMm: true });
  });

  it("rejects text that is not a measurement", () => {
    expect(parseMeasurement("abc")).toBeNull();
    expect(parseMeasurement("0")).toBeNull();
    expect(parseMeasurement("")).toBeNull();
  });
});

describe("millimetreValues", () => {
  it("returns numbers only when the snippet mentions mm", () => {
    expect(millimetreValues("12.7 x 300 x 600 mm")).toEqual([12.7, 300, 600]);
    expect(millimetreValues("12.7MM X 300MM X 600MM")).toEqual([12.7, 300, 600]);
    expect(millimetreValues("1/2 x 12 x 24")).toEqual([]);
  });

  it("returns only the numbers written in mm when inches are given too", () => {
    expect(millimetreValues('0.500" (12.7 mm)')).toEqual([12.7]);
    expect(millimetreValues("0.5 x 12 x 24 in (12.7 x 305 x 610 mm)")).toEqual([12.7, 305, 610]);
    expect(millimetreValues("1-1/2 x 300mm")).toEqual([300]);
  });

  it("reads decimal commas and thousands separators", () => {
    expect(millimetreValues("12,7 mm")).toEqual([12.7]);
    expect(millimetreValues("1,200 x 2,400 mm")).toEqual([1200, 2400]);
  });

  it("reads a size followed by a separate Units cell in a CSV row", () => {
    expect(millimetreValues("40,HR-1010,END CAP,7075-T6,25.4 x 150 x 300,mm,3,6")).toEqual([25.4, 150, 300]);
    expect(millimetreValues("10,HR-1001-A,BASE PLATE,AL 6061-T651,1.00 x 12.00 x 18.00,IN,2,4")).toEqual([]);
  });
});

describe("millimetreSource", () => {
  it("finds the mm figure a value has to be converted from", () => {
    expect(millimetreSource(300, "300MM")).toBe(300);
    expect(millimetreSource(12.7, "12,7 mm")).toBe(12.7);
    expect(millimetreSource(300, "25mm dia x 300 lg")).toBe(300);
  });

  it("returns the mm figure for a value the model already converted", () => {
    expect(millimetreSource(0.5, "12.7MM")).toBe(12.7);
    expect(millimetreSource(23.622, "600 mm")).toBe(600);
  });

  it("leaves a value the snippet states in inches next to a metric figure", () => {
    expect(millimetreSource(0.5, '0.500" (12.7 mm)')).toBeNull();
    expect(millimetreSource(12, "0.5 x 12 x 24 in (12.7 x 305 x 610 mm)")).toBeNull();
    expect(millimetreSource(12, "0.500 x 12.000 x 24.000 (12.7 x 305 x 610 mm)")).toBeNull();
    expect(millimetreSource(0.5, "0.500 x 12.000 x 24.000 (12.7 x 305 x 610 mm)")).toBeNull();
  });

  it("ignores snippets with no millimetres", () => {
    expect(millimetreSource(12, "1/2 x 12 x 24")).toBeNull();
    expect(millimetreSource(20, "SHCS M6x20 CL12.9")).toBeNull();
  });
});
