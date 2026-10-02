"use client";

import { Info, Warning, WarningOctagon, type Icon } from "@phosphor-icons/react";
import type { RfqEditor } from "@/hooks/useRfqEditor";
import { buildQuestionsEmail } from "@/lib/email";
import type { Flag, Severity } from "@/lib/schema";
import { Button, CopyButton, Panel, SEVERITY_STYLE, cx } from "./ui";

const GROUPS: Severity[] = ["error", "warning", "info"];
const ICONS: Record<Severity, Icon> = { error: WarningOctagon, warning: Warning, info: Info };

export function FlagsPanel({ editor }: { editor: RfqEditor }) {
  const { flags } = editor;
  const email = buildQuestionsEmail(editor.draft, flags);

  return (
    <Panel
      title="Flags"
      count={flags.length}
      actions={email ? <CopyButton text={email} label="Copy questions as email" /> : null}
      className="flex flex-col"
    >
      {flags.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-fg-2">Nothing to confirm. This RFQ is ready to send.</p>
      ) : (
        <div className="divide-y divide-line">
          {GROUPS.map((severity) => {
            const group = flags.filter((f) => f.severity === severity);
            return group.length ? <FlagGroup key={severity} severity={severity} flags={group} onAccept={editor.acceptFlag} /> : null;
          })}
        </div>
      )}
      {editor.acceptedCount > 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-fg-3">{editor.acceptedCount} accepted</p>
      )}
    </Panel>
  );
}

function FlagGroup({ severity, flags, onAccept }: { severity: Severity; flags: Flag[]; onAccept: (id: string) => void }) {
  const style = SEVERITY_STYLE[severity];
  const GroupIcon = ICONS[severity];
  return (
    <div className="px-4 py-3">
      <h3 className={cx("mb-2 flex items-center gap-1.5 text-xs font-semibold", style.text)}>
        <GroupIcon size={15} weight="bold" aria-hidden />
        {style.label}
        <span className={cx("rounded-md px-1.5 font-mono text-[11px]", style.soft)}>{flags.length}</span>
      </h3>
      <ul className="space-y-2">
        {flags.map((flag) => (
          <li key={flag.id} className="group rounded-md border border-line bg-sunken px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-3">
                  <span className="rounded-md border border-line bg-surface px-1.5 font-mono text-fg-2">{flag.line_ref ? `Line ${flag.line_ref}` : "Header"}</span>
                  {flag.field && <span className="font-mono">{flag.field}</span>}
                  <span>{flag.source === "llm" ? "from model" : "from rules"}</span>
                </div>
                <p className="text-[13px] leading-snug text-fg">{flag.message}</p>
                {flag.suggested_question && <p className="text-xs leading-snug text-fg-2">Ask: {flag.suggested_question}</p>}
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
