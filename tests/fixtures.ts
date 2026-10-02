import seed from "@/data/materials.seed.json";
import type { Catalog, ExtractedLine, ExtractedRfq, Field } from "@/lib/schema";

export const catalog: Catalog = { source: "seed", materials: { Plate: seed.Plate, Bar: seed.Bar, Tube: seed.Tube } };

export const TODAY = "2026-10-02";

export const known = <T,>(value: T, source: string | null = null): Field<T> => ({ value, confidence: "high", source });
export const unknown = <T,>(): Field<T> => ({ value: null, confidence: "high", source: null });

export function line(overrides: Partial<ExtractedLine> = {}): ExtractedLine {
  return {
    ref: "L1",
    customer_part_number: unknown(),
    description_raw: "",
    alloy: known("6061"),
    temper: known("T651"),
    product_type: known("Plate"),
    shape: known("Plate"),
    thickness_in: known(0.5),
    width_in: known(12),
    length_in: known(24),
    height_in: unknown(),
    diameter_in: unknown(),
    outer_diameter_in: unknown(),
    outer_dimension_in: unknown(),
    wall_thickness_in: unknown(),
    quantity: known(10),
    cut_tolerance: unknown(),
    compliance: unknown(),
    certifications: [],
    notes: null,
    ...overrides,
  };
}

export function rfq(overrides: Partial<ExtractedRfq> = {}): ExtractedRfq {
  return {
    document_type: "email",
    po_number: unknown(),
    job_number: unknown(),
    customer: { name: unknown(), company: unknown(), email: unknown(), phone: unknown() },
    ship_to_address: unknown(),
    bill_to_address: unknown(),
    required_date: unknown(),
    mill_certs_required: unknown(),
    lines: [line()],
    general_notes: null,
    ...overrides,
  };
}
