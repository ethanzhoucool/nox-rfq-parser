"use client";

import { UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { SampleInfo } from "@/lib/samples";
import { Button, Panel, cx } from "./ui";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.eml,.txt,.csv,.xlsx,.xls";

export type ParseSource = { kind: "file"; file: File } | { kind: "text"; text: string };

export function InputPanel({
  samples,
  busy,
  onParse,
  onSample,
}: {
  samples: SampleInfo[];
  busy: boolean;
  onParse: (source: ParseSource) => void;
  onSample: (name: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");

  const parseFile = (file: File | undefined) => file && onParse({ kind: "file", file });

  return (
    <Panel title="Document">
      <div className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-fg-2">Sample document</span>
          <select
            disabled={busy || samples.length === 0}
            value=""
            onChange={(e) => e.target.value && onSample(e.target.value)}
            className="w-full cursor-pointer rounded-md border border-line-strong bg-sunken px-2.5 py-2 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">{samples.length ? `Choose one of ${samples.length}` : "Loading samples…"}</option>
            {samples.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

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
            parseFile(e.dataTransfer.files[0]);
          }}
          className={cx(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition disabled:opacity-50",
            dragging ? "border-accent bg-accent/5" : "border-line-strong hover:border-fg-3 hover:bg-hover",
          )}
        >
          <UploadSimple size={22} className="text-fg-3" aria-hidden />
          <span className="text-[13px] font-medium text-fg">Drop an RFQ or PO</span>
          <span className="text-xs text-fg-3">PDF, image, email or spreadsheet</span>
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => parseFile(e.target.files?.[0])} />

        <div className="flex items-center gap-3 text-xs text-fg-3">
          <span className="h-px flex-1 bg-line" />
          or paste
          <span className="h-px flex-1 bg-line" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder={'need 6061 plate 1/2 x 12 x 24 qty 10\n2 pcs 7075-T651 rd 2.5 dia x 12 lg\ncerts pls, need by fri'}
          className="w-full resize-y rounded-md border border-line-strong bg-sunken px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent"
        />
        <Button variant="primary" className="w-full py-2" disabled={busy || !text.trim()} onClick={() => onParse({ kind: "text", text })}>
          {busy ? "Parsing…" : "Parse text"}
        </Button>
      </div>
    </Panel>
  );
}
