import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRow, upsertRow } from "@/lib/repository";
import { getWorkflow } from "@/lib/workflow-store";
import { uploadVideoToYoutube } from "@/lib/youtube-service";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { appendAutomationLog, markAutomationYoutubeUploadComplete } from "@/lib/automation-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  videoUrl: z.string().optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
  userId: z.string().optional(),
  defer: z.boolean().optional()
});

function resolveInternalApiSecret(): string {
  return String(
    process.env.AUTOMATION_INTERNAL_SECRET ||
      process.env.CRON_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      process.env.AUTH_SECRET ||
      ""
  ).trim();
}

function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const secret = resolveInternalApiSecret();
  if (!secret) {
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function performYoutubeUpload(args: {
  payload: z.infer<typeof schema>;
  userId: string;
}): Promise<string> {
  const row = args.payload.id ? await getRow(args.payload.id, args.userId) : undefined;
  const workflow = args.payload.id ? await getWorkflow(args.payload.id, args.userId) : undefined;

  const title = args.payload.title || row?.title || workflow?.input.title;
  const videoUrl =
    args.payload.videoUrl ||
    row?.videoUrl ||
    workflow?.finalVideoUrl ||
    workflow?.previewVideoUrl;
  if (!title || !videoUrl) {
    throw new Error("title and videoUrl are required");
  }

  if (row?.id) {
    await upsertRow({
      id: row.id,
      status: "uploading",
      videoUrl: row.videoUrl || videoUrl
    }, args.userId);
  }
  appendAutomationLog(
    args.userId,
    "info",
    `[${args.payload.id || row?.id || "unknown"}] YouTube 업로드 시작 (${args.payload.defer ? "스케줄/백그라운드" : "즉시 실행"})`
  );

  const requestId = crypto.randomUUID();
  const youtubeUrl = await uploadVideoToYoutube({
    title,
    description: args.payload.description,
    tags: args.payload.tags ?? row?.tags,
    videoUrl,
    privacyStatus: args.payload.privacyStatus,
    trace: {
      source: args.payload.defer ? "api.upload-youtube.defer" : "api.upload-youtube",
      requestPath: "/api/upload-youtube",
      requestId,
      userId: args.userId,
      rowId: row?.id || args.payload.id,
      workflowId: workflow?.id || args.payload.id
    }
  });

  if (row?.id) {
    await upsertRow({
      id: row.id,
      youtubeUrl,
      status: "uploaded"
    }, args.userId);
  }
  appendAutomationLog(
    args.userId,
    "info",
    `[${args.payload.id || row?.id || "unknown"}] YouTube 업로드 완료: ${youtubeUrl}`
  );
  if (args.payload.defer) {
    await markAutomationYoutubeUploadComplete({
      userId: args.userId,
      rowId: args.payload.id || row?.id,
      youtubeUrl
    }).catch((error) => {
      console.error("[upload-youtube.defer] failed to reconcile automation state", {
        userId: args.userId,
        id: args.payload.id || row?.id,
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return youtubeUrl;
}

/** Upload a completed video to YouTube using OAuth credentials. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = schema.parse(body);
    const internalRequest = isAuthorizedInternalRequest(request);
    const userId =
      internalRequest && payload.userId?.trim()
        ? payload.userId.trim()
        : await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (payload.defer) {
      if (!internalRequest) {
        return NextResponse.json({ error: "Unauthorized deferred upload request." }, { status: 401 });
      }
      after(async () => {
        try {
          appendAutomationLog(userId, "info", `[${payload.id || "unknown"}] YouTube 백그라운드 업로드 실행`);
          await performYoutubeUpload({ payload, userId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          appendAutomationLog(userId, "error", `[${payload.id || "unknown"}] YouTube 업로드 실패: ${message}`);
          console.error("[upload-youtube.defer] failed", {
            userId,
            id: payload.id,
            message
          });
          if (payload.id) {
            await upsertRow({
              id: payload.id,
              status: "failed",
              error: message
            }, userId).catch(() => undefined);
          }
        }
      });
      return NextResponse.json({ queued: true }, { status: 202 });
    }

    const youtubeUrl = await performYoutubeUpload({ payload, userId });
    return NextResponse.json({ youtubeUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
