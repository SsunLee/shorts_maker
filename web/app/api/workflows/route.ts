import { NextRequest, NextResponse } from "next/server";
import { listWorkflows } from "@/lib/workflow-store";

export const runtime = "nodejs";

/** List workflows. Use `?activeOnly=1` to exclude final-ready items. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "1";
    const items = await listWorkflows();
    const workflows = activeOnly
      ? items.filter((item) => item.stage !== "final_ready")
      : items;

    return NextResponse.json({ workflows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list workflows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
