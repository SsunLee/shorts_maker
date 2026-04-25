import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { uploadInstagramFeedToMeta } from "@/lib/instagram-meta-upload-service";

export const runtime = "nodejs";

const schema = z.object({
  caption: z.string().optional(),
  mediaUrls: z.array(z.string()).min(1).max(10),
  rowId: z.string().optional(),
  sheetName: z.string().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const result = await uploadInstagramFeedToMeta({
      userId,
      caption: payload.caption,
      mediaUrls: payload.mediaUrls,
      rowId: payload.rowId,
      sheetName: payload.sheetName,
      requestOrigin: request.nextUrl.origin
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((item) => item.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Meta 업로드에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
