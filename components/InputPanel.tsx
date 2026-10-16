"use client";

import { ArrowRight, CaretDown, ClipboardText, FileText, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { SampleInfo } from "@/lib/samples";
import { Button, LABEL, ToolbarButton, cx } from "./ui";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.eml,.txt,.csv,.xlsx,.xls";

export type ParseSource = { kind: "file"; file: File } | { kind: "text"; text: string };

type InputProps = {
  samples: SampleInfo[];
  busy: boolean;
  onParse: (source: ParseSource) => void;
  onSample: (name: string) => void;
};

/** Upload, sample and paste actions for the page toolbar. */
export function InputActions({ samples, busy, onParse, onSample, pasteOpen, onTogglePaste }: InputProps & { pasteOpen: boolean; onTogglePaste: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <ToolbarButton disabled={busy} onClick={() => fileInput.current?.click()}>
        <UploadSimple size={16} aria-hidden />
        Upload document
      </ToolbarButton>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onParse({ kind: "file", file });
          e.target.value = "";
        }}
      />
      <label className="relative inline-flex items-center gap-1.5 px-1 py-1 text-sm text-fg-2 hover:text-fg">
        <FileText size={16} aria-hidden />
        Samples
        <CaretDown size={12} aria-hidden />
        <select
          aria-label="Open a sample document"
          disabled={busy || samples.length === 0}
          value=""
          onChange={(e) => e.target.value && onSample(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">Open a sample</option>
          {samples.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <ToolbarButton disabled={busy} onClick={onTogglePaste} aria-expanded={pasteOpen} className={cx(pasteOpen && "text-fg")}>
        <ClipboardText size={16} aria-hidden />
        Paste text
      </ToolbarButton>
    </>
  );
}

export function PasteBox({ busy, onParse }: Pick<InputProps, "busy" | "onParse">) {
  const [text, setText] = useState("");
  return (
    <div className="mb-6 rounded-sm border border-line bg-surface p-4">
      <label htmlFor="paste" className={cx(LABEL, "mb-2 block text-fg-2")}>
        Paste an RFQ, email or line list
      </label>
      <textarea
        id="paste"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"need 6061 plate 1/2 x 12 x 24 qty 10\n2 pcs 7075-T651 rd 2.5 dia x 12 lg\ncerts pls, need by fri"}
        className="w-full resize-y rounded-sm border border-line-strong bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent"
      />
      <div className="mt-3 flex justify-end">
        <Button variant="primary" disabled={busy || !text.trim()} onClick={() => onParse({ kind: "text", text })}>
          {busy ? "Reading…" : "Read text"}
        </Button>
      </div>
    </div>
  );
}

/** Start screen: a large drop target plus the featured samples. */
export function DropZone({
  busy,
  onParse,
  onSample,
  featured,
}: Pick<InputProps, "busy" | "onParse" | "onSample"> & { featured: { name: string; label: string }[] }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onParse({ kind: "file", file });
        }}
        className={cx(
          "flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-sm border border-dashed bg-surface px-6 text-center transition-colors disabled:opacity-50",
          dragging ? "border-accent bg-accent/5" : "border-line-strong hover:border-fg-3",
        )}
      >
        <UploadSimple size={28} className="text-fg-3" aria-hidden />
        <span className="text-lg font-medium text-fg">Drop your PO or RFQ</span>
        <span className="max-w-[44ch] text-sm leading-relaxed text-fg-2">
          PDF, scan, photo, spreadsheet or email. Every value keeps the text it came from, and anything unclear is flagged for you to confirm.
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onParse({ kind: "file", file });
          e.target.value = "";
        }}
      />

      {featured.length > 0 && (
        <div>
          <p className={cx(LABEL, "mb-3 text-fg-2")}>Try a sample</p>
          <ul className="divide-y divide-line border-y border-line">
            {featured.map((sample) => (
              <li key={sample.name}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSample(sample.name)}
                  className="group flex w-full items-center justify-between gap-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{sample.label}</span>
                    <span className="block truncate font-mono text-xs text-fg-3">{sample.name}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
