import { NextResponse } from "next/server";
import { z } from "zod";
import { regenerateWorkflowSceneImage } from "@/lib/staged-workflow";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { withReadableWorkflowMediaUrls } from "@/lib/workflow-media-url";

export const runtime = "nodejs";

const payloadSchema = z
  .object({
    imagePrompt: z.string().trim().min(1).max(2000).optional()
  })
  .optional();

/** Re-generate one scene image during assets review. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sceneIndex: string }> }
): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, sceneIndex } = await context.params;
    const parsedSceneIndex = Number.parseInt(sceneIndex, 10);
    if (!Number.isFinite(parsedSceneIndex) || parsedSceneIndex < 1) {
      return NextResponse.json({ error: "Invalid scene index." }, { status: 400 });
    }
    const body = await request.json().catch(() => undefined);
    const payload = payloadSchema.parse(body);

    const workflow = await regenerateWorkflowSceneImage(
      id,
      parsedSceneIndex,
      payload?.imagePrompt,
      userId
    );
    const hydrated = await withReadableWorkflowMediaUrls(workflow);
    return NextResponse.json(hydrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to re-generate scene image";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
