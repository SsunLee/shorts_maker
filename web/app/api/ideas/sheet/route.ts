import { NextRequest, NextResponse } from "next/server";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";

export const runtime = "nodejs";

/** Read sheet table headers + rows for idea planning page. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const requestedSheetName = String(request.nextUrl.searchParams.get("sheetName") || "").trim();
    const mode = String(request.nextUrl.searchParams.get("mode") || "").trim().toLowerCase();
    let sheetName = requestedSheetName || undefined;
    if (!sheetName && mode === "instagram") {
      const settings = await getSettings(userId);
      const instagramSheetName = String(settings.gsheetInstagramSheetName || "").trim();
      if (instagramSheetName) {
        sheetName = instagramSheetName;
      }
    }
    const table = await loadIdeasSheetTable(sheetName, userId);
    return NextResponse.json(table);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read sheet table";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
