import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { toSignedStorageReadUrl } from "@/lib/object-storage";

export const runtime = "nodejs";

function mediaProxySecret(): string {
  const value = String(process.env.INTERNAL_MEDIA_PROXY_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (!value) {
    throw new Error("INTERNAL_MEDIA_PROXY_SECRET 또는 NEXTAUTH_SECRET 설정이 필요합니다.");
  }
  return value;
}

function verifySignature(source: string, exp: number, sig: string): boolean {
  const payload = `${source}|${exp}`;
  const expected = crypto.createHmac("sha256", mediaProxySecret()).update(payload).digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(String(sig || "").trim(), "hex");
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

async function resolveValidatedSourceUrl(request: NextRequest): Promise<{ ok: true; sourceUrl: string } | { ok: false; response: NextResponse }> {
  const sourceToken = String(request.nextUrl.searchParams.get("source") || "").trim();
  const expRaw = String(request.nextUrl.searchParams.get("exp") || "").trim();
  const sig = String(request.nextUrl.searchParams.get("sig") || "").trim();
  if (!sourceToken || !expRaw || !sig) {
    return { ok: false, response: NextResponse.json({ error: "source, exp, sig 쿼리가 필요합니다." }, { status: 400 }) };
  }

  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp <= 0) {
    return { ok: false, response: NextResponse.json({ error: "exp 값이 올바르지 않습니다." }, { status: 400 }) };
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return { ok: false, response: NextResponse.json({ error: "media URL 토큰이 만료되었습니다." }, { status: 410 }) };
  }

  let sourceUrl = "";
  try {
    sourceUrl = Buffer.from(sourceToken, "base64url").toString("utf8");
  } catch {
    return { ok: false, response: NextResponse.json({ error: "source 토큰이 올바르지 않습니다." }, { status: 400 }) };
  }
  if (!sourceUrl) {
    return { ok: false, response: NextResponse.json({ error: "source URL이 비어 있습니다." }, { status: 400 }) };
  }
  if (!verifySignature(sourceUrl, exp, sig)) {
    return { ok: false, response: NextResponse.json({ error: "media URL 서명이 유효하지 않습니다." }, { status: 403 }) };
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "source URL 형식이 올바르지 않습니다." }, { status: 400 }) };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, response: NextResponse.json({ error: "지원하지 않는 source URL 프로토콜입니다." }, { status: 400 }) };
  }
  return { ok: true, sourceUrl };
}

function copyPassthroughHeaders(response: Response): Headers {
  const headers = new Headers();
  const passKeys = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control"
  ];
  for (const key of passKeys) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.get("cache-control")) {
    headers.set("Cache-Control", "public, max-age=300");
  }
  return headers;
}

function inferForcedContentType(request: NextRequest): string | undefined {
  const pathname = String(request.nextUrl.pathname || "").toLowerCase();
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".mov")) return "video/quicktime";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  return undefined;
}

async function proxyMedia(request: NextRequest, method: "GET" | "HEAD"): Promise<NextResponse> {
  const resolved = await resolveValidatedSourceUrl(request);
  if (!resolved.ok) return resolved.response;
  const sourceUrl = resolved.sourceUrl;
  const signedOrOriginal = await toSignedStorageReadUrl(sourceUrl, 60 * 60);
  const upstreamHeaders: Record<string, string> = {};
  const incomingRange = String(request.headers.get("range") || "").trim();
  if (incomingRange) {
    upstreamHeaders.Range = incomingRange;
  }

  const response = await fetch(signedOrOriginal, {
    method,
    headers: upstreamHeaders,
    cache: "no-store",
    redirect: "follow"
  });
  if (!response.ok && response.status !== 206) {
    return NextResponse.json({ error: `미디어 로드 실패 (HTTP ${response.status || 500})` }, { status: response.status || 502 });
  }
  const headers = copyPassthroughHeaders(response);
  const forcedContentType = inferForcedContentType(request);
  if (forcedContentType) {
    headers.set("Content-Type", forcedContentType);
  } else if (!headers.get("content-type")) {
    headers.set("Content-Type", "application/octet-stream");
  }
  if (!headers.get("accept-ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }
  if (method === "HEAD") {
    return new NextResponse(null, { status: response.status, headers });
  }
  if (!response.body) {
    return NextResponse.json({ error: "미디어 본문이 비어 있습니다." }, { status: 502 });
  }
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  return proxyMedia(request, "HEAD");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyMedia(request, "GET");
}
