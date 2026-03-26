import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAutomationState,
  requestAutomationStop,
  startAutomationRun,
  waitForAutomationRunCompletion
} from "@/lib/automation-runner";
import { ensureAutomationSchedulerStarted } from "@/lib/automation-scheduler";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 300;

const startSchema = z.object({
  sheetName: z.string().optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
  uploadMode: z.enum(["youtube", "pre_upload"]).optional(),
  templateMode: z.enum(["applied_template", "latest_workflow", "none"]).optional(),
  templateId: z.string().optional(),
  maxItems: z.number().int().min(1).max(1000).optional(),
  autoIdeaEnabled: z.boolean().optional(),
  autoIdeaTopic: z.string().optional(),
  autoIdeaLanguage: z.enum(["ko", "en", "ja", "es", "hi"]).optional(),
  autoIdeaIdBase: z.string().optional()
});

/** Get current automation run status. */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAutomationSchedulerStarted(userId);
  return NextResponse.json({ state: getAutomationState(userId) });
}

/** Start batch automation run (ready rows -> render -> upload loop). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const payload = startSchema.parse(body || {});
    const state = startAutomationRun(userId, payload);

    // Serverless runtimes cannot safely keep background loops alive after response is sent.
    // Continue the run after the response so the browser is not blocked until render/upload finishes.
    const isServerless = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless) {
      after(async () => {
        try {
          await waitForAutomationRunCompletion(userId);
        } catch (error) {
          console.error("[api.automation] background run failed", {
            userId,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      });
      return NextResponse.json({ state }, { status: 202 });
    }

    return NextResponse.json({ state }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start automation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Request stop for active automation run. */
export async function DELETE(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = requestAutomationStop(userId);
  return NextResponse.json({ state });
}
