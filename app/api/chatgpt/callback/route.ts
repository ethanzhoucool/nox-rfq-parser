import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, assertLocalRequest, finishChatgptLogin } from "@/lib/chatgpt-auth";
import { toHttpError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let url: URL;
  try { url = assertLocalRequest(request); } catch (error) { return errorResponse(error); }
  const destination = new URL("/", url.origin);
  try {
    await finishChatgptLogin(url, request.cookies.get(AUTH_COOKIE)?.value);
    destination.searchParams.set("chatgpt", "connected");
  } catch (error) {
    destination.searchParams.set("chatgpt_error", toHttpError(error).message);
  }
  const response = NextResponse.redirect(destination, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  response.cookies.set(AUTH_COOKIE, "", { path: "/api/chatgpt", maxAge: 0 });
  return response;
}
