import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { toSignedStorageReadUrl } from "@/lib/object-storage";
import { muxVideoAudioWithEngine } from "@/lib/video-engine-service";

export const runtime = "nodejs";

const schema = z.object({
  templateName: z.string().optional(),
  pageName: z.string().optional(),
  videoUrl: z.string().min(1),
  audioUrl: z.string().min(1),
  bgmUrl: z.string().optional(),
  audioVolume: z.number().optional(),
  bgmVolume: z.number().optional(),
  mixWithVideoAudio: z.boolean().optional(),
  videoAudioVolume: z.number().optional(),
  durationSec: z.number().optional()
});

function sanitizeSlug(raw: string, fallback: string): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned || fallback;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = schema.parse(await request.json());
    const templateSlug = sanitizeSlug(payload.templateName || "", "instagram-template");
    const pageSlug = sanitizeSlug(payload.pageName || "", "page");
    const jobId = `${templateSlug}-${pageSlug}-mux-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const result = await muxVideoAudioWithEngine(
      {
        jobId,
        videoPath: payload.videoUrl,
        audioPath: payload.audioUrl,
        bgmPath: payload.bgmUrl,
        audioVolume: payload.audioVolume,
        bgmVolume: payload.bgmVolume,
        mixWithVideoAudio: payload.mixWithVideoAudio,
        videoAudioVolume: payload.videoAudioVolume,
        durationSec: payload.durationSec
      },
      userId
    );
    if (!result.outputUrl) {
      throw new Error("비디오/오디오 합성 결과 URL을 받지 못했습니다.");
    }
    return NextResponse.json({
      jobId,
      outputUrl: await toSignedStorageReadUrl(result.outputUrl, 60 * 60 * 6),
      ffmpegSteps: result.ffmpegSteps || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비디오/오디오 합성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
