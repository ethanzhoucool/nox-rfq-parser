import seed from "@/data/materials.seed.json";
import { config } from "./config";
import { fetchMaterials } from "./nox";
import type { Catalog } from "./schema";

const TTL_MS = 10 * 60 * 1000;
const SEED: Catalog = { source: "seed", materials: { Plate: seed.Plate, Bar: seed.Bar, Tube: seed.Tube } };

let cached: { catalog: Catalog; expires: number } | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (!config.noxKey) return SEED;
  if (cached && cached.expires > Date.now()) return cached.catalog;

  try {
    const catalog: Catalog = { source: "live", materials: await fetchMaterials() };
    cached = { catalog, expires: Date.now() + TTL_MS };
    return catalog;
  } catch (error) {
    console.error("Falling back to seed catalog:", error);
    return SEED;
  }
}
