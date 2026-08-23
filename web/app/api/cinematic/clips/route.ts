import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  buildCutJobParams,
  createHiggsfieldJob,
  estimateHiggsfieldCost
} from "@/lib/higgsfield-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const payloadSchema = z.object({
  prompt: z.string().trim().min(10, "프롬프트가 너무 짧습니다."),
  model: z.string().trim().min(1),
  durationSec: z.number().int().min(2).max(10),
  aspectRatio: z.enum(["9:16", "16:9"]),
  resolution: z.enum(["480p", "720p", "1080p"]),
  startImage: z.string().trim().optional(),
  /** Estimate credits without spending them. */
  dryRun: z.boolean().optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const params = buildCutJobParams({
      prompt: body.prompt,
      durationSec: body.durationSec,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      startImage: body.startImage
    });

    if (body.dryRun) {
      const credits = await estimateHiggsfieldCost({ jobType: body.model, params });
      return NextResponse.json({ credits });
    }

    const credits = await estimateHiggsfieldCost({ jobType: body.model, params }).catch(() => null);
    const jobIds = await createHiggsfieldJob({ jobType: body.model, params });
    return NextResponse.json({ jobId: jobIds[0], jobIds, credits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "컷 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
