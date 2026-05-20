import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { createInstagramTemplateMediaUploadUrl, storeGeneratedAsset } from "@/lib/object-storage";

export const runtime = "nodejs";

const payloadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().optional(),
  contentLength: z.number().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
      }
      if (file.size > 200 * 1024 * 1024) {
        return NextResponse.json({ error: "템플릿 미디어는 200MB 이하 파일만 업로드할 수 있습니다." }, { status: 400 });
      }
      const body = new Uint8Array(await file.arrayBuffer());
      const stored = await storeGeneratedAsset({
        jobId: "instagram-template-media",
        fileName: `${Date.now()}-${file.name || "template-media"}`,
        body,
        contentType: file.type || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
        userId
      });
      return NextResponse.json({
        ok: true,
        publicUrl: stored.publicUrl
      });
    }

    const payload = payloadSchema.parse(await request.json());
    const contentLength = Number(payload.contentLength || 0);
    if (contentLength > 200 * 1024 * 1024) {
      return NextResponse.json({ error: "템플릿 미디어는 200MB 이하 파일만 업로드할 수 있습니다." }, { status: 400 });
    }

    const result = await createInstagramTemplateMediaUploadUrl({
      fileName: payload.fileName,
      contentType: payload.contentType,
      contentLength,
      successRedirectUrl: `${request.nextUrl.origin}/api/instagram/template-media/post-upload-complete`,
      userId
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "템플릿 미디어 업로드 URL 생성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
