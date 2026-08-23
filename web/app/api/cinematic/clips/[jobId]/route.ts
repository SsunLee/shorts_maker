import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getHiggsfieldJob } from "@/lib/higgsfield-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { jobId } = await context.params;
    const job = await getHiggsfieldJob(jobId);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
