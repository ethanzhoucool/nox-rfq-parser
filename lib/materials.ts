import plateThicknesses from "@/data/plate-thicknesses.json";
import type { Catalog, MaterialDto, ProductType } from "./schema";

const STOCK_PLATE_THICKNESSES: Record<string, number[]> = Object.fromEntries(
  Object.entries(plateThicknesses).filter((entry): entry is [string, number[]] => Array.isArray(entry[1])),
);

/** Stock plate thicknesses for an alloy, or null when we don't have a list for it. */
export function stockPlateThicknesses(alloy: string): number[] | null {
  return STOCK_PLATE_THICKNESSES[alloy.trim().toUpperCase()] ?? null;
}

export function findMaterial(catalog: Catalog, productType: ProductType, alloy: string): MaterialDto | null {
  const code = alloy.trim().toUpperCase();
  return catalog.materials[productType].find((m) => m.code.toUpperCase() === code) ?? null;
}

export function stocksTemper(material: MaterialDto, temper: string): boolean {
  return material.tempers.some((t) => t.toUpperCase() === temper.trim().toUpperCase());
}

/** Maps a generic temper to the stress-relieved variant Nox stocks, e.g. T6 → T651 on plate, T73 → T7351. */
export function stockedVariant(material: MaterialDto, temper: string): string | null {
  const requested = temper.trim().toUpperCase();
  return material.tempers.find((t) => t.toUpperCase().startsWith(requested)) ?? null;
}
