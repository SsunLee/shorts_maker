import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  DEFAULT_INSTAGRAM_AI_VIDEO_PROMPT,
  estimateInstagramAiVideoCost,
  generateImageToVideoWithOpenAi,
  generateImageToVideoWithVeoLite
} from "@/lib/openai-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const payloadSchema = z.object({
  imageUrl: z.string().trim().min(1, "영상화할 이미지가 없습니다."),
  prompt: z.string().optional(),
  dialogue: z.string().optional(),
  provider: z.enum(["gemini", "openai"]).optional(),
  durationSec: z.number().optional(),
  resolution: z.enum(["720p", "1080p"]).optional(),
  aspectRatio: z.enum(["9:16", "16:9"]).optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const cost = estimateInstagramAiVideoCost({
      durationSec: body.durationSec,
      resolution: body.resolution,
      provider: body.provider
    });
    const jobId = `instagram-ai-video-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const result =
      body.provider === "openai"
        ? await generateImageToVideoWithOpenAi({
            jobId,
            imageUrl: body.imageUrl,
            prompt: String(body.prompt || DEFAULT_INSTAGRAM_AI_VIDEO_PROMPT),
            dialogue: String(body.dialogue || ""),
            durationSec: cost.durationSec,
            aspectRatio: body.aspectRatio || "9:16",
            userId
          })
        : await generateImageToVideoWithVeoLite({
            jobId,
            imageUrl: body.imageUrl,
            prompt: String(body.prompt || DEFAULT_INSTAGRAM_AI_VIDEO_PROMPT),
            dialogue: String(body.dialogue || ""),
            durationSec: cost.durationSec,
            resolution: cost.resolution,
            aspectRatio: body.aspectRatio || "9:16",
            userId
          });

    return NextResponse.json({
      videoUrl: result.publicUrl,
      provider: result.provider || body.provider || "gemini",
      model: result.model,
      durationSec: result.durationSec,
      resolution: result.resolution,
      estimatedCostUsd: result.estimatedCostUsd,
      usedPrompt: result.usedPrompt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 영상화에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
