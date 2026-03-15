import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { createGoogleOAuthStartUrl, normalizeGoogleOAuthScope } from "@/lib/google-oauth-flow";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = normalizeGoogleOAuthScope(request.nextUrl.searchParams.get("scope"));
    const url = await createGoogleOAuthStartUrl({
      userId,
      scope,
      origin: request.nextUrl.origin
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google OAuth 시작에 실패했습니다." },
      { status: 400 }
    );
  }
}
