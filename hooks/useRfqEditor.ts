"use client";

import { useMemo, useState } from "react";
import { analyze } from "@/lib/analyze";
import type { Catalog, ExtractedLine, ExtractedRfq, Field, ParseResult } from "@/lib/schema";

export type LineFieldName = {
  [K in keyof ExtractedLine]: ExtractedLine[K] extends Field<unknown> ? K : never;
}[keyof ExtractedLine];
export type LineValue<K extends LineFieldName> = ExtractedLine[K]["value"];

export type HeaderFieldName = "po_number" | "job_number" | "ship_to_address" | "bill_to_address" | "required_date";
export type CustomerFieldName = keyof ExtractedRfq["customer"];

const editKey = (lineRef: string | null, field: string | null) => `${lineRef ?? ""}|${field ?? ""}`;

const edited = <T,>(field: Field<T>, value: T | null): Field<T> => ({ ...field, value, confidence: "high" });

/** Holds the user's corrections to an extraction and re-runs validation + payload building on every change. */
export function useRfqEditor(result: ParseResult, catalog: Catalog, today: string) {
  const [draft, setDraft] = useState(result.extracted);
  const [editedKeys, setEditedKeys] = useState<ReadonlySet<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<ReadonlySet<string>>(new Set());

  const markEdited = (lineRef: string | null, field: string) => setEditedKeys((keys) => new Set(keys).add(editKey(lineRef, field)));

  const analysis = useMemo(() => {
    const stillRelevant = result.extraction_flags.filter((f) => !editedKeys.has(editKey(f.line_ref, f.field)));
    return analyze(draft, stillRelevant, catalog, today);
  }, [draft, editedKeys, result.extraction_flags, catalog, today]);

  const flags = useMemo(() => analysis.flags.filter((f) => !acceptedIds.has(f.id)), [analysis.flags, acceptedIds]);

  return {
    draft,
    ...analysis,
    flags,
    acceptedCount: analysis.flags.length - flags.length,
    isEdited: (lineRef: string | null, field: string) => editedKeys.has(editKey(lineRef, field)),

    setLineField<K extends LineFieldName>(ref: string, field: K, value: LineValue<K>) {
      setDraft((rfq) => ({
        ...rfq,
        lines: rfq.lines.map((line) => (line.ref === ref ? { ...line, [field]: edited(line[field] as Field<LineValue<K>>, value) } : line)),
      }));
      markEdited(ref, field);
    },

    setHeaderField(field: HeaderFieldName, value: string | null) {
      setDraft((rfq) => ({ ...rfq, [field]: edited(rfq[field], value) }));
      markEdited(null, field);
    },

    setCustomerField(field: CustomerFieldName, value: string | null) {
      setDraft((rfq) => ({ ...rfq, customer: { ...rfq.customer, [field]: edited(rfq.customer[field], value) } }));
      markEdited(null, `customer.${field}`);
    },

    removeLine(ref: string) {
      setDraft((rfq) => ({ ...rfq, lines: rfq.lines.filter((line) => line.ref !== ref) }));
    },

    acceptFlag(id: string) {
      setAcceptedIds((ids) => new Set(ids).add(id));
    },
  };
}

export type RfqEditor = ReturnType<typeof useRfqEditor>;
