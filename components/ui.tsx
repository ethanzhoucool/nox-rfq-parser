"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Confidence, Severity } from "@/lib/schema";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Uppercase, letter-spaced label used for column heads and section titles, as on noxmetals.co. */
export const LABEL = "text-[11px] font-medium uppercase tracking-[0.12em]";

/** Text-and-icon action for the page toolbar. */
export function ToolbarButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-sm whitespace-nowrap text-fg-2 transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  count,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-sm border border-line bg-surface", className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2">
        <h2 className={cx(LABEL, "flex items-center gap-2 text-fg-2")}>
          {title}
          {count !== undefined && <span className="rounded-sm bg-sunken px-1.5 font-mono text-[11px] tracking-normal text-fg-2">{count}</span>}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-fg hover:bg-hover",
        variant === "ghost" && "text-fg-2 hover:bg-hover hover:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="ghost" onClick={copy}>
      {copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

const CONFIDENCE_COLOR: Record<Exclude<Confidence, "high">, string> = {
  medium: "bg-warn",
  low: "bg-err",
};

/** Marks only what needs a second look: medium/low confidence, or a value the reviewer changed. */
export function ConfidenceMark({ confidence, edited }: { confidence: Confidence; edited?: boolean }) {
  if (!edited && confidence === "high") return null;
  return (
    <span
      aria-label={edited ? "edited" : `${confidence} confidence`}
      className={cx("inline-block size-1.5 shrink-0 rounded-full", edited ? "bg-accent" : CONFIDENCE_COLOR[confidence as "medium" | "low"])}
    />
  );
}

export const SEVERITY_STYLE: Record<Severity, { text: string; ring: string; box: string; soft: string; label: string }> = {
  error: { text: "text-err", ring: "ring-1 ring-err/60 bg-err/5", box: "border-err/70 bg-err/[0.04]", soft: "bg-err/10 text-err", label: "Errors" },
  warning: { text: "text-warn", ring: "ring-1 ring-warn/60 bg-warn/5", box: "border-warn/70 bg-warn/[0.05]", soft: "bg-warn/10 text-warn", label: "Warnings" },
  info: { text: "text-fg-2", ring: "", box: "border-line-strong", soft: "bg-sunken text-fg-2", label: "Notes" },
};

export function StatusChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "accent" | "warn" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-xs">
      <span className="text-fg-3">{label}</span>
      <span className={cx("font-medium", tone === "accent" && "text-accent", tone === "warn" && "text-warn", tone === "neutral" && "text-fg")}>{value}</span>
    </span>
  );
}

/** Hover tooltip rendered in a portal so it is never clipped by scrolling tables. */
export function Tooltip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) setPosition({ left: rect.left + rect.width / 2, top: rect.top });
  };

  return (
    <span ref={anchor} className={className} onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}>
      {children}
      {position && content && <TooltipBubble position={position}>{content}</TooltipBubble>}
    </span>
  );
}

function TooltipBubble({ position, children }: { position: { left: number; top: number }; children: ReactNode }) {
  const bubble = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(position.left);

  useLayoutEffect(() => {
    const width = bubble.current?.offsetWidth ?? 0;
    setLeft(Math.min(Math.max(position.left, width / 2 + 8), window.innerWidth - width / 2 - 8));
  }, [position.left]);

  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      style={{ left, top: position.top - 8 }}
      className="pointer-events-none fixed z-50 max-w-sm -translate-x-1/2 -translate-y-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs leading-relaxed text-fg shadow-lg shadow-fg/10"
    >
      {children}
    </div>,
    document.body,
  );
}

export function SourceQuote({ source, confidence, edited }: { source: string | null; confidence: Confidence; edited?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
        <ConfidenceMark confidence={confidence} edited={edited} />
        {edited ? "Edited by you" : `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`}
      </div>
      {source ? <q className="block font-mono text-[11px] text-fg">{source}</q> : <span className="text-fg-3">Not found in the document</span>}
    </div>
  );
}
