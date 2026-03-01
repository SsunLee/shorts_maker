import { promises as fs } from "fs";
import path from "path";
import { AppSettings } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveSettingsFile(): string {
  const explicit = (process.env.SETTINGS_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(process.cwd(), "data", `settings.${sanitizeNamespace(namespace)}.json`);
  }

  return path.join(process.cwd(), "data", "settings.json");
}

async function ensureSettingsFile(): Promise<void> {
  const settingsFile = resolveSettingsFile();
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });

  try {
    await fs.access(settingsFile);
  } catch {
    await fs.writeFile(settingsFile, JSON.stringify({}, null, 2), "utf8");
  }
}

/** Read locally saved settings used as a fallback to environment variables. */
export async function getSettings(userId?: string): Promise<AppSettings> {
  if (userId && prisma) {
    const row = await prisma.userSettings.findUnique({
      where: { userId }
    });
    const parsed = row?.data;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as AppSettings;
    }
    return {};
  }

  const settingsFile = resolveSettingsFile();
  await ensureSettingsFile();
  const raw = await fs.readFile(settingsFile, "utf8");

  try {
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

/** Persist settings to local disk for development and self-hosted usage. */
export async function saveSettings(settings: AppSettings, userId?: string): Promise<AppSettings> {
  if (userId && prisma) {
    await prisma.userSettings.upsert({
      where: { userId },
      update: { data: settings as unknown as Prisma.InputJsonValue },
      create: { userId, data: settings as unknown as Prisma.InputJsonValue }
    });
    return settings;
  }

  const settingsFile = resolveSettingsFile();
  await ensureSettingsFile();
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}
