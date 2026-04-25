import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  disableInstagramAutomationSchedule,
  getInstagramAutomationScheduleState,
  updateInstagramAutomationScheduleConfig
} from "@/lib/instagram-automation-scheduler";

export const runtime = "nodejs";

const schema = z.object({
  enabled: z.boolean().optional(),
  cadence: z.enum(["daily", "interval_hours"]).optional(),
  dailyTime: z.string().optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
  timeZone: z.string().optional(),
  itemsPerRun: z.number().int().min(1).max(10).optional(),
  sheetName: z.string().optional(),
  autoIdeaEnabled: z.boolean().optional(),
  autoIdeaKeywords: z.string().optional(),
  autoIdeaLanguage: z.enum(["ko", "en", "ja", "es", "hi"]).optional(),
  autoUploadEnabled: z.boolean().optional()
});

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const schedule = await getInstagramAutomationScheduleState(userId);
  return NextResponse.json({ schedule });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const schedule = await updateInstagramAutomationScheduleConfig(userId, payload);
    return NextResponse.json({ schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update instagram schedule";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const schedule = await disableInstagramAutomationSchedule(userId);
  return NextResponse.json({ schedule });
}
