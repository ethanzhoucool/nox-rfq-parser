"use client";

import { useEffect, useState } from "react";
import type { RfqEditor } from "@/hooks/useRfqEditor";
import { useRfqPolling } from "@/hooks/useRfqPolling";
import { ApiError, postJson } from "@/lib/api-client";
import type { SubmitResult } from "@/lib/nox";
import { buildRfqRequest, toCurl } from "@/lib/request";
import type { AppStatus } from "@/lib/status";
import { Button, CopyButton, Panel, Tooltip, cx } from "./ui";

type Tab = "json" | "curl";
type Submission = { state: "idle" } | { state: "sending" } | { state: "done"; result: SubmitResult } | { state: "failed"; message: string };

export function PayloadPanel({ editor, nox }: { editor: RfqEditor; nox: AppStatus["nox"] }) {
  const { payload, excluded_refs: excluded } = editor;
  const json = JSON.stringify(payload, null, 2);
  const [tab, setTab] = useState<Tab>("json");
  const [curl, setCurl] = useState("");
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });
  const [submittedJson, setSubmittedJson] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    buildRfqRequest(payload, nox.baseUrl).then((request) => current && setCurl(toCurl(request)));
    return () => {
      current = false;
    };
  }, [payload, nox.baseUrl]);

  if (submittedJson !== null && submittedJson !== json) {
    setSubmittedJson(null);
    setSubmission({ state: "idle" });
  }

  const submit = async (live: boolean) => {
    if (live && !window.confirm(`Create a real RFQ at Nox with ${payload.lines.length} line(s)?`)) return;
    setSubmission({ state: "sending" });
    setSubmittedJson(json);
    try {
      setSubmission({ state: "done", result: await postJson<SubmitResult>("/api/submit", { payload, live }) });
    } catch (error) {
      setSubmission({ state: "failed", message: error instanceof ApiError ? error.message : "Submit failed." });
    }
  };

  const empty = payload.lines.length === 0;
  const liveEnabled = nox.mode === "live";

  return (
    <Panel
      title="Nox API payload"
      actions={
        <>
          <div className="flex rounded-md border border-line p-0.5">
            {(["json", "curl"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cx("rounded px-2 py-0.5 text-[11px] font-medium", tab === t ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200")}
              >
                {t === "json" ? "JSON" : "curl"}
              </button>
            ))}
          </div>
          <CopyButton text={tab === "json" ? json : curl} />
        </>
      }
      className="flex flex-col"
    >
      <div className="border-b border-line px-4 py-2 font-mono text-[11px] text-slate-400">
        <span className="text-accent">POST</span> {nox.baseUrl}/api/v1/rfqs
      </div>
      {excluded.length > 0 && (
        <p className="border-b border-line bg-rose-500/5 px-4 py-2 text-xs text-rose-200">
          Line{excluded.length > 1 ? "s" : ""} {excluded.join(", ")} left out until {excluded.length > 1 ? "their" : "its"} errors are fixed.
        </p>
      )}
      <pre className="max-h-[26rem] min-h-48 flex-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-slate-300">{tab === "json" ? json : curl}</pre>

      <footer className="space-y-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={liveEnabled ? "secondary" : "primary"} disabled={empty || submission.state === "sending"} onClick={() => submit(false)}>
            Create RFQ (dry run)
          </Button>
          <Tooltip content={liveEnabled ? "Sends POST /api/v1/rfqs with your Nox key." : "Set NOX_API_KEY on the server to enable live submission."}>
            <Button variant="primary" disabled={!liveEnabled || empty || submission.state === "sending"} onClick={() => submit(true)}>
              Submit to Nox
            </Button>
          </Tooltip>
          <span className="ml-auto text-[11px] text-slate-500">
            {payload.lines.length} line{payload.lines.length === 1 ? "" : "s"} · Idempotency-Key = hash of body
          </span>
        </div>
        <SubmissionStatus submission={submission} />
      </footer>
    </Panel>
  );
}

function SubmissionStatus({ submission }: { submission: Submission }) {
  if (submission.state === "idle") return null;
  if (submission.state === "sending") return <p className="text-xs text-slate-400">Sending…</p>;
  if (submission.state === "failed") return <p className="text-xs text-rose-300">{submission.message}</p>;

  const { result } = submission;
  if (result.mode === "dry-run") {
    return (
      <div className="rounded-md border border-line bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
        <span className="font-semibold text-accent">Dry run.</span> Nothing was sent. The exact request is in the curl tab, with key{" "}
        <code className="font-mono">{result.request.headers["Idempotency-Key"]}</code>.
      </div>
    );
  }
  return <LiveStatus id={result.response.id} />;
}

function LiveStatus({ id }: { id: string }) {
  const { status, total, error } = useRfqPolling(id);
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-slate-200">
      <span className="font-semibold text-accent">Submitted.</span> RFQ <code className="font-mono">{id}</code> · pricing:{" "}
      <span className="font-medium">{status ?? "…"}</span>
      {total !== null && <> · total ${total.toFixed(2)}</>}
      {error && <span className="text-rose-300"> · {error}</span>}
    </div>
  );
}
