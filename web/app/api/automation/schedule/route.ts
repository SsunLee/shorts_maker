import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  disableAutomationSchedule,
  ensureAutomationSchedulerStarted,
  getAutomationScheduleState,
  updateAutomationScheduleConfig
} from "@/lib/automation-scheduler";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

const schema = z.object({
  enabled: z.boolean().optional(),
  cadence: z.enum(["interval_hours", "daily"]).optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
  dailyTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  itemsPerRun: z.number().int().min(1).max(20).optional(),
  sheetName: z.string().optional(),
  uploadMode: z.enum(["youtube", "pre_upload"]).optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
  templateMode: z.enum(["applied_template", "latest_workflow", "none"]).optional(),
  templateId: z.string().optional()
});

/** Get automation schedule config/state. */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAutomationSchedulerStarted(userId);
  const schedule = await getAutomationScheduleState(userId);
  return NextResponse.json({ schedule });
}

/** Create or update automation schedule config. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureAutomationSchedulerStarted(userId);
    const body = await request.json().catch(() => ({}));
    const payload = schema.parse(body || {});
    const schedule = await updateAutomationScheduleConfig(userId, payload);
    return NextResponse.json({ schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update schedule";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Disable automation schedule. */
export async function DELETE(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAutomationSchedulerStarted(userId);
  const schedule = await disableAutomationSchedule(userId);
  return NextResponse.json({ schedule });
}
