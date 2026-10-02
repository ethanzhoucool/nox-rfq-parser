import type { CreateRfqDto } from "./schema";

export const RFQS_PATH = "/api/v1/rfqs";
export const REDACTED_KEY = "$NOX_API_KEY";

export type HttpRequest = {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: CreateRfqDto;
};

/** Same body → same key, so a double-click or retry replays the original RFQ instead of creating a duplicate. */
export async function idempotencyKey(payload: CreateRfqDto): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `rfq-${hex.slice(0, 40)}`;
}

export async function buildRfqRequest(payload: CreateRfqDto, baseUrl: string, apiKey = REDACTED_KEY): Promise<HttpRequest> {
  return {
    method: "POST",
    url: `${baseUrl}${RFQS_PATH}`,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "Idempotency-Key": await idempotencyKey(payload),
    },
    body: payload,
  };
}

export function toCurl(request: HttpRequest): string {
  const headers = Object.entries(request.headers).map(([name, value]) =>
    value === REDACTED_KEY ? `  -H "${name}: ${value}"` : `  -H ${shellQuote(`${name}: ${value}`)}`,
  );
  return [
    `curl -X ${request.method} ${shellQuote(request.url)}`,
    ...headers,
    `  --data ${shellQuote(JSON.stringify(request.body, null, 2))}`,
  ].join(" \\\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
