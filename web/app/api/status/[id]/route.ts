import { NextResponse } from "next/server";
import { getRow } from "@/lib/repository";

export const runtime = "nodejs";

/** Return the current status snapshot for a specific generation ID. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const row = await getRow(id);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
