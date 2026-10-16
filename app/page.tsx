"use client";

import { ArrowClockwise, ArrowRight, WarningOctagon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ChatgptConnection } from "@/components/ChatgptConnection";
import { FlagsPanel } from "@/components/FlagsPanel";
import { HeaderCard } from "@/components/HeaderCard";
import { InputPanel, type ParseSource } from "@/components/InputPanel";
import { LineTable } from "@/components/LineTable";
import { PayloadPanel } from "@/components/PayloadPanel";
import { Button, StatusChip, cx } from "@/components/ui";
import { useRfqEditor } from "@/hooks/useRfqEditor";
import { ApiError, postJson, requestJson } from "@/lib/api-client";
import type { SampleInfo } from "@/lib/samples";
import type { ParseResult } from "@/lib/schema";
import type { AppStatus } from "@/lib/status";

type ParseState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "done"; result: ParseResult; run: number; source: ParseSource }
  | { state: "failed"; code: string; message: string };

const PROVIDER_LABEL: Record<AppStatus["provider"] | "mock", string> = {
  mock: "Demo",
  chatgpt: "ChatGPT plan",
  openai: "OpenAI API",
  claude: "Claude",
};

const FEATURED_SAMPLES: Record<string, string> = {
  "09-launch-vehicle-po.pdf": "Launch vehicle PO with Inconel, DFARS and a revision",
  "02-aerospace-po.pdf": "Aerospace PO with spec callouts and DFARS",
  "06-scanned-note.png": "Handwritten shop note, photographed",
  "05-rfq-out-of-catalog.pdf": "RFQ with a stainless line and qty over 200",
};

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [parse, setParse] = useState<ParseState>({ state: "idle" });
  const [showConnection, setShowConnection] = useState(false);

  useEffect(() => {
    requestJson<AppStatus>("/api/status").then(setStatus).catch(() => setStatus(null));
    requestJson<{ samples: SampleInfo[] }>("/api/samples").then((r) => setSamples(r.samples)).catch(() => setSamples([]));
  }, []);

  const run = async (source: ParseSource, fresh = false) => {
    setParse({ state: "loading", label: source.kind === "file" ? source.file.name : "pasted text" });
    try {
      const url = fresh ? "/api/parse?fresh=1" : "/api/parse";
      const result = await (source.kind === "file" ? postFile(url, source.file) : postJson<ParseResult>(url, { text: source.text }));
      setParse({ state: "done", result, run: Date.now(), source });
    } catch (error) {
      setParse(
        error instanceof ApiError
          ? { state: "failed", code: error.code, message: error.message }
          : { state: "failed", code: "network", message: "Couldn't reach the server." },
      );
    }
  };

  const runSample = async (name: string) => {
    const response = await fetch(`/api/samples/${encodeURIComponent(name)}`).catch(() => null);
    if (!response?.ok) {
      setParse({ state: "failed", code: "sample_unavailable", message: `Couldn't load ${name}.` });
      return;
    }
    run({ kind: "file", file: new File([await response.blob()], name, { type: response.headers.get("content-type") ?? "" }) });
  };

  const featured = Object.keys(FEATURED_SAMPLES).flatMap((name) => samples.filter((s) => s.name === name));

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
      <TopBar status={status} onToggleConnection={() => setShowConnection((shown) => !shown)} />
      {status && (status.llm === "missing_key" || showConnection) && (
        <ChatgptConnection status={status} refresh={async () => setStatus(await requestJson<AppStatus>("/api/status"))} />
      )}
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-5 lg:self-start">
          <InputPanel samples={samples} busy={parse.state === "loading"} onParse={run} onSample={runSample} />
        </aside>
        <main className="min-w-0">
          {parse.state === "idle" && <EmptyState featured={featured} onSample={runSample} />}
          {parse.state === "loading" && <Loading label={parse.label} />}
          {parse.state === "failed" && <ErrorCard code={parse.code} message={parse.message} />}
          {parse.state === "done" && status && <Results key={parse.run} result={parse.result} status={status} onRerunLive={() => run(parse.source, true)} />}
        </main>
      </div>
    </div>
  );
}

function postFile(url: string, file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  return requestJson<ParseResult>(url, { method: "POST", body: form });
}

function TopBar({ status, onToggleConnection }: { status: AppStatus | null; onToggleConnection: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-fg">RFQ Parser</h1>
        <p className="text-[13px] text-fg-2">Buyer RFQs and POs in, validated Nox Metals API requests out.</p>
      </div>
      {status && status.llm !== "missing_key" && (
        <button type="button" onClick={onToggleConnection} title="AI provider settings" className="rounded-md transition-opacity hover:opacity-80">
          <StatusChip label={PROVIDER_LABEL[status.llm === "mock" ? "mock" : status.provider]} value={status.model} />
        </button>
      )}
    </header>
  );
}

function Results({ result, status, onRerunLive }: { result: ParseResult; status: AppStatus; onRerunLive: () => void }) {
  const editor = useRfqEditor(result, status.catalog, status.today);
  const count = (severity: string) => editor.flags.filter((f) => f.severity === severity).length;
  const { meta } = result;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-4 py-2.5 text-xs">
        <span className={cx("rounded-md px-2 py-0.5 font-semibold", editor.blocking ? "bg-err/10 text-err" : "bg-ok/10 text-ok")}>
          {editor.blocking ? "Needs attention" : "Ready to submit"}
        </span>
        <Stat label="File" value={meta.filename ?? "Pasted text"} />
        <Stat label="In payload" value={`${editor.payload.lines.length} of ${editor.draft.lines.length} lines`} />
        <Stat label="Errors" value={String(count("error"))} />
        <Stat label="Warnings" value={String(count("warning"))} />
        <Stat label="Time" value={`${(meta.ms / 1000).toFixed(1)}s`} />
        {meta.cached_at && (
          <span className="ml-auto flex items-center gap-3">
            <span className="text-fg-3">
              Cached extraction from <span className="font-mono text-fg">{formatCachedAt(meta.cached_at)}</span>
            </span>
            <Button variant="secondary" onClick={onRerunLive}>
              <ArrowClockwise size={14} aria-hidden />
              Re-run live
            </Button>
          </span>
        )}
        {meta.input_tokens !== undefined && (
          <Stat label="Tokens" value={`${meta.input_tokens.toLocaleString()} in, ${meta.output_tokens?.toLocaleString()} out`} />
        )}
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
    <span className="text-fg-3">
      {label} <span className="font-mono font-medium text-fg">{value}</span>
    </span>
  );
}

function EmptyState({ featured, onSample }: { featured: SampleInfo[]; onSample: (name: string) => void }) {
  return (
    <div className="flex min-h-[460px] flex-col justify-center rounded-md border border-dashed border-line-strong px-6 py-12 md:px-12">
      <h2 className="text-xl font-semibold tracking-tight text-fg">Drop a buyer&apos;s RFQ or PO to start</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-fg-2">
        Every value is shown with the text it came from. Anything missing or ambiguous becomes a flag with a question for the customer. The output
        is the exact request for <code className="font-mono text-[13px]">POST /api/v1/rfqs</code>.
      </p>
      {featured.length > 0 && (
        <div className="mt-8 max-w-xl">
          <p className="mb-2 text-xs font-medium text-fg-3">Or run a sample</p>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
            {featured.map((sample) => (
              <li key={sample.name}>
                <button
                  type="button"
                  onClick={() => onSample(sample.name)}
                  className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{FEATURED_SAMPLES[sample.name]}</span>
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

function Loading({ label }: { label: string }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <p className="text-sm text-fg-2">
        Reading <span className="font-mono text-fg">{label}</span>. Extracting lines, normalizing units and checking the catalog.
      </p>
      <div className="rounded-md border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-full max-w-40" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-md border border-line bg-surface p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}

function Bone({ className }: { className: string }) {
  return <div className={cx("rounded-md bg-sunken motion-safe:animate-pulse", className)} />;
}

function ErrorCard({ code, message }: { code: string; message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-md border border-err/40 bg-err/5 p-5">
      <WarningOctagon size={20} weight="bold" className="mt-0.5 shrink-0 text-err" aria-hidden />
      <div>
        <p className="text-sm font-medium text-fg">{message}</p>
        <p className="mt-1 font-mono text-xs text-fg-3">{code}</p>
      </div>
    </div>
  );
}

function formatCachedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
