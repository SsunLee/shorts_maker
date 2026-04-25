import crypto from "crypto";
import { AppSettings } from "@/lib/types";
import { getSettings, saveSettings } from "@/lib/settings-store";

type MetaOAuthStatePayload = {
  userId: string;
  issuedAt: number;
  returnTo: string;
};

type MetaOAuthConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  scopes: string[];
};

type MetaPageAccount = {
  pageId: string;
  pageName?: string;
  pageAccessToken?: string;
  instagramAccountId: string;
  instagramUsername?: string;
};

export type MetaOAuthCompleteResult = {
  returnTo: string;
  account: MetaPageAccount;
  tokenMode: "long_lived" | "short_lived";
  warning?: string;
};

const META_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "business_management"
];

function resolveStateSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "shorts-maker-dev-meta-oauth-state-secret-change-me"
  );
}

function normalizeGraphVersion(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "v23.0";
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
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

function createStateToken(payload: MetaOAuthStatePayload): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signState(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function sanitizeReturnTo(input: string | null | undefined): string {
  const value = String(input || "").trim();
  if (!value || !value.startsWith("/")) {
    return "/settings";
  }
  if (value.startsWith("//") || value.startsWith("/api/")) {
    return "/settings";
  }
  return value;
}

function parseStateToken(token: string): MetaOAuthStatePayload {
  const [encodedPayload, signature] = String(token || "").split(".", 2);
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state.");
  }
  const expected = signState(encodedPayload);
  if (!timingSafeEqualText(signature, expected)) {
    throw new Error("OAuth state signature mismatch.");
  }
  let parsed: MetaOAuthStatePayload;
  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload)) as MetaOAuthStatePayload;
  } catch {
    throw new Error("Invalid OAuth state payload.");
  }
  if (!parsed.userId || !parsed.issuedAt) {
    throw new Error("Incomplete OAuth state payload.");
  }
  parsed.returnTo = sanitizeReturnTo(parsed.returnTo);
  const stateMaxAgeMs = 10 * 60 * 1000;
  if (Date.now() - Number(parsed.issuedAt || 0) > stateMaxAgeMs) {
    throw new Error("OAuth state expired. Please retry.");
  }
  return parsed;
}

function parseMetaScopesFromEnv(): string[] {
  const raw = String(process.env.META_OAUTH_SCOPES || "").trim();
  if (!raw) {
    return META_OAUTH_SCOPES;
  }
  const values = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? Array.from(new Set(values)) : META_OAUTH_SCOPES;
}

function resolveMetaOAuthConfig(settings: AppSettings, origin: string): MetaOAuthConfig {
  const appId = String(settings.metaAppId || process.env.META_APP_ID || "").trim();
  const appSecret = String(settings.metaAppSecret || process.env.META_APP_SECRET || "").trim();
  const graphVersion = normalizeGraphVersion(
    String(settings.metaGraphVersion || process.env.META_GRAPH_VERSION || "v23.0")
  );
  const redirectUri = String(process.env.META_OAUTH_REDIRECT_URI || `${origin}/meta/oauth2callback`).trim();
  if (!appId) {
    throw new Error("Meta App ID가 비어 있습니다. Settings에서 저장 후 다시 시도해 주세요.");
  }
  if (!appSecret) {
    throw new Error("Meta App Secret이 비어 있습니다. Settings에서 저장 후 다시 시도해 주세요.");
  }
  return {
    appId,
    appSecret,
    graphVersion,
    redirectUri,
    scopes: parseMetaScopesFromEnv()
  };
}

function graphApiBase(version: string): string {
  return `https://graph.facebook.com/${normalizeGraphVersion(version)}`;
}

function toMetaErrorMessage(raw: string, fallback: string): string {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        message?: string;
        code?: number;
      };
    };
    const message = String(parsed.error?.message || "").trim();
    const code = Number(parsed.error?.code || 0);
    if (message) {
      return code > 0 ? `${message} (code: ${code})` : message;
    }
  } catch {
    // noop
  }
  return text;
}

async function fetchMetaJson(url: string, fallbackError: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(toMetaErrorMessage(raw, fallbackError));
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function asRecords(input: unknown): Record<string, unknown>[] {
  return Array.isArray(input) ? input.map((item) => asRecord(item)) : [];
}

function pickMetaPageAccount(args: {
  pages: Record<string, unknown>[];
  preferredPageId: string;
}): MetaPageAccount | undefined {
  const candidates: MetaPageAccount[] = [];
  args.pages.forEach((page) => {
    const pageId = normalizeText(page.id);
    const instagramBusiness = asRecord(page.instagram_business_account);
    const instagramAccountId = normalizeText(instagramBusiness.id);
    if (!pageId || !instagramAccountId) {
      return;
    }
    candidates.push({
      pageId,
      pageName: normalizeText(page.name) || undefined,
      pageAccessToken: normalizeText(page.access_token) || undefined,
      instagramAccountId,
      instagramUsername: normalizeText(instagramBusiness.username) || undefined
    });
  });

  if (candidates.length === 0) {
    return undefined;
  }
  if (args.preferredPageId) {
    const preferred = candidates.find((item) => item.pageId === args.preferredPageId);
    if (preferred) {
      return preferred;
    }
  }
  const withToken = candidates.find((item) => Boolean(item.pageAccessToken));
  return withToken || candidates[0];
}

export async function createMetaOAuthStartUrl(args: {
  userId: string;
  origin: string;
  returnTo?: string | null;
}): Promise<string> {
  const settings = await getSettings(args.userId);
  const config = resolveMetaOAuthConfig(settings, args.origin);
  const state = createStateToken({
    userId: args.userId,
    issuedAt: Date.now(),
    returnTo: sanitizeReturnTo(args.returnTo)
  });
  const params = new URLSearchParams();
  params.set("client_id", config.appId);
  params.set("redirect_uri", config.redirectUri);
  params.set("state", state);
  params.set("response_type", "code");
  params.set("scope", config.scopes.join(","));
  return `https://www.facebook.com/${config.graphVersion}/dialog/oauth?${params.toString()}`;
}

export async function completeMetaOAuth(args: {
  code: string;
  state: string;
  origin: string;
}): Promise<MetaOAuthCompleteResult> {
  const payload = parseStateToken(args.state);
  const settings = await getSettings(payload.userId);
  const config = resolveMetaOAuthConfig(settings, args.origin);

  const exchangeParams = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code: args.code
  });
  const shortTokenResponse = await fetchMetaJson(
    `${graphApiBase(config.graphVersion)}/oauth/access_token?${exchangeParams.toString()}`,
    "Meta OAuth code 교환에 실패했습니다."
  );
  const shortToken = normalizeText(shortTokenResponse.access_token);
  if (!shortToken) {
    throw new Error("Meta OAuth 응답에 access_token이 없습니다.");
  }

  let token = shortToken;
  let tokenMode: MetaOAuthCompleteResult["tokenMode"] = "short_lived";
  let warning: string | undefined;
  try {
    const longTokenParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortToken
    });
    const longTokenResponse = await fetchMetaJson(
      `${graphApiBase(config.graphVersion)}/oauth/access_token?${longTokenParams.toString()}`,
      "Meta 장기 토큰 교환에 실패했습니다."
    );
    const longToken = normalizeText(longTokenResponse.access_token);
    if (longToken) {
      token = longToken;
      tokenMode = "long_lived";
    }
  } catch (error) {
    warning =
      error instanceof Error
        ? `장기 토큰 교환 실패로 단기 토큰을 사용합니다: ${error.message}`
        : "장기 토큰 교환 실패로 단기 토큰을 사용합니다.";
  }

  const pageResponse = await fetchMetaJson(
    `${graphApiBase(config.graphVersion)}/me/accounts?${new URLSearchParams({
      access_token: token,
      fields: "id,name,access_token,tasks,instagram_business_account{id,username}",
      limit: "100"
    }).toString()}`,
    "연결 가능한 Facebook 페이지 목록을 가져오지 못했습니다."
  );
  const pages = asRecords(pageResponse.data);
  const account = pickMetaPageAccount({
    pages,
    preferredPageId: normalizeText(settings.metaFacebookPageId)
  });

  if (!account) {
    throw new Error(
      "Instagram 비즈니스 계정이 연결된 Facebook 페이지를 찾지 못했습니다. 페이지-인스타 연동과 앱 권한(scopes)을 확인해 주세요."
    );
  }

  const nextSettings: AppSettings = {
    ...settings,
    metaAppId: config.appId,
    metaAppSecret: config.appSecret,
    metaGraphVersion: config.graphVersion,
    metaAccessToken: account.pageAccessToken || token,
    metaFacebookPageId: account.pageId,
    metaInstagramAccountId: account.instagramAccountId
  };
  await saveSettings(nextSettings, payload.userId);

  return {
    returnTo: payload.returnTo,
    account,
    tokenMode,
    warning
  };
}
