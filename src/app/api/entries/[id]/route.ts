import { NextResponse } from "next/server";
import { deleteEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  await deleteEntry(numericId);
  return NextResponse.json({ ok: true });
}
