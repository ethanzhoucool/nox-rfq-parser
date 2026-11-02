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
  // "1/0" parses to Infinity and "0/0" to NaN.
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return { inches: fromMm ? roundInches(value / MM_PER_INCH) : value, fromMm };
}

function parseNumber(body: string): number | null {
  const mixed = MIXED.exec(body);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = FRACTION.exec(body);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return DECIMAL.test(body) ? Number(body) : null;
}

const QUANTITY = /^(?:qty\.?:?\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(?:pcs?\.?|pieces?|ea\.?|each)?$/i;

/**
 * Parses a piece count typed into the editor: "10", "1,200", "12 pcs", "qty 5". Anything else, such as
 * "1-2", "10 x 2" or "1,5", is rejected rather than having its digits run together into 12, 102 or 15.
 */
export function parseQuantity(text: string): number | null {
  const match = QUANTITY.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, "") + (match[2] ?? ""));
  return value > 0 ? value : null;
}

export function roundInches(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Returns every millimetre value mentioned in a snippet, e.g. "12.7 x 300 x 600 mm" → [12.7, 300, 600]. */
export function millimetreValues(source: string): number[] {
  if (!/\d\s*mm\b/i.test(source)) return [];
  return Array.from(source.matchAll(/(\d+(?:\.\d+)?)/g), (m) => Number(m[1]));
}
