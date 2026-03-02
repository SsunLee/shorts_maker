import { NextRequest, NextResponse } from "next/server";
import { runDueAutomationSchedules } from "@/lib/automation-scheduler";

export const runtime = "nodejs";

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${secret}`;
}

/** Vercel Cron entrypoint: executes due automation schedules for all enabled users. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const result = await runDueAutomationSchedules({ force });
  return NextResponse.json({
    ok: true,
    force,
    ...result
  });
}

