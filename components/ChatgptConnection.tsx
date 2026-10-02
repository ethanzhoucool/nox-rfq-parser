"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import { requestJson } from "@/lib/api-client";
import type { AppStatus } from "@/lib/status";

export function ChatgptConnection({ status, refresh }: { status: AppStatus | null; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connection = status?.chatgpt;
  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("chatgpt_error");
    if (error) setMessage(error);
    if (error || url.searchParams.has("chatgpt")) {
      url.searchParams.delete("chatgpt_error"); url.searchParams.delete("chatgpt");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const disconnect = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await requestJson<{ revoked: boolean }>("/api/chatgpt/session", { method: "DELETE" });
      await refresh();
      if (!result.revoked) setMessage("Disconnected locally. Remote revocation wasn't confirmed; disconnect RFQ Parser in ChatGPT settings too.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't disconnect ChatGPT."); }
    finally { setBusy(false); }
  };

  const choose = async (id: string) => {
    if (!id) { window.location.assign("/api/chatgpt/login"); return; }
    const account = connection?.accounts.find((a) => a.id === id);
    if (!account?.connected) { window.location.assign(`/api/chatgpt/login?account=${encodeURIComponent(id)}`); return; }
    setBusy(true); setMessage(null);
    try {
      await requestJson("/api/chatgpt/session", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't switch accounts."); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="ChatGPT connection" className="mb-5 rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-fg">
            {status?.provider === "chatgpt" && status.llm === "ready" ? "Using your ChatGPT plan" : "Connect your ChatGPT plan"}
          </p>
          <p className="mt-1 text-xs text-fg-2">
            {connection?.connected || connection?.environmentToken
              ? "Parsing counts toward your existing ChatGPT usage limits."
              : "Sign in and allow plan usage to parse RFQs with your eligible ChatGPT plan."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connection && connection.accounts.length > 0 && !connection.environmentToken && (
            <select aria-label="ChatGPT account" disabled={busy} value={connection.activeId || ""} onChange={(e) => void choose(e.target.value)}
              className="max-w-72 rounded-md border border-line-strong bg-sunken px-2 py-1.5 text-xs text-fg outline-none focus:border-accent">
              <option value="">Add a ChatGPT account</option>
              {connection.accounts.map((account, i) => <option key={account.id} value={account.id}>
                {account.email || `ChatGPT account ${i + 1}`}{account.connected ? "" : " (sign in)"}
              </option>)}
            </select>
          )}
          {!connection?.environmentToken && !connection?.connected && (
            <a href={`/api/chatgpt/login${connection?.activeId ? `?account=${encodeURIComponent(connection.activeId)}` : ""}`}
              className="inline-flex rounded-md bg-accent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Continue with ChatGPT</a>
          )}
          {connection?.connected && !connection.environmentToken && <Button disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>}
          {(connection?.connected || connection?.environmentToken) &&
            <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" className="px-2 py-1.5 text-xs text-accent hover:underline">Manage usage</a>}
        </div>
      </div>
      {message && <p role="alert" className="mt-3 text-xs text-warn">{message}</p>}
    </section>
  );
}
