import type { CertFamily, ProductType } from "./schema";

export type SpecCallout = {
  family: CertFamily;
  designation: string;
  alloy: string | null;
  temper: string | null;
  product_type: ProductType | null;
  note?: string;
  outsideCatalog?: boolean;
};

export const SPEC_CALLOUTS: SpecCallout[] = [
  { family: "AMS", designation: "AMS 4027", alloy: "6061", temper: "T651", product_type: null },
  { family: "QQ", designation: "QQ-A-250/11", alloy: "6061", temper: "T651", product_type: "Plate" },
  { family: "AMS", designation: "AMS 4078", alloy: "7075", temper: "T7351", product_type: "Plate" },
  { family: "AMS", designation: "AMS 4045", alloy: "7075", temper: "T651", product_type: "Plate" },
  { family: "QQ", designation: "QQ-A-250/12", alloy: "7075", temper: null, product_type: "Plate" },
  { family: "AMS", designation: "AMS 4050", alloy: "7050", temper: "T7451", product_type: "Plate" },
  { family: "ASTM", designation: "ASTM B209", alloy: null, temper: null, product_type: "Plate", note: "general sheet/plate spec, no alloy implied" },
  { family: "ASTM", designation: "ASTM B221", alloy: null, temper: null, product_type: "Bar", note: "extruded bar/rod spec, no alloy implied" },
  { family: "AMS", designation: "AMS 4117", alloy: "6061", temper: null, product_type: "Bar" },
  { family: "QQ", designation: "QQ-A-225/8", alloy: "6061", temper: null, product_type: "Bar" },
  { family: "AMS", designation: "AMS 4122", alloy: "7075", temper: "T651", product_type: "Bar" },
  { family: "QQ", designation: "QQ-A-225/9", alloy: "7075", temper: "T651", product_type: "Bar" },
  {
    family: "AMS",
    designation: "AMS 5643",
    alloy: "17-4PH",
    temper: null,
    product_type: "Bar",
    note: "17-4 PH stainless bar",
    outsideCatalog: true,
  },
];

/** Canonical form used by Nox: "AMS 4027", "QQ-A-250/11", "ASTM B209". */
export function canonicalDesignation(raw: string): string {
  const compact = raw.toUpperCase().replace(/\s+/g, " ").trim();
  const qq = /QQ\s*-?\s*A\s*-?\s*(\d+)\s*\/\s*(\d+)/.exec(compact);
  if (qq) return `QQ-A-${qq[1]}/${qq[2]}`;
  const prefixed = /^(AMS|ASTM|ASME)[\s-]*([A-Z]?\d+)/.exec(compact);
  if (prefixed) return `${prefixed[1]} ${prefixed[2]}`;
  return compact;
}

export function lookupSpec(designation: string): SpecCallout | null {
  const canonical = canonicalDesignation(designation);
  return SPEC_CALLOUTS.find((spec) => spec.designation === canonical) ?? null;
}

export function describeSpecTable(): string {
  return SPEC_CALLOUTS.map((s) => {
    const material = [s.alloy, s.temper].filter(Boolean).join("-") || "no alloy implied";
    const form = s.product_type ? ` ${s.product_type.toLowerCase()}` : "";
    const note = s.note ? ` (${s.note})` : "";
    return `- ${s.designation} [${s.family}] → ${material}${form}${note}`;
  }).join("\n");
}
