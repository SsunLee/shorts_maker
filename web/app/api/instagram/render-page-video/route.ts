import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { renderInstagramPageVideo } from "@/lib/instagram-render-page-video-service";

export const runtime = "nodejs";

const schema = z.object({
  templateName: z.string().optional(),
  pageName: z.string().optional(),
  imageDataUrl: z.string().min(1),
  useAudio: z.boolean().optional(),
  audioPrompt: z.string().optional(),
  ttsProvider: z.enum(["auto", "openai", "gemini"]).optional(),
  sampleData: z.record(z.string(), z.string()).optional(),
  audioVoice: z.string().optional(),
  audioSpeed: z.number().optional(),
  durationSec: z.number().optional(),
  outputWidth: z.number().optional(),
  outputHeight: z.number().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const payload = schema.parse(body);
    const result = await renderInstagramPageVideo({
      ...payload,
      userId
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "페이지 MP4 렌더링에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
