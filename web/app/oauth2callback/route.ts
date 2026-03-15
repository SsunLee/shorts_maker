import { NextRequest, NextResponse } from "next/server";
import { completeGoogleOAuth } from "@/lib/google-oauth-flow";

export const runtime = "nodejs";

function buildSettingsRedirect(request: NextRequest, ok: boolean, message?: string): URL {
  const url = new URL("/settings", request.nextUrl.origin);
  url.searchParams.set("google_oauth", ok ? "success" : "error");
  if (message) {
    url.searchParams.set("google_oauth_message", message);
  }
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = String(request.nextUrl.searchParams.get("code") || "").trim();
  const state = String(request.nextUrl.searchParams.get("state") || "").trim();
  const oauthError = String(request.nextUrl.searchParams.get("error") || "").trim();

  if (oauthError) {
    return NextResponse.redirect(
      buildSettingsRedirect(request, false, `Google OAuth 오류: ${oauthError}`)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildSettingsRedirect(request, false, "Google OAuth 응답에 code/state가 없습니다.")
    );
  }

  try {
    await completeGoogleOAuth({
      code,
      state,
      origin: request.nextUrl.origin
    });
    return NextResponse.redirect(
      buildSettingsRedirect(
        request,
        true,
        "Google 연동이 완료되었습니다. YouTube/Sheets에 동일 토큰이 적용됩니다."
      )
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google OAuth callback 처리에 실패했습니다.";
    return NextResponse.redirect(buildSettingsRedirect(request, false, message));
  }
}
