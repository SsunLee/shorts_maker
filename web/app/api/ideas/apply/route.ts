import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendIdeaRowsToSheet } from "@/lib/ideas-sheet";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

const rowSchema = z.object({
  id: z.string().optional(),
  Status: z.string(),
  Keyword: z.string(),
  Subject: z.string(),
  Description: z.string(),
  Narration: z.string(),
  publish: z.string()
});

const schema = z.object({
  sheetName: z.string().optional(),
  idBase: z.string().optional(),
  items: z.array(rowSchema).min(1).max(10)
});

/** Apply generated ideas to current sheet as new rows. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = schema.parse(body);
    const result = await appendIdeaRowsToSheet({
      sheetName: payload.sheetName,
      idBase: payload.idBase,
      items: payload.items,
      userId
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply ideas to sheet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
