import { getSettings } from "@/lib/settings-store";
import type { AppSettings } from "@/lib/types";

export type AiProvider = "openai" | "gemini";
export type AiTask = "text" | "image" | "tts";
export type AiMode = "auto" | "openai" | "gemini" | "mixed";

function normalizeMode(value: string | undefined): AiMode {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "openai" || raw === "gemini" || raw === "mixed") {
    return raw;
  }
  return "auto";
}

function normalizeProvider(value: string | undefined): AiProvider | undefined {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "openai" || raw === "gemini") {
    return raw;
  }
  return undefined;
}

function resolveMode(settings: AppSettings): AiMode {
  // Settings value has priority over env for explicit user control in UI.
  const settingsMode = normalizeMode(settings.aiMode);
  if (settingsMode !== "auto" || String(settings.aiMode || "").trim()) {
    return settingsMode;
  }
  return normalizeMode(process.env.AI_PROVIDER);
}

export async function resolveApiKeys(): Promise<{ openaiKey?: string; geminiKey?: string }> {
  const settings = await getSettings();
  return {
    openaiKey: process.env.OPENAI_API_KEY || settings.openaiApiKey,
    geminiKey: process.env.GEMINI_API_KEY || settings.geminiApiKey
  };
}

function chooseAvailableProvider(keys: { openaiKey?: string; geminiKey?: string }): AiProvider {
  if (keys.geminiKey) {
    return "gemini";
  }
  if (keys.openaiKey) {
    return "openai";
  }
  throw new Error("No AI provider key found. Add GEMINI_API_KEY or OPENAI_API_KEY in /settings.");
}

function ensureProviderKey(provider: AiProvider, keys: { openaiKey?: string; geminiKey?: string }): void {
  if (provider === "gemini" && !keys.geminiKey) {
    throw new Error("Gemini API key is missing. Configure it in /settings.");
  }
  if (provider === "openai" && !keys.openaiKey) {
    throw new Error("OpenAI API key is missing. Configure it in /settings.");
  }
}

function mixedTaskProvider(settings: AppSettings, task: AiTask): AiProvider | undefined {
  if (task === "text") {
    return normalizeProvider(settings.aiTextProvider);
  }
  if (task === "image") {
    return normalizeProvider(settings.aiImageProvider);
  }
  return normalizeProvider(settings.aiTtsProvider);
}

export async function resolveProviderForTask(task: AiTask): Promise<AiProvider> {
  const settings = await getSettings();
  const keys = {
    openaiKey: process.env.OPENAI_API_KEY || settings.openaiApiKey,
    geminiKey: process.env.GEMINI_API_KEY || settings.geminiApiKey
  };
  const mode = resolveMode(settings);

  if (mode === "openai" || mode === "gemini") {
    ensureProviderKey(mode, keys);
    return mode;
  }

  if (mode === "mixed") {
    const configured = mixedTaskProvider(settings, task);
    if (configured) {
      ensureProviderKey(configured, keys);
      return configured;
    }
    return chooseAvailableProvider(keys);
  }

  return chooseAvailableProvider(keys);
}

export async function resolveModelForTask(
  provider: AiProvider,
  task: AiTask
): Promise<string> {
  const settings = await getSettings();

  if (provider === "openai") {
    if (task === "text") {
      return settings.openaiTextModel || process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
    }
    if (task === "image") {
      return settings.openaiImageModel || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    }
    return settings.openaiTtsModel || process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  }

  if (task === "text") {
    return settings.geminiTextModel || process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  }
  if (task === "image") {
    return settings.geminiImageModel || process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  }
  return settings.geminiTtsModel || process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
}

