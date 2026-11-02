import { describe, expect, it } from "vitest";
import { millimetreValues, parseMeasurement, parseQuantity } from "@/lib/units";

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
    expect(parseMeasurement("1/0")).toBeNull();
    expect(parseMeasurement("0/0")).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["10", 10],
    [" 12 pcs ", 12],
    ["4 ea", 4],
    ["qty 5", 5],
    ["1,200", 1200],
    ["2.5", 2.5],
  ])("reads %s as %d", (text, quantity) => {
    expect(parseQuantity(text)).toBe(quantity);
  });

  it.each(["1-2", "10 x 2", "5 (+1 spare)", "1,5", "-3", "0", "abc", ""])("rejects %s instead of running its digits together", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe("millimetreValues", () => {
  it("returns numbers only when the snippet mentions mm", () => {
    expect(millimetreValues("12.7 x 300 x 600 mm")).toEqual([12.7, 300, 600]);
    expect(millimetreValues("1/2 x 12 x 24")).toEqual([]);
  });
});
