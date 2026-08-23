import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateVideoMetadata } from "@/lib/cinematic-ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const payloadSchema = z.object({
  topic: z.string().trim().min(2),
  hook: z.object({
    id: z.string(),
    hook: z.string(),
    commonBelief: z.string().default(""),
    reality: z.string().default("")
  }),
  scriptBlocks: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
  research: z.any().optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = payloadSchema.parse(await request.json());
    const metadata = await generateVideoMetadata({ ...body, userId });
    return NextResponse.json(metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : "메타데이터 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
