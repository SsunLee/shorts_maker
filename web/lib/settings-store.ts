import { promises as fs } from "fs";
import path from "path";
import { AppSettings } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scopedUserId } from "@/lib/user-storage-namespace";

const SETTINGS_DB_RETRY_MAX = 3;
const SETTINGS_DB_RETRY_DELAYS_MS = [200, 600];

function isReadOnlyServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NEXT_RUNTIME === "edge"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryablePrismaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return (
    normalized.includes("can't reach database server") ||
    normalized.includes("timed out fetching a new connection from the connection pool") ||
    normalized.includes("connection pool timeout") ||
    normalized.includes("server has closed the connection") ||
    normalized.includes("connection reset by peer")
  );
}

async function withSettingsDbRetry<T>(
  label: string,
  run: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < SETTINGS_DB_RETRY_MAX) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (!isRetryablePrismaError(error) || attempt >= SETTINGS_DB_RETRY_MAX) {
        break;
      }
      const waitMs = SETTINGS_DB_RETRY_DELAYS_MS[Math.min(attempt - 1, SETTINGS_DB_RETRY_DELAYS_MS.length - 1)];
      console.warn(
        `[settings-store] ${label} transient DB error, retrying (${attempt}/${SETTINGS_DB_RETRY_MAX}) in ${waitMs}ms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

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

function readSettingsFromEnv(): AppSettings {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    aiMode:
      process.env.AI_PROVIDER === "openai" ||
      process.env.AI_PROVIDER === "gemini" ||
      process.env.AI_PROVIDER === "auto"
        ? process.env.AI_PROVIDER
        : undefined,
    openaiTextModel: process.env.OPENAI_TEXT_MODEL || undefined,
    openaiImageModel: process.env.OPENAI_IMAGE_MODEL || undefined,
    openaiTtsModel: process.env.OPENAI_TTS_MODEL || undefined,
    geminiTextModel: process.env.GEMINI_TEXT_MODEL || undefined,
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || undefined,
    geminiTtsModel: process.env.GEMINI_TTS_MODEL || undefined,
    gsheetSpreadsheetId: process.env.GSHEETS_SPREADSHEET_ID || undefined,
    gsheetClientEmail: process.env.GSHEETS_CLIENT_EMAIL || undefined,
    gsheetPrivateKey: process.env.GSHEETS_PRIVATE_KEY || undefined,
    gsheetSheetName: process.env.GSHEETS_SHEET_NAME || undefined,
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID || undefined,
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || undefined,
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI || undefined,
    youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || undefined,
    youtubeChannelName: process.env.YOUTUBE_CHANNEL_NAME || undefined
  };
}

async function readSettingsFromFile(): Promise<AppSettings> {
  if (isReadOnlyServerlessRuntime()) {
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

/** Read locally saved settings used as a fallback to environment variables. */
export async function getSettings(userId?: string): Promise<AppSettings> {
  const envSettings = readSettingsFromEnv();
  const storageUserId = scopedUserId(userId, "settings");

  if (storageUserId && prisma) {
    const db = prisma;
    const row = await withSettingsDbRetry("getSettings.findUnique", () =>
      db.userSettings.findUnique({
        where: { userId: storageUserId }
      })
    );
    const parsed = row?.data;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        ...envSettings,
        ...(parsed as AppSettings)
      };
    }

    const fileSettings = await readSettingsFromFile();
    return {
      ...envSettings,
      ...fileSettings
    };
  }

  const fileSettings = await readSettingsFromFile();
  return {
    ...envSettings,
    ...fileSettings
  };
}

/** Persist settings to local disk for development and self-hosted usage. */
export async function saveSettings(settings: AppSettings, userId?: string): Promise<AppSettings> {
  const storageUserId = scopedUserId(userId, "settings");
  if (storageUserId && prisma) {
    const db = prisma;
    await withSettingsDbRetry("saveSettings.upsert", () =>
      db.userSettings.upsert({
        where: { userId: storageUserId },
        update: { data: settings as unknown as Prisma.InputJsonValue },
        create: { userId: storageUserId, data: settings as unknown as Prisma.InputJsonValue }
      })
    );
    return settings;
  }

  if (isReadOnlyServerlessRuntime()) {
    throw new Error(
      "Settings persistence requires DATABASE_URL on serverless runtime. Add DATABASE_URL and retry."
    );
  }

  const settingsFile = resolveSettingsFile();
  await ensureSettingsFile();
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}
