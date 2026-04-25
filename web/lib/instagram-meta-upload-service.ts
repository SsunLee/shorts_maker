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

type UploadArgs = {
  userId: string;
  caption?: string;
  mediaUrls: string[];
  rowId?: string;
  sheetName?: string;
  requestOrigin?: string;
};

export type UploadResult = {
  ok: true;
  mediaId: string;
  permalink: string;
  mediaType: string;
  childContainerIds: string[];
  sheetUpdate: { updated: boolean; reason?: string; sheetName?: string };
};

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

function looksLikeMp4Header(buffer: Uint8Array): boolean {
  if (!buffer || buffer.length < 12) {
    return false;
  }
  // ISO BMFF/MP4 signature usually contains "ftyp" box near the beginning.
  for (let index = 0; index <= Math.max(0, buffer.length - 4); index += 1) {
    if (
      buffer[index] === 0x66 &&
      buffer[index + 1] === 0x74 &&
      buffer[index + 2] === 0x79 &&
      buffer[index + 3] === 0x70
    ) {
      return true;
    }
  }
  return false;
}

async function assertPublicMediaReachable(mediaUrl: string, expectedKind?: "image" | "video"): Promise<void> {
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
    const contentType = String(headResponse.headers.get("content-type") || "").toLowerCase();
    if (expectedKind === "video" && contentType && !contentType.startsWith("video/")) {
      throw new Error(
        `업로드 비디오 URL의 Content-Type이 video/* 가 아닙니다(${contentType || "unknown"}): ${redactUrl(source)}`
      );
    }
    if (expectedKind === "image" && contentType && !contentType.startsWith("image/")) {
      throw new Error(
        `업로드 이미지 URL의 Content-Type이 image/* 가 아닙니다(${contentType || "unknown"}): ${redactUrl(source)}`
      );
    }
    if (expectedKind !== "video") {
      return;
    }
  }

  const getResponse = await fetch(source, {
    method: "GET",
    headers: { Range: expectedKind === "video" ? "bytes=0-4095" : "bytes=0-1" },
    redirect: "follow",
    cache: "no-store"
  }).catch(() => undefined);
  if (getResponse && getResponse.ok) {
    const contentType = String(getResponse.headers.get("content-type") || "").toLowerCase();
    if (expectedKind === "video" && contentType && !contentType.startsWith("video/")) {
      throw new Error(
        `업로드 비디오 URL의 Content-Type이 video/* 가 아닙니다(${contentType || "unknown"}): ${redactUrl(source)}`
      );
    }
    if (expectedKind === "image" && contentType && !contentType.startsWith("image/")) {
      throw new Error(
        `업로드 이미지 URL의 Content-Type이 image/* 가 아닙니다(${contentType || "unknown"}): ${redactUrl(source)}`
      );
    }
    if (expectedKind === "video") {
      const chunk = new Uint8Array(await getResponse.arrayBuffer());
      if (!looksLikeMp4Header(chunk)) {
        throw new Error(`업로드 비디오 URL에서 MP4 헤더(ftyp)를 확인하지 못했습니다: ${redactUrl(source)}`);
      }
    }
    return;
  }

  const status = getResponse?.status || headResponse?.status || 0;
  throw new Error(`업로드 미디어 접근 실패(HTTP ${status}): ${redactUrl(source)}`);
}

export async function uploadInstagramFeedToMeta(args: UploadArgs): Promise<UploadResult> {
  const config = await resolveMetaConfig(args.userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    throw new Error(`Meta 설정 누락: ${missing.join(", ")}`);
  }

  const normalizedUrls = (args.mediaUrls || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (normalizedUrls.length === 0) {
    throw new Error("업로드할 미디어가 없습니다.");
  }
  if (normalizedUrls.length > 10) {
    throw new Error("한 번에 업로드할 수 있는 미디어는 최대 10개입니다.");
  }

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
          throw new Error(
            "Meta 업로드 미디어 URL이 로컬/사설망 주소입니다. S3 저장을 활성화하거나 공개 URL을 사용해 주세요."
          );
        }
        const mirrored = await storeGeneratedAssetFromRemote({
          jobId,
          fileName: `media-${index + 1}${inferMediaKind(effectiveUrl) === "video" ? ".mp4" : ".png"}`,
          sourceUrl: effectiveUrl,
          userId: args.userId
        });
        effectiveUrl = mirrored.publicUrl;
      }
      if (!s3Enabled && mediaKind === "video" && !isS3BackedPublicUrl(effectiveUrl)) {
        const host = readHost(effectiveUrl) || "unknown-host";
        throw new Error(
          `비디오 업로드는 S3 공개 URL이 필요합니다. 현재 URL host=${host}. ` +
            "S3 환경변수(S3_BUCKET/S3_REGION/S3_PREFIX/S3_PUBLIC_BASE_URL)를 설정한 뒤 다시 시도해 주세요."
        );
      }
      if (s3Enabled && !isS3BackedPublicUrl(effectiveUrl)) {
        const mirrored = await storeGeneratedAssetFromRemote({
          jobId,
          fileName: `media-${index + 1}${inferMediaKind(effectiveUrl) === "video" ? ".mp4" : ".png"}`,
          sourceUrl: effectiveUrl,
          userId: args.userId
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
        userId: args.userId
      });
      if (!isPublicHttpUrl(stored.publicUrl)) {
        throw new Error("Data URL 변환 결과가 공개 URL이 아닙니다. Meta 업로드를 위해 S3 저장을 활성화해 주세요.");
      }
      resolvedMediaUrls.push(stored.publicUrl);
      continue;
    }

    if (value.startsWith("/")) {
      if (!args.requestOrigin) {
        throw new Error("로컬 경로(/generated/...)를 공개 URL로 변환할 origin 정보가 없습니다.");
      }
      const absoluteLocal = `${args.requestOrigin}${value}`;
      if (!s3Enabled) {
        throw new Error("로컬 경로(/generated/...) 미디어는 Meta가 접근할 수 없습니다. S3 저장을 활성화해 주세요.");
      }
      const mirrored = await storeGeneratedAssetFromRemote({
        jobId,
        fileName: `media-${index + 1}${inferMediaKind(value) === "video" ? ".mp4" : ".png"}`,
        sourceUrl: absoluteLocal,
        userId: args.userId
      });
      resolvedMediaUrls.push(mirrored.publicUrl);
      continue;
    }

    throw new Error(`지원하지 않는 미디어 URL 형식입니다: ${value.slice(0, 64)}`);
  }

  const deliveryMediaUrls: string[] = [];
  for (const mediaUrl of resolvedMediaUrls) {
    const signed = await toSignedStorageReadUrl(mediaUrl, 60 * 60 * 6);
    deliveryMediaUrls.push(signed);
  }

  for (const mediaUrl of deliveryMediaUrls) {
    await assertPublicMediaReachable(mediaUrl, inferMediaKind(mediaUrl));
  }

  const igUserId = config.instagramAccountId;
  const caption = String(args.caption || "").trim();
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
    userId: args.userId,
    sheetName: args.sheetName,
    rowId: args.rowId,
    status: "업로드완료",
    publishValue: "완료",
    permalink: mediaInfo.permalink || "",
    mediaId: mediaInfo.id || mediaId
  });

  return {
    ok: true,
    mediaId: mediaInfo.id || mediaId,
    permalink: mediaInfo.permalink || "",
    mediaType: mediaInfo.media_type || "",
    childContainerIds: childIds,
    sheetUpdate
  };
}
