"use client";

import type { RfqEditor } from "@/hooks/useRfqEditor";
import { buildQuestionsEmail } from "@/lib/email";
import type { Flag, Severity } from "@/lib/schema";
import { Button, CopyButton, Panel, SEVERITY_STYLE, cx } from "./ui";

const GROUPS: Severity[] = ["error", "warning", "info"];

export function FlagsPanel({ editor }: { editor: RfqEditor }) {
  const { flags } = editor;
  const email = buildQuestionsEmail(editor.draft, flags);

  return (
    <Panel
      title={`Flags · ${flags.length}`}
      actions={email ? <CopyButton text={email} label="Copy questions as email" /> : null}
      className="flex flex-col"
    >
      {flags.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">Nothing to confirm. This RFQ is ready to send.</p>
      ) : (
        <div className="divide-y divide-line">
          {GROUPS.map((severity) => {
            const group = flags.filter((f) => f.severity === severity);
            return group.length ? <FlagGroup key={severity} severity={severity} flags={group} onAccept={editor.acceptFlag} /> : null;
          })}
        </div>
      )}
      {editor.acceptedCount > 0 && (
        <p className="border-t border-line px-4 py-2 text-[11px] text-slate-500">{editor.acceptedCount} accepted</p>
      )}
    </Panel>
  );
}

function FlagGroup({ severity, flags, onAccept }: { severity: Severity; flags: Flag[]; onAccept: (id: string) => void }) {
  const style = SEVERITY_STYLE[severity];
  return (
    <div className="px-4 py-3">
      <h3 className={cx("mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase", style.text)}>
        {style.label}
        <span className={cx("rounded-full px-1.5 py-px text-[10px]", style.chip)}>{flags.length}</span>
      </h3>
      <ul className="space-y-2">
        {flags.map((flag) => (
          <li key={flag.id} className="group rounded-md border border-line bg-slate-900/60 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded bg-slate-800 px-1.5 py-px font-mono text-slate-300">{flag.line_ref ? `Line ${flag.line_ref}` : "Header"}</span>
                  {flag.field && <span className="font-mono">{flag.field}</span>}
                  <span>· {flag.source === "llm" ? "model" : "rule"}</span>
                </div>
                <p className="text-[13px] leading-snug text-slate-200">{flag.message}</p>
                {flag.suggested_question && <p className="text-xs leading-snug text-slate-400 italic">Ask: {flag.suggested_question}</p>}
              </div>
              {severity !== "error" && (
                <Button variant="ghost" onClick={() => onAccept(flag.id)} className="shrink-0 opacity-60 group-hover:opacity-100">
                  Accept
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
