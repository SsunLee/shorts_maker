import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId, unscopedUserId } from "@/lib/user-storage-namespace";
import type { InstagramAutomationScheduleState } from "@/lib/instagram-automation-types";

const INSTAGRAM_SCHEDULE_SUFFIX = "::instagram-schedule";

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

function resolveScheduleFile(): string {
  const explicit = (process.env.INSTAGRAM_AUTOMATION_SCHEDULE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(
      process.cwd(),
      "data",
      `instagram-automation-schedule.${sanitizeNamespace(namespace)}.json`
    );
  }

  return path.join(process.cwd(), "data", "instagram-automation-schedule.json");
}

function resolveInstagramScheduleStorageUserId(userId?: string): string | undefined {
  const scoped = scopedUserId(userId, "automation");
  if (!scoped) return undefined;
  return `${scoped}${INSTAGRAM_SCHEDULE_SUFFIX}`;
}

function recoverUserIdFromStorage(storageUserId: string): string | undefined {
  if (!storageUserId.endsWith(INSTAGRAM_SCHEDULE_SUFFIX)) {
    return undefined;
  }
  const scoped = storageUserId.slice(0, storageUserId.length - INSTAGRAM_SCHEDULE_SUFFIX.length);
  return unscopedUserId(scoped, "automation");
}

async function ensureScheduleFile(): Promise<void> {
  if (isReadOnlyServerlessRuntime()) {
    return;
  }
  const scheduleFile = resolveScheduleFile();
  await fs.mkdir(path.dirname(scheduleFile), { recursive: true });
  try {
    await fs.access(scheduleFile);
  } catch {
    await fs.writeFile(scheduleFile, JSON.stringify({}, null, 2), "utf8");
  }
}

export async function readInstagramAutomationScheduleState(
  userId?: string
): Promise<Partial<InstagramAutomationScheduleState> | undefined> {
  const storageUserId = resolveInstagramScheduleStorageUserId(userId);
  if (storageUserId && prisma) {
    const row = await prisma.userAutomationScheduleState.findUnique({
      where: { userId: storageUserId }
    });
    const parsed = row?.data;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Partial<InstagramAutomationScheduleState>;
  }

  if (isReadOnlyServerlessRuntime()) {
    return undefined;
  }

  const scheduleFile = resolveScheduleFile();
  await ensureScheduleFile();
  const raw = await fs.readFile(scheduleFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<InstagramAutomationScheduleState>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeInstagramAutomationScheduleState(
  state: InstagramAutomationScheduleState,
  userId?: string
): Promise<InstagramAutomationScheduleState> {
  const storageUserId = resolveInstagramScheduleStorageUserId(userId);
  if (storageUserId && prisma) {
    await prisma.userAutomationScheduleState.upsert({
      where: { userId: storageUserId },
      update: { data: state as unknown as Prisma.InputJsonValue },
      create: { userId: storageUserId, data: state as unknown as Prisma.InputJsonValue }
    });
    return state;
  }

  if (isReadOnlyServerlessRuntime()) {
    throw new Error(
      "Instagram automation schedule persistence requires DATABASE_URL on serverless runtime. Add DATABASE_URL and retry."
    );
  }

  const scheduleFile = resolveScheduleFile();
  await ensureScheduleFile();
  await fs.writeFile(scheduleFile, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function listEnabledInstagramScheduleUsers(): Promise<string[]> {
  if (!prisma) {
    return [];
  }

  const rows = await prisma.userAutomationScheduleState.findMany({
    select: {
      userId: true,
      data: true
    }
  });

  const users = new Set<string>();
  rows.forEach((row) => {
    const userId = recoverUserIdFromStorage(row.userId);
    if (!userId) {
      return;
    }
    const parsed = row.data;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }
    const state = parsed as Partial<InstagramAutomationScheduleState>;
    if (!state.config?.enabled) {
      return;
    }
    users.add(userId);
  });

  return Array.from(users);
}
