"use client";

import { useRef, useState } from "react";
import type { SampleInfo } from "@/lib/samples";
import { Button, Panel, cx } from "./ui";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.eml,.txt,.csv,.xlsx,.xls";

export type ParseSource = { kind: "file"; file: File } | { kind: "text"; text: string };

export function InputPanel({ samples, busy, onParse }: { samples: SampleInfo[]; busy: boolean; onParse: (source: ParseSource) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [sampleError, setSampleError] = useState<string | null>(null);

  const parseFile = (file: File | undefined) => file && onParse({ kind: "file", file });

  const loadSample = async (name: string) => {
    if (!name) return;
    setSampleError(null);
    const response = await fetch(`/api/samples/${encodeURIComponent(name)}`);
    if (!response.ok) {
      setSampleError(`Couldn't load ${name}.`);
      return;
    }
    parseFile(new File([await response.blob()], name, { type: response.headers.get("content-type") ?? "" }));
  };

  return (
    <Panel title="Input">
      <div className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-slate-400">Try a sample</span>
          <select
            disabled={busy || samples.length === 0}
            defaultValue=""
            onChange={(e) => loadSample(e.target.value)}
            className="w-full cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-[13px] text-slate-200 outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">{samples.length ? `${samples.length} samples in /samples` : "No samples found"}</option>
            {samples.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {sampleError && <span className="mt-1 block text-xs text-rose-300">{sampleError}</span>}
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
            dragging ? "border-accent bg-accent/5" : "border-slate-700 hover:border-slate-500 hover:bg-slate-900/60",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[13px] text-slate-200">Drop an RFQ or PO</span>
          <span className="text-[11px] text-slate-500">PDF · PNG/JPG · EML/TXT · XLSX/CSV</span>
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => parseFile(e.target.files?.[0])} />

        <div className="flex items-center gap-3 text-[10px] tracking-widest text-slate-600 uppercase">
          <span className="h-px flex-1 bg-line" />
          or paste
          <span className="h-px flex-1 bg-line" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder={'need 6061 plate 1/2 x 12 x 24 qty 10\n2 pcs 7075-T651 rd 2.5 dia x 12 lg\ncerts pls, need by fri'}
          className="w-full resize-y rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent"
        />
        <Button variant="primary" className="w-full py-2" disabled={busy || !text.trim()} onClick={() => onParse({ kind: "text", text })}>
          {busy ? "Parsing…" : "Parse text"}
        </Button>
      </div>
    </Panel>
  );
}
