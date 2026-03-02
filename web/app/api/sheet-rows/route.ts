import { NextRequest, NextResponse } from "next/server";
import { listSheetContentRows } from "@/lib/sheet-content";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

/** Fetch content rows (subject/description/narration) from connected Google Sheets. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sheetName = request.nextUrl.searchParams.get("sheetName") || undefined;
    const rows = await listSheetContentRows(sheetName, userId);
    return NextResponse.json({
      rows,
      count: rows.length,
      readyOnly: true,
      sheetName: sheetName || process.env.GSHEETS_SHEET_NAME || "Shorts"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch sheet rows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
