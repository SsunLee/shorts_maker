import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { storeInstagramFontAsset } from "@/lib/object-storage";

export const runtime = "nodejs";

const ALLOWED_FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"]);
const MAX_FONT_SIZE_BYTES = 30 * 1024 * 1024;

function normalizeFontFamily(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function inferFamilyFromFileName(fileName: string): string {
  const stem = String(fileName || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return normalizeFontFamily(stem) || "Uploaded Font";
}

function normalizeFileName(fileName: string): string {
  return String(fileName || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "폰트 파일(file)을 찾을 수 없습니다." }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "빈 파일은 업로드할 수 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_FONT_SIZE_BYTES) {
      return NextResponse.json(
        { error: "폰트 파일이 너무 큽니다. 30MB 이하만 업로드 가능합니다." },
        { status: 400 }
      );
    }

    const originalFileName = String(file.name || "").trim();
    const safeFileName = normalizeFileName(originalFileName);
    const extension = path.extname(safeFileName).toLowerCase();
    if (!ALLOWED_FONT_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        {
          error: "지원하지 않는 폰트 확장자입니다. (ttf, otf, ttc, woff, woff2)"
        },
        { status: 400 }
      );
    }

    const requestedFamily = normalizeFontFamily(String(formData.get("family") || ""));
    const family = requestedFamily || inferFamilyFromFileName(safeFileName);
    const mimeType = String(file.type || "").trim() || undefined;
    const body = new Uint8Array(await file.arrayBuffer());
    const stored = await storeInstagramFontAsset({
      fileName: safeFileName || `uploaded-font${extension || ".ttf"}`,
      body,
      contentType: mimeType,
      userId
    });

    const uploadedAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      font: {
        id: randomUUID(),
        family,
        fileName: safeFileName || originalFileName || "uploaded-font",
        sourceUrl: stored.publicUrl,
        mimeType,
        uploadedAt
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "폰트 업로드에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

