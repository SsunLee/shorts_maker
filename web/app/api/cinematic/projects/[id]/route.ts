import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  deleteCinematicProject,
  getCinematicProject,
  upsertCinematicProject
} from "@/lib/cinematic-project-store";
import { CinematicProject } from "@/lib/cinematic-types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const project = await getCinematicProject(id, userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const existing = await getCinematicProject(id, userId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const patch = (await request.json()) as Partial<CinematicProject>;
    const merged: CinematicProject = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    return NextResponse.json({ project: await upsertCinematicProject(merged, userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로젝트 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  await deleteCinematicProject(id, userId);
  return NextResponse.json({ ok: true });
}
