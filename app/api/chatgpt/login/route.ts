import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_TTL_SECONDS, assertLocalRequest, startChatgptLogin } from "@/lib/chatgpt-auth";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = assertLocalRequest(request);
    // Canonicalize before setting the transaction cookie; localhost cookies won't reach 127.0.0.1.
    if (url.hostname !== "127.0.0.1") {
      url.hostname = "127.0.0.1";
      return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
    }
    const callback = new URL("/api/chatgpt/callback", url.origin);
    const login = await startChatgptLogin(callback.toString(), url.searchParams.get("account") || undefined);
    const response = NextResponse.redirect(login.url, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    response.cookies.set(AUTH_COOKIE, login.browserId, { httpOnly: true, sameSite: "lax", path: "/api/chatgpt", maxAge: AUTH_TTL_SECONDS });
    return response;
  } catch (error) { return errorResponse(error); }
}
