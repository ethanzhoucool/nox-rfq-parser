"use client";

import { X } from "@phosphor-icons/react";
import type { LineFieldName, RfqEditor } from "@/hooks/useRfqEditor";
import { worstSeverity } from "@/lib/flags";
import { findMaterial } from "@/lib/materials";
import { COMPLIANCE, PRODUCT_TYPES, SHAPES, type Catalog, type DimensionField, type ExtractedLine, type Flag } from "@/lib/schema";
import { effectiveShape, requiredDimensions } from "@/lib/shapes";
import { parseMeasurement } from "@/lib/units";
import { EditableSelect, EditableText } from "./EditableField";
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

const COLUMNS = ["", "Ref", "Form", "Shape", "Alloy", "Temper", "Compliance", "Dimensions (in)", "Qty", "Part number", "Status", ""];

const formatNumber = (value: number) => String(Number(value.toFixed(4)));
const parseText = (text: string) => text.trim();
const parseAlloy = (text: string) => text.trim().toUpperCase();
const parseInches = (text: string) => parseMeasurement(text)?.inches;
const parseQuantity = (text: string) => {
  const quantity = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
};
const formatPounds = (pounds: number) => pounds.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function LineTable({ editor, catalog }: { editor: RfqEditor; catalog: Catalog }) {
  const lines = editor.draft.lines;
  const excluded = new Set(editor.excluded_refs);
  const weights = lines.map((line) => lineWeight(line, catalog));
  const known = weights.filter((w): w is number => w !== null);
  const total = known.reduce((sum, w) => sum + w, 0);

  return (
    <section aria-label="Line items">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className={cx(LABEL, "text-left text-fg-2")}>
              {COLUMNS.map((label, i) => (
                <th key={i} className={cx("border-b border-line px-1.5 pb-4 font-medium", label === "Qty" && "text-center", label === "Status" && "text-right")}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <LineRow key={line.ref} line={line} editor={editor} excluded={excluded.has(line.ref)} weight={weights[i]} />
            ))}
          </tbody>
        </table>
        {lines.length === 0 && <p className="border-b border-line py-10 text-center text-sm text-fg-3">No line items found in this document.</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 pt-5 text-sm">
        <span className="text-fg-3">Hover any box to see the text it was read from.</span>
        {known.length > 0 && (
          <span className="text-fg-2">
            <span className="font-mono font-medium text-fg">{formatPounds(total)}</span> lb
            {known.length < lines.length && <span className="text-fg-3"> (excludes lines without a size)</span>}
          </span>
        )}
        <span className="text-fg-2">
          <span className="font-mono font-medium text-fg">
            {editor.payload.lines.length} of {lines.length}
          </span>{" "}
          lines in the RFQ
        </span>
      </footer>
    </section>
  );
}

function LineRow({ line, editor, excluded, weight }: { line: ExtractedLine; editor: RfqEditor; excluded: boolean; weight: number | null }) {
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

  return (
    <tr className="group">
      <td className={cx(cell, "w-[72px] pt-4 pl-0")}>
        <MaterialThumb line={line} />
      </td>
      <td className={cx(cell, "w-14 pt-[26px]")}>
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="text-[11px] text-fg-3">Original line</div>
              <q className="block font-mono text-[11px]">{line.description_raw}</q>
              {line.notes && <p className="text-fg-2">{line.notes}</p>}
            </div>
          }
        >
          <span className={cx("font-mono text-[13px]", excluded ? "text-err line-through decoration-err/50" : "text-fg-2")}>{line.ref}</span>
        </Tooltip>
      </td>
      <td className={cx(cell, "w-[112px] py-3")}>
        <EditableSelect {...common("product_type")} options={PRODUCT_TYPES} onCommit={set("product_type")} boxed />
      </td>
      <td className={cx(cell, "w-[124px] py-3")}>
        <EditableSelect {...common("shape")} options={SHAPES} onCommit={set("shape")} boxed />
      </td>
      <td className={cx(cell, "w-[104px] py-3")}>
        <EditableText {...common("alloy")} format={String} parse={parseAlloy} onCommit={set("alloy")} className="font-mono" boxed />
      </td>
      <td className={cx(cell, "w-[104px] py-3")}>
        <EditableText {...common("temper")} format={String} parse={parseAlloy} onCommit={set("temper")} className="font-mono" boxed />
      </td>
      <td className={cx(cell, "w-[124px] py-3")}>
        <EditableSelect {...common("compliance")} options={COMPLIANCE} onCommit={set("compliance")} className="font-mono uppercase" boxed />
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
        <LineNotes line={line} flags={lineFlags} />
      </td>
      <td className={cx(cell, "w-[76px] py-3")}>
        <EditableText {...common("quantity")} format={String} parse={parseQuantity} onCommit={set("quantity")} align="right" className="font-mono" boxed />
      </td>
      <td className={cx(cell, "w-[150px] py-3")}>
        <EditableText {...common("customer_part_number")} format={String} parse={parseText} onCommit={set("customer_part_number")} placeholder="" className="font-mono" boxed />
      </td>
      <td className={cx(cell, "w-[120px] pt-4 text-right")}>
        <LineStatus excluded={excluded} worst={worst} />
        {weight !== null && <div className="mt-1 font-mono text-xs text-fg-3">{formatPounds(weight)} lb</div>}
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

/** Certs, tolerance and the line's top flag, shown under the size like the stock-width hint on noxmetals.co. */
function LineNotes({ line, flags }: { line: ExtractedLine; flags: Flag[] }) {
  const top = flags.find((f) => f.severity === "error") ?? flags.find((f) => f.severity === "warning");
  const extra = flags.filter((f) => f.severity !== "info").length - (top ? 1 : 0);
  if (!top && line.certifications.length === 0 && !line.cut_tolerance.value) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {line.certifications.map((cert) => (
        <Tooltip key={cert.designation} content={cert.source && <q className="font-mono text-[11px]">{cert.source}</q>}>
          <span className="rounded-sm bg-ok/10 px-1.5 py-0.5 font-mono text-[11px] text-ok">{cert.designation}</span>
        </Tooltip>
      ))}
      {line.cut_tolerance.value && <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{line.cut_tolerance.value}</span>}
      {top && (
        <Tooltip content={top.suggested_question && <span>Ask: {top.suggested_question}</span>}>
          <span className={cx("leading-snug", SEVERITY_STYLE[top.severity].text)}>
            {top.message}
            {extra > 0 && <span className="text-fg-3"> +{extra} more</span>}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** A small plate or bar drawn to the line's proportions, standing in for the product photo on noxmetals.co. */
function MaterialThumb({ line }: { line: ExtractedLine }) {
  const shape = effectiveShape(line);
  const metal = "bg-gradient-to-b from-[#eceef2] via-[#d3d6dd] to-[#a9adb7] shadow-[0_1px_2px_rgb(60_64_72/0.25)]";
  if (shape === "Round") {
    return (
      <div className="flex h-12 items-center justify-center">
        <div className={cx("h-3.5 w-14 rounded-full border border-[#9fa3ad]", metal)} />
      </div>
    );
  }
  const thickness = line.thickness_in.value ?? line.height_in.value ?? 0.5;
  const px = Math.round(Math.min(14, Math.max(3, 3 + thickness * 4)));
  return (
    <div className="flex h-12 items-center justify-center">
      <div style={{ height: px }} className={cx("w-12 -skew-x-[35deg] rounded-[2px] border border-[#9fa3ad]", metal, shape === "Square" && "w-8")} />
    </div>
  );
}

function lineWeight(line: ExtractedLine, catalog: Catalog): number | null {
  const productType = line.product_type.value;
  const alloy = line.alloy.value;
  const quantity = line.quantity.value;
  if (!productType || !alloy || !quantity) return null;
  const material = findMaterial(catalog, productType, alloy);
  if (!material) return null;

  const v = (dim: DimensionField) => line[dim].value;
  const shape = effectiveShape(line);
  const length = v("length_in");
  let volume: number | null = null;
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
