import { NextResponse } from "next/server";
import { listAudit } from "@/lib/db";
import { currentOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET() {
  const { key } = await currentOwner();
  return NextResponse.json({ audit: await listAudit(key) });
}
