import { NextRequest, NextResponse } from "next/server";
import { listSheetContentRows } from "@/lib/sheet-content";

export const runtime = "nodejs";

/** Fetch content rows (subject/description/narration) from connected Google Sheets. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sheetName = request.nextUrl.searchParams.get("sheetName") || undefined;
    const rows = await listSheetContentRows(sheetName);
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
