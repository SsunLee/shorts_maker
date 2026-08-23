import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { estimateSfxCostUsd, generateSoundEffect } from "@/lib/elevenlabs-service";

export const runtime = "nodejs";
export const maxDuration = 120;

const payloadSchema = z.object({
  projectId: z.string().trim().min(1),
  cutId: z.string().trim().min(1),
  prompt: z.string().trim().min(3, "효과음 설명이 너무 짧습니다."),
  durationSec: z.number().min(0.5).max(30),
  promptInfluence: z.number().min(0).max(1).optional(),
  /** Return only the price without generating. */
  dryRun: z.boolean().optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    if (body.dryRun) {
      return NextResponse.json({ estimatedCostUsd: estimateSfxCostUsd(body.durationSec) });
    }

    const result = await generateSoundEffect({
      jobId: `cinematic-sfx-${body.projectId}`,
      fileName: `cut-${body.cutId}-${Date.now()}.mp3`,
      prompt: body.prompt,
      durationSec: body.durationSec,
      promptInfluence: body.promptInfluence,
      userId
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "효과음 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
