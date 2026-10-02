import { config } from "./config";
import { HttpError } from "./errors";
import { RFQS_PATH, buildRfqRequest, type HttpRequest } from "./request";
import type { CreateRfqDto, MaterialsListDto } from "./schema";

export type RfqAccepted = { id: string; status: "pricing" | "priced" | "failed"; created_at: string; poll_url: string };

export type SubmitResult =
  | { mode: "dry-run"; request: HttpRequest }
  | { mode: "live"; request: HttpRequest; response: RfqAccepted };

export async function fetchMaterials(): Promise<MaterialsListDto> {
  return noxGet<MaterialsListDto>("/api/v1/materials");
}

/** Dry run unless a Nox key is configured AND the caller explicitly asked to go live. */
export async function submitRfq(payload: CreateRfqDto, { live }: { live: boolean }): Promise<SubmitResult> {
  const request = await buildRfqRequest(payload, config.noxBaseUrl);
  const apiKey = config.noxKey;
  if (!live || !apiKey) return { mode: "dry-run", request };

  const response = await fetch(request.url, {
    method: request.method,
    headers: { ...request.headers, "x-api-key": apiKey },
    body: JSON.stringify(request.body),
  });
  return { mode: "live", request, response: await readJson<RfqAccepted>(response) };
}

export async function getRfq(id: string): Promise<unknown> {
  return noxGet(`${RFQS_PATH}/${encodeURIComponent(id)}`);
}

async function noxGet<T>(path: string): Promise<T> {
  const apiKey = config.noxKey;
  if (!apiKey) throw new HttpError(400, "nox_key_missing", "NOX_API_KEY is not set; live Nox calls are disabled.");
  const response = await fetch(`${config.noxBaseUrl}${path}`, { headers: { "x-api-key": apiKey } });
  return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === "object" && "message" in body ? String(body.message) : response.statusText;
    throw new HttpError(response.status === 401 ? 502 : response.status, "nox_api_error", `Nox API ${response.status}: ${detail}`);
  }
  return body as T;
}
