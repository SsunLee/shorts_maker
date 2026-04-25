import { NextResponse } from "next/server";
import { runNextWorkflowStage } from "@/lib/staged-workflow";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { withReadableWorkflowMediaUrls } from "@/lib/workflow-media-url";

export const runtime = "nodejs";

/** Run exactly one next step in staged workflow. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const workflow = await runNextWorkflowStage(id, userId);
    const hydrated = await withReadableWorkflowMediaUrls(workflow);
    return NextResponse.json(hydrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run next stage";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
