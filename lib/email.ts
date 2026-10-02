import type { ExtractedRfq, Flag } from "./schema";

export function buildQuestionsEmail(rfq: ExtractedRfq, flags: Flag[]): string | null {
  const questions = [...new Set(flags.map((f) => f.suggested_question).filter((q): q is string => Boolean(q)))];
  if (questions.length === 0) return null;

  const firstName = rfq.customer.name.value?.split(/\s+/)[0];
  const reference = rfq.po_number.value ? ` for PO ${rfq.po_number.value}` : "";
  return [
    `Hi ${firstName ?? "there"},`,
    "",
    `Thanks for the request${reference}. Before we finalize pricing, a few quick questions:`,
    "",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Once we hear back we'll get the quote right over.",
    "",
    "Thanks,",
    "Nox Metals Sales",
  ].join("\n");
}
