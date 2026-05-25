import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { storeGeneratedAsset } from "@/lib/object-storage";

export const runtime = "nodejs";

const payloadSchema = z.object({
  audioUrl: z.string().url(),
  title: z.string().optional()
});

function assertPixabayAudioUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (!host.endsWith("pixabay.com") && !host.endsWith("pixabayusercontent.com"))) {
    throw new Error("Pixabay 오디오 URL만 가져올 수 있습니다.");
  }
  return url;
}

function sanitizeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9가-힣._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "pixabay-sound-effect";
}

function extensionFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
  if (normalized.includes("wav")) return ".wav";
  if (normalized.includes("ogg")) return ".ogg";
  if (normalized.includes("aac")) return ".aac";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return ".m4a";
  return ".mp3";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = payloadSchema.parse(await request.json());
    const url = assertPixabayAudioUrl(payload.audioUrl);
    const response = await fetch(url, {
      headers: { Accept: "audio/*,*/*" },
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`Pixabay 오디오를 가져오지 못했습니다. HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "audio/mpeg";
    if (!contentType.toLowerCase().includes("audio") && !url.pathname.match(/\.(mp3|wav|ogg|oga|aac|m4a)$/i)) {
      throw new Error("Pixabay 응답이 오디오 파일이 아닙니다.");
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 80 * 1024 * 1024) {
      throw new Error("Pixabay 오디오 파일은 80MB 이하만 가져올 수 있습니다.");
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > 80 * 1024 * 1024) {
      throw new Error("Pixabay 오디오 파일은 80MB 이하만 가져올 수 있습니다.");
    }
    const extension = url.pathname.match(/\.(mp3|wav|ogg|oga|aac|m4a)$/i)?.[0] || extensionFromContentType(contentType);
    const stored = await storeGeneratedAsset({
      jobId: "instagram-template-media",
      fileName: `${Date.now()}-${sanitizeFileName(payload.title || "pixabay-sound-effect")}${extension}`,
      body,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      userId
    });
    return NextResponse.json({
      ok: true,
      publicUrl: stored.publicUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pixabay 오디오 적용에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
