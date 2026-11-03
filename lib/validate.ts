import { addBusinessDays, isIsoDate } from "./dates";
import { ruleFlag } from "./flags";
import { findMaterial, stockPlateThicknesses, stocksTemper } from "./materials";
import { MAX_CERTIFICATIONS } from "./payload";
import type { Catalog, DimensionField, ExtractedLine, ExtractedRfq, Field, Flag, MaterialDto } from "./schema";
import { DIMENSION_LABELS, describeForm, effectiveShape, requiredDimensions } from "./shapes";
import { capitalize } from "./text";

export const MAX_QUANTITY = 200;
export const MAX_LINES = 100;
const PLATE_THICKNESS_RANGE = { min: 0.125, max: 6 };
const MIN_LEAD_BUSINESS_DAYS = 2;

const DIMENSION_NAMES = Object.keys(DIMENSION_LABELS) as DimensionField[];

const HEADER_FIELD_LABELS = {
  po_number: "PO number",
  job_number: "job number",
  ship_to_address: "ship-to address",
  bill_to_address: "bill-to address",
  required_date: "required date",
  mill_certs_required: "mill cert requirement",
} as const;

const LINE_FIELD_LABELS = {
  customer_part_number: "part number",
  alloy: "alloy",
  temper: "temper",
  product_type: "product form",
  shape: "shape",
  ...DIMENSION_LABELS,
  quantity: "quantity",
  cut_tolerance: "cut tolerance",
  compliance: "compliance",
} as const;

export function validate(rfq: ExtractedRfq, catalog: Catalog, today: string): Flag[] {
  return [...validateHeader(rfq, today), ...rfq.lines.flatMap((line) => validateLine(line, catalog)), ...duplicateLines(rfq.lines)];
}

function validateHeader(rfq: ExtractedRfq, today: string): Flag[] {
  const flags: Flag[] = [];

  if (rfq.lines.length === 0) {
    flags.push(
      ruleFlag("no-lines", {
        severity: "error",
        line_ref: null,
        field: "lines",
        message: "No material line items found in the document.",
        suggested_question: "Could you send the list of material you'd like quoted (alloy, size and quantity)?",
      }),
    );
  }
  if (rfq.lines.length > MAX_LINES) {
    flags.push(
      ruleFlag("too-many-lines", {
        severity: "error",
        line_ref: null,
        field: "lines",
        message: `${rfq.lines.length} lines exceeds the API limit of ${MAX_LINES} per RFQ. Split into multiple RFQs.`,
      }),
    );
  }

  const date = rfq.required_date.value;
  if (date && isIsoDate(date) && date < today) {
    flags.push(
      ruleFlag("date-past", {
        severity: "warning",
        line_ref: null,
        field: "required_date",
        message: `Need-by ${date} has already passed. Check the date.`,
        suggested_question: `The need-by date reads ${date}, which has passed. What date do you need the material on your dock?`,
      }),
    );
  } else if (date && !isIsoDate(date)) {
    flags.push(
      ruleFlag("date-unparsed", {
        severity: "warning",
        line_ref: null,
        field: "required_date",
        message: `Couldn't read "${date}" as a calendar date.`,
        suggested_question: "What date do you need the material on your dock?",
      }),
    );
  } else if (date && date < addBusinessDays(today, MIN_LEAD_BUSINESS_DAYS)) {
    flags.push(
      ruleFlag("date-tight", {
        severity: "warning",
        line_ref: null,
        field: "required_date",
        message: `Need-by ${date} is tight; Nox turns stocked material next day, but confirm the ship date.`,
        suggested_question: `You need this by ${date}. Is that a dock date or a ship date, and is there any flexibility?`,
      }),
    );
  }

  for (const [name, label] of Object.entries(HEADER_FIELD_LABELS)) {
    flags.push(...lowConfidence(null, name, label, rfq[name as keyof typeof HEADER_FIELD_LABELS]));
  }
  for (const [name, value] of Object.entries(rfq.customer)) {
    flags.push(...lowConfidence(null, `customer.${name}`, `customer ${name}`, value));
  }

  return flags;
}

function validateLine(line: ExtractedLine, catalog: Catalog): Flag[] {
  const flags: Flag[] = [];
  const ref = line.ref;
  const alloy = line.alloy.value;
  const productType = line.product_type.value;

  if (!alloy) {
    flags.push(
      ruleFlag("missing", {
        severity: "error",
        line_ref: ref,
        field: "alloy",
        message: "Alloy not specified.",
        suggested_question: `Line ${ref}: which alloy do you need (e.g. 6061, 7075)?`,
      }),
    );
  }

  flags.push(...validateQuantity(line));

  if (!productType) {
    flags.push(
      ruleFlag("missing", {
        severity: "error",
        line_ref: ref,
        field: "product_type",
        message: "Product form not specified (plate, bar or tube).",
        suggested_question: `Line ${ref}: is this plate, bar or tube?`,
      }),
    );
  } else {
    flags.push(...validateDimensions(line));
  }

  if (alloy && productType) {
    const material = findMaterial(catalog, productType, alloy);
    flags.push(...(material ? validateTemper(line, material) : notStocked(line)));
  }

  if (line.certifications.length > MAX_CERTIFICATIONS) {
    const overflow = line.certifications.slice(MAX_CERTIFICATIONS).map((cert) => cert.designation);
    flags.push(
      ruleFlag("too-many-certifications", {
        severity: "warning",
        line_ref: ref,
        field: "certifications",
        message: `${line.certifications.length} spec callouts; the API takes ${MAX_CERTIFICATIONS} per line, so ${overflow.join(", ")} go in the job detail instead. Confirm.`,
      }),
    );
  }

  for (const [name, label] of Object.entries(LINE_FIELD_LABELS)) {
    flags.push(...lowConfidence(ref, name, label, line[name as keyof typeof LINE_FIELD_LABELS]));
  }
  return flags;
}

function validateQuantity(line: ExtractedLine): Flag[] {
  const quantity = line.quantity.value;
  const base = { severity: "error" as const, line_ref: line.ref, field: "quantity" };

  if (quantity === null) {
    return [
      ruleFlag("missing", {
        ...base,
        message: "Quantity not specified.",
        suggested_question: `Line ${line.ref}: how many pieces do you need?`,
      }),
    ];
  }
  if (quantity > MAX_QUANTITY) {
    return [
      ruleFlag("range", {
        ...base,
        message: `Quantity ${quantity} exceeds the API maximum of ${MAX_QUANTITY} per line. Split into ${Math.ceil(quantity / MAX_QUANTITY)} lines.`,
        suggested_question: `Line ${line.ref}: ${quantity} pcs is a large order. OK to quote it as ${Math.ceil(quantity / MAX_QUANTITY)} release lines?`,
      }),
    ];
  }
  if (quantity < 1 || !Number.isInteger(quantity)) {
    return [ruleFlag("range", { ...base, message: `Quantity ${quantity} must be a whole number of pieces, 1 to ${MAX_QUANTITY}.` })];
  }
  return [];
}

function validateDimensions(line: ExtractedLine): Flag[] {
  const productType = line.product_type.value!;
  const shape = effectiveShape(line);

  if (!shape) {
    return [
      ruleFlag("missing", {
        severity: "error",
        line_ref: line.ref,
        field: "shape",
        message: `${productType} shape not specified (round, square or rectangle).`,
        suggested_question: `Line ${line.ref}: is the ${productType.toLowerCase()} round, square or rectangular (flat)?`,
      }),
    ];
  }

  const required = requiredDimensions(productType, shape);
  if (!required) {
    return [
      ruleFlag("invalid", {
        severity: "error",
        line_ref: line.ref,
        field: "shape",
        message: `${shape} isn't a valid shape for ${productType.toLowerCase()}.`,
      }),
    ];
  }

  const form = describeForm(productType, shape);
  const flags = required
    .filter((name) => line[name].value === null)
    .map((name) =>
      ruleFlag("missing", {
        severity: "error",
        line_ref: line.ref,
        field: name,
        message: `${capitalize(form)} is missing ${DIMENSION_LABELS[name]}.`,
        suggested_question: `Line ${line.ref}: what ${DIMENSION_LABELS[name]} do you need on the ${form}?`,
      }),
    );

  const notPositive = required.filter((name) => {
    const value = line[name].value;
    return value !== null && !(value > 0 && Number.isFinite(value));
  });
  for (const name of notPositive) {
    flags.push(
      ruleFlag("range", {
        severity: "error",
        line_ref: line.ref,
        field: name,
        message: `${capitalize(DIMENSION_LABELS[name])} ${line[name].value}" isn't a size; it must be greater than zero.`,
        suggested_question: `Line ${line.ref}: what ${DIMENSION_LABELS[name]} do you need on the ${form}?`,
      }),
    );
  }

  // The payload only carries the dimensions the form uses, so anything else would vanish without a word.
  for (const name of DIMENSION_NAMES.filter((name) => !required.includes(name) && line[name].value !== null)) {
    const label = DIMENSION_LABELS[name];
    flags.push(
      ruleFlag("unused-dimension", {
        severity: "warning",
        line_ref: line.ref,
        field: name,
        message: `${capitalize(label)} ${line[name].value}" doesn't apply to ${form} and won't be sent to Nox. Check the form and size.`,
        suggested_question: `Line ${line.ref}: you gave a ${label} of ${line[name].value}", which a ${form} doesn't have. Can you confirm the form and size?`,
      }),
    );
  }

  const thickness = line.thickness_in.value;
  if (notPositive.includes("thickness_in")) return flags;
  if (productType === "Plate" && thickness !== null && (thickness < PLATE_THICKNESS_RANGE.min || thickness > PLATE_THICKNESS_RANGE.max)) {
    flags.push(
      ruleFlag("unusual-thickness", {
        severity: "warning",
        line_ref: line.ref,
        field: "thickness_in",
        message: `${thickness}" thick is unusual for stocked plate (${PLATE_THICKNESS_RANGE.min}" to ${PLATE_THICKNESS_RANGE.max}"). Confirm.`,
        suggested_question: `Line ${line.ref}: can you confirm the plate thickness of ${thickness}"?`,
      }),
    );
  } else if (productType === "Plate" && thickness !== null && line.alloy.value) {
    flags.push(...validateStockThickness(line, line.alloy.value, thickness));
  }
  return flags;
}

/** Flags a plate thickness Nox doesn't stock instead of rounding it to the nearest one. */
function validateStockThickness(line: ExtractedLine, alloy: string, thickness: number): Flag[] {
  const stock = stockPlateThicknesses(alloy);
  if (!stock || stock.some((t) => Math.abs(t - thickness) < 0.001)) return [];

  const below = stock.filter((t) => t < thickness).at(-1);
  const above = stock.find((t) => t > thickness);
  const nearest = [below, above].filter((t) => t !== undefined).map((t) => `${t}"`).join(" or ");
  return [
    ruleFlag("non-stock-thickness", {
      severity: "warning",
      line_ref: line.ref,
      field: "thickness_in",
      message: `${thickness}" isn't a stock thickness for ${alloy} plate (nearest: ${nearest}). Not rounded; confirm with the buyer or route to sales.`,
      suggested_question: `Line ${line.ref}: we don't stock ${alloy} plate at ${thickness}". Would ${nearest} work, or do you need it machined to ${thickness}"?`,
    }),
  ];
}

function validateTemper(line: ExtractedLine, material: MaterialDto): Flag[] {
  const temper = line.temper.value;
  const form = line.product_type.value!.toLowerCase();
  const stocked = material.tempers.join(", ");

  if (!temper) {
    const onlyTemper = material.tempers.length === 1 ? material.tempers[0] : null;
    return [
      ruleFlag("missing", {
        severity: "warning",
        line_ref: line.ref,
        field: "temper",
        message: onlyTemper
          ? `Temper not specified; Nox stocks ${material.code} ${form} only as ${onlyTemper}.`
          : `Temper not specified; Nox stocks ${material.code} ${form} as ${stocked}.`,
        suggested_question: onlyTemper
          ? `Line ${line.ref}: no temper was given for the ${material.code} ${form}. OK to quote ${material.code}-${onlyTemper}?`
          : `Line ${line.ref}: which temper do you need on the ${material.code} ${form}: ${stocked}?`,
      }),
    ];
  }
  if (!stocksTemper(material, temper)) {
    return [
      ruleFlag("not-stocked", {
        severity: "error",
        line_ref: line.ref,
        field: "temper",
        message: `${material.code}-${temper} ${form} isn't stocked (Nox carries ${stocked}). Route to sales or confirm an alternate.`,
        suggested_question: `Line ${line.ref}: we don't stock ${material.code}-${temper} ${form}. Would ${material.code}-${material.tempers[0]} work?`,
      }),
    ];
  }
  return [];
}

function notStocked(line: ExtractedLine): Flag[] {
  const form = line.product_type.value!.toLowerCase();
  const alloy = line.alloy.value!;
  const flags = [
    ruleFlag("not-stocked", {
      severity: "error",
      line_ref: line.ref,
      field: "alloy",
      message: `${alloy} ${form} isn't in Nox's catalog; not stocked, route to sales.`,
    }),
  ];
  if (line.compliance.value === "dfars") {
    flags.push(
      ruleFlag("dfars-not-stocked", {
        severity: "error",
        line_ref: line.ref,
        field: "compliance",
        message: `DFARS material required on ${alloy}, which Nox doesn't stock; sales must source compliant material.`,
      }),
    );
  }
  return flags;
}

/** A line that repeats an earlier one (same part, material and size) is usually a re-sent or carried-over line. */
function duplicateLines(lines: ExtractedLine[]): Flag[] {
  const first = new Map<string, ExtractedLine>();
  return lines.flatMap((line) => {
    const signature = lineSignature(line);
    if (!signature) return [];
    const original = first.get(signature);
    if (!original) {
      first.set(signature, line);
      return [];
    }
    const form = describeForm(line.product_type.value!, effectiveShape(line)!);
    const qty = (l: ExtractedLine) => (l.quantity.value === null ? "no qty" : `qty ${l.quantity.value}`);
    return [
      ruleFlag("duplicate", {
        severity: "warning",
        line_ref: line.ref,
        field: null,
        message: `Same part, material and size as line ${original.ref}. Confirm both are needed, or combine them.`,
        suggested_question: `Lines ${original.ref} and ${line.ref} are the same ${line.alloy.value} ${form} (${qty(original)} and ${qty(line)}). Do you need both, or is one a repeat?`,
      }),
    ];
  });
}

function lineSignature(line: ExtractedLine): string | null {
  const shape = effectiveShape(line);
  const dimensions = (Object.keys(DIMENSION_LABELS) as DimensionField[]).map((name) => line[name].value);
  if (!line.alloy.value || !line.product_type.value || !shape || dimensions.every((d) => d === null)) return null;
  return JSON.stringify([
    line.alloy.value.trim().toUpperCase(),
    line.temper.value?.trim().toUpperCase() ?? null,
    line.product_type.value,
    shape,
    ...dimensions,
    line.customer_part_number.value?.trim().toUpperCase() ?? null,
  ]);
}

function lowConfidence(lineRef: string | null, name: string, label: string, field: Field<unknown>): Flag[] {
  if (field.confidence !== "low" || field.value === null) return [];
  const quote = field.source ? `: "${field.source}"` : "";
  return [
    ruleFlag("low-confidence", {
      severity: "warning",
      line_ref: lineRef,
      field: name,
      message: `Low confidence reading the ${label} (${String(field.value)})${quote}.`,
      suggested_question: lineRef
        ? `Line ${lineRef}: can you confirm the ${label} is ${String(field.value)}?`
        : `Can you confirm the ${label} is ${String(field.value)}?`,
    }),
  ];
}
