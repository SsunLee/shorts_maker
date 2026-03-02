import { promises as fs } from "fs";
import path from "path";
import { AppSettings } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
    youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || undefined
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

  if (userId && prisma) {
    const row = await prisma.userSettings.findUnique({
      where: { userId }
    });
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
  if (userId && prisma) {
    await prisma.userSettings.upsert({
      where: { userId },
      update: { data: settings as unknown as Prisma.InputJsonValue },
      create: { userId, data: settings as unknown as Prisma.InputJsonValue }
    });
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
