import { NextResponse } from "next/server";
import { HttpError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { fromFile, fromText, type RfqInput } from "@/lib/input";
import { parseRfq } from "@/lib/parse";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    return NextResponse.json(await parseRfq(await readInput(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

async function readInput(request: Request): Promise<RfqInput> {
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
