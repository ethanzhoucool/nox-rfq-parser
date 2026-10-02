import { NextResponse } from "next/server";
import { HttpError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { submitRfq } from "@/lib/nox";
import type { CreateRfqDto } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { payload?: CreateRfqDto; live?: unknown } | null;
    const payload = body?.payload;
    if (!payload || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new HttpError(400, "invalid_payload", "Payload must include at least one line.");
    }
    return NextResponse.json(await submitRfq(payload, { live: body.live === true }));
  } catch (error) {
    return errorResponse(error);
  }
}
