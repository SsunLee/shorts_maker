import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateTopicCandidates } from "@/lib/cinematic-ai";
import { listCinematicProjects } from "@/lib/cinematic-project-store";

export const runtime = "nodejs";
export const maxDuration = 120;

const payloadSchema = z.object({
  stylePresetId: z.string().trim().min(1),
  count: z.number().int().min(3).max(10).optional(),
  hint: z.string().trim().max(120).optional(),
  /** Topics already on screen, so a refresh returns different ones. */
  exclude: z.array(z.string()).max(60).optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    // Saved projects are excluded too, so suggestions never repeat past work.
    const existing = await listCinematicProjects(userId);
    const exclude = Array.from(
      new Set([...(body.exclude || []), ...existing.map((project) => project.topic)])
    ).filter(Boolean);

    const topics = await generateTopicCandidates({
      stylePresetId: body.stylePresetId,
      count: body.count,
      hint: body.hint,
      exclude,
      userId
    });
    return NextResponse.json({ topics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "주제 추천에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
