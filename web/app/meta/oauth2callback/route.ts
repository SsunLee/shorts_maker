import { NextRequest, NextResponse } from "next/server";
import { completeMetaOAuth } from "@/lib/meta-oauth-flow";

export const runtime = "nodejs";

function safeRedirectPath(input: string | undefined): string {
  const value = String(input || "").trim();
  if (!value || !value.startsWith("/")) {
    return "/settings";
  }
  if (value.startsWith("//") || value.startsWith("/api/")) {
    return "/settings";
  }
  return value;
}

function buildRedirect(args: {
  request: NextRequest;
  ok: boolean;
  message?: string;
  returnTo?: string;
}): URL {
  const targetPath = safeRedirectPath(args.returnTo);
  const url = new URL(targetPath, args.request.nextUrl.origin);
  url.searchParams.set("meta_oauth", args.ok ? "success" : "error");
  if (args.message) {
    url.searchParams.set("meta_oauth_message", args.message);
  }
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = String(request.nextUrl.searchParams.get("code") || "").trim();
  const state = String(request.nextUrl.searchParams.get("state") || "").trim();
  const oauthError = String(request.nextUrl.searchParams.get("error") || "").trim();
  const oauthErrorDescription = String(request.nextUrl.searchParams.get("error_description") || "").trim();

  if (oauthError) {
    const message = oauthErrorDescription
      ? `Meta OAuth 오류: ${oauthError} (${oauthErrorDescription})`
      : `Meta OAuth 오류: ${oauthError}`;
    return NextResponse.redirect(
      buildRedirect({
        request,
        ok: false,
        message
      })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      buildRedirect({
        request,
        ok: false,
        message: "Meta OAuth 응답에 code/state가 없습니다."
      })
    );
  }

  try {
    const result = await completeMetaOAuth({
      code,
      state,
      origin: request.nextUrl.origin
    });
    const accountLabel = result.account.instagramUsername
      ? `@${result.account.instagramUsername}`
      : result.account.instagramAccountId;
    const tokenLabel = result.tokenMode === "long_lived" ? "장기 토큰" : "단기 토큰";
    const pageLabel = result.account.pageName || result.account.pageId;
    const message = [
      `Meta 연동 완료 · 계정 ${accountLabel} · 페이지 ${pageLabel} · ${tokenLabel} 적용`,
      result.warning
    ]
      .filter(Boolean)
      .join(" / ");
    return NextResponse.redirect(
      buildRedirect({
        request,
        ok: true,
        message,
        returnTo: result.returnTo
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta OAuth callback 처리에 실패했습니다.";
    return NextResponse.redirect(
      buildRedirect({
        request,
        ok: false,
        message
      })
    );
  }
}
