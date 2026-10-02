"use client";

import { useEffect, useState } from "react";
import { ApiError, requestJson } from "@/lib/api-client";

type RfqDetail = { pricing_status: "pricing" | "priced" | "failed" | null; total: number };
type PollState = { status: RfqDetail["pricing_status"]; total: number | null; error: string | null };

const INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 60;

/** Polls GET /api/v1/rfqs/{id} (via our proxy) until Wayne finishes pricing. */
export function useRfqPolling(id: string): PollState {
  const [state, setState] = useState<PollState>({ status: "pricing", total: null, error: null });

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      try {
        const rfq = await requestJson<RfqDetail>(`/api/rfqs/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setState({ status: rfq.pricing_status, total: rfq.pricing_status === "priced" ? rfq.total : null, error: null });
        if (rfq.pricing_status === "pricing" && ++attempts < MAX_ATTEMPTS) timer = setTimeout(poll, INTERVAL_MS);
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, error: error instanceof ApiError ? error.message : "Polling failed." }));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  return state;
}
