import { NextRequest, NextResponse } from "next/server";
import { listRows } from "@/lib/repository";
import { listWorkflows } from "@/lib/workflow-store";
import { progressFromStatus } from "@/lib/status";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

/** Fetch all generated rows for dashboard polling. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withWorkflowHydration = request.nextUrl.searchParams.get("withWorkflow") === "1";
  const rows = await listRows(userId);
  if (!withWorkflowHydration) {
    return NextResponse.json({ rows });
  }

  const workflows = await listWorkflows(userId);
  const workflowById = new Map(workflows.map((item) => [item.id, item]));
  const hydratedRows = rows.map((row) => {
    const workflow = workflowById.get(row.id);
    const fallbackVideoUrl =
      workflow?.finalVideoUrl || workflow?.previewVideoUrl;

    let next = row;

    if (!next.videoUrl && fallbackVideoUrl) {
      next = {
        ...next,
        videoUrl: fallbackVideoUrl
      };
    }

    // Reconcile stale dashboard status when workflow is already finalized.
    if (next.youtubeUrl && next.status !== "uploaded") {
      next = {
        ...next,
        status: "uploaded",
        progress: progressFromStatus("uploaded")
      };
    } else if (
      workflow?.stage === "final_ready" &&
      next.status !== "uploaded" &&
      next.status !== "uploading" &&
      next.status !== "failed"
    ) {
      next = {
        ...next,
        status: "ready",
        progress: progressFromStatus("ready")
      };
    }

    return next;
  });
  return NextResponse.json({ rows: hydratedRows });
}
