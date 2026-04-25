import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { toSignedStorageReadUrl } from "@/lib/object-storage";

export const runtime = "nodejs";

function guessMimeTypeFromPath(sourcePath: string): string {
  const normalized = String(sourcePath || "").toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".m4a")) return "audio/mp4";
  if (normalized.endsWith(".aac")) return "audio/aac";
  if (normalized.endsWith(".oga")) return "audio/ogg";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".ogg")) return "video/ogg";
  return "image/png";
}

function isAllowedLocalPublicPath(sourcePath: string): boolean {
  return sourcePath.startsWith("/generated/") || sourcePath.startsWith("/fonts/");
}

async function readLocalPublicAsset(sourcePath: string): Promise<{ body: Buffer; contentType: string }> {
  const relativeSegments = sourcePath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (relativeSegments.length === 0 || relativeSegments.some((segment) => segment === "..")) {
    throw new Error("INVALID_LOCAL_PATH");
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, ...relativeSegments);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("INVALID_LOCAL_PATH");
  }

  const body = await fs.readFile(absolutePath);
  return {
    body,
    contentType: guessMimeTypeFromPath(sourcePath)
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = String(request.nextUrl.searchParams.get("source") || "").trim();
  if (!source) {
    return NextResponse.json({ error: "source 쿼리가 필요합니다." }, { status: 400 });
  }
  if (source.length > 16000) {
    return NextResponse.json({ error: "source 길이가 너무 깁니다." }, { status: 400 });
  }
  if (source.startsWith("/api/instagram/media-proxy")) {
    return NextResponse.json({ error: "지원하지 않는 source 경로입니다." }, { status: 400 });
  }

  try {
    if (source.startsWith("/")) {
      if (!isAllowedLocalPublicPath(source)) {
        return NextResponse.json({ error: "지원하지 않는 로컬 경로입니다." }, { status: 400 });
      }
      const localAsset = await readLocalPublicAsset(source);
      return new NextResponse(new Uint8Array(localAsset.body), {
        status: 200,
        headers: {
          "Content-Type": localAsset.contentType,
          "Cache-Control": "private, max-age=60"
        }
      });
    }

    let remoteUrl: URL;
    try {
      remoteUrl = new URL(source);
    } catch {
      return NextResponse.json({ error: "source URL 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (remoteUrl.protocol !== "https:" && remoteUrl.protocol !== "http:") {
      return NextResponse.json({ error: "지원하지 않는 URL 프로토콜입니다." }, { status: 400 });
    }

    const signedOrOriginal = await toSignedStorageReadUrl(source, 60 * 60);
    const response = await fetch(signedOrOriginal, {
      method: "GET",
      cache: "no-store",
      redirect: "follow"
    });
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: `미디어 로드 실패 (HTTP ${response.status || 500})` },
        { status: response.status || 502 }
      );
    }

    const contentType =
      String(response.headers.get("content-type") || "").trim() || guessMimeTypeFromPath(remoteUrl.pathname);
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60"
      }
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    const message = error instanceof Error ? error.message : "미디어 프록시 처리에 실패했습니다.";
    if (code === "ENOENT" || code === "ENOTDIR" || message.includes("ENOENT")) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (message === "INVALID_LOCAL_PATH") {
      return NextResponse.json({ error: "유효하지 않은 로컬 경로입니다." }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
