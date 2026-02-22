import { NextResponse } from "next/server";
import { runNextWorkflowStage } from "@/lib/staged-workflow";

export const runtime = "nodejs";

/** Run exactly one next step in staged workflow. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const workflow = await runNextWorkflowStage(id);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run next stage";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
