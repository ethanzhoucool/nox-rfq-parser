"use client";

import type { CustomerFieldName, HeaderFieldName, RfqEditor } from "@/hooks/useRfqEditor";
import { isIsoDate } from "@/lib/dates";
import { worstSeverity } from "@/lib/flags";
import type { Field } from "@/lib/schema";
import { EditableText } from "./EditableField";
import { ConfidenceMark, LABEL, SourceQuote, Tooltip, cx } from "./ui";

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
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className={cx(LABEL, "text-fg-2")}>Request details</h2>
        <span className="rounded-sm bg-sunken px-2 py-0.5 font-mono text-[11px] text-fg-2">{draft.document_type.toUpperCase()}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {customer("company", "Company")}
        {customer("name", "Contact")}
        {customer("email", "Email")}
        {customer("phone", "Phone")}
        {header("po_number", "PO #")}
        {header("job_number", "Job #")}
        {header("required_date", "Need by", parseDate)}
        <Item label="Mill certs">
          <StaticValue field={draft.mill_certs_required} display={(v) => (v ? "Required" : "Not requested")} />
        </Item>
        <div className="col-span-2">{header("ship_to_address", "Ship to")}</div>
        <Item label="Compliance">
          <span className="block px-1.5 py-1 uppercase">{compliance.length ? compliance.join(", ") : <span className="text-fg-3 normal-case">None</span>}</span>
        </Item>
        <Item label="Certifications">
          <span className="block px-1.5 py-1 font-mono text-xs">{certs.length ? certs.join(", ") : <span className="font-sans text-fg-3">None</span>}</span>
        </Item>
      </div>
      {draft.general_notes && (
        <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-fg-2">
          <span className="mr-2 font-medium text-fg">Notes</span>
          {draft.general_notes}
        </p>
      )}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-[13px]">
      <div className={cx(LABEL, "px-1.5 pt-1 pb-0.5 text-[10.5px] text-fg-3")}>{label}</div>
      {children}
    </div>
  );
}

function StaticValue<T>({ field, display }: { field: Field<T>; display: (value: T) => string }) {
  return (
    <Tooltip content={<SourceQuote source={field.source} confidence={field.confidence} />} className="block">
      <span className="flex items-center gap-1.5 px-1.5 py-1">
        <ConfidenceMark confidence={field.confidence} />
        {field.value === null ? <span className="text-fg-3">None</span> : display(field.value)}
      </span>
    </Tooltip>
  );
}
