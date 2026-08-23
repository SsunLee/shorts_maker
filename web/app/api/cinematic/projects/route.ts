import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { listCinematicProjects, upsertCinematicProject } from "@/lib/cinematic-project-store";
import { CinematicProject } from "@/lib/cinematic-types";
import { DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID } from "@/lib/cinematic-script-templates";
import {
  DEFAULT_CINEMATIC_STYLE_PRESET_ID,
  findCinematicStylePreset
} from "@/lib/cinematic-style-presets";

export const runtime = "nodejs";
export const maxDuration = 60;

const createSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요."),
  topic: z.string().trim().min(2, "주제를 입력해주세요."),
  stylePresetId: z.string().trim().default(DEFAULT_CINEMATIC_STYLE_PRESET_ID),
  scriptTemplateId: z.string().trim().default(DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID),
  aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  model: z.string().trim().default("veo3_1_lite"),
  resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
  targetDurationSec: z.number().int().min(20).max(120).default(50)
});

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ projects: await listCinematicProjects(userId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = createSchema.parse(await request.json());
    const preset = findCinematicStylePreset(body.stylePresetId);
    const now = new Date().toISOString();
    const project: CinematicProject = {
      id: randomUUID(),
      title: body.title,
      topic: body.topic,
      stylePresetId: preset.id,
      scriptTemplateId: body.scriptTemplateId,
      masterPrompt: preset.masterPrompt,
      aspectRatio: body.aspectRatio,
      model: body.model,
      resolution: body.resolution,
      targetDurationSec: body.targetDurationSec,
      hookCandidates: [],
      scriptBlocks: [],
      cuts: [],
      createdAt: now,
      updatedAt: now
    };
    return NextResponse.json({ project: await upsertCinematicProject(project, userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
