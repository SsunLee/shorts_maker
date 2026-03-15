import crypto from "crypto";
import { google } from "googleapis";
import { AppSettings } from "@/lib/types";
import { getSettings, saveSettings } from "@/lib/settings-store";

export type GoogleOAuthScope = "youtube" | "sheets" | "both";

type GoogleOAuthStatePayload = {
  userId: string;
  scope: GoogleOAuthScope;
  issuedAt: number;
};

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function resolveStateSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "shorts-maker-dev-google-oauth-state-secret-change-me"
  );
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signState(encodedPayload: string): string {
  return crypto.createHmac("sha256", resolveStateSecret()).update(encodedPayload).digest("base64url");
}

function timingSafeEqualText(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

function createStateToken(payload: GoogleOAuthStatePayload): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signState(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseStateToken(token: string): GoogleOAuthStatePayload {
  const [encodedPayload, signature] = String(token || "").split(".", 2);
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state.");
  }
  const expected = signState(encodedPayload);
  if (!timingSafeEqualText(signature, expected)) {
    throw new Error("OAuth state signature mismatch.");
  }
  let parsed: GoogleOAuthStatePayload;
  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload)) as GoogleOAuthStatePayload;
  } catch {
    throw new Error("Invalid OAuth state payload.");
  }
  if (!parsed.userId || !parsed.scope || !parsed.issuedAt) {
    throw new Error("Incomplete OAuth state payload.");
  }
  const stateMaxAgeMs = 10 * 60 * 1000;
  if (Date.now() - Number(parsed.issuedAt || 0) > stateMaxAgeMs) {
    throw new Error("OAuth state expired. Please retry.");
  }
  return parsed;
}

export function normalizeGoogleOAuthScope(value: string | null | undefined): GoogleOAuthScope {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "youtube" || normalized === "sheets") {
    return normalized;
  }
  return "both";
}

function resolveScopes(scope: GoogleOAuthScope): string[] {
  if (scope === "youtube") {
    return [YOUTUBE_SCOPE];
  }
  if (scope === "sheets") {
    return [SHEETS_SCOPE];
  }
  return [YOUTUBE_SCOPE, SHEETS_SCOPE];
}

function resolveGoogleOauthClientConfig(settings: AppSettings, origin: string): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = String(settings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID || "").trim();
  const clientSecret = String(settings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET || "").trim();
  const redirectUri = String(
    settings.youtubeRedirectUri ||
      process.env.YOUTUBE_REDIRECT_URI ||
      `${origin}/oauth2callback`
  ).trim();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth Client ID/Secret이 비어 있습니다. Settings에서 먼저 저장해 주세요.");
  }
  if (!redirectUri) {
    throw new Error("Google OAuth Redirect URI가 비어 있습니다.");
  }
  return { clientId, clientSecret, redirectUri };
}

export async function createGoogleOAuthStartUrl(args: {
  userId: string;
  scope: GoogleOAuthScope;
  origin: string;
}): Promise<string> {
  const settings = await getSettings(args.userId);
  const oauth = resolveGoogleOauthClientConfig(settings, args.origin);
  const oauthClient = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret, oauth.redirectUri);
  const state = createStateToken({
    userId: args.userId,
    scope: args.scope,
    issuedAt: Date.now()
  });
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: resolveScopes(args.scope),
    state
  });
  return url;
}

export async function completeGoogleOAuth(args: {
  code: string;
  state: string;
  origin: string;
}): Promise<void> {
  const payload = parseStateToken(args.state);
  const settings = await getSettings(payload.userId);
  const oauth = resolveGoogleOauthClientConfig(settings, args.origin);
  const oauthClient = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret, oauth.redirectUri);
  const tokenResponse = await oauthClient.getToken(args.code);
  const refreshToken = String(tokenResponse.tokens.refresh_token || "").trim();
  if (!refreshToken) {
    throw new Error(
      "Refresh token이 발급되지 않았습니다. Google 계정 권한을 초기화한 뒤 다시 연동해 주세요."
    );
  }

  const merged: AppSettings = {
    ...settings,
    youtubeClientId: oauth.clientId,
    youtubeClientSecret: oauth.clientSecret,
    youtubeRedirectUri: oauth.redirectUri
  };
  if (payload.scope === "youtube" || payload.scope === "both") {
    merged.youtubeRefreshToken = refreshToken;
  }
  if (payload.scope === "sheets" || payload.scope === "both") {
    // Google OAuth 토큰을 Sheets에도 공용으로 사용한다.
    merged.youtubeRefreshToken = refreshToken;
  }

  await saveSettings(merged, payload.userId);
}
