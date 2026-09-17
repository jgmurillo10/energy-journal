import { NextResponse } from "next/server";
import { listAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ audit: await listAudit() });
}
