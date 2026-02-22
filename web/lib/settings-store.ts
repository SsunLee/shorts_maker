import { promises as fs } from "fs";
import path from "path";
import { AppSettings } from "@/lib/types";

const settingsFile = path.join(process.cwd(), "data", "settings.json");

async function ensureSettingsFile(): Promise<void> {
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });

  try {
    await fs.access(settingsFile);
  } catch {
    await fs.writeFile(settingsFile, JSON.stringify({}, null, 2), "utf8");
  }
}

/** Read locally saved settings used as a fallback to environment variables. */
export async function getSettings(): Promise<AppSettings> {
  await ensureSettingsFile();
  const raw = await fs.readFile(settingsFile, "utf8");

  try {
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

/** Persist settings to local disk for development and self-hosted usage. */
export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await ensureSettingsFile();
  await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}
