"use client";

import { useEffect, useState } from "react";
import { ChatgptConnection } from "@/components/ChatgptConnection";
import { FlagsPanel } from "@/components/FlagsPanel";
import { HeaderCard } from "@/components/HeaderCard";
import { InputPanel, type ParseSource } from "@/components/InputPanel";
import { LineTable } from "@/components/LineTable";
import { PayloadPanel } from "@/components/PayloadPanel";
import { Pill, cx } from "@/components/ui";
import { useRfqEditor } from "@/hooks/useRfqEditor";
import { ApiError, postJson, requestJson } from "@/lib/api-client";
import type { SampleInfo } from "@/lib/samples";
import type { ParseResult } from "@/lib/schema";
import type { AppStatus } from "@/lib/status";

type ParseState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "done"; result: ParseResult; run: number }
  | { state: "failed"; code: string; message: string };

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [parse, setParse] = useState<ParseState>({ state: "idle" });

  useEffect(() => {
    requestJson<AppStatus>("/api/status").then(setStatus).catch(() => setStatus(null));
    requestJson<{ samples: SampleInfo[] }>("/api/samples").then((r) => setSamples(r.samples)).catch(() => setSamples([]));
  }, []);

  const run = async (source: ParseSource) => {
    setParse({ state: "loading", label: source.kind === "file" ? source.file.name : "pasted text" });
    try {
      const result = await (source.kind === "file" ? postFile(source.file) : postJson<ParseResult>("/api/parse", { text: source.text }));
      setParse({ state: "done", result, run: Date.now() });
    } catch (error) {
      setParse(
        error instanceof ApiError
          ? { state: "failed", code: error.code, message: error.message }
          : { state: "failed", code: "network", message: "Couldn't reach the server." },
      );
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-16">
      <TopBar status={status} />
      <ChatgptConnection status={status} refresh={async () => setStatus(await requestJson<AppStatus>("/api/status"))} />
      {status?.llm === "missing_key" && (
        <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2.5 text-[13px] text-amber-100">
          <strong className="font-semibold">The selected AI provider isn't connected.</strong> Connect ChatGPT above, or configure an OpenAI or Claude API key to enable parsing.
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-5 lg:self-start">
          <InputPanel samples={samples} busy={parse.state === "loading"} onParse={run} />
        </aside>
        <main className="min-w-0">
          {parse.state === "idle" && <EmptyState />}
          {parse.state === "loading" && <Loading label={parse.label} />}
          {parse.state === "failed" && <ErrorCard code={parse.code} message={parse.message} />}
          {parse.state === "done" && status && <Results key={parse.run} result={parse.result} status={status} />}
        </main>
      </div>
    </div>
  );
}

function postFile(file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  return requestJson<ParseResult>("/api/parse", { method: "POST", body: form });
}

function TopBar({ status }: { status: AppStatus | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-md border border-accent/40 bg-accent/10 font-mono text-sm font-bold text-accent">Rx</div>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-100">RFQ Parser</h1>
          <p className="text-xs text-slate-500">Messy buyer RFQs in, validated Nox Metals API requests out</p>
        </div>
      </div>
      {status && (
        <div className="flex flex-wrap gap-2">
          <Pill label="AI" value={status.llm === "mock" ? "demo" : status.provider === "chatgpt" ? "ChatGPT plan" : status.provider === "openai" ? "OpenAI API" : "Claude"} />
          <Pill label="Model" value={status.model} tone={status.llm === "missing_key" ? "warn" : "neutral"} />
          <Pill label="Catalog" value={status.catalog.source === "live" ? "live /materials" : "seed (approx.)"} tone={status.catalog.source === "live" ? "accent" : "neutral"} />
          <Pill label="Nox" value={status.nox.mode === "live" ? "live submit" : "dry run"} tone={status.nox.mode === "live" ? "accent" : "neutral"} />
        </div>
      )}
    </header>
  );
}

function Results({ result, status }: { result: ParseResult; status: AppStatus }) {
  const editor = useRfqEditor(result, status.catalog, status.today);
  const count = (severity: string) => editor.flags.filter((f) => f.severity === severity).length;
  const { meta } = result;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs">
        <span className={cx("rounded px-2 py-0.5 font-semibold", editor.blocking ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300")}>
          {editor.blocking ? "Needs attention" : "Ready to submit"}
        </span>
        <Stat label="File" value={meta.filename ?? "—"} />
        <Stat label="Lines" value={`${editor.payload.lines.length}/${editor.draft.lines.length} in payload`} />
        <Stat label="Errors" value={String(count("error"))} />
        <Stat label="Warnings" value={String(count("warning"))} />
        <span className="ml-auto text-slate-500">
          {(meta.ms / 1000).toFixed(1)}s{meta.input_tokens !== undefined && ` · ${meta.input_tokens.toLocaleString()} in / ${meta.output_tokens?.toLocaleString()} out tokens`}
        </span>
      </div>
      <HeaderCard editor={editor} />
      <LineTable editor={editor} />
      <div className="grid gap-5 xl:grid-cols-2">
        <FlagsPanel editor={editor} />
        <PayloadPanel editor={editor} nox={status.nox} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-slate-500">
      {label} <span className="font-medium text-slate-200">{value}</span>
    </span>
  );
}

function EmptyState() {
  const steps = [
    ["Drop", "a PDF PO, photo, spreadsheet or email. Or pick a sample."],
    ["Review", "every extracted value with its source quote and confidence."],
    ["Resolve", "flags: fix cells, accept warnings, email the customer the open questions."],
    ["Send", "the exact POST /api/v1/rfqs request. Dry run unless a Nox key is set."],
  ];
  return (
    <div className="grid h-full min-h-[420px] place-items-center rounded-lg border border-dashed border-line bg-panel/30 p-10">
      <ol className="grid max-w-2xl gap-4 sm:grid-cols-2">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-lg border border-line bg-panel/70 p-4">
            <div className="mb-1 font-mono text-[11px] text-accent">0{i + 1}</div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-lg border border-line bg-panel/40">
      <div className="text-center">
        <div className="mx-auto mb-4 h-1 w-48 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
        <p className="text-sm text-slate-200">Reading {label}…</p>
        <p className="mt-1 text-xs text-slate-500">Extracting lines, normalizing units, checking the catalog</p>
      </div>
    </div>
  );
}

function ErrorCard({ code, message }: { code: string; message: string }) {
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-5">
      <div className="mb-1 font-mono text-[11px] text-rose-300">{code}</div>
      <p className="text-sm text-rose-100">{message}</p>
    </div>
  );
}
