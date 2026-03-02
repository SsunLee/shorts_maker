import { NextResponse } from "next/server";
import { listRows } from "@/lib/repository";
import { listWorkflows } from "@/lib/workflow-store";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

/** Fetch all generated rows for dashboard polling. */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await listRows(userId);
  const workflows = await listWorkflows(userId);
  const workflowById = new Map(workflows.map((item) => [item.id, item]));
  const hydratedRows = rows.map((row) => {
    if (row.videoUrl) {
      return row;
    }
    const workflow = workflowById.get(row.id);
    const fallbackVideoUrl =
      workflow?.finalVideoUrl || workflow?.previewVideoUrl;
    if (!fallbackVideoUrl) {
      return row;
    }
    return {
      ...row,
      videoUrl: fallbackVideoUrl
    };
  });
  return NextResponse.json({ rows: hydratedRows });
}
