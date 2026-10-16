"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { RfqEditor } from "@/hooks/useRfqEditor";
import { useRfqPolling } from "@/hooks/useRfqPolling";
import { ApiError, postJson } from "@/lib/api-client";
import type { SubmitResult } from "@/lib/nox";
import { buildRfqRequest, toCurl } from "@/lib/request";
import type { AppStatus } from "@/lib/status";
import { CopyButton, LABEL, cx } from "./ui";

type Tab = "json" | "curl";
type Submission = { state: "idle" } | { state: "sending" } | { state: "done"; result: SubmitResult } | { state: "failed"; message: string };

/** Sends the payload to Nox when a key is set; otherwise returns the request as a dry run. Resets when the payload changes. */
export function useSubmission(editor: RfqEditor, nox: AppStatus["nox"]) {
  const { payload } = editor;
  const json = JSON.stringify(payload);
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });
  const [submittedJson, setSubmittedJson] = useState<string | null>(null);
  const live = nox.mode === "live";

  if (submittedJson !== null && submittedJson !== json) {
    setSubmittedJson(null);
    setSubmission({ state: "idle" });
  }

  const submit = async () => {
    if (live && !window.confirm(`Create a real RFQ at Nox with ${payload.lines.length} line(s)?`)) return;
    setSubmission({ state: "sending" });
    setSubmittedJson(json);
    try {
      setSubmission({ state: "done", result: await postJson<SubmitResult>("/api/submit", { payload }) });
    } catch (error) {
      setSubmission({ state: "failed", message: error instanceof ApiError ? error.message : "Submit failed." });
    }
  };

  return { live, submission, submit, disabled: payload.lines.length === 0 || submission.state === "sending" };
}

export type SubmissionControl = ReturnType<typeof useSubmission>;

export function SubmitButton({ control }: { control: SubmissionControl }) {
  return (
    <button
      type="button"
      disabled={control.disabled}
      onClick={control.submit}
      title={control.live ? "Sends POST /api/v1/rfqs with your Nox key." : "No NOX_API_KEY is set, so this shows the exact request without sending it."}
      className="inline-flex h-12 items-center gap-2 rounded-sm bg-accent px-5 text-[15px] font-semibold whitespace-nowrap text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
    >
      <PaperPlaneTilt size={18} weight="bold" aria-hidden />
      {control.submission.state === "sending" ? "Sending…" : control.live ? "Submit to Nox" : "Create RFQ"}
    </button>
  );
}

export function SubmissionStatus({ control }: { control: SubmissionControl }) {
  const { submission } = control;
  if (submission.state === "idle" || submission.state === "sending") return null;
  if (submission.state === "failed") return <p className="text-sm text-err">{submission.message}</p>;

  const { result } = submission;
  if (result.mode === "dry-run") {
    return (
      <p className="text-sm text-fg-2">
        <span className="font-semibold text-fg">Not sent.</span> No Nox API key is set, so this was a dry run. The exact request is under Nox API request
        below, with Idempotency-Key <code className="font-mono text-[13px]">{result.request.headers["Idempotency-Key"]}</code>.
      </p>
    );
  }
  return <LiveStatus id={result.response.id} />;
}

function LiveStatus({ id }: { id: string }) {
  const { status, total, error } = useRfqPolling(id);
  return (
    <p className="text-sm text-fg">
      <span className="font-semibold text-ok">Submitted.</span> RFQ <code className="font-mono">{id}</code>, pricing:{" "}
      <span className="font-medium">{status ?? "…"}</span>
      {total !== null && <>, total ${total.toFixed(2)}</>}
      {error && <span className="text-err">. {error}</span>}
    </p>
  );
}

/** The exact request for POST /api/v1/rfqs, as JSON or curl. */
export function PayloadPanel({ editor, nox }: { editor: RfqEditor; nox: AppStatus["nox"] }) {
  const { payload, excluded_refs: excluded } = editor;
  const json = JSON.stringify(payload, null, 2);
  const [tab, setTab] = useState<Tab>("json");
  const [curl, setCurl] = useState("");

  useEffect(() => {
    let current = true;
    buildRfqRequest(payload, nox.baseUrl).then((request) => current && setCurl(toCurl(request)));
    return () => {
      current = false;
    };
  }, [payload, nox.baseUrl]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className={cx(LABEL, "text-fg-2")}>Nox API request</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-sm border border-line-strong bg-surface p-0.5">
            {(["json", "curl"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cx("rounded-sm px-2.5 py-0.5 text-xs font-medium", tab === t ? "bg-sunken text-fg" : "text-fg-3 hover:text-fg")}
              >
                {t === "json" ? "JSON" : "curl"}
              </button>
            ))}
          </div>
          <CopyButton text={tab === "json" ? json : curl} />
        </div>
      </div>
      <div className="overflow-hidden rounded-sm border border-line-strong bg-surface">
        <div className="border-b border-line px-4 py-2 font-mono text-xs text-fg-2">
          <span className="font-semibold text-accent">POST</span> {nox.baseUrl}/api/v1/rfqs
        </div>
        {excluded.length > 0 && (
          <p className="border-b border-line bg-err/5 px-4 py-2 text-xs text-err">
            Line{excluded.length > 1 ? "s" : ""} {excluded.join(", ")} held back until {excluded.length > 1 ? "their" : "its"} errors are fixed.
          </p>
        )}
        <pre className="max-h-[24rem] overflow-auto bg-sunken px-4 py-3 font-mono text-xs leading-relaxed text-fg-2">{tab === "json" ? json : curl}</pre>
      </div>
    </section>
  );
}
