import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { toSignedStorageReadUrl } from "@/lib/object-storage";

export const runtime = "nodejs";

function contentTypeByExtension(filePath: string): string {
  const ext = path.extname(String(filePath || "").toLowerCase());
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".otf") return "font/otf";
  if (ext === ".ttc") return "font/collection";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function resolveAllowedHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const requestHost = String(request.nextUrl.host || "").trim().toLowerCase();
  if (requestHost) {
    hosts.add(requestHost);
  }

  const s3PublicBase = String(process.env.S3_PUBLIC_BASE_URL || "").trim();
  if (s3PublicBase) {
    try {
      hosts.add(new URL(s3PublicBase).host.toLowerCase());
    } catch {
      // noop
    }
  }

  const bucket = String(process.env.S3_BUCKET || "").trim();
  const region = String(process.env.S3_REGION || "").trim() || "us-east-1";
  if (bucket) {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`.toLowerCase());
    hosts.add(`${bucket}.s3.amazonaws.com`.toLowerCase());
  }
  return hosts;
}

async function readLocalFontFile(sourcePath: string): Promise<Response> {
  const cleaned = String(sourcePath || "").trim();
  const withoutQuery = cleaned.split("?")[0].split("#")[0];
  const relative = decodeURIComponent(withoutQuery).replace(/^\/+/, "");
  if (!relative.toLowerCase().startsWith("fonts/")) {
    return NextResponse.json({ error: "지원하지 않는 로컬 폰트 경로입니다." }, { status: 400 });
  }
  const publicRoot = path.resolve(process.cwd(), "public");
  const targetPath = path.resolve(publicRoot, ...relative.split("/"));
  const safePrefix = `${publicRoot}${path.sep}`;
  if (!(targetPath === publicRoot || targetPath.startsWith(safePrefix))) {
    return NextResponse.json({ error: "유효하지 않은 폰트 경로입니다." }, { status: 400 });
  }
  try {
    const buffer = await fs.readFile(targetPath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeByExtension(targetPath),
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch {
    return NextResponse.json({ error: "폰트 파일을 찾을 수 없습니다." }, { status: 404 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = String(request.nextUrl.searchParams.get("source") || "").trim();
  if (!source) {
    return NextResponse.json({ error: "source 쿼리가 필요합니다." }, { status: 400 });
  }

  if (source.startsWith("/")) {
    return readLocalFontFile(source);
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    return NextResponse.json({ error: "source URL 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
    return NextResponse.json({ error: "지원하지 않는 URL 프로토콜입니다." }, { status: 400 });
  }

  const allowedHosts = resolveAllowedHosts(request);
  if (!allowedHosts.has(sourceUrl.host.toLowerCase())) {
    return NextResponse.json({ error: "허용되지 않은 폰트 소스 host입니다." }, { status: 400 });
  }

  try {
    const signedUrl = await toSignedStorageReadUrl(source, 60 * 60);
    const response = await fetch(signedUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json(
        { error: `폰트 파일 다운로드 실패 (HTTP ${response.status})` },
        { status: 502 }
      );
    }
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || contentTypeByExtension(sourceUrl.pathname);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "폰트 파일 프록시에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

