"use client";

import { Info, Warning, WarningCircle, WarningOctagon, type Icon } from "@phosphor-icons/react";
import type { RfqEditor } from "@/hooks/useRfqEditor";
import { worstSeverity } from "@/lib/flags";
import type { Flag, Severity } from "@/lib/schema";
import { Button, Popover, SEVERITY_STYLE, cx } from "./ui";

const ICONS: Record<Severity, Icon> = { error: WarningOctagon, warning: Warning, info: Info };

/** Flags with an Accept action, as shown inside a warning popover. */
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
