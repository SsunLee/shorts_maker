import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateScriptBlocks } from "@/lib/cinematic-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const payloadSchema = z.object({
  topic: z.string().trim().min(2),
  stylePresetId: z.string().trim().min(1),
  scriptTemplateId: z.string().trim().min(1),
  targetDurationSec: z.number().int().min(20).max(120),
  research: z.any().optional(),
  hook: z.object({
    id: z.string(),
    hook: z.string().trim().min(1),
    commonBelief: z.string().default(""),
    reality: z.string().default("")
  })
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = payloadSchema.parse(await request.json());
    const blocks = await generateScriptBlocks({ ...body, userId });
    return NextResponse.json({ blocks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "대본 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
