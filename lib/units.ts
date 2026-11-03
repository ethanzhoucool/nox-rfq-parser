export const MM_PER_INCH = 25.4;

export type Measurement = { inches: number; fromMm: boolean };

const MIXED = /^(\d+)[\s-]+(\d+)\/(\d+)$/;
const FRACTION = /^(\d+)\/(\d+)$/;
const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;

/** Parses a single dimension such as `1-1/2"`, `.500`, `0.5in` or `12.7 mm` into inches. */
export function parseMeasurement(text: string): Measurement | null {
  const raw = text.trim().toLowerCase();
  const fromMm = /\d\s*mm\.?$/.test(raw);
  const body = raw
    .replace(/(mm|millimeters?|inch(es)?|in|")\.?$/, "")
    .replace(/(thk|thick|dia|lg|long)\.?$/, "")
    .trim();

  const value = parseNumber(body);
  if (value === null || value <= 0) return null;
  return { inches: fromMm ? roundInches(value / MM_PER_INCH) : value, fromMm };
}

function parseNumber(body: string): number | null {
  const mixed = MIXED.exec(body);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = FRACTION.exec(body);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return DECIMAL.test(body) ? Number(body) : null;
}

export function roundInches(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export type UnitTag = "mm" | "in" | null;
export type TaggedNumber = { value: number; unit: UnitTag };

// A number as buyers write it: 1-1/2, 1/2, 1,200 (thousands), 12,7 (decimal comma), 12.7 or .5.
// Comma forms must stand on their own, so CSV cells such as "7075-T6,25.4" or ",3,6" aren't read as one number.
const NUMBER = String.raw`\d+[\s-]+\d+\/\d+|\d+\/\d+|(?<![\w,.])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d{1,2})(?![\d.,])|\d+(?:\.\d+)?|\.\d+`;
// A unit written straight after a number. The optional comma covers a separate Units column in a CSV row.
const UNIT = String.raw`\s*,?\s*(mm|millimet(?:er|re)s?|"|''|”|in(?:ch(?:es)?)?(?![a-z]))`;
const MEMBER = new RegExp(`(${NUMBER})(?:${UNIT})?`, "gi");
// "12.7 x 300 x 600 mm": a trailing unit applies to every number in the group that has none of its own.
const GROUP = new RegExp(`(?:${NUMBER})(?:${UNIT})?(?:\\s*[x×*]\\s*(?:${NUMBER})(?:${UNIT})?)*`, "gi");

/** Every number in a snippet, tagged with the unit written next to it (or after its "a x b x c" group). */
export function taggedNumbers(source: string): TaggedNumber[] {
  const numbers: TaggedNumber[] = [];
  for (const [group] of source.matchAll(GROUP)) {
    const members = Array.from(group.matchAll(MEMBER), (m) => ({ text: m[1], unit: unitTag(m[2]) }));
    const trailing = members.at(-1)?.unit ?? null;
    for (const { text, unit } of members) {
      const value = numberValue(text);
      // Fractions are inch notation; nobody writes 1/2 mm.
      if (Number.isFinite(value)) numbers.push({ value, unit: text.includes("/") ? "in" : (unit ?? trailing) });
    }
  }
  return numbers;
}

function numberValue(text: string): number {
  if (text.includes("/")) return parseNumber(text) ?? Number.NaN;
  if (/^\d{1,3}(?:,\d{3})+/.test(text)) return Number(text.replace(/,/g, ""));
  return Number(text.replace(",", "."));
}

function unitTag(unit: string | undefined): UnitTag {
  if (!unit) return null;
  return unit.toLowerCase().startsWith("m") ? "mm" : "in";
}

/** Returns every millimetre value mentioned in a snippet, e.g. "12.7 x 300 x 600 mm" → [12.7, 300, 600]. */
export function millimetreValues(source: string): number[] {
  return taggedNumbers(source)
    .filter((n) => n.unit === "mm")
    .map((n) => n.value);
}

/**
 * For a dimension read from `source`, returns the millimetre figure it still has to be converted from,
 * or null when the value is already in inches. A value the snippet states in inches next to a metric
 * figure (`0.500" (12.7 mm)`) is left alone; only numbers written as millimetres are treated as mm.
 */
export function millimetreSource(value: number, source: string): number | null {
  const numbers = taggedNumbers(source);
  const mm = numbers.filter((n) => n.unit === "mm").map((n) => n.value);
  if (mm.length === 0) return null;

  const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;
  if (numbers.some((n) => n.unit === "in" && same(n.value, value))) return null;

  const plain = numbers.filter((n) => n.unit === null).map((n) => n.value);
  const converted = mm.find((n) => Math.abs(n / MM_PER_INCH - value) < 0.02);
  // Already in inches. An unmarked number equal to the value means the inch size was stated too; keep it exactly.
  if (converted !== undefined) return plain.some((n) => same(n, value)) ? null : converted;

  // Unmarked numbers count as millimetres only when nothing in the snippet is marked as inches.
  const hasInches = numbers.some((n) => n.unit === "in");
  return [...mm, ...(hasInches ? [] : plain)].find((n) => Math.abs(n - value) < 0.01) ?? null;
}
