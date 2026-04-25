import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  readInstagramDmState,
  writeInstagramDmCollectorSnapshot,
  type InstagramDmCollectorSnapshot
} from "@/lib/instagram-dm-store";
import { getInstagramMetaAccountInfo } from "@/lib/instagram-meta-dm-service";
import { collectInstagramComments, listInstagramRecentMedia } from "@/lib/instagram-meta-comment-service";

export const runtime = "nodejs";

const collectSchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(20),
  mediaLimit: z.number().int().min(1).max(25).default(12),
  commentLimitPerMedia: z.number().int().min(1).max(500).default(80),
  includeReplies: z.boolean().default(false)
});

function normalizeMediaIds(input: string[]): string[] {
  return Array.from(new Set((input || []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await readInstagramDmState(userId);
  const snapshot = state.collector || null;
  const mediaLimitRaw = Number.parseInt(String(request.nextUrl.searchParams.get("mediaLimit") || 12), 10);
  const mediaLimit = Number.isFinite(mediaLimitRaw) ? Math.min(25, Math.max(1, mediaLimitRaw)) : 12;
  const refresh = request.nextUrl.searchParams.get("refresh") !== "0";

  const meta = await getInstagramMetaAccountInfo(userId);
  if (!meta.ready) {
    return NextResponse.json({
      ok: true,
      ready: false,
      message: meta.message || "Meta 인증 상태가 준비되지 않았습니다.",
      missing: meta.missing || [],
      account: meta.account || null,
      media: snapshot?.media || [],
      snapshot
    });
  }

  let media = snapshot?.media || [];
  if (refresh) {
    try {
      media = await listInstagramRecentMedia({
        userId,
        limit: mediaLimit
      });
    } catch (error) {
      if (!media || media.length === 0) {
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "게시물 목록을 불러오지 못했습니다."
          },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ready: true,
    account: meta.account || null,
    media,
    snapshot
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const payload = collectSchema.parse(body);
    const selectedMediaIds = normalizeMediaIds(payload.mediaIds);
    if (selectedMediaIds.length === 0) {
      return NextResponse.json({ error: "수집할 게시물을 선택해 주세요." }, { status: 400 });
    }

    const meta = await getInstagramMetaAccountInfo(userId);
    if (!meta.ready) {
      const missing = meta.missing && meta.missing.length > 0 ? ` (누락: ${meta.missing.join(", ")})` : "";
      return NextResponse.json(
        { error: `${meta.message || "Meta 인증 상태가 준비되지 않았습니다."}${missing}` },
        { status: 400 }
      );
    }

    const collection = await collectInstagramComments({
      userId,
      mediaIds: selectedMediaIds,
      perMediaLimit: payload.commentLimitPerMedia,
      includeReplies: payload.includeReplies
    });

    const snapshot: InstagramDmCollectorSnapshot = {
      collectedAt: new Date().toISOString(),
      selectedMediaIds,
      mediaLimit: payload.mediaLimit,
      commentLimitPerMedia: payload.commentLimitPerMedia,
      includeReplies: payload.includeReplies,
      media: collection.media.map((item) => ({
        mediaId: item.mediaId,
        caption: item.caption,
        mediaType: item.mediaType,
        mediaUrl: item.mediaUrl,
        thumbnailUrl: item.thumbnailUrl,
        permalink: item.permalink,
        timestamp: item.timestamp,
        commentsCount: item.commentsCount,
        fetchError: item.fetchError
      })),
      comments: collection.comments.map((item) => ({
        commentId: item.commentId,
        mediaId: item.mediaId,
        mediaCaption: item.mediaCaption,
        mediaPermalink: item.mediaPermalink,
        username: item.username,
        igsid: item.igsid,
        text: item.text,
        timestamp: item.timestamp,
        parentId: item.parentId
      })),
      errors: collection.errors.map((item) => `[${item.mediaId}] ${item.message}`),
      diagnostics: {
        totalComments: collection.diagnostics.totalComments,
        directUsernameCount: collection.diagnostics.directUsernameCount,
        enrichedUsernameCount: collection.diagnostics.enrichedUsernameCount,
        fallbackUsernameCount: collection.diagnostics.fallbackUsernameCount,
        usernameMissingCount: collection.diagnostics.usernameMissingCount,
        withIgsidCount: collection.diagnostics.withIgsidCount
      }
    };

    const state = await writeInstagramDmCollectorSnapshot({
      userId,
      snapshot
    });
    const uniqueUsers = new Set(
      snapshot.comments.map((item) => (item.igsid ? `id:${item.igsid}` : `u:${String(item.username || "").trim().toLowerCase()}`))
    ).size;

    return NextResponse.json({
      ok: true,
      snapshot: state.collector || snapshot,
      message:
        snapshot.comments.length === 0
          ? "선택한 게시물에서 수집 가능한 댓글이 없습니다. (댓글이 없거나 수집 조건에 해당하지 않음)"
          : "",
      summary: {
        selectedMedia: selectedMediaIds.length,
        totalComments: snapshot.comments.length,
        uniqueUsers,
        errorCount: snapshot.errors?.length || 0,
        directUsernameCount: snapshot.diagnostics?.directUsernameCount || 0,
        enrichedUsernameCount: snapshot.diagnostics?.enrichedUsernameCount || 0,
        fallbackUsernameCount: snapshot.diagnostics?.fallbackUsernameCount || 0
      }
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((item) => item.message).join(", ")
        : error instanceof Error
          ? error.message
          : "댓글 수집에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
