import { NextResponse } from "next/server";
import { HttpError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { MAX_UPLOAD_BYTES, fromFile, fromText, type RfqInput } from "@/lib/input";
import { parseRfq } from "@/lib/parse";
import { assertLocalRequest } from "@/lib/chatgpt-auth";
import { llmSettings } from "@/lib/llm";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!config.mockLlm && (await llmSettings()).provider === "chatgpt") assertLocalRequest(request, true);
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await parseRfq(await readInput(request), { fresh }));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Room for the multipart envelope around a file at the upload limit. */
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

async function readInput(request: Request): Promise<RfqInput> {
  // Refuse before buffering the body; fromFile checks the file itself.
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new HttpError(413, "file_too_large", `Uploads are limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "missing_file", 'Expected a "file" field in the form data.');
    return fromFile(file.name, Buffer.from(await file.arrayBuffer()));
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown; filename?: unknown } | null;
  if (typeof body?.text !== "string") throw new HttpError(400, "missing_text", 'Send multipart "file" or JSON { "text": "..." }.');
  return fromText(body.text, typeof body.filename === "string" ? body.filename : undefined);
}
