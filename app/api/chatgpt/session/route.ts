import { NextResponse } from "next/server";
import { assertLocalRequest, chatgptStatus, disconnectChatgpt, selectChatgptAccount } from "@/lib/chatgpt-auth";
import { HttpError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    return NextResponse.json(await chatgptStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    assertLocalRequest(request, true);
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== "string") throw new HttpError(400, "chatgpt_account", "Choose a ChatGPT connection.");
    await selectChatgptAccount(body.id);
    return NextResponse.json(await chatgptStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertLocalRequest(request, true);
    return NextResponse.json(await disconnectChatgpt(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
