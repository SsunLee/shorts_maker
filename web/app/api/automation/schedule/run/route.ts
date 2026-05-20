import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { runAutomationScheduleTick } from "@/lib/automation-scheduler";

export const runtime = "nodejs";
// A scheduled YouTube automation run can include idea generation, 10 images, rendering, and upload.
export const maxDuration = 800;

export async function POST(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedule = await runAutomationScheduleTick(userId, {
      force: true,
      waitForCompletion: true
    });
    return NextResponse.json({ schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run automation schedule";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
