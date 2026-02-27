import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAutomationState,
  requestAutomationStop,
  startAutomationRun
} from "@/lib/automation-runner";
import { ensureAutomationSchedulerStarted } from "@/lib/automation-scheduler";

export const runtime = "nodejs";

const startSchema = z.object({
  sheetName: z.string().optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
  uploadMode: z.enum(["youtube", "pre_upload"]).optional(),
  templateMode: z.enum(["applied_template", "latest_workflow", "none"]).optional(),
  templateId: z.string().optional(),
  maxItems: z.number().int().min(1).max(1000).optional()
});

/** Get current automation run status. */
export async function GET(): Promise<NextResponse> {
  await ensureAutomationSchedulerStarted();
  return NextResponse.json({ state: getAutomationState() });
}

/** Start batch automation run (ready rows -> render -> upload loop). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = startSchema.parse(body || {});
    const state = startAutomationRun(payload);
    return NextResponse.json({ state }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start automation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Request stop for active automation run. */
export async function DELETE(): Promise<NextResponse> {
  const state = requestAutomationStop();
  return NextResponse.json({ state });
}
