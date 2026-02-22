import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enqueueGeneration } from "@/lib/generation-worker";

export const runtime = "nodejs";

const requestSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  topic: z.string().optional(),
  narration: z.string().optional(),
  imageStyle: z.string().min(1),
  imageAspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  voice: z.string().min(1),
  voiceSpeed: z.number().min(0.5).max(2).default(1),
  useSfx: z.boolean().default(false),
  videoLengthSec: z.number().int().min(10).max(180),
  sceneCount: z.number().int().min(3).max(12).default(5),
  tags: z.array(z.string()).optional()
});

/** Start a background generation job and return its ID for polling. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const id = await enqueueGeneration(payload);
    return NextResponse.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
