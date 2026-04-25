import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { runInstagramAutomationScheduleTick } from "@/lib/instagram-automation-scheduler";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedule = await runInstagramAutomationScheduleTick(userId, { force: true });
    return NextResponse.json({ schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run instagram schedule";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
