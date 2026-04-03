import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";
import { appendInstagramIdeasToSheet } from "@/lib/instagram-sheet";

export const runtime = "nodejs";

const schema = z.object({
  sheetName: z.string().optional(),
  items: z.array(z.record(z.string(), z.string())).min(1).max(50)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const payload = schema.parse(body);
    const settings = await getSettings(userId);
    const resolvedSheetName =
      String(payload.sheetName || "").trim() ||
      String(settings.gsheetInstagramSheetName || "").trim() ||
      undefined;

    const appended = await appendInstagramIdeasToSheet({
      sheetName: resolvedSheetName,
      items: payload.items,
      userId
    });

    return NextResponse.json({
      inserted: appended.inserted,
      sheetName: appended.sheetName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "시트 반영에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
