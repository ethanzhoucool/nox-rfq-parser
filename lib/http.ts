import { NextResponse } from "next/server";
import { toHttpError } from "./errors";

export type ApiErrorBody = { error: { code: string; message: string } };

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const { status, code, message } = toHttpError(error);
  if (status >= 500) console.error(error);
  return NextResponse.json({ error: { code, message } }, { status });
}
