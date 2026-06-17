import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { runAutomationScheduleTick } from "@/lib/automation-scheduler";

export const runtime = "nodejs";
// Hobby plan cap. Longer scheduled work should be split or delegated.
export const maxDuration = 300;

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
