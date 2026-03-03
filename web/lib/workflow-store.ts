import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId } from "@/lib/user-storage-namespace";
import { VideoWorkflow } from "@/lib/types";

const workflowFile = path.join(process.cwd(), "data", "workflows.json");

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

  if (prisma && scopedUserId(userId, "automation")) {
    try {
      const dbRows = await readAllFromDb(userId);
      if (dbRows) {
        return dbRows;
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
    return readAllFromFile();
  }

  throw new Error("Workflow storage is unavailable in serverless runtime without a database.");
}

async function writeAll(items: VideoWorkflow[], userId?: string): Promise<void> {
  const canUseFileFallback = !isReadOnlyServerlessRuntime();

  if (prisma && scopedUserId(userId, "automation")) {
    try {
      const savedToDb = await writeAllToDb(items, userId);
      if (savedToDb) {
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
    await writeAllToFile(items);
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
  const items = await readAll(userId);
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
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete workflow by ID. Returns true when deleted. */
export async function deleteWorkflow(id: string, userId?: string): Promise<boolean> {
  const items = await readAll(userId);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) {
    return false;
  }
  await writeAll(next, userId);
  return true;
}
