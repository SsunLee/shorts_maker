import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId } from "@/lib/user-storage-namespace";

const INSTAGRAM_DM_SUFFIX = "::instagram-dm-state";
const MAX_RUN_HISTORY = 40;
const MAX_LOGS_PER_RUN = 500;
const MAX_COLLECTOR_MEDIA = 60;
const MAX_COLLECTOR_COMMENTS = 12000;
const MAX_COLLECTOR_ERRORS = 300;

export type InstagramDmDeliveryStatus = "sent" | "failed" | "skipped";

export type InstagramDmDeliveryLog = {
  id: string;
  rowIndex: number;
  rowId?: string;
  recipientId: string;
  recipientName?: string;
  status: InstagramDmDeliveryStatus;
  message: string;
  sentAt: string;
  error?: string;
  messageId?: string;
};

export type InstagramDmRunLog = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  dryRun: boolean;
  logs: InstagramDmDeliveryLog[];
};

export type InstagramDmMetaCheck = {
  checkedAt: string;
  ready: boolean;
  message?: string;
  missing?: string[];
  account?: {
    id?: string;
    username?: string;
  };
};

export type InstagramDmCollectorMediaItem = {
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

export type InstagramDmCollectedComment = {
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

export type InstagramDmCollectorDiagnostics = {
  totalComments: number;
  directUsernameCount: number;
  enrichedUsernameCount: number;
  fallbackUsernameCount: number;
  usernameMissingCount: number;
  withIgsidCount: number;
};

export type InstagramDmCollectorSnapshot = {
  collectedAt: string;
  selectedMediaIds: string[];
  mediaLimit: number;
  commentLimitPerMedia: number;
  includeReplies: boolean;
  media: InstagramDmCollectorMediaItem[];
  comments: InstagramDmCollectedComment[];
  errors?: string[];
  diagnostics?: InstagramDmCollectorDiagnostics;
};

export type InstagramDmState = {
  updatedAt: string;
  lastMetaCheck?: InstagramDmMetaCheck;
  collector?: InstagramDmCollectorSnapshot;
  runs: InstagramDmRunLog[];
};

function isReadOnlyServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NEXT_RUNTIME === "edge"
  );
}

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveDmStateFile(): string {
  const explicit = (process.env.INSTAGRAM_DM_STATE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(
      process.cwd(),
      "data",
      `instagram-dm-state.${sanitizeNamespace(namespace)}.json`
    );
  }

  return path.join(process.cwd(), "data", "instagram-dm-state.json");
}

function resolveDmStorageUserId(userId?: string): string | undefined {
  const scoped = scopedUserId(userId, "automation");
  if (!scoped) return undefined;
  return `${scoped}${INSTAGRAM_DM_SUFFIX}`;
}

async function ensureDmStateFile(): Promise<void> {
  if (isReadOnlyServerlessRuntime()) {
    return;
  }
  const dmStateFile = resolveDmStateFile();
  await fs.mkdir(path.dirname(dmStateFile), { recursive: true });
  try {
    await fs.access(dmStateFile);
  } catch {
    const initial: InstagramDmState = {
      updatedAt: new Date().toISOString(),
      runs: []
    };
    await fs.writeFile(dmStateFile, JSON.stringify(initial, null, 2), "utf8");
  }
}

function uid(): string {
  return randomUUID();
}

function normalizeDeliveryLog(input: Partial<InstagramDmDeliveryLog>, index: number): InstagramDmDeliveryLog | undefined {
  const status = input.status === "sent" || input.status === "failed" || input.status === "skipped" ? input.status : undefined;
  if (!status) {
    return undefined;
  }
  return {
    id: String(input.id || uid()),
    rowIndex: Number.isFinite(Number(input.rowIndex)) ? Number(input.rowIndex) : index,
    rowId: String(input.rowId || "").trim() || undefined,
    recipientId: String(input.recipientId || "").trim(),
    recipientName: String(input.recipientName || "").trim() || undefined,
    status,
    message: String(input.message || "").trim(),
    sentAt: String(input.sentAt || "").trim() || new Date().toISOString(),
    error: String(input.error || "").trim() || undefined,
    messageId: String(input.messageId || "").trim() || undefined
  };
}

function normalizeRun(input: Partial<InstagramDmRunLog>): InstagramDmRunLog | undefined {
  const startedAt = String(input.startedAt || "").trim();
  const finishedAt = String(input.finishedAt || "").trim();
  if (!startedAt || !finishedAt) {
    return undefined;
  }
  const logs = Array.isArray(input.logs)
    ? input.logs
        .map((item, index) => normalizeDeliveryLog((item || {}) as Partial<InstagramDmDeliveryLog>, index))
        .filter((item): item is InstagramDmDeliveryLog => Boolean(item))
        .slice(0, MAX_LOGS_PER_RUN)
    : [];
  return {
    runId: String(input.runId || uid()),
    startedAt,
    finishedAt,
    totalRows: Math.max(0, Number.parseInt(String(input.totalRows || 0), 10) || 0),
    sentCount: Math.max(0, Number.parseInt(String(input.sentCount || 0), 10) || 0),
    failedCount: Math.max(0, Number.parseInt(String(input.failedCount || 0), 10) || 0),
    skippedCount: Math.max(0, Number.parseInt(String(input.skippedCount || 0), 10) || 0),
    dryRun: Boolean(input.dryRun),
    logs
  };
}

function normalizeMetaCheck(input: unknown): InstagramDmMetaCheck | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const item = input as Partial<InstagramDmMetaCheck>;
  const checkedAt = String(item.checkedAt || "").trim();
  if (!checkedAt) {
    return undefined;
  }
  const account =
    item.account && typeof item.account === "object"
      ? {
          id: String(item.account.id || "").trim() || undefined,
          username: String(item.account.username || "").trim() || undefined
        }
      : undefined;
  return {
    checkedAt,
    ready: Boolean(item.ready),
    message: String(item.message || "").trim() || undefined,
    missing: Array.isArray(item.missing) ? item.missing.map((value) => String(value || "").trim()).filter(Boolean) : undefined,
    account
  };
}

function normalizeCollectorMediaItem(input: Partial<InstagramDmCollectorMediaItem>): InstagramDmCollectorMediaItem | undefined {
  const mediaId = String(input.mediaId || "").trim();
  if (!mediaId) {
    return undefined;
  }
  const commentsCountRaw = Number.parseInt(String(input.commentsCount ?? 0), 10);
  const commentsCount = Number.isFinite(commentsCountRaw) ? Math.max(0, commentsCountRaw) : 0;
  return {
    mediaId,
    caption: String(input.caption || "").trim() || undefined,
    mediaType: String(input.mediaType || "").trim() || undefined,
    mediaUrl: String(input.mediaUrl || "").trim() || undefined,
    thumbnailUrl: String(input.thumbnailUrl || "").trim() || undefined,
    permalink: String(input.permalink || "").trim() || undefined,
    timestamp: String(input.timestamp || "").trim() || undefined,
    commentsCount,
    fetchError: String(input.fetchError || "").trim() || undefined
  };
}

function normalizeCollectorComment(
  input: Partial<InstagramDmCollectedComment>,
  index: number
): InstagramDmCollectedComment | undefined {
  const commentId = String(input.commentId || "").trim();
  const mediaId = String(input.mediaId || "").trim();
  const text = String(input.text || "").trim();
  const timestamp = String(input.timestamp || "").trim();
  if (!commentId || !mediaId || !timestamp) {
    return undefined;
  }
  return {
    commentId,
    mediaId,
    mediaCaption: String(input.mediaCaption || "").trim() || undefined,
    mediaPermalink: String(input.mediaPermalink || "").trim() || undefined,
    username: String(input.username || "").trim() || `user_${index + 1}`,
    igsid: String(input.igsid || "").trim() || undefined,
    text,
    timestamp,
    parentId: String(input.parentId || "").trim() || undefined
  };
}

function normalizeCollectorSnapshot(input: unknown): InstagramDmCollectorSnapshot | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const item = input as Partial<InstagramDmCollectorSnapshot>;
  const collectedAt = String(item.collectedAt || "").trim();
  if (!collectedAt) {
    return undefined;
  }
  const selectedMediaIds = Array.isArray(item.selectedMediaIds)
    ? Array.from(new Set(item.selectedMediaIds.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, MAX_COLLECTOR_MEDIA)
    : [];
  const mediaLimitRaw = Number.parseInt(String(item.mediaLimit ?? 12), 10);
  const mediaLimit = Number.isFinite(mediaLimitRaw) ? Math.min(60, Math.max(1, mediaLimitRaw)) : 12;
  const commentLimitRaw = Number.parseInt(String(item.commentLimitPerMedia ?? 80), 10);
  const commentLimitPerMedia = Number.isFinite(commentLimitRaw) ? Math.min(500, Math.max(1, commentLimitRaw)) : 80;
  const media = Array.isArray(item.media)
    ? item.media
        .map((mediaItem) => normalizeCollectorMediaItem((mediaItem || {}) as Partial<InstagramDmCollectorMediaItem>))
        .filter((mediaItem): mediaItem is InstagramDmCollectorMediaItem => Boolean(mediaItem))
        .slice(0, MAX_COLLECTOR_MEDIA)
    : [];
  const comments = Array.isArray(item.comments)
    ? item.comments
        .map((comment, index) => normalizeCollectorComment((comment || {}) as Partial<InstagramDmCollectedComment>, index))
        .filter((comment): comment is InstagramDmCollectedComment => Boolean(comment))
        .slice(0, MAX_COLLECTOR_COMMENTS)
    : [];
  const errors = Array.isArray(item.errors)
    ? item.errors.map((value) => String(value || "").trim()).filter(Boolean).slice(0, MAX_COLLECTOR_ERRORS)
    : undefined;
  const diagnosticsInput =
    item.diagnostics && typeof item.diagnostics === "object" && !Array.isArray(item.diagnostics)
      ? (item.diagnostics as Partial<InstagramDmCollectorDiagnostics>)
      : undefined;
  const diagnostics = diagnosticsInput
    ? {
        totalComments: Math.max(0, Number.parseInt(String(diagnosticsInput.totalComments ?? comments.length), 10) || 0),
        directUsernameCount: Math.max(0, Number.parseInt(String(diagnosticsInput.directUsernameCount ?? 0), 10) || 0),
        enrichedUsernameCount: Math.max(0, Number.parseInt(String(diagnosticsInput.enrichedUsernameCount ?? 0), 10) || 0),
        fallbackUsernameCount: Math.max(0, Number.parseInt(String(diagnosticsInput.fallbackUsernameCount ?? 0), 10) || 0),
        usernameMissingCount: Math.max(0, Number.parseInt(String(diagnosticsInput.usernameMissingCount ?? 0), 10) || 0),
        withIgsidCount: Math.max(0, Number.parseInt(String(diagnosticsInput.withIgsidCount ?? 0), 10) || 0)
      }
    : undefined;
  return {
    collectedAt,
    selectedMediaIds,
    mediaLimit,
    commentLimitPerMedia,
    includeReplies: Boolean(item.includeReplies),
    media,
    comments,
    errors,
    diagnostics
  };
}

function normalizeState(input: unknown): InstagramDmState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      updatedAt: new Date().toISOString(),
      runs: []
    };
  }
  const item = input as Partial<InstagramDmState>;
  const runs = Array.isArray(item.runs)
    ? item.runs
        .map((run) => normalizeRun((run || {}) as Partial<InstagramDmRunLog>))
        .filter((run): run is InstagramDmRunLog => Boolean(run))
        .slice(0, MAX_RUN_HISTORY)
    : [];
  return {
    updatedAt: String(item.updatedAt || "").trim() || new Date().toISOString(),
    lastMetaCheck: normalizeMetaCheck(item.lastMetaCheck),
    collector: normalizeCollectorSnapshot(item.collector),
    runs
  };
}

export async function readInstagramDmState(userId?: string): Promise<InstagramDmState> {
  const storageUserId = resolveDmStorageUserId(userId);
  if (storageUserId && prisma) {
    const row = await prisma.userAutomationScheduleState.findUnique({
      where: { userId: storageUserId }
    });
    return normalizeState(row?.data);
  }

  if (isReadOnlyServerlessRuntime()) {
    return {
      updatedAt: new Date().toISOString(),
      runs: []
    };
  }

  await ensureDmStateFile();
  const raw = await fs.readFile(resolveDmStateFile(), "utf8");
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      runs: []
    };
  }
}

export async function writeInstagramDmState(state: InstagramDmState, userId?: string): Promise<InstagramDmState> {
  const normalized: InstagramDmState = {
    ...normalizeState(state),
    updatedAt: new Date().toISOString()
  };
  const storageUserId = resolveDmStorageUserId(userId);
  if (storageUserId && prisma) {
    await prisma.userAutomationScheduleState.upsert({
      where: { userId: storageUserId },
      update: { data: normalized as unknown as Prisma.InputJsonValue },
      create: { userId: storageUserId, data: normalized as unknown as Prisma.InputJsonValue }
    });
    return normalized;
  }

  if (isReadOnlyServerlessRuntime()) {
    throw new Error("Instagram DM state persistence requires DATABASE_URL on serverless runtime.");
  }

  await ensureDmStateFile();
  await fs.writeFile(resolveDmStateFile(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function appendInstagramDmRunLog(args: {
  userId?: string;
  run: InstagramDmRunLog;
}): Promise<InstagramDmState> {
  const state = await readInstagramDmState(args.userId);
  const normalizedRun = normalizeRun(args.run);
  if (!normalizedRun) {
    return state;
  }
  const nextState: InstagramDmState = {
    ...state,
    updatedAt: new Date().toISOString(),
    runs: [normalizedRun, ...(state.runs || [])].slice(0, MAX_RUN_HISTORY)
  };
  return writeInstagramDmState(nextState, args.userId);
}

export async function writeInstagramDmCollectorSnapshot(args: {
  userId?: string;
  snapshot: InstagramDmCollectorSnapshot;
}): Promise<InstagramDmState> {
  const state = await readInstagramDmState(args.userId);
  const normalizedCollector = normalizeCollectorSnapshot(args.snapshot);
  if (!normalizedCollector) {
    return state;
  }
  const nextState: InstagramDmState = {
    ...state,
    updatedAt: new Date().toISOString(),
    collector: normalizedCollector
  };
  return writeInstagramDmState(nextState, args.userId);
}
