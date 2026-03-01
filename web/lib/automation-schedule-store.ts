import { promises as fs } from "fs";
import path from "path";
import { AutomationScheduleState } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveScheduleFile(): string {
  const explicit = (process.env.AUTOMATION_SCHEDULE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(process.cwd(), "data", `automation-schedule.${sanitizeNamespace(namespace)}.json`);
  }

  return path.join(process.cwd(), "data", "automation-schedule.json");
}

async function ensureScheduleFile(): Promise<void> {
  const scheduleFile = resolveScheduleFile();
  await fs.mkdir(path.dirname(scheduleFile), { recursive: true });
  try {
    await fs.access(scheduleFile);
  } catch {
    await fs.writeFile(scheduleFile, JSON.stringify({}, null, 2), "utf8");
  }
}

export async function readAutomationScheduleState(
  userId?: string
): Promise<Partial<AutomationScheduleState> | undefined> {
  if (userId && prisma) {
    const row = await prisma.userAutomationScheduleState.findUnique({
      where: { userId }
    });
    const parsed = row?.data;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Partial<AutomationScheduleState>;
  }

  const scheduleFile = resolveScheduleFile();
  await ensureScheduleFile();
  const raw = await fs.readFile(scheduleFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationScheduleState>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeAutomationScheduleState(
  state: AutomationScheduleState,
  userId?: string
): Promise<AutomationScheduleState> {
  if (userId && prisma) {
    await prisma.userAutomationScheduleState.upsert({
      where: { userId },
      update: { data: state as unknown as Prisma.InputJsonValue },
      create: { userId, data: state as unknown as Prisma.InputJsonValue }
    });
    return state;
  }

  const scheduleFile = resolveScheduleFile();
  await ensureScheduleFile();
  await fs.writeFile(scheduleFile, JSON.stringify(state, null, 2), "utf8");
  return state;
}
