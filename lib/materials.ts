import type { Catalog, MaterialDto, ProductType } from "./schema";

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
