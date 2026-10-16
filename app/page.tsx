"use client";

import { ArrowClockwise, CalendarBlank, Check, EnvelopeSimple, WarningOctagon } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { ChatgptConnection } from "@/components/ChatgptConnection";
import { BuyerQuestions, FlagBadge } from "@/components/FlagsPanel";
import { HeaderCard } from "@/components/HeaderCard";
import { DropZone, InputActions, PasteBox, type ParseSource } from "@/components/InputPanel";
import { LineTable, lineWeight } from "@/components/LineTable";
import { PayloadPanel, SubmissionStatus, SubmitButton, useSubmission } from "@/components/PayloadPanel";
import { LABEL, ToolbarButton, cx } from "@/components/ui";
import { useRfqEditor } from "@/hooks/useRfqEditor";
import { ApiError, postJson, requestJson } from "@/lib/api-client";
import { buildQuestionsEmail } from "@/lib/email";
import type { SampleInfo } from "@/lib/samples";
import type { ParseResult } from "@/lib/schema";
import type { AppStatus } from "@/lib/status";

type ParseState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "done"; result: ParseResult; run: number; source: ParseSource }
  | { state: "failed"; code: string; message: string };

const PROVIDER_LABEL: Record<AppStatus["provider"] | "mock", string> = {
  mock: "Mock",
  chatgpt: "ChatGPT plan",
  openai: "OpenAI API",
  claude: "Claude",
};

const FEATURED_SAMPLES: Record<string, string> = {
  "06-scanned-note.png": "Handwritten shop note, photographed",
  "02-aerospace-po.pdf": "Aerospace PO with spec callouts and DFARS",
  "09-launch-vehicle-po.pdf": "Launch vehicle PO with Inconel and a revision",
  "05-rfq-out-of-catalog.pdf": "RFQ with a stainless line and qty over 200",
};

export default function Home() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [parse, setParse] = useState<ParseState>({ state: "idle" });
  const [showConnection, setShowConnection] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    requestJson<AppStatus>("/api/status").then(setStatus).catch(() => setStatus(null));
    requestJson<{ samples: SampleInfo[] }>("/api/samples").then((r) => setSamples(r.samples)).catch(() => setSamples([]));
  }, []);

  const run = async (source: ParseSource, fresh = false) => {
    setPasteOpen(false);
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

  const busy = parse.state === "loading";
  const inputActions = (
    <InputActions samples={samples} busy={busy} onParse={run} onSample={runSample} pasteOpen={pasteOpen} onTogglePaste={() => setPasteOpen((open) => !open)} />
  );
  const featured = Object.entries(FEATURED_SAMPLES)
    .filter(([name]) => samples.some((s) => s.name === name))
    .map(([name, label]) => ({ name, label }));

  return (
    <>
      <TopBar status={status} onToggleConnection={() => setShowConnection((shown) => !shown)} />
      <div className="mx-auto max-w-[1400px] px-4 pb-20 md:px-8">
        {status && (status.llm === "missing_key" || showConnection) && (
          <div className="pt-6">
            <ChatgptConnection status={status} refresh={async () => setStatus(await requestJson<AppStatus>("/api/status"))} />
          </div>
        )}

        {parse.state === "done" && status ? (
          <Results
            key={parse.run}
            result={parse.result}
            status={status}
            inputActions={inputActions}
            paste={pasteOpen && <PasteBox busy={busy} onParse={run} />}
            onRerunLive={() => run(parse.source, true)}
          />
        ) : (
          <>
            <TitleRow title="Review a buyer's RFQ" actions={inputActions} />
            {pasteOpen && <PasteBox busy={busy} onParse={run} />}
            {parse.state === "idle" && <DropZone busy={busy} onParse={run} onSample={runSample} featured={featured} />}
            {parse.state === "loading" && <Loading label={parse.label} />}
            {parse.state === "failed" && <ErrorCard code={parse.code} message={parse.message} />}
          </>
        )}
      </div>
    </>
  );
}

function postFile(url: string, file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  return requestJson<ParseResult>(url, { method: "POST", body: form });
}

function TopBar({ status, onToggleConnection }: { status: AppStatus | null; onToggleConnection: () => void }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold tracking-[0.22em] text-fg">RFQ PARSER</span>
          <span className="hidden text-sm text-fg-3 sm:inline">for Nox Metals</span>
        </div>
        {status && status.llm !== "missing_key" && (
          <button
            type="button"
            onClick={onToggleConnection}
            title="AI provider settings"
            className="inline-flex items-center gap-1.5 rounded-sm bg-sunken px-2.5 py-1.5 text-xs transition-colors hover:bg-hover"
          >
            <span className="text-fg-3">{PROVIDER_LABEL[status.llm === "mock" ? "mock" : status.provider]}</span>
            <span className="font-mono text-fg">{status.model}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function TitleRow({ title, status, actions }: { title: string; status?: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pt-10 pb-7">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-fg">{title}</h1>
        {status}
      </div>
      <nav aria-label="Document actions" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {actions}
      </nav>
    </div>
  );
}

function Results({
  result,
  status,
  inputActions,
  paste,
  onRerunLive,
}: {
  result: ParseResult;
  status: AppStatus;
  inputActions: ReactNode;
  paste: ReactNode;
  onRerunLive: () => void;
}) {
  const editor = useRfqEditor(result, status.catalog, status.today);
  const submission = useSubmission(editor, status.nox);
  const { meta } = result;
  const { draft } = editor;
  const email = buildQuestionsEmail(draft, editor.flags);
  const headerFlags = editor.flags.filter((f) => f.line_ref === null);
  const open = editor.flags.filter((f) => f.severity !== "info").length;
  const weights = draft.lines.map((line) => lineWeight(line, status.catalog)).filter((w): w is number => w !== null);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const needBy = draft.required_date.value;

  const titleStatus = (
    <span className="inline-flex items-center gap-2 text-[15px] text-fg-2">
      <CalendarBlank size={18} className="text-fg-3" aria-hidden />
      {needBy ? <>Need by {formatDate(needBy)}</> : "No need-by date"}
      <FlagBadge flags={headerFlags} onAccept={editor.acceptFlag} label="Notes about the request" align="left" />
    </span>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-x-10 gap-y-4 pt-6">
      <div className="mr-auto space-y-1 text-sm text-fg-2">
        <p>
          <span className="font-mono text-fg">{formatPounds(total)} lb</span>
          {weights.length < draft.lines.length && <span className="text-fg-3"> (lines without a size or density excluded)</span>}
        </p>
        <p className="max-w-[60ch] truncate">{draft.ship_to_address.value ? <>Ship to {draft.ship_to_address.value}</> : <span className="text-fg-3">No ship-to address</span>}</p>
      </div>
      <div className="text-right">
        <p className={cx(LABEL, "text-fg-2")}>Lines in RFQ</p>
        <p className="font-mono text-[28px] leading-tight font-semibold text-fg">
          {editor.payload.lines.length}
          <span className="text-fg-3"> / {draft.lines.length}</span>
        </p>
        <p className={cx("text-xs", editor.blocking ? "text-err" : open > 0 ? "text-warn" : "text-ok")}>
          {editor.blocking ? `${editor.excluded_refs.length} held back` : open > 0 ? `${open} to confirm` : "Ready to send"}
        </p>
      </div>
      <SubmitButton control={submission} />
    </div>
  );

  return (
    <>
      <TitleRow
        title="Review the request"
        status={titleStatus}
        actions={
          <>
            {inputActions}
            {meta.cached_at && (
              <ToolbarButton onClick={onRerunLive} title={`Cached extraction from ${formatCachedAt(meta.cached_at)}`}>
                <ArrowClockwise size={16} aria-hidden />
                Re-run live
              </ToolbarButton>
            )}
          </>
        }
      />
      {paste}
      <p className="-mt-3 mb-4 text-[13px] text-fg-3">
        <span className="font-mono text-fg-2">{meta.filename ?? "Pasted text"}</span>
        {meta.cached_at ? <>, cached extraction from {formatCachedAt(meta.cached_at)}</> : <>, read in {(meta.ms / 1000).toFixed(1)}s</>}
        . Hover any box to see the text it was read from.
      </p>
      <LineTable editor={editor} catalog={status.catalog} footer={footer} />
      <div className="mt-3 flex justify-end">
        <SubmissionStatus control={submission} />
      </div>

      <div className="mt-14 grid gap-12 border-t border-line pt-10 lg:grid-cols-2">
        <div>
          <BuyerQuestions editor={editor} />
          {email && (
            <div className="mt-5">
              <CopyQuestions email={email} />
            </div>
          )}
        </div>
        <HeaderCard editor={editor} />
      </div>

      <div className="mt-14 border-t border-line pt-10">
        <PayloadPanel editor={editor} nox={status.nox} />
      </div>
    </>
  );
}

function CopyQuestions({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolbarButton
      onClick={async () => {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={16} weight="bold" className="text-ok" aria-hidden /> : <EnvelopeSimple size={16} aria-hidden />}
      {copied ? "Copied" : "Copy questions as email"}
    </ToolbarButton>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="text-sm text-fg-2">
        Reading <span className="font-mono text-fg">{label}</span>. Extracting lines, normalizing units and checking the catalog.
      </p>
      <div className="rounded-sm border border-line bg-surface p-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-full max-w-40" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-sm border border-line bg-surface p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

function Bone({ className }: { className: string }) {
  return <div className={cx("rounded-sm bg-sunken motion-safe:animate-pulse", className)} />;
}

function ErrorCard({ code, message }: { code: string; message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-sm border border-err/40 bg-err/5 p-5">
      <WarningOctagon size={20} weight="bold" className="mt-0.5 shrink-0 text-err" aria-hidden />
      <div>
        <p className="text-sm font-medium text-fg">{message}</p>
        <p className="mt-1 font-mono text-xs text-fg-3">{code}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatPounds(pounds: number): string {
  return pounds.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function formatCachedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
