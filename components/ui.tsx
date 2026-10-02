"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Confidence, Severity } from "@/lib/schema";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-panel/80 shadow-xl shadow-black/20 backdrop-blur", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">{title}</h2>
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
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-accent text-slate-950 hover:bg-accent-strong",
        variant === "secondary" && "border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-500 hover:bg-slate-800",
        variant === "ghost" && "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
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
      {copied ? "Copied" : label}
    </Button>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-400",
  medium: "bg-amber-300",
  low: "bg-rose-400",
};

export function ConfidenceDot({ confidence, edited }: { confidence: Confidence; edited?: boolean }) {
  return (
    <span
      aria-label={edited ? "edited" : `${confidence} confidence`}
      className={cx("inline-block size-1.5 shrink-0 rounded-full", edited ? "bg-accent" : CONFIDENCE_STYLE[confidence])}
    />
  );
}

export const SEVERITY_STYLE: Record<Severity, { text: string; ring: string; chip: string; label: string }> = {
  error: { text: "text-rose-300", ring: "ring-1 ring-rose-500/60 bg-rose-500/5", chip: "bg-rose-500/15 text-rose-300", label: "Errors" },
  warning: { text: "text-amber-200", ring: "ring-1 ring-amber-400/50 bg-amber-400/5", chip: "bg-amber-400/15 text-amber-200", label: "Warnings" },
  info: { text: "text-slate-300", ring: "", chip: "bg-slate-500/20 text-slate-300", label: "Notes" },
};

export function Pill({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "accent" | "warn" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-900/70 px-2.5 py-1 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className={cx("font-medium", tone === "accent" && "text-accent", tone === "warn" && "text-amber-200", tone === "neutral" && "text-slate-200")}>
        {value}
      </span>
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
      className="pointer-events-none fixed z-50 max-w-sm -translate-x-1/2 -translate-y-full rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}

export function SourceQuote({ source, confidence, edited }: { source: string | null; confidence: Confidence; edited?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-slate-500 uppercase">
        <ConfidenceDot confidence={confidence} edited={edited} />
        {edited ? "edited by you" : `${confidence} confidence`}
      </div>
      {source ? <q className="block font-mono text-[11px] text-slate-100">{source}</q> : <span className="text-slate-500">Not found in the document</span>}
    </div>
  );
}
