import { NextRequest, NextResponse } from "next/server";
import { listWorkflows } from "@/lib/workflow-store";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { withReadableWorkflowMediaUrls } from "@/lib/workflow-media-url";

export const runtime = "nodejs";

/** List workflows. Use `?activeOnly=1` to exclude final-ready items. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "1";
    const items = await listWorkflows(userId);
    const workflows = activeOnly
      ? items.filter((item) => item.stage !== "final_ready")
      : items;
    const hydrated = await Promise.all(workflows.map((item) => withReadableWorkflowMediaUrls(item)));

    return NextResponse.json({ workflows: hydrated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list workflows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
