import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { createMetaOAuthStartUrl } from "@/lib/meta-oauth-flow";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const returnTo = String(request.nextUrl.searchParams.get("return_to") || "").trim() || undefined;
    const url = await createMetaOAuthStartUrl({
      userId,
      origin: request.nextUrl.origin,
      returnTo
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta OAuth 시작에 실패했습니다." },
      { status: 400 }
    );
  }
}
