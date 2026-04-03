import { NextRequest, NextResponse } from "next/server";
import { runDueAutomationSchedules } from "@/lib/automation-scheduler";
import { runDueInstagramAutomationSchedules } from "@/lib/instagram-automation-scheduler";

export const runtime = "nodejs";
// Keep cron invocation alive while the due automation run finishes.
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = request.headers.get("authorization") || "";
  const vercelCronHeader = request.headers.get("x-vercel-cron") || "";

  if (secret && authHeader === `Bearer ${secret}`) {
    return true;
  }

  // Fallback for Vercel cron requests when authorization header is unavailable.
  if (process.env.VERCEL === "1" && vercelCronHeader === "1") {
    return true;
  }

  return false;
}

/** Vercel Cron entrypoint: executes due automation schedules for all enabled users. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("[cron.automation] tick", {
    path: request.nextUrl.pathname,
    force: request.nextUrl.searchParams.get("force") === "1",
    hasAuthHeader: Boolean(request.headers.get("authorization")),
    vercelCronHeader: request.headers.get("x-vercel-cron") || "",
    now: new Date().toISOString()
  });

  if (!isAuthorizedCronRequest(request)) {
    console.warn("[cron.automation] unauthorized");
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const youtubeResult = await runDueAutomationSchedules({
    force,
    waitForCompletion: true
  });
  const instagramResult = await runDueInstagramAutomationSchedules({
    force
  });
  const result = {
    youtube: youtubeResult,
    instagram: instagramResult
  };
  console.log("[cron.automation] result", result);
  return NextResponse.json({
    ok: true,
    force,
    ...result
  });
}
