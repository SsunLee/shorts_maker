import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRow, upsertRow } from "@/lib/repository";
import { getWorkflow } from "@/lib/workflow-store";
import { uploadVideoToYoutube } from "@/lib/youtube-service";

export const runtime = "nodejs";

const schema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  videoUrl: z.string().optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional()
});

/** Upload a completed video to YouTube using OAuth credentials. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const row = payload.id ? await getRow(payload.id) : undefined;
    const workflow = payload.id ? await getWorkflow(payload.id) : undefined;

    const title = payload.title || row?.title || workflow?.input.title;
    const videoUrl =
      payload.videoUrl ||
      row?.videoUrl ||
      workflow?.finalVideoUrl ||
      workflow?.previewVideoUrl;
    if (!title || !videoUrl) {
      return NextResponse.json(
        { error: "title and videoUrl are required" },
        { status: 400 }
      );
    }

    if (row?.id) {
      await upsertRow({
        id: row.id,
        status: "uploading",
        videoUrl: row.videoUrl || videoUrl
      });
    }

    const youtubeUrl = await uploadVideoToYoutube({
      title,
      description: payload.description,
      tags: payload.tags ?? row?.tags,
      videoUrl,
      privacyStatus: payload.privacyStatus
    });

    if (row?.id) {
      await upsertRow({
        id: row.id,
        youtubeUrl,
        status: "uploaded"
      });
    }

    return NextResponse.json({ youtubeUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
