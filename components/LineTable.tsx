"use client";

import { CaretDown, X } from "@phosphor-icons/react";
import type { LineFieldName, RfqEditor } from "@/hooks/useRfqEditor";
import { worstSeverity } from "@/lib/flags";
import { findMaterial, stockPlateThicknesses } from "@/lib/materials";
import { COMPLIANCE, type Catalog, type DimensionField, type ExtractedLine, type Flag, type ProductType, type Shape } from "@/lib/schema";
import { effectiveShape, requiredDimensions } from "@/lib/shapes";
import { parseMeasurement } from "@/lib/units";
import { EditableSelect, EditableText } from "./EditableField";
import { FlagBadge } from "./FlagsPanel";
import { LABEL, SEVERITY_STYLE, Tooltip, cx } from "./ui";

const DIM_ABBREVIATION: Record<DimensionField, string> = {
  thickness_in: "T",
  width_in: "W",
  height_in: "H",
  length_in: "L",
  diameter_in: "Ø",
  outer_diameter_in: "OD",
  outer_dimension_in: "OD",
  wall_thickness_in: "WT",
};

/** Product type and shape as one choice, the way the Shape column reads on noxmetals.co. */
const FORMS: { label: string; productType: ProductType; shape: Shape }[] = [
  { label: "Plate", productType: "Plate", shape: "Plate" },
  { label: "Round bar", productType: "Bar", shape: "Round" },
  { label: "Square bar", productType: "Bar", shape: "Square" },
  { label: "Flat bar", productType: "Bar", shape: "Rectangle" },
  { label: "Round tube", productType: "Tube", shape: "Round" },
  { label: "Square tube", productType: "Tube", shape: "Square" },
  { label: "Rect tube", productType: "Tube", shape: "Rectangle" },
];

const COLUMNS = ["", "Shape", "Alloy", "Temper", "Compliance", "Dimensions (in)", "Qty", "Part number", "Each", "Status", ""];

const formatNumber = (value: number) => String(Number(value.toFixed(4)));
const parseText = (text: string) => text.trim();
const parseAlloy = (text: string) => text.trim().toUpperCase();
const parseInches = (text: string) => parseMeasurement(text)?.inches;
const parseQuantity = (text: string) => {
  const quantity = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
};
const formatPounds = (pounds: number) => pounds.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const formatInches = (inches: number) => `${formatNumber(inches)}"`;

export function LineTable({ editor, catalog, footer }: { editor: RfqEditor; catalog: Catalog; footer?: React.ReactNode }) {
  const lines = editor.draft.lines;
  const excluded = new Set(editor.excluded_refs);
  const weights = lines.map((line) => lineWeight(line, catalog, 1));

  return (
    <section aria-label="Line items">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className={cx(LABEL, "text-left text-fg-2")}>
              {COLUMNS.map((label, i) => (
                <th key={i} className={cx("border-b border-line px-1.5 pb-4 font-medium", (label === "Qty" || label === "Each" || label === "Status") && "text-right")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <LineRow key={line.ref} line={line} editor={editor} excluded={excluded.has(line.ref)} each={weights[i]} />
            ))}
          </tbody>
        </table>
        {lines.length === 0 && <p className="border-b border-line py-10 text-center text-sm text-fg-3">No line items found in this document.</p>}
      </div>
      {footer}
    </section>
  );
}

function LineRow({ line, editor, excluded, each }: { line: ExtractedLine; editor: RfqEditor; excluded: boolean; each: number | null }) {
  const weight = each !== null && line.quantity.value ? each * line.quantity.value : null;
  const lineFlags = editor.flags.filter((f) => f.line_ref === line.ref);
  const worst = worstSeverity(lineFlags);
  const severityOf = (field: string) => worstSeverity(lineFlags.filter((f) => f.field === field));
  const common = <K extends LineFieldName>(field: K) => ({
    field: line[field],
    edited: editor.isEdited(line.ref, field),
    severity: severityOf(field),
    label: `${field} for line ${line.ref}`,
  });
  const set =
    <K extends LineFieldName>(field: K) =>
    (value: ExtractedLine[K]["value"]) =>
      editor.setLineField(line.ref, field, value);

  const dims = sizeFields(line);
  const dimSeverity = worstSeverity(lineFlags.filter((f) => f.field !== null && (dims as string[]).includes(f.field)));
  const cell = "border-b border-line px-1.5 align-top";
  const flagsFor = (fields: string[]) => lineFlags.filter((f) => f.field !== null && fields.includes(f.field));
  // Flags on a field that has no column of its own (or no field at all) sit under the size.
  const sizeFlags = lineFlags.filter((f) => f.field === null || !COLUMN_FIELDS.has(f.field) || (dims as string[]).includes(f.field));

  return (
    <tr className="group">
      <td className={cx(cell, "w-[76px] pt-3 pl-0")}>
        <MaterialThumb line={line} />
        <Tooltip
          className="mt-0.5 flex justify-center"
          content={
            <div className="space-y-1">
              <div className="text-[11px] text-fg-3">Original line</div>
              <q className="block font-mono text-[11px]">{line.description_raw}</q>
              {line.notes && <p className="text-fg-2">{line.notes}</p>}
            </div>
          }
        >
          <span className={cx("font-mono text-[11px]", excluded ? "text-err line-through decoration-err/50" : "text-fg-3")}>Line {line.ref}</span>
        </Tooltip>
      </td>
      <td className={cx(cell, "w-[150px] py-3")}>
        <FormSelect line={line} editor={editor} severity={worstSeverity(flagsFor(["product_type", "shape"]))} />
        <FieldNote flags={flagsFor(["product_type", "shape"])} />
      </td>
      <td className={cx(cell, "w-[104px] py-3")}>
        <EditableText {...common("alloy")} format={String} parse={parseAlloy} onCommit={set("alloy")} className="font-mono" boxed />
        <FieldNote flags={flagsFor(["alloy"])} />
      </td>
      <td className={cx(cell, "w-[104px] py-3")}>
        <EditableText {...common("temper")} format={String} parse={parseAlloy} onCommit={set("temper")} className="font-mono" boxed />
        <FieldNote flags={flagsFor(["temper"])} />
      </td>
      <td className={cx(cell, "w-[124px] py-3")}>
        <EditableSelect {...common("compliance")} options={COMPLIANCE} onCommit={set("compliance")} className="font-mono uppercase" boxed />
        <FieldNote flags={flagsFor(["compliance"])} />
      </td>
      <td className={cx(cell, "min-w-[250px] py-3")}>
        <div
          className={cx(
            "flex h-11 items-center gap-1 rounded-sm border bg-surface px-2 font-mono",
            dimSeverity && dimSeverity !== "info" ? SEVERITY_STYLE[dimSeverity].box : "border-line-strong",
          )}
        >
          {dims.map((dim, i) => (
            <span key={dim} className="flex min-w-0 flex-1 items-center gap-0.5">
              {i > 0 && <span className="px-0.5 text-fg-3">×</span>}
              <span className="text-[11px] text-fg-3">{DIM_ABBREVIATION[dim]}</span>
              <EditableText {...common(dim)} severity={undefined} format={formatNumber} parse={parseInches} onCommit={set(dim)} align="right" className="min-w-0 flex-1" />
            </span>
          ))}
        </div>
        <LineNotes line={line} flags={sizeFlags} onThickness={set("thickness_in")} />
      </td>
      <td className={cx(cell, "w-[76px] py-3")}>
        <EditableText {...common("quantity")} format={String} parse={parseQuantity} onCommit={set("quantity")} align="right" className="font-mono" boxed />
        <FieldNote flags={flagsFor(["quantity"])} />
      </td>
      <td className={cx(cell, "w-[150px] py-3")}>
        <EditableText {...common("customer_part_number")} format={String} parse={parseText} onCommit={set("customer_part_number")} placeholder="" className="font-mono" boxed />
        <FieldNote flags={flagsFor(["customer_part_number"])} />
      </td>
      <td className={cx(cell, "w-[96px] pt-[22px] text-right font-mono text-[13px] text-fg-2")}>{each !== null ? `${formatPounds(each)} lb` : "–"}</td>
      <td className={cx(cell, "w-[120px] pt-4 text-right")}>
        <div className="flex items-center justify-end gap-1.5">
          <LineStatus excluded={excluded} worst={worst} />
          <FlagBadge flags={lineFlags} onAccept={editor.acceptFlag} label={`Notes for line ${line.ref}`} />
        </div>
        {weight !== null && <div className="mt-1 font-mono text-xs text-fg-3">{formatPounds(weight)} lb total</div>}
      </td>
      <td className={cx(cell, "w-9 pt-[22px] pr-0 text-right")}>
        <button
          type="button"
          aria-label={`Remove line ${line.ref}`}
          onClick={() => editor.removeLine(line.ref)}
          className="rounded-sm p-1 text-fg-3 transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </td>
    </tr>
  );
}

function LineStatus({ excluded, worst }: { excluded: boolean; worst: ReturnType<typeof worstSeverity> }) {
  if (excluded) return <span className="text-[15px] font-medium text-err">Held back</span>;
  if (worst === "warning") return <span className="text-[15px] font-medium text-warn">Confirm</span>;
  return <span className="text-[15px] font-medium text-ok">Ready</span>;
}

/** Fields that have their own column, and so show their own flags under it. */
const COLUMN_FIELDS = new Set(["product_type", "shape", "alloy", "temper", "compliance", "quantity", "customer_part_number"]);

/** The worst flag on one column's field(s), shown right under that column's input. */
function FieldNote({ flags }: { flags: Flag[] }) {
  const top = flags.find((f) => f.severity === "error") ?? flags.find((f) => f.severity === "warning");
  if (!top) return null;
  const extra = flags.filter((f) => f.severity !== "info").length - 1;
  return (
    <Tooltip
      className="mt-1.5 block"
      content={
        <div className="space-y-1">
          <p>{top.message}</p>
          {top.suggested_question && <p className="text-fg-2">Ask: {top.suggested_question}</p>}
        </div>
      }
    >
      <span className={cx("line-clamp-2 text-xs leading-snug", SEVERITY_STYLE[top.severity].text)}>{top.message}</span>
      {extra > 0 && <span className="text-xs text-fg-3">+{extra} more</span>}
    </Tooltip>
  );
}

/** Certs, tolerance and the size's top flag, shown under the size like the stock-width hint on noxmetals.co. */
function LineNotes({ line, flags, onThickness }: { line: ExtractedLine; flags: Flag[]; onThickness: (value: number) => void }) {
  const top = flags.find((f) => f.severity === "error") ?? flags.find((f) => f.severity === "warning");
  const extra = flags.filter((f) => f.severity !== "info").length - (top ? 1 : 0);
  const nearest = flags.some((f) => f.id.includes("non-stock-thickness")) ? nearestStock(line) : [];
  if (!top && line.certifications.length === 0 && !line.cut_tolerance.value) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {top && (
        <Tooltip content={top.suggested_question && <span>Ask: {top.suggested_question}</span>}>
          <span className={cx("leading-snug", SEVERITY_STYLE[top.severity].text)}>
            {nearest.length > 0 ? "Not a stock thickness" : top.message}
            {extra > 0 && <span className="text-fg-3"> +{extra} more</span>}
          </span>
        </Tooltip>
      )}
      {nearest.map((inches) => (
        <button
          key={inches}
          type="button"
          onClick={() => onThickness(inches)}
          title={`Change thickness to ${formatInches(inches)}`}
          className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg transition-colors hover:bg-accent/10 hover:text-accent"
        >
          Use {formatInches(inches)}
        </button>
      ))}
      {line.certifications.map((cert) => (
        <Tooltip key={cert.designation} content={cert.source && <q className="font-mono text-[11px]">{cert.source}</q>}>
          <span className="rounded-sm bg-ok/10 px-1.5 py-0.5 font-mono text-[11px] text-ok">{cert.designation}</span>
        </Tooltip>
      ))}
      {line.cut_tolerance.value && <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{line.cut_tolerance.value}</span>}
    </div>
  );
}

/** The stock thicknesses either side of a non-stock one. */
function nearestStock(line: ExtractedLine): number[] {
  const thickness = line.thickness_in.value;
  const stock = line.alloy.value ? stockPlateThicknesses(line.alloy.value) : null;
  if (thickness === null || !stock) return [];
  const below = stock.filter((t) => t < thickness).at(-1);
  const above = stock.find((t) => t > thickness);
  return [below, above].filter((t): t is number => t !== undefined);
}

function FormSelect({ line, editor, severity }: { line: ExtractedLine; editor: RfqEditor; severity: ReturnType<typeof worstSeverity> }) {
  const shape = effectiveShape(line);
  const current = FORMS.findIndex((f) => f.productType === line.product_type.value && f.shape === shape);
  return (
    <Tooltip className="block" content={line.product_type.source && <q className="font-mono text-[11px]">{line.product_type.source}</q>}>
      <label
        className={cx(
          "relative flex h-11 items-center rounded-sm border bg-surface px-3 text-sm",
          severity && severity !== "info" ? SEVERITY_STYLE[severity].box : "border-line-strong",
          current < 0 && "text-fg-3",
        )}
      >
        <span className="flex-1 truncate">{current >= 0 ? FORMS[current].label : "Choose"}</span>
        <CaretDown size={12} className="text-fg-3" aria-hidden />
        <select
          aria-label={`Shape for line ${line.ref}`}
          value={current}
          onChange={(e) => {
            const form = FORMS[Number(e.target.value)];
            if (form) editor.setForm(line.ref, form.productType, form.shape);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {current < 0 && <option value={-1}>Choose</option>}
          {FORMS.map((form, i) => (
            <option key={form.label} value={i}>
              {form.label}
            </option>
          ))}
        </select>
      </label>
    </Tooltip>
  );
}

/** A small plate or bar drawn to the line's proportions, standing in for the product photo on noxmetals.co. */
function MaterialThumb({ line }: { line: ExtractedLine }) {
  const shape = effectiveShape(line);
  const face = "linear-gradient(135deg, #f1f2f5 0%, #d9dce2 55%, #c3c7cf 100%)";
  if (shape === "Round") {
    const tube = line.product_type.value === "Tube";
    return (
      <div className="flex h-11 items-center justify-center">
        <div className="relative h-4 w-14 rounded-full border border-[#a3a7b0]" style={{ background: "linear-gradient(180deg, #f4f5f7 0%, #d0d3da 50%, #a9adb6 100%)" }}>
          <div className={cx("absolute top-[1px] right-[1px] h-[12px] w-[7px] rounded-full border border-[#a3a7b0]", tube ? "bg-[#8d919b]" : "bg-[#dfe1e6]")} />
        </div>
      </div>
    );
  }
  const thickness = line.thickness_in.value ?? line.height_in.value ?? line.width_in.value ?? 0.5;
  const edge = Math.round(Math.min(12, Math.max(3, 2 + thickness * 4)));
  const width = shape === "Plate" ? 46 : 54;
  const depth = shape === "Plate" ? 18 : 6;
  return (
    <div className="flex h-11 items-center justify-center">
      <div style={{ width }}>
        <div style={{ height: depth, background: face, transform: "skewX(-40deg)", transformOrigin: "bottom" }} className="border border-b-0 border-[#a3a7b0]" />
        <div style={{ height: edge }} className="border border-[#a3a7b0] bg-[#b4b8c1]" />
      </div>
    </div>
  );
}

/** Weight in lb for `quantity` pieces, from the catalog density; tubes and unknown sizes return null. */
export function lineWeight(line: ExtractedLine, catalog: Catalog, quantity = line.quantity.value): number | null {
  const productType = line.product_type.value;
  const alloy = line.alloy.value;
  if (!productType || !alloy || !quantity) return null;
  const material = findMaterial(catalog, productType, alloy);
  if (!material) return null;

  const v = (dim: DimensionField) => line[dim].value;
  const shape = effectiveShape(line);
  const length = v("length_in");
  let volume: number | null = null;
  if (productType === "Tube") return null;
  if (shape === "Plate" && v("thickness_in") && v("width_in") && length) volume = v("thickness_in")! * v("width_in")! * length;
  if (shape === "Rectangle" && v("height_in") && v("width_in") && length) volume = v("height_in")! * v("width_in")! * length;
  if (shape === "Square" && v("width_in") && length) volume = v("width_in")! ** 2 * length;
  if (shape === "Round" && v("diameter_in") && length) volume = Math.PI * (v("diameter_in")! / 2) ** 2 * length;
  return volume === null ? null : volume * material.density * quantity;
}

function sizeFields(line: ExtractedLine): DimensionField[] {
  const productType = line.product_type.value;
  const shape = effectiveShape(line);
  const required = productType && shape ? requiredDimensions(productType, shape) : null;
  if (required) return required;
  const present = (Object.keys(DIM_ABBREVIATION) as DimensionField[]).filter((dim) => line[dim].value !== null);
  return present.length ? present : ["thickness_in", "width_in", "length_in"];
}
