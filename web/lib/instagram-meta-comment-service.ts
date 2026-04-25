import { metaGet, resolveMetaConfig, validateMetaConfig } from "@/lib/instagram-meta-service";

function objectRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function arrayOfRecords(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => objectRecord(item))
    .filter((item) => Object.keys(item).length > 0);
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveFallbackUsername(args: { igsid?: string; commentId?: string }): string {
  const igsid = normalizeText(args.igsid);
  if (igsid) {
    return `ig_user_${igsid.slice(-6)}`;
  }
  const commentId = normalizeText(args.commentId);
  if (commentId) {
    return `commenter_${commentId.slice(-6)}`;
  }
  return "";
}

function resolveCommentUsername(args: {
  username?: unknown;
  from?: Record<string, unknown>;
  commentId?: string;
}): string {
  const from = args.from || {};
  const fromId = normalizeText(from.id);
  const candidate = normalizeText(args.username || from.username);
  if (candidate) {
    return candidate;
  }
  return (
    deriveFallbackUsername({
      igsid: fromId || undefined,
      commentId: args.commentId
    }) || "commenter"
  );
}

function toFriendlyCommentFetchError(rawMessage: string): string {
  const message = normalizeText(rawMessage);
  const lower = message.toLowerCase();
  if (!lower) return "댓글 조회 중 알 수 없는 오류가 발생했습니다.";
  if (
    lower.includes("application does not have the capability") ||
    lower.includes("does not have the capability") ||
    lower.includes("(#3)") ||
    lower.includes("(code: 3)")
  ) {
    return "현재 Meta 앱 권한/모드에서 댓글 조회 기능을 사용할 수 없습니다. 앱 권한 또는 고급 액세스를 확인해 주세요.";
  }
  if (
    lower.includes("permissions error") ||
    lower.includes("missing permissions") ||
    lower.includes("insufficient permission") ||
    lower.includes("(#10)") ||
    lower.includes("(code: 10)") ||
    lower.includes("(#200)") ||
    lower.includes("(code: 200)")
  ) {
    return "댓글 조회 권한이 부족합니다. Meta 권한(pages_read_engagement/instagram_manage_comments 등)을 확인해 주세요.";
  }
  if (
    lower.includes("unsupported get request") ||
    lower.includes("nonexisting field") ||
    lower.includes("does not exist")
  ) {
    return "선택한 게시물에서 댓글을 조회할 수 없습니다. 게시물 ID를 확인해 주세요.";
  }
  if (lower.includes("rate limit") || lower.includes("(#4)") || lower.includes("(code: 4)")) {
    return "Meta API 호출 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message;
}

export type InstagramCommentMedia = {
  mediaId: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
  commentsCount?: number;
  fetchError?: string;
};

export type InstagramCollectedComment = {
  commentId: string;
  mediaId: string;
  mediaCaption?: string;
  mediaPermalink?: string;
  username: string;
  igsid?: string;
  text: string;
  timestamp: string;
  parentId?: string;
};

export type InstagramCommentCollectionError = {
  mediaId: string;
  message: string;
};

export type InstagramCommentCollectionDiagnostics = {
  totalComments: number;
  directUsernameCount: number;
  enrichedUsernameCount: number;
  fallbackUsernameCount: number;
  usernameMissingCount: number;
  withIgsidCount: number;
};

function parseMediaItem(input: Record<string, unknown>): InstagramCommentMedia | undefined {
  const mediaId = normalizeText(input.id);
  if (!mediaId) return undefined;
  const commentsCountRaw = Number.parseInt(String(input.comments_count ?? 0), 10);
  return {
    mediaId,
    caption: normalizeText(input.caption) || undefined,
    mediaType: normalizeText(input.media_type) || undefined,
    mediaUrl: normalizeText(input.media_url) || undefined,
    thumbnailUrl: normalizeText(input.thumbnail_url) || undefined,
    permalink: normalizeText(input.permalink) || undefined,
    timestamp: normalizeText(input.timestamp) || undefined,
    commentsCount: Number.isFinite(commentsCountRaw) ? Math.max(0, commentsCountRaw) : 0
  };
}

async function fetchMediaDetail(args: {
  config: Awaited<ReturnType<typeof resolveMetaConfig>>;
  mediaId: string;
}): Promise<InstagramCommentMedia | undefined> {
  const payload = objectRecord(
    await metaGet({
      config: args.config,
      path: `/${encodeURIComponent(args.mediaId)}`,
      params: {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count"
      }
    })
  );
  return parseMediaItem(payload);
}

async function fetchCommentActor(args: {
  config: Awaited<ReturnType<typeof resolveMetaConfig>>;
  commentId: string;
}): Promise<{ username?: string; igsid?: string }> {
  const payload = objectRecord(
    await metaGet({
      config: args.config,
      path: `/${encodeURIComponent(args.commentId)}`,
      params: {
        fields: "id,username,from{id,username}"
      }
    })
  );
  const from = objectRecord(payload.from);
  const username = normalizeText(payload.username || from.username);
  const igsid = normalizeText(from.id);
  return {
    username: username || undefined,
    igsid: igsid || undefined
  };
}

export async function listInstagramRecentMedia(args: {
  userId: string;
  limit?: number;
}): Promise<InstagramCommentMedia[]> {
  const config = await resolveMetaConfig(args.userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    throw new Error(`Meta 설정 누락: ${missing.join(", ")}`);
  }

  const limit = clamp(Number(args.limit) || 12, 1, 25);
  const response = objectRecord(
    await metaGet({
      config,
      path: `/${encodeURIComponent(config.instagramAccountId)}/media`,
      params: {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count",
        limit
      }
    })
  );
  return arrayOfRecords(response.data)
    .map((item) => parseMediaItem(item))
    .filter((item): item is InstagramCommentMedia => Boolean(item));
}

export async function collectInstagramComments(args: {
  userId: string;
  mediaIds: string[];
  perMediaLimit?: number;
  includeReplies?: boolean;
}): Promise<{
  media: InstagramCommentMedia[];
  comments: InstagramCollectedComment[];
  errors: InstagramCommentCollectionError[];
  diagnostics: InstagramCommentCollectionDiagnostics;
}> {
  const config = await resolveMetaConfig(args.userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    throw new Error(`Meta 설정 누락: ${missing.join(", ")}`);
  }

  const perMediaLimit = clamp(Number(args.perMediaLimit) || 80, 1, 500);
  const includeReplies = Boolean(args.includeReplies);
  const mediaIds = Array.from(new Set((args.mediaIds || []).map((value) => normalizeText(value)).filter(Boolean))).slice(0, 20);

  const media: InstagramCommentMedia[] = [];
  const comments: InstagramCollectedComment[] = [];
  const errors: InstagramCommentCollectionError[] = [];
  const commentActorCache = new Map<string, { username?: string; igsid?: string }>();
  const commentSourceById = new Map<
    string,
    { directUsername: boolean; enrichedUsername: boolean; withIgsid: boolean }
  >();

  for (const mediaId of mediaIds) {
    let mediaContext: InstagramCommentMedia = { mediaId };
    try {
      const detail = await fetchMediaDetail({ config, mediaId });
      if (detail) {
        mediaContext = detail;
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "게시물 상세를 조회하지 못했습니다.";
      mediaContext.fetchError = toFriendlyCommentFetchError(rawMessage);
    }

    try {
      let after = "";
      let collectedForMedia = 0;
      while (collectedForMedia < perMediaLimit) {
        const pageLimit = Math.min(50, perMediaLimit - collectedForMedia);
        const response = objectRecord(
          await metaGet({
            config,
            path: `/${encodeURIComponent(mediaId)}/comments`,
            params: {
              fields: "id,text,timestamp,username,parent_id,from{id,username}",
              limit: pageLimit,
              after: after || undefined
            }
          })
        );
        const data = arrayOfRecords(response.data);
        if (data.length === 0) {
          break;
        }

        for (const item of data) {
          const commentId = normalizeText(item.id);
          if (!commentId) continue;
          const parentId = normalizeText(item.parent_id);
          if (!includeReplies && parentId) {
            continue;
          }
          const from = objectRecord(item.from);
          const directUsername = normalizeText(item.username || from.username);
          let username = directUsername;
          let igsid = normalizeText(from.id);
          let usernameRecoveredByEnrichment = false;
          const needsActorEnrichment = Boolean(commentId) && (!directUsername || !igsid);
          if (needsActorEnrichment) {
            if (!commentActorCache.has(commentId)) {
              try {
                commentActorCache.set(
                  commentId,
                  await fetchCommentActor({
                    config,
                    commentId
                  })
                );
              } catch {
                commentActorCache.set(commentId, {});
              }
            }
            const actor = commentActorCache.get(commentId) || {};
            if (actor.username) {
              if (!directUsername) {
                username = actor.username;
                usernameRecoveredByEnrichment = true;
              }
            }
            if (!igsid && actor.igsid) {
              igsid = actor.igsid;
            }
          }
          if (!username) {
            username = resolveCommentUsername({
              username: item.username,
              from,
              commentId
            });
          }
          if (!commentSourceById.has(commentId)) {
            commentSourceById.set(commentId, {
              directUsername: Boolean(directUsername),
              enrichedUsername: !directUsername && Boolean(usernameRecoveredByEnrichment && username),
              withIgsid: Boolean(igsid)
            });
          }
          const text = normalizeText(item.text);
          const timestamp = normalizeText(item.timestamp) || new Date().toISOString();
          comments.push({
            commentId,
            mediaId,
            mediaCaption: mediaContext.caption,
            mediaPermalink: mediaContext.permalink,
            username,
            igsid: igsid || undefined,
            text,
            timestamp,
            parentId: parentId || undefined
          });
          collectedForMedia += 1;
          if (collectedForMedia >= perMediaLimit) {
            break;
          }
        }

        const paging = objectRecord(response.paging);
        const cursors = objectRecord(paging.cursors);
        const nextAfter = normalizeText(cursors.after);
        if (!nextAfter || collectedForMedia >= perMediaLimit) {
          break;
        }
        after = nextAfter;
      }
      mediaContext.commentsCount = collectedForMedia;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "댓글 조회에 실패했습니다.";
      const message = toFriendlyCommentFetchError(rawMessage);
      mediaContext.fetchError = message;
      errors.push({ mediaId, message });
    }
    media.push(mediaContext);
  }

  const dedupedComments = new Map<string, InstagramCollectedComment>();
  comments.forEach((item) => {
    if (!dedupedComments.has(item.commentId)) {
      dedupedComments.set(item.commentId, item);
    }
  });
  let directUsernameCount = 0;
  let enrichedUsernameCount = 0;
  let withIgsidCount = 0;
  dedupedComments.forEach((_value, commentId) => {
    const source = commentSourceById.get(commentId);
    if (!source) return;
    if (source.directUsername) {
      directUsernameCount += 1;
    } else if (source.enrichedUsername) {
      enrichedUsernameCount += 1;
    }
    if (source.withIgsid) {
      withIgsidCount += 1;
    }
  });
  const fallbackUsernameCount = Math.max(0, dedupedComments.size - (directUsernameCount + enrichedUsernameCount));

  return {
    media,
    comments: Array.from(dedupedComments.values()).sort((left, right) => {
      const leftTime = Date.parse(left.timestamp) || 0;
      const rightTime = Date.parse(right.timestamp) || 0;
      return rightTime - leftTime;
    }),
    errors,
    diagnostics: {
      totalComments: dedupedComments.size,
      directUsernameCount,
      enrichedUsernameCount,
      fallbackUsernameCount,
      usernameMissingCount: Math.max(0, dedupedComments.size - (directUsernameCount + enrichedUsernameCount)),
      withIgsidCount
    }
  };
}
