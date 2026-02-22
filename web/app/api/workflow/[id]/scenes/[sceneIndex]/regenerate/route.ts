import { NextResponse } from "next/server";
import { regenerateWorkflowSceneImage } from "@/lib/staged-workflow";

export const runtime = "nodejs";

/** Re-generate one scene image during assets review. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; sceneIndex: string }> }
): Promise<NextResponse> {
  try {
    const { id, sceneIndex } = await context.params;
    const parsedSceneIndex = Number.parseInt(sceneIndex, 10);
    if (!Number.isFinite(parsedSceneIndex) || parsedSceneIndex < 1) {
      return NextResponse.json({ error: "Invalid scene index." }, { status: 400 });
    }

    const workflow = await regenerateWorkflowSceneImage(id, parsedSceneIndex);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to re-generate scene image";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
