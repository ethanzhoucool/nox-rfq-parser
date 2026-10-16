"use client";

import { Info, Warning, WarningCircle, WarningOctagon, type Icon } from "@phosphor-icons/react";
import type { RfqEditor } from "@/hooks/useRfqEditor";
import { worstSeverity } from "@/lib/flags";
import type { Flag, Severity } from "@/lib/schema";
import { Button, LABEL, Popover, SEVERITY_STYLE, cx } from "./ui";

const ICONS: Record<Severity, Icon> = { error: WarningOctagon, warning: Warning, info: Info };

/** Flags with their buyer question and an Accept action, as shown inside a warning popover. */
export function FlagList({ flags, onAccept }: { flags: Flag[]; onAccept: (id: string) => void }) {
  return (
    <ul className="divide-y divide-line">
      {flags.map((flag) => {
        const FlagIcon = ICONS[flag.severity];
        return (
          <li key={flag.id} className="flex gap-2.5 px-3 py-3">
            <FlagIcon size={16} weight="bold" className={cx("mt-0.5 shrink-0", SEVERITY_STYLE[flag.severity].text)} aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[13px] leading-snug text-fg">{flag.message}</p>
              {flag.suggested_question && <p className="text-xs leading-snug text-fg-2">Ask: {flag.suggested_question}</p>}
              {flag.severity !== "error" && (
                <Button variant="secondary" onClick={() => onAccept(flag.id)} className="mt-1 px-2 py-1 text-xs">
                  Accept as is
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The (!) badge that opens a list of flags, like the lead-time notice on noxmetals.co. */
export function FlagBadge({ flags, onAccept, label, align }: { flags: Flag[]; onAccept: (id: string) => void; label: string; align?: "left" | "right" }) {
  const worst = worstSeverity(flags);
  if (!worst || flags.length === 0) return null;
  return (
    <Popover
      label={label}
      align={align}
      trigger={<WarningCircle size={18} weight="bold" className={cx(worst === "info" ? "text-fg-3" : SEVERITY_STYLE[worst].text)} aria-hidden />}
    >
      <FlagList flags={flags} onAccept={onAccept} />
    </Popover>
  );
}

/** Every open question, in the plain-text style of the "Good to know" section on noxmetals.co. */
export function BuyerQuestions({ editor }: { editor: RfqEditor }) {
  const questions = editor.flags.filter((f) => f.suggested_question);
  const notes = editor.flags.filter((f) => !f.suggested_question);

  return (
    <section>
      <h2 className={cx(LABEL, "mb-4 text-fg-2")}>Questions for the buyer</h2>
      {editor.flags.length === 0 ? (
        <p className="text-[15px] text-fg-2">Nothing to confirm. Every line is ready to send.</p>
      ) : (
        <ol className="space-y-2.5">
          {[...questions, ...notes].map((flag) => (
            <li key={flag.id} className="group flex items-start gap-3 text-[15px] leading-relaxed text-fg-2">
              <span className={cx("mt-0.5 shrink-0 font-mono text-xs", SEVERITY_STYLE[flag.severity].text)}>{flag.line_ref ?? "RFQ"}</span>
              <span className="min-w-0 flex-1">{flag.suggested_question ?? flag.message}</span>
              {flag.severity !== "error" && (
                <button
                  type="button"
                  onClick={() => editor.acceptFlag(flag.id)}
                  className="shrink-0 text-xs text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                >
                  Accept
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {editor.acceptedCount > 0 && <p className="mt-3 text-xs text-fg-3">{editor.acceptedCount} accepted as is</p>}
    </section>
  );
}
