import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { assembleCinematicShort } from "@/lib/cinematic-assembly";
import { CinematicCut } from "@/lib/cinematic-types";

export const runtime = "nodejs";
export const maxDuration = 300;

const takeSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  model: z.string(),
  status: z.enum(["queued", "in_progress", "completed", "failed"]),
  videoUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  credits: z.number().optional(),
  error: z.string().optional(),
  createdAt: z.string()
});

const cutSchema = z.object({
  id: z.string(),
  index: z.number().int(),
  narrationText: z.string(),
  screenNote: z.string().default(""),
  subject: z.string().default(""),
  action: z.string().default(""),
  camera: z.string().default(""),
  durationSec: z.number(),
  prompt: z.string().default(""),
  takes: z.array(takeSchema).default([]),
  selectedTakeId: z.string().optional()
});

const payloadSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().default(""),
  voice: z.string().trim().min(1),
  voiceSpeed: z.number().optional(),
  ttsProvider: z.enum(["openai", "elevenlabs"]).optional(),
  voiceStability: z.number().min(0).max(1).optional(),
  voiceSimilarityBoost: z.number().min(0).max(1).optional(),
  useSfx: z.boolean().optional(),
  cuts: z.array(cutSchema).min(1)
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const result = await assembleCinematicShort({
      projectId: body.projectId,
      title: body.title,
      cuts: body.cuts as CinematicCut[],
      voice: body.voice,
      voiceSpeed: body.voiceSpeed,
      ttsProvider: body.ttsProvider,
      voiceStability: body.voiceStability,
      voiceSimilarityBoost: body.voiceSimilarityBoost,
      useSfx: body.useSfx,
      userId
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "조립에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
