import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId } from "@/lib/user-storage-namespace";
import { VideoWorkflow } from "@/lib/types";

const workflowFile = path.join(process.cwd(), "data", "workflows.json");

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const WORKFLOW_MAX_TOTAL = parsePositiveInt(process.env.WORKFLOW_MAX_TOTAL, 120);
const WORKFLOW_MAX_FINAL_READY = parsePositiveInt(process.env.WORKFLOW_MAX_FINAL_READY, 30);
const WORKFLOW_FINAL_READY_FULL_KEEP = parsePositiveInt(
  process.env.WORKFLOW_FINAL_READY_FULL_KEEP,
  8
);
const WORKFLOW_ARCHIVE_NARRATION_MAX_CHARS = parsePositiveInt(
  process.env.WORKFLOW_ARCHIVE_NARRATION_MAX_CHARS,
  240
);
const WORKFLOW_CACHE_TTL_MS = Math.max(
  1000,
  parsePositiveInt(process.env.WORKFLOW_CACHE_TTL_MS, 12000)
);

type WorkflowCacheEntry = {
  items: VideoWorkflow[];
  expiresAtMs: number;
};

const workflowCache = new Map<string, WorkflowCacheEntry>();

function isReadOnlyServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NEXT_RUNTIME === "edge"
  );
}

async function ensureWorkflowFile(): Promise<void> {
  if (isReadOnlyServerlessRuntime()) {
    return;
  }
  await fs.mkdir(path.dirname(workflowFile), { recursive: true });
  try {
    await fs.access(workflowFile);
  } catch {
    await fs.writeFile(workflowFile, JSON.stringify([], null, 2), "utf8");
  }
}

function parseWorkflows(value: unknown): VideoWorkflow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is VideoWorkflow => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const row = item as Partial<VideoWorkflow>;
    return Boolean(typeof row.id === "string" && row.id.trim());
  });
}

function compactWorkflowForArchive(item: VideoWorkflow): VideoWorkflow {
  const compactNarration = String(item.narration || "").trim();
  const limitedNarration =
    compactNarration.length > WORKFLOW_ARCHIVE_NARRATION_MAX_CHARS
      ? `${compactNarration.slice(0, WORKFLOW_ARCHIVE_NARRATION_MAX_CHARS)}...`
      : compactNarration;
  return {
    ...item,
    input: {
      ...item.input,
      narration: undefined
    },
    narration: limitedNarration,
    scenes: []
  };
}

function normalizeWorkflowCatalog(items: VideoWorkflow[]): {
  items: VideoWorkflow[];
  changed: boolean;
  beforeBytes: number;
  afterBytes: number;
} {
  const before = JSON.stringify(items);
  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const finalReady = sorted.filter(
    (item) => item.stage === "final_ready" && item.status !== "processing"
  );
  const finalReadyKept = finalReady.slice(0, WORKFLOW_MAX_FINAL_READY);
  const finalReadyKeepFullIds = new Set(
    finalReadyKept.slice(0, WORKFLOW_FINAL_READY_FULL_KEEP).map((item) => item.id)
  );
  const finalReadyKeptIds = new Set(finalReadyKept.map((item) => item.id));

  const normalized = sorted
    .filter((item) => item.stage !== "final_ready" || item.status === "processing" || finalReadyKeptIds.has(item.id))
    .map((item) => {
      if (
        item.stage === "final_ready" &&
        item.status !== "processing" &&
        !finalReadyKeepFullIds.has(item.id)
      ) {
        return compactWorkflowForArchive(item);
      }
      return item;
    })
    .slice(0, WORKFLOW_MAX_TOTAL);

  const after = JSON.stringify(normalized);
  return {
    items: normalized,
    changed: before !== after,
    beforeBytes: Buffer.byteLength(before, "utf8"),
    afterBytes: Buffer.byteLength(after, "utf8")
  };
}

function resolveWorkflowCacheKey(userId?: string): string {
  const storageUserId = scopedUserId(userId, "automation");
  if (storageUserId) {
    return `db:${storageUserId}`;
  }
  return `file:${workflowFile}`;
}

function readWorkflowCache(cacheKey: string): VideoWorkflow[] | undefined {
  const cached = workflowCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAtMs <= Date.now()) {
    workflowCache.delete(cacheKey);
    return undefined;
  }
  return cached.items;
}

function writeWorkflowCache(cacheKey: string, items: VideoWorkflow[]): void {
  workflowCache.set(cacheKey, {
    items,
    expiresAtMs: Date.now() + WORKFLOW_CACHE_TTL_MS
  });
}

async function readAllFromDb(userId?: string): Promise<VideoWorkflow[] | undefined> {
  const storageUserId = scopedUserId(userId, "automation");
  if (!storageUserId || !prisma) {
    return undefined;
  }
  const row = await prisma.userWorkflowCatalog.findUnique({
    where: { userId: storageUserId }
  });
  return parseWorkflows(row?.data);
}

async function writeAllToDb(items: VideoWorkflow[], userId?: string): Promise<boolean> {
  const storageUserId = scopedUserId(userId, "automation");
  if (!storageUserId || !prisma) {
    return false;
  }
  await prisma.userWorkflowCatalog.upsert({
    where: { userId: storageUserId },
    update: { data: items as unknown as Prisma.InputJsonValue },
    create: { userId: storageUserId, data: items as unknown as Prisma.InputJsonValue }
  });
  return true;
}

async function readAllFromFile(): Promise<VideoWorkflow[]> {
  if (isReadOnlyServerlessRuntime()) {
    return [];
  }
  await ensureWorkflowFile();
  const raw = await fs.readFile(workflowFile, "utf8");
  try {
    return parseWorkflows(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeAllToFile(items: VideoWorkflow[]): Promise<void> {
  if (isReadOnlyServerlessRuntime()) {
    return;
  }
  await ensureWorkflowFile();
  await fs.writeFile(workflowFile, JSON.stringify(items, null, 2), "utf8");
}

async function readAll(userId?: string): Promise<VideoWorkflow[]> {
  const canUseFileFallback = !isReadOnlyServerlessRuntime();
  const cacheKey = resolveWorkflowCacheKey(userId);
  const cached = readWorkflowCache(cacheKey);
  if (cached) {
    return cached;
  }

  if (prisma && scopedUserId(userId, "automation")) {
    try {
      const dbRows = await readAllFromDb(userId);
      if (dbRows) {
        const normalized = normalizeWorkflowCatalog(dbRows);
        if (normalized.changed) {
          try {
            await writeAllToDb(normalized.items, userId);
            console.info(
              `[workflow-store] compacted catalog for user=${String(userId || "")}: ${normalized.beforeBytes} -> ${normalized.afterBytes} bytes`
            );
          } catch (writeError) {
            const message = writeError instanceof Error ? writeError.message : String(writeError);
            console.error(
              `[workflow-store] compact writeback failed (user=${String(userId || "")}): ${message}`
            );
          }
        }
        writeWorkflowCache(cacheKey, normalized.items);
        return normalized.items;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[workflow-store] DB read failed (user=${String(userId || "")}): ${message}`);
      if (!canUseFileFallback) {
        throw new Error(`Workflow storage database read failed: ${message}`);
      }
    }
  }

  if (canUseFileFallback) {
    const fromFile = await readAllFromFile();
    const normalized = normalizeWorkflowCatalog(fromFile);
    if (normalized.changed) {
      await writeAllToFile(normalized.items);
    }
    writeWorkflowCache(cacheKey, normalized.items);
    return normalized.items;
  }

  throw new Error("Workflow storage is unavailable in serverless runtime without a database.");
}

async function writeAll(items: VideoWorkflow[], userId?: string): Promise<void> {
  const normalized = normalizeWorkflowCatalog(items);
  const itemsToWrite = normalized.items;
  const canUseFileFallback = !isReadOnlyServerlessRuntime();
  const cacheKey = resolveWorkflowCacheKey(userId);

  if (prisma && scopedUserId(userId, "automation")) {
    try {
      const savedToDb = await writeAllToDb(itemsToWrite, userId);
      if (savedToDb) {
        writeWorkflowCache(cacheKey, itemsToWrite);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[workflow-store] DB write failed (user=${String(userId || "")}): ${message}`);
      if (!canUseFileFallback) {
        throw new Error(`Workflow storage database write failed: ${message}`);
      }
    }
  }

  if (canUseFileFallback) {
    await writeAllToFile(itemsToWrite);
    writeWorkflowCache(cacheKey, itemsToWrite);
    return;
  }

  throw new Error("Workflow storage write is unavailable in serverless runtime without a database.");
}

export async function getWorkflow(id: string, userId?: string): Promise<VideoWorkflow | undefined> {
  const items = await readAll(userId);
  return items.find((item) => item.id === id);
}

export async function upsertWorkflow(
  workflow: VideoWorkflow,
  userId?: string
): Promise<VideoWorkflow> {
  const items = [...(await readAll(userId))];
  const index = items.findIndex((item) => item.id === workflow.id);
  if (index >= 0) {
    items[index] = workflow;
  } else {
    items.push(workflow);
  }
  await writeAll(items, userId);
  return workflow;
}

/** List workflows sorted by most recently updated first. */
export async function listWorkflows(userId?: string): Promise<VideoWorkflow[]> {
  const items = await readAll(userId);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete workflow by ID. Returns true when deleted. */
export async function deleteWorkflow(id: string, userId?: string): Promise<boolean> {
  const items = [...(await readAll(userId))];
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) {
    return false;
  }
  await writeAll(next, userId);
  return true;
}
