"use client";

import type { LineFieldName, RfqEditor } from "@/hooks/useRfqEditor";
import { worstSeverity } from "@/lib/flags";
import { COMPLIANCE, PRODUCT_TYPES, SHAPES, type DimensionField, type ExtractedLine } from "@/lib/schema";
import { effectiveShape, requiredDimensions } from "@/lib/shapes";
import { parseMeasurement } from "@/lib/units";
import { EditableSelect, EditableText } from "./EditableField";
import { Button, Panel, Tooltip, cx } from "./ui";

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

const formatNumber = (value: number) => String(Number(value.toFixed(4)));
const parseText = (text: string) => text.trim();
const parseAlloy = (text: string) => text.trim().toUpperCase();
const parseInches = (text: string) => parseMeasurement(text)?.inches;
const parseQuantity = (text: string) => {
  const quantity = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
};

export function LineTable({ editor }: { editor: RfqEditor }) {
  const lines = editor.draft.lines;
  const excluded = new Set(editor.excluded_refs);

  return (
    <Panel
      title={`Line items · ${lines.length}`}
      actions={<span className="text-[11px] text-slate-500">Hover a cell for the source quote · click to edit</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] tracking-wider text-slate-500 uppercase">
              <th className="w-16 py-2 pl-4 font-medium">Ref</th>
              <th className="w-24 font-medium">Part #</th>
              <th className="w-24 font-medium">Alloy</th>
              <th className="w-24 font-medium">Temper</th>
              <th className="w-24 font-medium">Form</th>
              <th className="w-28 font-medium">Shape</th>
              <th className="min-w-[250px] font-medium">Size (in)</th>
              <th className="w-20 font-medium">Qty</th>
              <th className="w-28 font-medium">Compliance</th>
              <th className="w-32 font-medium">Certs · tol</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <LineRow key={line.ref} line={line} editor={editor} excluded={excluded.has(line.ref)} />
            ))}
          </tbody>
        </table>
        {lines.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No line items.</p>}
      </div>
    </Panel>
  );
}

function LineRow({ line, editor, excluded }: { line: ExtractedLine; editor: RfqEditor; excluded: boolean }) {
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

  return (
    <tr className={cx("group border-b border-line/70 align-middle last:border-0", excluded && "bg-rose-500/[0.03]")}>
      <td className="relative py-1.5 pl-4">
        <span
          className={cx(
            "absolute inset-y-1 left-0 w-0.5 rounded-r",
            worst === "error" ? "bg-rose-500" : worst === "warning" ? "bg-amber-300" : "bg-transparent",
          )}
        />
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="text-[10px] tracking-wider text-slate-500 uppercase">Original line</div>
              <q className="block font-mono text-[11px]">{line.description_raw}</q>
              {line.notes && <p className="text-slate-400">{line.notes}</p>}
              {excluded && <p className="text-rose-300">Left out of the payload until its errors are fixed.</p>}
            </div>
          }
        >
          <span className={cx("font-mono text-xs", excluded ? "text-rose-300 line-through decoration-rose-500/50" : "text-slate-300")}>{line.ref}</span>
        </Tooltip>
      </td>
      <td>
        <EditableText {...common("customer_part_number")} format={String} parse={parseText} onCommit={set("customer_part_number")} />
      </td>
      <td>
        <EditableText {...common("alloy")} format={String} parse={parseAlloy} onCommit={set("alloy")} className="font-mono" />
      </td>
      <td>
        <EditableText {...common("temper")} format={String} parse={parseAlloy} onCommit={set("temper")} className="font-mono" />
      </td>
      <td>
        <EditableSelect {...common("product_type")} options={PRODUCT_TYPES} onCommit={set("product_type")} />
      </td>
      <td>
        <EditableSelect {...common("shape")} options={SHAPES} onCommit={set("shape")} />
      </td>
      <td>
        <div className="flex flex-nowrap items-center gap-x-1 font-mono">
          {sizeFields(line).map((dim, i) => (
            <span key={dim} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-slate-600">×</span>}
              <span className="text-[10px] text-slate-500">{DIM_ABBREVIATION[dim]}</span>
              <EditableText {...common(dim)} format={formatNumber} parse={parseInches} onCommit={set(dim)} className="w-[4.25rem]" />
            </span>
          ))}
        </div>
      </td>
      <td>
        <EditableText {...common("quantity")} format={String} parse={parseQuantity} onCommit={set("quantity")} align="right" className="w-16 font-mono" />
      </td>
      <td>
        <EditableSelect {...common("compliance")} options={COMPLIANCE} onCommit={set("compliance")} />
      </td>
      <td className="text-xs">
        <div className="flex flex-wrap gap-1">
          {line.certifications.map((cert) => (
            <Tooltip key={cert.designation} content={cert.source && <q className="font-mono text-[11px]">{cert.source}</q>}>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{cert.designation}</span>
            </Tooltip>
          ))}
          {line.cut_tolerance.value && <span className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{line.cut_tolerance.value}</span>}
        </div>
      </td>
      <td className="pr-2 text-right">
        <Button variant="ghost" aria-label={`Remove line ${line.ref}`} onClick={() => editor.removeLine(line.ref)} className="opacity-0 group-hover:opacity-100 focus:opacity-100">
          ✕
        </Button>
      </td>
    </tr>
  );
}

function sizeFields(line: ExtractedLine): DimensionField[] {
  const productType = line.product_type.value;
  const shape = effectiveShape(line);
  const required = productType && shape ? requiredDimensions(productType, shape) : null;
  if (required) return required;
  const present = (Object.keys(DIM_ABBREVIATION) as DimensionField[]).filter((dim) => line[dim].value !== null);
  return present.length ? present : ["thickness_in", "width_in", "length_in"];
}
