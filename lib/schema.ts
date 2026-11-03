import { z } from "zod";
import { CERT_FAMILIES, COMPLIANCE, PRODUCT_TYPES, SHAPES, type CertFamily, type Compliance, type ProductType, type Shape } from "./vocabulary";

// Re-exported so server code can keep importing them from here. Client code imports ./vocabulary
// directly, because importing a value from this module pulls zod into the browser bundle.
export { CERT_FAMILIES, COMPLIANCE, DIMENSION_FIELDS, PRODUCT_TYPES, SHAPES } from "./vocabulary";
export type { CertFamily, Compliance, DimensionField, ProductType, Shape } from "./vocabulary";

const Confidence = z.enum(["high", "medium", "low"]);

function field<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), confidence: Confidence, source: z.string().nullable() });
}

const StringField = field(z.string());
const NumberField = field(z.number());

export const ExtractedLineSchema = z.object({
  ref: z.string(),
  customer_part_number: StringField,
  description_raw: z.string(),
  alloy: StringField,
  temper: StringField,
  product_type: field(z.enum(PRODUCT_TYPES)),
  shape: field(z.enum(SHAPES)),
  thickness_in: NumberField,
  width_in: NumberField,
  length_in: NumberField,
  height_in: NumberField,
  diameter_in: NumberField,
  outer_diameter_in: NumberField,
  outer_dimension_in: NumberField,
  wall_thickness_in: NumberField,
  quantity: NumberField,
  cut_tolerance: StringField,
  compliance: field(z.enum(COMPLIANCE)),
  certifications: z.array(
    z.object({ family: z.enum(CERT_FAMILIES), designation: z.string(), source: z.string().nullable() }),
  ),
  notes: z.string().nullable(),
});

export const ExtractedRfqSchema = z.object({
  document_type: z.enum(["rfq", "po", "email", "drawing", "spreadsheet", "other"]),
  po_number: StringField,
  job_number: StringField,
  customer: z.object({ name: StringField, company: StringField, email: StringField, phone: StringField }),
  ship_to_address: StringField,
  bill_to_address: StringField,
  required_date: StringField,
  mill_certs_required: field(z.boolean()),
  lines: z.array(ExtractedLineSchema),
  general_notes: z.string().nullable(),
});

const Severity = z.enum(["error", "warning", "info"]);

export const LlmFlagSchema = z.object({
  severity: Severity,
  line_ref: z.string().nullable(),
  field: z.string().nullable(),
  message: z.string(),
  suggested_question: z.string().nullable(),
});

export const ExtractionSchema = z.object({
  rfq: ExtractedRfqSchema,
  flags: z.array(LlmFlagSchema),
});

export type Confidence = z.infer<typeof Confidence>;
export type Field<T> = { value: T | null; confidence: Confidence; source: string | null };
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;
export type ExtractedRfq = z.infer<typeof ExtractedRfqSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;
export type LlmFlag = z.infer<typeof LlmFlagSchema>;
export type Severity = z.infer<typeof Severity>;

export type Flag = LlmFlag & { id: string; source: "llm" | "rules" };


export type RfqCertificationDto = { family: CertFamily; designation: string };

export type RfqLineDto = {
  ref?: string;
  alloy: string;
  product_type?: ProductType;
  shape?: Shape;
  temper?: string;
  thickness?: number;
  width?: number;
  length?: number;
  height?: number;
  outer_diameter?: number;
  diameter?: number;
  outer_dimension?: number;
  wall_thickness?: number;
  requested_quantity: number;
  compliance?: Compliance;
  job_detail?: string;
  certifications?: RfqCertificationDto[];
};

export type CreateRfqDto = {
  subject?: string;
  job_number?: string;
  customer?: { name?: string; company?: string; email?: string; phone?: string };
  bill_to_address?: string;
  ship_to_address?: string;
  lines: RfqLineDto[];
};

export type MaterialDto = { code: string; density: number; tempers: string[] };
export type MaterialsListDto = Record<ProductType, MaterialDto[]>;

export type Catalog = { source: "live" | "seed"; materials: MaterialsListDto };

export type ParseResult = {
  extracted: ExtractedRfq;
  /** Flags produced during extraction (LLM + normalization); kept so the client can re-run validation after edits. */
  extraction_flags: Flag[];
  flags: Flag[];
  payload: CreateRfqDto;
  excluded_refs: string[];
  blocking: boolean;
  meta: { model: string; ms: number; input_tokens?: number; output_tokens?: number; filename?: string; cached_at?: string };
};
