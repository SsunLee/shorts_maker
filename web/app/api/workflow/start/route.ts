import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startStagedWorkflow } from "@/lib/staged-workflow";

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

/** Start staged workflow and return scene-split review data. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const workflow = await startStagedWorkflow(payload);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start workflow";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
