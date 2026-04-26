import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId } from "@/lib/user-storage-namespace";
import type { AutomationRunState } from "@/lib/types";

const AUTOMATION_RUN_STATE_SUFFIX = "::automation-run-state";

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

function resolveAutomationRunStateFile(): string {
  const explicit = (process.env.AUTOMATION_RUN_STATE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(process.cwd(), "data", `automation-run-state.${sanitizeNamespace(namespace)}.json`);
  }

  return path.join(process.cwd(), "data", "automation-run-state.json");
}

function resolveAutomationRunStorageUserId(userId?: string): string | undefined {
  const scoped = scopedUserId(userId, "automation");
  if (!scoped) return undefined;
  return `${scoped}${AUTOMATION_RUN_STATE_SUFFIX}`;
}

async function ensureAutomationRunStateFile(): Promise<void> {
  if (isReadOnlyServerlessRuntime()) {
    return;
  }
  const stateFile = resolveAutomationRunStateFile();
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  try {
    await fs.access(stateFile);
  } catch {
    await fs.writeFile(stateFile, JSON.stringify({}, null, 2), "utf8");
  }
}

export async function readAutomationRunState(
  userId?: string
): Promise<Partial<AutomationRunState> | undefined> {
  const storageUserId = resolveAutomationRunStorageUserId(userId);
  if (storageUserId && prisma) {
    const row = await prisma.userAutomationScheduleState.findUnique({
      where: { userId: storageUserId }
    });
    const parsed = row?.data;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Partial<AutomationRunState>;
  }

  if (isReadOnlyServerlessRuntime()) {
    return undefined;
  }

  await ensureAutomationRunStateFile();
  const raw = await fs.readFile(resolveAutomationRunStateFile(), "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationRunState>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeAutomationRunState(
  state: AutomationRunState,
  userId?: string
): Promise<AutomationRunState> {
  const storageUserId = resolveAutomationRunStorageUserId(userId);
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
      "Automation run-state persistence requires DATABASE_URL on serverless runtime. Add DATABASE_URL and retry."
    );
  }

  await ensureAutomationRunStateFile();
  await fs.writeFile(resolveAutomationRunStateFile(), JSON.stringify(state, null, 2), "utf8");
  return state;
}
