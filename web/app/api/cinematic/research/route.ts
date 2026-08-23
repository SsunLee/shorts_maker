import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { researchTopic } from "@/lib/cinematic-research";

export const runtime = "nodejs";
export const maxDuration = 180;

const payloadSchema = z.object({
  topic: z.string().trim().min(2, "주제를 입력해주세요."),
  stylePresetId: z.string().trim().min(1)
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = payloadSchema.parse(await request.json());
    const research = await researchTopic({ ...body, userId });
    return NextResponse.json({ research });
  } catch (error) {
    const message = error instanceof Error ? error.message : "자료 조사에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
