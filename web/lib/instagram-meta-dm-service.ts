import { metaGet, metaPost, resolveMetaConfig, validateMetaConfig } from "@/lib/instagram-meta-service";

function objectRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function normalizeUsername(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function arrayOfRecords(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => objectRecord(item))
    .filter((item) => Object.keys(item).length > 0);
}

const RECIPIENT_INDEX_TTL_MS = 1000 * 60 * 5;
const MAX_CONVERSATIONS_SCAN = 80;
const MAX_CONVERSATION_MESSAGES_SCAN = 8;
const MAX_CONVERSATION_PAGES = 4;

export type InstagramRecipientIndex = {
  loadedAt: string;
  scannedConversations: number;
  byUsername: Record<string, string>;
};

const recipientIndexCache = new Map<string, { expiresAtMs: number; index: InstagramRecipientIndex }>();

export type InstagramMetaAccountInfo = {
  ready: boolean;
  missing?: string[];
  message?: string;
  account?: {
    id?: string;
    username?: string;
  };
};

export async function getInstagramMetaAccountInfo(userId: string): Promise<InstagramMetaAccountInfo> {
  const config = await resolveMetaConfig(userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    return {
      ready: false,
      missing,
      message: "Meta 설정이 누락되었습니다."
    };
  }

  try {
    const account = (await metaGet({
      config,
      path: `/${encodeURIComponent(config.instagramAccountId)}`,
      params: { fields: "id,username" }
    })) as {
      id?: string;
      username?: string;
    };
    return {
      ready: true,
      account: {
        id: account.id || config.instagramAccountId,
        username: account.username || ""
      }
    };
  } catch (error) {
    return {
      ready: false,
      message: error instanceof Error ? error.message : "Meta API 검사에 실패했습니다."
    };
  }
}

export async function buildInstagramRecipientIndex(args: {
  userId: string;
  force?: boolean;
}): Promise<InstagramRecipientIndex> {
  const cacheKey = args.userId;
  const cached = recipientIndexCache.get(cacheKey);
  if (!args.force && cached && cached.expiresAtMs > Date.now()) {
    return cached.index;
  }

  const config = await resolveMetaConfig(args.userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    throw new Error(`Meta 설정 누락: ${missing.join(", ")}`);
  }

  const account = objectRecord(
    await metaGet({
      config,
      path: `/${encodeURIComponent(config.instagramAccountId)}`,
      params: { fields: "id,username" }
    })
  );
  const selfId = normalizeText(account.id || config.instagramAccountId);
  const selfUsername = normalizeUsername(account.username);
  const byUsername: Record<string, string> = {};
  const conversationIds: string[] = [];

  let after = "";
  for (let page = 0; page < MAX_CONVERSATION_PAGES; page += 1) {
    const response = objectRecord(
      await metaGet({
        config,
        path: `/${encodeURIComponent(config.instagramAccountId)}/conversations`,
        params: {
          platform: "instagram",
          fields: "id,updated_time",
          limit: 50,
          after: after || undefined
        }
      })
    );
    const data = arrayOfRecords(response.data);
    data.forEach((conversation) => {
      const conversationId = normalizeText(conversation.id);
      if (!conversationId) return;
      if (conversationIds.includes(conversationId)) return;
      if (conversationIds.length >= MAX_CONVERSATIONS_SCAN) return;
      conversationIds.push(conversationId);
    });
    const paging = objectRecord(response.paging);
    const cursors = objectRecord(paging.cursors);
    const nextAfter = normalizeText(cursors.after);
    if (!nextAfter || conversationIds.length >= MAX_CONVERSATIONS_SCAN) {
      break;
    }
    after = nextAfter;
  }

  for (const conversationId of conversationIds) {
    try {
      const detail = objectRecord(
        await metaGet({
          config,
          path: `/${encodeURIComponent(conversationId)}`,
          params: {
            fields: `messages.limit(${MAX_CONVERSATION_MESSAGES_SCAN}){id,from,to}`
          }
        })
      );
      const messages = arrayOfRecords(objectRecord(detail.messages).data);
      messages.forEach((message) => {
        const from = objectRecord(message.from);
        const fromId = normalizeText(from.id);
        const fromUsername = normalizeUsername(from.username);
        if (fromId && fromUsername && fromId !== selfId && fromUsername !== selfUsername) {
          byUsername[fromUsername] = fromId;
        }

        const toUsers = arrayOfRecords(objectRecord(message.to).data);
        toUsers.forEach((toUser) => {
          const toId = normalizeText(toUser.id);
          const toUsername = normalizeUsername(toUser.username);
          if (toId && toUsername && toId !== selfId && toUsername !== selfUsername) {
            byUsername[toUsername] = toId;
          }
        });
      });
    } catch {
      // 개별 대화 상세 조회 실패는 전체 인덱스 생성 실패로 보지 않습니다.
    }
  }

  const index: InstagramRecipientIndex = {
    loadedAt: new Date().toISOString(),
    scannedConversations: conversationIds.length,
    byUsername
  };
  recipientIndexCache.set(cacheKey, {
    index,
    expiresAtMs: Date.now() + RECIPIENT_INDEX_TTL_MS
  });
  return index;
}

export async function sendInstagramDmText(args: {
  userId: string;
  recipientId?: string;
  commentId?: string;
  message: string;
}): Promise<{ messageId?: string; raw: Record<string, unknown> }> {
  const recipientId = normalizeText(args.recipientId);
  const commentId = normalizeText(args.commentId);
  if (!recipientId && !commentId) {
    throw new Error("수신자 계정 ID 또는 comment_id가 필요합니다.");
  }
  const message = normalizeText(args.message);
  if (!message) {
    throw new Error("DM 메시지가 비어 있습니다.");
  }
  if (message.length > 1000) {
    throw new Error("DM 메시지는 최대 1000자까지 전송할 수 있습니다.");
  }

  const config = await resolveMetaConfig(args.userId);
  const missing = validateMetaConfig(config);
  if (missing.length > 0) {
    throw new Error(`Meta 설정 누락: ${missing.join(", ")}`);
  }

  const response = objectRecord(
    await metaPost({
      config,
      path: `/${encodeURIComponent(config.instagramAccountId)}/messages`,
      body: {
        recipient: JSON.stringify(commentId ? { comment_id: commentId } : { id: recipientId }),
        message: JSON.stringify({ text: message })
      }
    })
  );

  const messageId = normalizeText(response.message_id || response.id || response.mid || "");
  return {
    messageId: messageId || undefined,
    raw: response
  };
}
