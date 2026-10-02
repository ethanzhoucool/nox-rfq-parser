import { NextResponse } from "next/server";
import { readSample } from "@/lib/samples";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const sample = await readSample(name);
  if (!sample) return NextResponse.json({ error: { code: "not_found", message: `No sample named ${name}.` } }, { status: 404 });

  return new NextResponse(new Uint8Array(sample.bytes), {
    headers: { "content-type": sample.contentType, "content-disposition": `inline; filename="${encodeURIComponent(name)}"` },
  });
}
