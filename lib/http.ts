import { NextResponse } from "next/server";
import { HttpError, toHttpError } from "./errors";

export type ApiErrorBody = { error: { code: string; message: string } };

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const { status, code, message } = toHttpError(error);
  if (status >= 500) console.error(error);
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Rejects a POST that a browser sent from another site. A plain HTML form or a text/plain fetch needs no
 * CORS preflight, so without this any page open in the same browser could run an extraction on the
 * configured AI key or create an RFQ at Nox. Requests from scripts and curl carry neither header and pass.
 */
export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw crossSite();

  const origin = request.headers.get("origin");
  if (origin === null) return;
  const host = hostOf(origin);
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(request.url).host];
  if (!host || !hosts.includes(host)) throw crossSite();
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host || null;
  } catch {
    return null;
  }
}

const crossSite = () => new HttpError(403, "cross_site_request", "This request has to come from the RFQ Parser page itself.");
