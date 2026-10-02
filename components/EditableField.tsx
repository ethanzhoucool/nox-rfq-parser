"use client";

import { useState } from "react";
import type { Field, Severity } from "@/lib/schema";
import { ConfidenceMark, SEVERITY_STYLE, SourceQuote, Tooltip, cx } from "./ui";

type Common<T> = {
  field: Field<T>;
  edited: boolean;
  severity?: Severity;
  label: string;
  className?: string;
};

export function EditableText<T>({
  field,
  edited,
  severity,
  label,
  className,
  format,
  parse,
  placeholder = "None",
  align = "left",
  onCommit,
}: Common<T> & {
  format: (value: T) => string;
  parse: (text: string) => T | null | undefined;
  placeholder?: string;
  align?: "left" | "right";
  onCommit: (value: T | null) => void;
}) {
  const shown = field.value === null ? "" : format(field.value);
  const [text, setText] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  const [invalid, setInvalid] = useState(false);

  if (shown !== prevShown) {
    setPrevShown(shown);
    setText(shown);
  }

  const commit = () => {
    if (text.trim() === shown) return;
    const parsed = text.trim() === "" ? null : parse(text);
    if (parsed === undefined) {
      setInvalid(true);
      setText(shown);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
  };

  return (
    <Cell field={field} edited={edited} severity={severity} className={className}>
      <input
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cx(
          "w-full min-w-0 bg-transparent outline-none placeholder:text-fg-3/70",
          align === "right" && "text-right",
          invalid && "text-err",
        )}
      />
    </Cell>
  );
}

export function EditableSelect<T extends string>({
  field,
  edited,
  severity,
  label,
  className,
  options,
  onCommit,
}: Common<T> & { options: readonly T[]; onCommit: (value: T | null) => void }) {
  return (
    <Cell field={field} edited={edited} severity={severity} className={className}>
      <select
        aria-label={label}
        value={field.value ?? ""}
        onChange={(e) => onCommit(e.target.value === "" ? null : (e.target.value as T))}
        className="w-full min-w-0 cursor-pointer appearance-none bg-transparent outline-none"
      >
        <option value="">None</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Cell>
  );
}

function Cell<T>({ field, edited, severity, className, children }: Omit<Common<T>, "label"> & { children: React.ReactNode }) {
  return (
    <Tooltip content={<SourceQuote source={field.source} confidence={field.confidence} edited={edited} />} className={cx("block", className)}>
      <span
        className={cx(
          "flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors focus-within:bg-sunken focus-within:ring-1 focus-within:ring-accent hover:bg-hover",
          severity && severity !== "info" && SEVERITY_STYLE[severity].ring,
        )}
      >
        <ConfidenceMark confidence={field.confidence} edited={edited} />
        {children}
      </span>
    </Tooltip>
  );
}
