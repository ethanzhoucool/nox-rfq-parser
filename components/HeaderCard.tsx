"use client";

import type { CustomerFieldName, HeaderFieldName, RfqEditor } from "@/hooks/useRfqEditor";
import { isIsoDate } from "@/lib/dates";
import { worstSeverity } from "@/lib/flags";
import type { Field } from "@/lib/schema";
import { EditableText } from "./EditableField";
import { ConfidenceDot, Panel, SourceQuote, Tooltip } from "./ui";

const parseText = (text: string): string | undefined => text.trim();
const parseDate = (text: string) => (isIsoDate(text.trim()) ? text.trim() : undefined);

export function HeaderCard({ editor }: { editor: RfqEditor }) {
  const { draft } = editor;
  const severityOf = (field: string) => worstSeverity(editor.flags.filter((f) => f.line_ref === null && f.field === field));

  const header = (name: HeaderFieldName, label: string, parse = parseText) => (
    <Item label={label}>
      <EditableText
        field={draft[name]}
        edited={editor.isEdited(null, name)}
        severity={severityOf(name)}
        label={label}
        format={String}
        parse={parse}
        onCommit={(value) => editor.setHeaderField(name, value)}
      />
    </Item>
  );

  const customer = (name: CustomerFieldName, label: string) => (
    <Item label={label}>
      <EditableText
        field={draft.customer[name]}
        edited={editor.isEdited(null, `customer.${name}`)}
        severity={severityOf(`customer.${name}`)}
        label={label}
        format={String}
        parse={parseText}
        onCommit={(value) => editor.setCustomerField(name, value)}
      />
    </Item>
  );

  const compliance = [...new Set(draft.lines.map((l) => l.compliance.value).filter(Boolean))];
  const certs = [...new Set(draft.lines.flatMap((l) => l.certifications.map((c) => c.designation)))];

  return (
    <Panel title={<>Request · <span className="normal-case tracking-normal text-slate-300">{draft.document_type.toUpperCase()}</span></>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-3 py-3 md:grid-cols-4">
        {customer("company", "Company")}
        {customer("name", "Buyer")}
        {customer("email", "Email")}
        {customer("phone", "Phone")}
        {header("po_number", "PO #")}
        {header("job_number", "Job #")}
        {header("required_date", "Need by (yyyy-mm-dd)", parseDate)}
        <Item label="Mill certs">
          <StaticValue field={draft.mill_certs_required} display={(v) => (v ? "Required" : "Not requested")} />
        </Item>
        <div className="col-span-2">{header("ship_to_address", "Ship to")}</div>
        <Item label="Compliance">
          <span className="px-1.5 py-1 text-[13px] uppercase">{compliance.length ? compliance.join(", ") : "—"}</span>
        </Item>
        <Item label="Certifications">
          <span className="px-1.5 py-1 font-mono text-[12px]">{certs.length ? certs.join(", ") : "—"}</span>
        </Item>
      </div>
      {draft.general_notes && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-slate-400">
          <span className="mr-2 text-[10px] tracking-wider text-slate-500 uppercase">Notes</span>
          {draft.general_notes}
        </p>
      )}
    </Panel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-[13px]">
      <div className="px-1.5 pt-1 text-[10px] tracking-wider text-slate-500 uppercase">{label}</div>
      {children}
    </div>
  );
}

function StaticValue<T>({ field, display }: { field: Field<T>; display: (value: T) => string }) {
  return (
    <Tooltip content={<SourceQuote source={field.source} confidence={field.confidence} />} className="block">
      <span className="flex items-center gap-1.5 px-1.5 py-1">
        <ConfidenceDot confidence={field.confidence} />
        {field.value === null ? "—" : display(field.value)}
      </span>
    </Tooltip>
  );
}
