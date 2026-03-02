import { NextRequest, NextResponse } from "next/server";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

/** Read sheet table headers + rows for idea planning page. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sheetName = request.nextUrl.searchParams.get("sheetName") || undefined;
    const table = await loadIdeasSheetTable(sheetName, userId);
    return NextResponse.json(table);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read sheet table";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
