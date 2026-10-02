import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getRfq } from "@/lib/nox";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getRfq(id));
  } catch (error) {
    return errorResponse(error);
  }
}
