import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  isS3StorageEnabled,
  storeGeneratedAsset,
  storeGeneratedAssetFromRemote,
  toSignedStorageReadUrl
} from "@/lib/object-storage";
import {
  metaGet,
  metaPost,
  resolveMetaConfig,
  validateMetaConfig,
  waitForContainerReady
} from "@/lib/instagram-meta-service";
import { updateInstagramSheetRowAfterUpload } from "@/lib/instagram-sheet";

export const runtime = "nodejs";

const schema = z.object({
  caption: z.string().optional(),
  mediaUrls: z.array(z.string()).min(1).max(10),
  rowId: z.string().optional(),
  sheetName: z.string().optional()
});

function inferMediaKind(url: string): "image" | "video" {
  const source = String(url || "").trim().toLowerCase().split("?")[0].split("#")[0];
  if (/\.(mp4|mov|webm|ogg|m4v)$/i.test(source)) {
    return "video";
  }
  return "image";
}

function isPublicHttpUrl(url: string): boolean {
  const raw = String(url || "").trim().toLowerCase();
  return raw.startsWith("http://") || raw.startsWith("https://");
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(String(raw || "").trim());
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(raw || "").split("?")[0].split("#")[0];
  }
}

function isS3BackedPublicUrl(raw: string): boolean {
  const source = String(raw || "").trim();
  if (!source) {
    return false;
  }
  try {
    const url = new URL(source);
    const host = String(url.hostname || "").trim().toLowerCase();
    if (!host) {
      return false;
    }
    if (host.includes(".s3.") || host.endsWith(".amazonaws.com")) {
      return true;
    }
    const explicitBase = String(process.env.S3_PUBLIC_BASE_URL || "").trim();
    if (explicitBase) {
      const base = new URL(explicitBase);
      return base.origin === url.origin;
    }
    return false;
  } catch {
    return false;
  }
}

function readHost(raw: string): string {
  try {
    return new URL(String(raw || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function extensionFromContentType(contentType: string): string {
  const normalized = String(contentType || "").trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "video/ogg") return "ogg";
  return "bin";
}

function parseDataUrl(value: string): { body: Uint8Array; contentType: string; extension: string } | undefined {
  const source = String(value || "").trim();
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (!match) {
    return undefined;
  }
  const contentType = String(match[1] || "application/octet-stream").trim().toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = String(match[3] || "");
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return {
    body: buffer,
    contentType,
    extension: extensionFromContentType(contentType)
  };
}

function isPrivateIpv4(host: string): boolean {
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const block = Number.parseInt(match172[1], 10);
    return Number.isFinite(block) && block >= 16 && block <= 31;
  }
  return false;
}

function isLikelyLocalOrPrivateUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = String(url.hostname || "").trim().toLowerCase();
    if (!host) return true;
    if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
    if (host === "host.docker.internal") return true;
    if (isPrivateIpv4(host)) return true;
    return false;
  } catch {
    return true;
  }
}

async function assertPublicMediaReachable(mediaUrl: string): Promise<void> {
  const source = String(mediaUrl || "").trim();
  if (!source) {
    throw new Error("업로드 미디어 URL이 비어 있습니다.");
  }
  if (!isPublicHttpUrl(source)) {
    throw new Error(`공개 URL이 아닌 미디어는 업로드할 수 없습니다: ${source.slice(0, 96)}`);
  }

  const headResponse = await fetch(source, {
    method: "HEAD",
    redirect: "follow",
    cache: "no-store"
  }).catch(() => undefined);
  if (headResponse && headResponse.ok) {
    return;
  }

  const getResponse = await fetch(source, {
    method: "GET",
    headers: { Range: "bytes=0-1" },
    redirect: "follow",
    cache: "no-store"
  }).catch(() => undefined);
  if (getResponse && getResponse.ok) {
    return;
  }

  const status = getResponse?.status || headResponse?.status || 0;
  throw new Error(`업로드 미디어 접근 실패(HTTP ${status}): ${redactUrl(source)}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const config = await resolveMetaConfig(userId);
    const missing = validateMetaConfig(config);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Meta 설정 누락: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const normalizedUrls = payload.mediaUrls
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const jobId = `instagram-feed-${Date.now()}`;
    const resolvedMediaUrls: string[] = [];
    const s3Enabled = isS3StorageEnabled();
    for (let index = 0; index < normalizedUrls.length; index += 1) {
      const value = normalizedUrls[index];
      if (isPublicHttpUrl(value)) {
        let effectiveUrl = value;
        const mediaKind = inferMediaKind(effectiveUrl);
        if (isLikelyLocalOrPrivateUrl(effectiveUrl)) {
          if (!s3Enabled) {
            return NextResponse.json(
              {
                error:
                  "Meta 업로드 미디어 URL이 로컬/사설망 주소입니다. S3 저장을 활성화하거나 공개 URL을 사용해 주세요."
              },
              { status: 400 }
            );
          }
          const mirrored = await storeGeneratedAssetFromRemote({
            jobId,
            fileName: `media-${index + 1}${inferMediaKind(effectiveUrl) === "video" ? ".mp4" : ".png"}`,
            sourceUrl: effectiveUrl,
            userId
          });
          effectiveUrl = mirrored.publicUrl;
        }
        // S3가 꺼진 상태에서 엔진/외부 비디오 URL을 그대로 Meta에 넘기면
        // crawler 접근 정책/일시 URL 문제로 ERROR가 자주 발생하므로 사전 차단합니다.
        if (!s3Enabled && mediaKind === "video" && !isS3BackedPublicUrl(effectiveUrl)) {
          const host = readHost(effectiveUrl) || "unknown-host";
          return NextResponse.json(
            {
              error:
                `비디오 업로드는 S3 공개 URL이 필요합니다. 현재 URL host=${host}. ` +
                "S3 환경변수(S3_BUCKET/S3_REGION/S3_PREFIX/S3_PUBLIC_BASE_URL)를 설정한 뒤 다시 시도해 주세요."
            },
            { status: 400 }
          );
        }
        // Meta crawler 안정성을 위해 S3가 활성화된 환경에서는 외부 URL을 S3로 표준화합니다.
        // (엔진 임시 URL/터널 URL/외부 CDN 만료 이슈를 회피)
        if (s3Enabled && !isS3BackedPublicUrl(effectiveUrl)) {
          const mirrored = await storeGeneratedAssetFromRemote({
            jobId,
            fileName: `media-${index + 1}${inferMediaKind(effectiveUrl) === "video" ? ".mp4" : ".png"}`,
            sourceUrl: effectiveUrl,
            userId
          });
          effectiveUrl = mirrored.publicUrl;
        }
        resolvedMediaUrls.push(effectiveUrl);
        continue;
      }

      const dataParsed = parseDataUrl(value);
      if (dataParsed) {
        const stored = await storeGeneratedAsset({
          jobId,
          fileName: `media-${index + 1}.${dataParsed.extension}`,
          body: dataParsed.body,
          contentType: dataParsed.contentType,
          userId
        });
        if (!isPublicHttpUrl(stored.publicUrl)) {
          return NextResponse.json(
            {
              error:
                "Data URL 변환 결과가 공개 URL이 아닙니다. Meta 업로드를 위해 S3 저장을 활성화해 주세요."
            },
            { status: 400 }
          );
        }
        resolvedMediaUrls.push(stored.publicUrl);
        continue;
      }

      if (value.startsWith("/")) {
        const absoluteLocal = `${request.nextUrl.origin}${value}`;
        if (!s3Enabled) {
          return NextResponse.json(
            {
              error:
                "로컬 경로(/generated/...) 미디어는 Meta가 접근할 수 없습니다. S3 저장을 활성화해 주세요."
            },
            { status: 400 }
          );
        }
        const mirrored = await storeGeneratedAssetFromRemote({
          jobId,
          fileName: `media-${index + 1}${inferMediaKind(value) === "video" ? ".mp4" : ".png"}`,
          sourceUrl: absoluteLocal,
          userId
        });
        resolvedMediaUrls.push(mirrored.publicUrl);
        continue;
      }

      return NextResponse.json(
        { error: `지원하지 않는 미디어 URL 형식입니다: ${value.slice(0, 64)}` },
        { status: 400 }
      );
    }

    // S3 객체가 private인 환경에서도 Meta crawler가 접근할 수 있도록
    // 업로드 직전에는 signed URL로 변환해 전달합니다.
    const deliveryMediaUrls: string[] = [];
    for (const mediaUrl of resolvedMediaUrls) {
      const signed = await toSignedStorageReadUrl(mediaUrl, 60 * 60 * 6);
      deliveryMediaUrls.push(signed);
    }

    for (const mediaUrl of deliveryMediaUrls) {
      await assertPublicMediaReachable(mediaUrl);
    }

    const igUserId = config.instagramAccountId;
    const caption = String(payload.caption || "").trim();

    let publishCreationId = "";
    const childIds: string[] = [];

    if (deliveryMediaUrls.length === 1) {
      const onlyUrl = deliveryMediaUrls[0];
      const mediaKind = inferMediaKind(onlyUrl);
      const creation = (await metaPost({
        config,
        path: `/${encodeURIComponent(igUserId)}/media`,
        body:
          mediaKind === "video"
            ? {
                // Feed upload flow: single video should use VIDEO container.
                media_type: "VIDEO",
                video_url: onlyUrl,
                caption: caption || undefined
              }
            : {
                image_url: onlyUrl,
                caption: caption || undefined
              }
      })) as { id?: string };
      publishCreationId = String(creation.id || "");
      if (!publishCreationId) {
        throw new Error("Meta 단건 컨테이너 생성에 실패했습니다.");
      }
      try {
        await waitForContainerReady({
          config,
          containerId: publishCreationId,
          timeoutMs: 180000,
          intervalMs: 3000
        });
      } catch (waitError) {
        throw new Error(
          `[single:${mediaKind}] 컨테이너 처리 실패 · mediaUrl=${redactUrl(onlyUrl)} · ${
            waitError instanceof Error ? waitError.message : String(waitError)
          }`
        );
      }
    } else {
      for (let index = 0; index < deliveryMediaUrls.length; index += 1) {
        const mediaUrl = deliveryMediaUrls[index];
        const mediaKind = inferMediaKind(mediaUrl);
        const creation = (await metaPost({
          config,
          path: `/${encodeURIComponent(igUserId)}/media`,
          body:
            mediaKind === "video"
              ? {
                  media_type: "VIDEO",
                  video_url: mediaUrl,
                  is_carousel_item: true
                }
              : {
                  image_url: mediaUrl,
                  is_carousel_item: true
                }
        })) as { id?: string };
        const childId = String(creation.id || "");
        if (!childId) {
          throw new Error("Meta 캐러셀 자식 컨테이너 생성에 실패했습니다.");
        }
        childIds.push(childId);
      }

      for (let index = 0; index < childIds.length; index += 1) {
        const childId = childIds[index];
        const mediaUrl = deliveryMediaUrls[index];
        try {
          await waitForContainerReady({
            config,
            containerId: childId,
            timeoutMs: 180000,
            intervalMs: 3000
          });
        } catch (waitError) {
          throw new Error(
            `[carousel-child:${index + 1}] 처리 실패 · childId=${childId} · mediaUrl=${redactUrl(mediaUrl)} · ${
              waitError instanceof Error ? waitError.message : String(waitError)
            }`
          );
        }
      }

      const carousel = (await metaPost({
        config,
        path: `/${encodeURIComponent(igUserId)}/media`,
        body: {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: caption || undefined
        }
      })) as { id?: string };
      publishCreationId = String(carousel.id || "");
      if (!publishCreationId) {
        throw new Error("Meta 캐러셀 컨테이너 생성에 실패했습니다.");
      }
      try {
        await waitForContainerReady({
          config,
          containerId: publishCreationId,
          timeoutMs: 180000,
          intervalMs: 3000
        });
      } catch (waitError) {
        throw new Error(
          `[carousel-parent] 처리 실패 · parentId=${publishCreationId} · ${
            waitError instanceof Error ? waitError.message : String(waitError)
          }`
        );
      }
    }

    const published = (await metaPost({
      config,
      path: `/${encodeURIComponent(igUserId)}/media_publish`,
      body: { creation_id: publishCreationId }
    })) as { id?: string };
    const mediaId = String(published.id || "");
    if (!mediaId) {
      throw new Error("Meta 업로드 publish 응답에 media id가 없습니다.");
    }

    const mediaInfo = (await metaGet({
      config,
      path: `/${encodeURIComponent(mediaId)}`,
      params: { fields: "id,permalink,media_type" }
    })) as {
      id?: string;
      permalink?: string;
      media_type?: string;
    };

    const sheetUpdate = await updateInstagramSheetRowAfterUpload({
      userId,
      sheetName: payload.sheetName,
      rowId: payload.rowId,
      status: "업로드완료",
      publishValue: "완료",
      permalink: mediaInfo.permalink || "",
      mediaId: mediaInfo.id || mediaId
    });

    return NextResponse.json({
      ok: true,
      mediaId: mediaInfo.id || mediaId,
      permalink: mediaInfo.permalink || "",
      mediaType: mediaInfo.media_type || "",
      childContainerIds: childIds,
      sheetUpdate
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((item) => item.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Meta 업로드에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
