import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateImages } from "@/lib/openai-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  prompt: z.string().trim().min(1, "프롬프트를 입력해 주세요."),
  stylePreset: z.string().optional(),
  canvasWidth: z.number().optional(),
  canvasHeight: z.number().optional()
});

function normalizeStylePreset(raw: string | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "Cinematic photo-real";
  if (value.toLowerCase() === "완전 실사 포토그래퍼") {
    return "Ultra photoreal photographer";
  }
  return value;
}

function resolveCompositionHint(canvasWidth?: number, canvasHeight?: number): string {
  const width = Number(canvasWidth) || 1080;
  const height = Number(canvasHeight) || 1350;
  if (width >= height) {
    return "Landscape composition with clean horizontal framing.";
  }
  return "Vertical composition optimized for mobile social feed.";
}

/** Generate one AI image and return the stored public URL. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const stylePreset = normalizeStylePreset(body.stylePreset);
    const composedPrompt =
      `${stylePreset}. ${body.prompt}. ${resolveCompositionHint(body.canvasWidth, body.canvasHeight)} ` +
      "High detail, clean lighting, no text, no watermark.";

    const imageAspectRatio =
      (Number(body.canvasWidth) || 1080) >= (Number(body.canvasHeight) || 1350) ? "16:9" : "9:16";
    const jobId = `instagram-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const urls = await generateImages(
      jobId,
      [composedPrompt],
      {
        startIndex: 0,
        imageAspectRatio
      },
      userId
    );
    const imageUrl = urls[0];
    if (!imageUrl) {
      throw new Error("이미지 생성 결과를 받지 못했습니다.");
    }

    return NextResponse.json({
      imageUrl,
      stylePreset,
      usedPrompt: composedPrompt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 생성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
