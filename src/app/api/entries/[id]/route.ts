import { NextResponse } from "next/server";
import { deleteEntry } from "@/lib/db";
import { currentOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const { key } = await currentOwner();
  await deleteEntry(key, numericId);
  return NextResponse.json({ ok: true });
}
