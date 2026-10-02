import { ruleFlag } from "./flags";
import { findMaterial, stockedVariant, stocksTemper } from "./materials";
import { DIMENSION_FIELDS, type Catalog, type Confidence, type ExtractedLine, type ExtractedRfq, type Field, type Flag } from "./schema";
import { DIMENSION_LABELS } from "./shapes";
import { canonicalDesignation, lookupSpec } from "./specs";
import { capitalize } from "./text";
import { MM_PER_INCH, millimetreValues, roundInches } from "./units";

const DFARS = /dfars|domestic(ally)?[\s-]+melt|melted (and manufactured )?in (the )?(usa|u\.?s\.?a?\.?|united states)|252\.225-7009|specialty metals clause/i;
const DOMESTIC = /\b(domestic|usa origin|made in (the )?usa|u\.?s\.? origin)\b/i;
const MILL_CERTS = /\b(certs?|c of c|coc|certificate of conformance|mill test reports?|mtrs?|material certs?)\b/i;
const GLUED_TEMPER = /^(?:al(?:uminum)?\s*)?(\d{4})\s*-?\s*(T\d{1,5}|H\d{2,3}|O|F)$/i;

type Context = { catalog: Catalog; flags: Flag[]; headerText: string };

/** Deterministic clean-up applied to the LLM output before validation. */
export function normalize(input: ExtractedRfq, catalog: Catalog): { rfq: ExtractedRfq; flags: Flag[] } {
  const rfq = structuredClone(input);
  const ctx: Context = { catalog, flags: [], headerText: rfq.general_notes ?? "" };

  if (rfq.mill_certs_required.value === null && MILL_CERTS.test(ctx.headerText)) {
    rfq.mill_certs_required = { value: true, confidence: "medium", source: snippet(ctx.headerText, MILL_CERTS) };
  }

  for (const line of rfq.lines) {
    splitGluedTemper(line);
    applySpecCallouts(line, ctx);
    inferCompliance(line, ctx);
    convertMetric(line, ctx);
    orderPlateDimensions(line, ctx);
    mapToStockedTemper(line, ctx);
  }
  return { rfq, flags: ctx.flags };
}

function splitGluedTemper(line: ExtractedLine) {
  const match = line.alloy.value && GLUED_TEMPER.exec(line.alloy.value.trim());
  if (match) {
    line.alloy = { ...line.alloy, value: match[1] };
    if (!line.temper.value) line.temper = { ...line.alloy, value: match[2].toUpperCase() };
  }
  if (line.temper.value) {
    line.temper = { ...line.temper, value: line.temper.value.trim().replace(/^-/, "").toUpperCase() };
  }
}

function applySpecCallouts(line: ExtractedLine, ctx: Context) {
  for (const cert of line.certifications) {
    cert.designation = canonicalDesignation(cert.designation);
    const spec = lookupSpec(cert.designation);
    if (!spec) continue;

    cert.family = spec.family;
    const source = cert.source ?? cert.designation;

    if (spec.alloy && !line.alloy.value) {
      line.alloy = { value: spec.alloy, confidence: "medium", source };
    } else if (spec.alloy && line.alloy.value && line.alloy.value.toUpperCase() !== spec.alloy.toUpperCase()) {
      ctx.flags.push(
        ruleFlag("spec-conflict", {
          severity: "warning",
          line_ref: line.ref,
          field: "alloy",
          message: `${spec.designation} calls for ${spec.alloy}, but the line says ${line.alloy.value}.`,
          suggested_question: `Line ${line.ref}: ${spec.designation} is a ${spec.alloy} spec, but the line reads ${line.alloy.value}. Which alloy do you need?`,
        }),
      );
    }
    if (spec.temper && !line.temper.value) line.temper = { value: spec.temper, confidence: "medium", source };
    if (spec.product_type && !line.product_type.value) {
      line.product_type = { value: spec.product_type, confidence: "medium", source };
    }
    if (spec.outsideCatalog) {
      ctx.flags.push(
        ruleFlag("outside-catalog", {
          severity: "error",
          line_ref: line.ref,
          field: "certifications",
          message: `${spec.designation} is ${spec.note}, outside Nox's aluminum catalog. Route to sales.`,
        }),
      );
    }
  }
}

function inferCompliance(line: ExtractedLine, ctx: Context) {
  if (line.compliance.value && line.compliance.value !== "none") return;

  const lineText = [line.description_raw, line.notes].filter(Boolean).join(" ");
  for (const [text, confidence, header] of [
    [lineText, "high", false],
    [ctx.headerText, "medium", true],
  ] as const) {
    for (const [pattern, value] of [[DFARS, "dfars"], [DOMESTIC, "domestic"]] as const) {
      if (!pattern.test(text) || (header && !headerAppliesTo(line.ref, text, pattern))) continue;
      line.compliance = { value, confidence, source: snippet(text, pattern) };
      return;
    }
  }
}

/** A document-level requirement covers every line unless its sentence names lines ("line 40 only"). */
function headerAppliesTo(ref: string, text: string, pattern: RegExp): boolean {
  const sentence = text.split(/(?<=[.;])\s+|\n/).find((s) => pattern.test(s)) ?? "";
  const scope = sentence.match(/\blines?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)/i);
  if (!scope) return true;
  return scope[1].match(/\d+/g)?.includes(ref.replace(/^\D+/, "")) ?? false;
}

function convertMetric(line: ExtractedLine, ctx: Context) {
  for (const name of DIMENSION_FIELDS) {
    const dim = line[name];
    if (dim.value === null || !dim.source) continue;

    const mmValues = millimetreValues(dim.source);
    const unconverted = mmValues.find((mm) => Math.abs(mm - dim.value!) < 0.01);
    const converted = mmValues.find((mm) => Math.abs(mm / MM_PER_INCH - dim.value!) < 0.02);
    const mm = unconverted ?? converted;
    if (mm === undefined) continue;

    const inches = roundInches(mm / MM_PER_INCH);
    line[name] = { ...dim, value: inches };
    ctx.flags.push(
      ruleFlag(`mm-${name}`, {
        severity: "info",
        line_ref: line.ref,
        field: name,
        message: `${capitalize(DIMENSION_LABELS[name])} converted from mm: ${mm} mm = ${inches}".`,
      }),
    );
  }
}

function orderPlateDimensions(line: ExtractedLine, ctx: Context) {
  if (line.product_type.value !== "Plate") return;
  const { thickness_in: t, width_in: w, length_in: l } = line;
  if (t.value === null || w.value === null || l.value === null) return;

  const [thinnest, ...rest] = [t, w, l].sort((a, b) => a.value! - b.value!);
  if (thinnest === t) return;

  const [narrower, longer] = rest;
  line.thickness_in = downgrade(thinnest);
  line.width_in = downgrade(narrower);
  line.length_in = downgrade(longer);
  ctx.flags.push(
    ruleFlag("dims-reordered", {
      severity: "info",
      line_ref: line.ref,
      field: "thickness_in",
      message: `Dimensions reordered as thickness × width × length (${line.thickness_in.value}" × ${line.width_in.value}" × ${line.length_in.value}").`,
    }),
  );
}

function mapToStockedTemper(line: ExtractedLine, ctx: Context) {
  const productType = line.product_type.value;
  const temper = line.temper.value;
  if (!productType || !temper || !line.alloy.value) return;

  const material = findMaterial(ctx.catalog, productType, line.alloy.value);
  if (!material || stocksTemper(material, temper)) return;

  const stocked = stockedVariant(material, temper);
  if (!stocked) return;

  line.temper = { ...line.temper, value: stocked, confidence: "medium" };
  const form = productType.toLowerCase();
  ctx.flags.push(
    ruleFlag("temper-mapped", {
      severity: "warning",
      line_ref: line.ref,
      field: "temper",
      message: `${temper} requested on ${form}; Nox stocks ${material.code} ${form} as ${stocked}. Confirm.`,
      suggested_question: `Line ${line.ref}: you asked for ${material.code}-${temper} ${form}. We stock ${material.code}-${stocked} (stress-relieved ${temper}). Is ${stocked} acceptable?`,
    }),
  );
}

const CONFIDENCE_ORDER: Confidence[] = ["low", "medium", "high"];

function downgrade<T>(field: Field<T>): Field<T> {
  const capped = Math.min(CONFIDENCE_ORDER.indexOf(field.confidence), CONFIDENCE_ORDER.indexOf("medium"));
  return { ...field, confidence: CONFIDENCE_ORDER[capped] };
}

function snippet(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return text.slice(0, 80);
  const start = Math.max(0, match.index - 30);
  return text.slice(start, match.index + match[0].length + 30).trim();
}
