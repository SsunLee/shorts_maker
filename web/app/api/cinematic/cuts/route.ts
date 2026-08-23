import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateCuts } from "@/lib/cinematic-ai";

export const runtime = "nodejs";
export const maxDuration = 180;

const payloadSchema = z.object({
  topic: z.string().trim().min(2),
  stylePresetId: z.string().trim().min(1),
  masterPrompt: z.string().trim().min(1),
  aspectRatio: z.enum(["9:16", "16:9"]),
  targetDurationSec: z.number().int().min(20).max(120),
  scriptBlocks: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string()
      })
    )
    .min(1)
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = payloadSchema.parse(await request.json());
    const cuts = await generateCuts({
      topic: body.topic,
      stylePresetId: body.stylePresetId,
      masterPrompt: body.masterPrompt,
      aspectRatio: body.aspectRatio,
      targetDurationSec: body.targetDurationSec,
      scriptBlocks: body.scriptBlocks as never,
      userId
    });
    return NextResponse.json({ cuts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "장면 분할에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
