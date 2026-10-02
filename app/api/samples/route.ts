import { NextResponse } from "next/server";
import { listSamples } from "@/lib/samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ samples: await listSamples() });
}
