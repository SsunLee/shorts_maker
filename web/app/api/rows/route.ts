import { NextResponse } from "next/server";
import { listRows } from "@/lib/repository";
import { listWorkflows } from "@/lib/workflow-store";

export const runtime = "nodejs";

/** Fetch all generated rows for dashboard polling. */
export async function GET(): Promise<NextResponse> {
  const rows = await listRows();
  const workflows = await listWorkflows();
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
