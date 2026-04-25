import { GoogleGenAI, Modality } from "@google/genai";
import OpenAI from "openai";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import {
  storeGeneratedAsset,
  storeGeneratedAssetFromRemote
} from "@/lib/object-storage";
import type { ImageAspectRatio, WorkflowScene } from "@/lib/types";
import { toGeminiVoiceName, toOpenAiVoiceName } from "@/lib/voice-options";

type GeminiInlineData = {
  data: string;
  mimeType?: string;
};

export type ImageVisualPolicy = "default" | "news_strict";

const NEWS_STRICT_VISUAL_GUARD_CLAUSE =
  "Strictly avoid holograms, futuristic HUD/UI overlays, transparent projection screens, " +
  "AR/VR goggles, neon cyberpunk effects, sci-fi control panels, robots/androids, " +
  "floating digital graphics, and fantasy magic effects. " +
  "Keep scenes grounded in present-day real-world context with plausible props, attire, and environments. " +
  "Respect the user-selected art style and composition.";

const NEWS_STRICT_TOKEN_PATTERN =
  /\b(hologram|holographic|hud|heads?-?up display|futuristic|sci-?fi|cyberpunk|neon ui|ar\/vr|augmented reality|virtual reality|projection screen|floating interface|robot|android|magic aura|glowing panel)\b/gi;

function applyVisualPolicyClause(base: string, policy: ImageVisualPolicy): string {
  if (policy !== "news_strict") {
    return base;
  }
  return `${base} ${NEWS_STRICT_VISUAL_GUARD_CLAUSE}`;
}

function sanitizePromptByVisualPolicy(prompt: string, policy: ImageVisualPolicy): string {
  const source = String(prompt || "").trim();
  if (!source) {
    return source;
  }
  if (policy !== "news_strict") {
    return source;
  }

  const stripped = source.replace(NEWS_STRICT_TOKEN_PATTERN, "").replace(/\s{2,}/g, " ").trim();
  const guarded = `${stripped}. ${NEWS_STRICT_VISUAL_GUARD_CLAUSE}`;
  return guarded.replace(/\s{2,}/g, " ").trim();
}

/** Create an OpenAI client from env/settings and throw if no key exists. */
export async function getOpenAiClient(userId?: string): Promise<OpenAI> {
  const keys = await resolveApiKeys(userId);
  const apiKey = keys.openaiKey;
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing. Set OPENAI_API_KEY or save it in /settings."
    );
  }
  return new OpenAI({ apiKey });
}

/** Create a Gemini client from env/settings and throw if no key exists. */
async function getGeminiClient(userId?: string): Promise<GoogleGenAI> {
  const keys = await resolveApiKeys(userId);
  const apiKey = keys.geminiKey;
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. Set GEMINI_API_KEY or save it in /settings."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function parseStringArray(raw: string, limit: number): string[] {
  const normalized = stripJsonFence(raw);
  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.map(String).slice(0, limit);
    }
  } catch {
    // Fallback parsing below.
  }

  return normalized
    .split("\n")
    .map((line) => line.replace(/^\d+[\).\s-]*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function stripJsonFence(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

type CtaLanguage = "ko" | "en" | "ja" | "es";

function detectNarrationLanguage(source: string): CtaLanguage {
  if (/[가-힣]/.test(source)) {
    return "ko";
  }
  if (/[\u3040-\u30ff]/.test(source)) {
    return "ja";
  }

  const lowered = source.toLowerCase();
  if (
    /[¿¡áéíóúñ]/i.test(source) ||
    /\b(el|la|los|las|de|del|historia|civilizaci[oó]n|antiguo|egipto)\b/.test(lowered)
  ) {
    return "es";
  }
  return "en";
}

function subscribeCtaByLanguage(language: CtaLanguage): string {
  if (language === "ko") {
    return "더 많은 이야기, 구독하고 함께해 주세요.";
  }
  if (language === "ja") {
    return "続きが気になる方は、ぜひチャンネル登録してください。";
  }
  if (language === "es") {
    return "Si te gustó, suscríbete para más historias.";
  }
  return "Subscribe for more stories like this.";
}

function hasSubscribeCta(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    /구독/.test(text) ||
    /subscribe/.test(lowered) ||
    /suscr[ií]bete/.test(lowered) ||
    /チャンネル登録/.test(text)
  );
}

function appendSubscribeCta(args: { narration: string; title: string; topic?: string }): string {
  const narration = args.narration.trim();
  if (!narration) {
    return narration;
  }
  if (hasSubscribeCta(narration)) {
    return narration;
  }
  const language = detectNarrationLanguage(`${args.title}\n${args.topic || ""}\n${narration}`);
  const cta = subscribeCtaByLanguage(language);
  return `${narration}\n\n${cta}`;
}

function safeParseScenes(raw: string, sceneCount: number): WorkflowScene[] | null {
  try {
    const normalized = stripJsonFence(raw);
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const scenes = parsed
      .slice(0, sceneCount)
      .map((item, index) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const sceneTitle = String(
          (item as Record<string, unknown>).sceneTitle ||
            (item as Record<string, unknown>).title ||
            `Scene ${index + 1}`
        );
        const narrationText = String(
          (item as Record<string, unknown>).narrationText ||
            (item as Record<string, unknown>).narration ||
            ""
        );
        const imagePrompt = String(
          (item as Record<string, unknown>).imagePrompt ||
            (item as Record<string, unknown>).prompt ||
            ""
        );
        return {
          index: index + 1,
          sceneTitle,
          narrationText,
          imagePrompt
        } satisfies WorkflowScene;
      })
      .filter((item): item is WorkflowScene => Boolean(item));

    return scenes.length === sceneCount ? scenes : null;
  } catch {
    return null;
  }
}

function normalizeImageStylePreset(style: string): string {
  const raw = String(style || "").trim().toLowerCase();
  if (!raw) {
    return "Cinematic photo-real";
  }
  if (
    raw === "3d pixar-style" ||
    raw === "3d pixar style" ||
    raw.includes("pixar")
  ) {
    return "3D Pixar-style";
  }
  if (
    raw === "완전 실사 포토그래퍼" ||
    raw === "ultra photoreal photographer" ||
    raw.includes("photographer") ||
    raw.includes("ultra photo-real") ||
    raw.includes("hyper realistic")
  ) {
    return "Ultra photoreal photographer";
  }
  return String(style || "").trim();
}

function buildImageStyleInstruction(style: string): string {
  const preset = normalizeImageStylePreset(style);
  if (preset === "3D Pixar-style") {
    return (
      "3D Pixar-style animated film look. " +
      "Stylized 3D characters, expressive facial features, clean non-photoreal materials, " +
      "soft global illumination, polished cinematic color grading, and family-friendly animation tone. " +
      "Not live-action photo, not documentary photojournalism."
    );
  }
  if (preset === "Ultra photoreal photographer") {
    return (
      "Ultra photoreal professional photography style. " +
      "Documentary-grade realism, physically accurate lighting, natural skin/texture detail, " +
      "real camera optics (35mm/50mm/85mm lens look), subtle depth-of-field, clean dynamic range, " +
      "sharp focus on subject. No illustration, no anime, no 3D render, no painterly look, no CGI/plastic texture."
    );
  }
  return preset;
}

function ensurePromptContainsStyle(prompt: string, style?: string): string {
  const source = String(prompt || "").trim();
  const rawStyle = String(style || "").trim();
  if (!source || !rawStyle) {
    return source;
  }

  const preset = normalizeImageStylePreset(rawStyle);
  const styleInstruction = buildImageStyleInstruction(rawStyle);
  const lowered = source.toLowerCase();
  if (lowered.includes(preset.toLowerCase())) {
    return source;
  }

  if (preset === "3D Pixar-style" && /(pixar|3d animation|animated film|non-photoreal)/i.test(source)) {
    return source;
  }
  if (
    preset === "Ultra photoreal photographer" &&
    /(photoreal|photo-real|realistic photo|professional photography|documentary)/i.test(source)
  ) {
    return source;
  }

  return `${styleInstruction}. ${source}`.replace(/\s{2,}/g, " ").trim();
}

function shouldApplyJapaneseVisualHint(args: {
  title: string;
  topic?: string;
  narration: string;
}): boolean {
  const language = detectNarrationLanguage(
    `${String(args.title || "")}\n${String(args.topic || "")}\n${String(args.narration || "")}`
  );
  return language === "ja";
}

function appendJapaneseVisualHint(prompt: string): string {
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) {
    return safePrompt;
  }
  const lowered = safePrompt.toLowerCase();
  if (
    lowered.includes("east asian") ||
    lowered.includes("japanese people") ||
    lowered.includes("japanese setting")
  ) {
    return safePrompt;
  }
  return `${safePrompt}. East Asian (Japanese) people/context when people appear.`;
}

function fallbackSplitScenes(args: {
  narration: string;
  imageStyle: string;
  imageAspectRatio: ImageAspectRatio;
  sceneCount: number;
  japaneseVisualHint?: boolean;
  visualPolicy?: ImageVisualPolicy;
}): WorkflowScene[] {
  const styleInstruction = buildImageStyleInstruction(args.imageStyle);
  const japaneseVisualGuide = args.japaneseVisualHint
    ? "East Asian (Japanese) people/context when people appear."
    : "";
  const composition =
    args.imageAspectRatio === "16:9"
      ? "Landscape 16:9 composition for cinematic widescreen framing."
      : "Vertical 9:16 composition for short-form mobile framing.";
  const words = args.narration.split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(words.length / args.sceneCount));
  return Array.from({ length: args.sceneCount }).map((_, idx) => {
    const chunk = words.slice(idx * chunkSize, (idx + 1) * chunkSize).join(" ");
    const visualPolicy = args.visualPolicy === "news_strict" ? "news_strict" : "default";
    return {
      index: idx + 1,
      sceneTitle: `Scene ${idx + 1}`,
      narrationText: chunk || args.narration,
      imagePrompt: sanitizePromptByVisualPolicy(
        `${styleInstruction}. ${chunk || args.narration}. ${composition}${
          japaneseVisualGuide ? ` ${japaneseVisualGuide}` : ""
        }`,
        visualPolicy
      )
    };
  });
}

/** Build short-form narration text based on topic + title + target length. */
export async function generateNarration(args: {
  title: string;
  topic?: string;
  targetLengthSec: number;
} , userId?: string): Promise<string> {
  const provider = await resolveProviderForTask("text", userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = await getGeminiClient(userId);
    const response = await runGeminiWithRetry({
      label: "Narration generation",
      task: () =>
        client.models.generateContent({
          model: textModel,
          contents:
            "You write concise viral short-video narration scripts. Keep it spoken and punchy. " +
            `Write narration for a ${args.targetLengthSec}-second short.\n` +
            `Title: ${args.title}\n` +
            `Topic: ${args.topic ?? "N/A"}\n` +
            "Include a hook, value, and CTA."
        })
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini did not return narration text.");
    }
    return appendSubscribeCta({
      narration: text,
      title: args.title,
      topic: args.topic
    });
  }

  const client = await getOpenAiClient(userId);
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          "You write concise viral short-video narration scripts. Keep it spoken and punchy."
      },
      {
        role: "user",
        content: `Write narration for a ${args.targetLengthSec}-second short.\nTitle: ${args.title}\nTopic: ${args.topic ?? "N/A"}\nInclude a hook, value, and CTA.`
      }
    ]
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("OpenAI did not return narration text.");
  }

  return appendSubscribeCta({
    narration: text,
    title: args.title,
    topic: args.topic
  });
}

/** Create stylized image prompts from narration text. */
export async function generateImagePrompts(args: {
  title: string;
  narration: string;
  imageStyle: string;
  imageAspectRatio?: ImageAspectRatio;
  sceneCount?: number;
  visualPolicy?: ImageVisualPolicy;
}, userId?: string): Promise<string[]> {
  const sceneCount = Math.max(3, Math.min(12, args.sceneCount ?? 5));
  const imageAspectRatio = args.imageAspectRatio === "16:9" ? "16:9" : "9:16";
  const styleInstruction = buildImageStyleInstruction(args.imageStyle);
  const japaneseVisualHint = shouldApplyJapaneseVisualHint({
    title: args.title,
    narration: args.narration
  });
  const japaneseVisualGuide = japaneseVisualHint
    ? "If people appear, explicitly depict East Asian (Japanese) people/context."
    : "";
  const compositionGuide =
    imageAspectRatio === "16:9"
      ? "Use cinematic landscape 16:9 composition with strong horizontal framing."
      : "Use vertical storytelling composition optimized for 9:16 mobile shorts.";
  const visualPolicy = args.visualPolicy === "news_strict" ? "news_strict" : "default";
  const visualPolicyGuide = applyVisualPolicyClause("", visualPolicy).trim();
  const provider = await resolveProviderForTask("text", userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = await getGeminiClient(userId);
    const response = await runGeminiWithRetry({
      label: "Image prompt generation",
      task: () =>
        client.models.generateContent({
          model: textModel,
          contents:
            `Output only a JSON array with exactly ${sceneCount} short image prompts. ` +
            "Prompts must be non-graphic, educational, and safe for general audiences. " +
            "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction.\n" +
            `${compositionGuide}\n` +
            `${japaneseVisualGuide}\n` +
            `${visualPolicyGuide}\n` +
            `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${styleInstruction}`
        })
    });

    const prompts = parseStringArray(response.text || "", sceneCount);
    if (prompts.length !== sceneCount) {
      throw new Error(`Failed to generate exactly ${sceneCount} image prompts.`);
    }
    const withJapaneseHint = japaneseVisualHint ? prompts.map(appendJapaneseVisualHint) : prompts;
    return withJapaneseHint.map((prompt) => sanitizePromptByVisualPolicy(prompt, visualPolicy));
  }

  const client = await getOpenAiClient(userId);
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          `Output only a JSON array with exactly ${sceneCount} short image prompts. ` +
          "Prompts must be non-graphic, educational, and safe for general audiences. " +
          "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction. " +
          compositionGuide +
          (japaneseVisualGuide ? ` ${japaneseVisualGuide}` : "") +
          (visualPolicyGuide ? ` ${visualPolicyGuide}` : "")
      },
      {
        role: "user",
        content: `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${styleInstruction}`
      }
    ]
  });

  const prompts = parseStringArray(response.output_text || "", sceneCount);
  if (prompts.length !== sceneCount) {
    throw new Error(`Failed to generate exactly ${sceneCount} image prompts.`);
  }
  const withJapaneseHint = japaneseVisualHint ? prompts.map(appendJapaneseVisualHint) : prompts;
  return withJapaneseHint.map((prompt) => sanitizePromptByVisualPolicy(prompt, visualPolicy));
}

/** Split narration into N scenes and generate one image prompt per scene. */
export async function splitNarrationToScenes(args: {
  title: string;
  narration: string;
  imageStyle: string;
  imageAspectRatio?: ImageAspectRatio;
  sceneCount?: number;
  visualPolicy?: ImageVisualPolicy;
}, userId?: string): Promise<WorkflowScene[]> {
  const sceneCount = Math.max(3, Math.min(12, args.sceneCount ?? 5));
  const imageAspectRatio = args.imageAspectRatio === "16:9" ? "16:9" : "9:16";
  const styleInstruction = buildImageStyleInstruction(args.imageStyle);
  const japaneseVisualHint = shouldApplyJapaneseVisualHint({
    title: args.title,
    narration: args.narration
  });
  const japaneseVisualGuide = japaneseVisualHint
    ? "If people appear, explicitly depict East Asian (Japanese) people/context."
    : "";
  const compositionGuide =
    imageAspectRatio === "16:9"
      ? "All image prompts must explicitly request landscape 16:9 composition."
      : "All image prompts must explicitly request vertical 9:16 composition.";
  const visualPolicy = args.visualPolicy === "news_strict" ? "news_strict" : "default";
  const visualPolicyGuide = applyVisualPolicyClause("", visualPolicy).trim();
  const provider = await resolveProviderForTask("text", userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = await getGeminiClient(userId);
    const response = await runGeminiWithRetry({
      label: "Scene split generation",
      task: () =>
        client.models.generateContent({
          model: textModel,
          contents:
            `Return only JSON array with exactly ${sceneCount} objects: sceneTitle, narrationText, imagePrompt. ` +
            "All imagePrompt values must be non-graphic, educational, and safe for general audiences. " +
            "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction.\n" +
            `${compositionGuide}\n` +
            `${japaneseVisualGuide}\n` +
            `${visualPolicyGuide}\n` +
            `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${styleInstruction}\n` +
            `Split the narration flow into ${sceneCount} logical scenes and write one visual prompt per scene.`
        })
    });

    const parsed = safeParseScenes(response.text || "", sceneCount);
    if (parsed) {
      const mapped = japaneseVisualHint
        ? parsed.map((scene) => ({
            ...scene,
            imagePrompt: appendJapaneseVisualHint(scene.imagePrompt)
          }))
        : parsed;
      return mapped.map((scene) => ({
        ...scene,
        imagePrompt: sanitizePromptByVisualPolicy(scene.imagePrompt, visualPolicy)
      }));
    }

    return fallbackSplitScenes({
      narration: args.narration,
      imageStyle: args.imageStyle,
      imageAspectRatio,
      sceneCount,
      japaneseVisualHint,
      visualPolicy
    });
  }

  const client = await getOpenAiClient(userId);
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          `Return only JSON array with exactly ${sceneCount} objects: sceneTitle, narrationText, imagePrompt. ` +
          "All imagePrompt values must be non-graphic, educational, and safe for general audiences. " +
          "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction. " +
          compositionGuide +
          (japaneseVisualGuide ? ` ${japaneseVisualGuide}` : "") +
          (visualPolicyGuide ? ` ${visualPolicyGuide}` : "")
      },
      {
        role: "user",
        content:
          `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${styleInstruction}\n` +
          `Split the narration flow into ${sceneCount} logical scenes and write one visual prompt per scene.`
      }
    ]
  });

  const parsed = safeParseScenes(response.output_text || "", sceneCount);
  if (parsed) {
    const mapped = japaneseVisualHint
      ? parsed.map((scene) => ({
          ...scene,
          imagePrompt: appendJapaneseVisualHint(scene.imagePrompt)
        }))
      : parsed;
    return mapped.map((scene) => ({
      ...scene,
      imagePrompt: sanitizePromptByVisualPolicy(scene.imagePrompt, visualPolicy)
    }));
  }

  return fallbackSplitScenes({
    narration: args.narration,
    imageStyle: args.imageStyle,
    imageAspectRatio,
    sceneCount,
    japaneseVisualHint,
    visualPolicy
  });
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("resource exhausted") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("deadline exceeded") ||
    message.includes("internal error")
  );
}

async function runGeminiWithRetry<T>(args: {
  task: () => Promise<T>;
  label: string;
  retryCount?: number;
  baseDelayMs?: number;
}): Promise<T> {
  const retryCount =
    args.retryCount ?? parsePositiveInt(process.env.GEMINI_RETRY_COUNT, 3);
  const baseDelayMs =
    args.baseDelayMs ?? parsePositiveInt(process.env.GEMINI_RETRY_BASE_MS, 800);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await args.task();
    } catch (error) {
      lastError = error;
      const isRetryable = isRetryableProviderError(error);
      if (!isRetryable || attempt >= retryCount) {
        break;
      }
      const waitMs = baseDelayMs * Math.max(1, 2 ** attempt) + Math.floor(Math.random() * 200);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${args.label} failed.`);
}

function isSafetyRejectionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("safety system") ||
    message.includes("safety_violations") ||
    message.includes("safety") ||
    message.includes("violence") ||
    message.includes("self-harm")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractInlineData(
  response: unknown,
  expectedMimePrefix?: string
): GeminiInlineData | null {
  const root = asRecord(response);
  if (!root) {
    return null;
  }

  let fallback: GeminiInlineData | null = null;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  for (const candidate of candidates) {
    const candidateObj = asRecord(candidate);
    const contentObj = candidateObj ? asRecord(candidateObj.content) : null;
    const parts = contentObj && Array.isArray(contentObj.parts) ? contentObj.parts : [];

    for (const part of parts) {
      const partObj = asRecord(part);
      const inlineData = partObj ? asRecord(partObj.inlineData) : null;
      const data = inlineData && typeof inlineData.data === "string" ? inlineData.data : undefined;
      const mimeType =
        inlineData && typeof inlineData.mimeType === "string" ? inlineData.mimeType : undefined;

      if (!data) {
        continue;
      }

      if (!fallback) {
        fallback = { data, mimeType };
      }

      if (!expectedMimePrefix || (mimeType && mimeType.startsWith(expectedMimePrefix))) {
        return { data, mimeType };
      }
    }
  }

  if (fallback) {
    return fallback;
  }

  if (typeof root.data === "string" && root.data.trim()) {
    return { data: root.data.trim() };
  }

  return null;
}

function extensionFromMime(mimeType: string | undefined, fallback: string): string {
  const mime = (mimeType || "").toLowerCase();

  if (mime.includes("image/png")) {
    return "png";
  }
  if (mime.includes("image/jpeg") || mime.includes("image/jpg")) {
    return "jpg";
  }
  if (mime.includes("image/webp")) {
    return "webp";
  }
  if (mime.includes("audio/wav")) {
    return "wav";
  }
  if (mime.includes("audio/x-wav")) {
    return "wav";
  }
  if (mime.includes("audio/mpeg") || mime.includes("audio/mp3")) {
    return "mp3";
  }
  if (mime.includes("audio/ogg")) {
    return "ogg";
  }
  if (mime.includes("audio/flac")) {
    return "flac";
  }
  if (mime.includes("audio/aac")) {
    return "aac";
  }

  return fallback;
}

function pcm16ToWav(args: {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
}): Buffer {
  const bitsPerSample = 16;
  const byteRate = args.sampleRate * args.channels * (bitsPerSample / 8);
  const blockAlign = args.channels * (bitsPerSample / 8);
  const dataSize = args.pcm.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16); // PCM fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM format
  wav.writeUInt16LE(args.channels, 22);
  wav.writeUInt32LE(args.sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  args.pcm.copy(wav, 44);
  return wav;
}

function parsePcmRateAndChannels(mimeType?: string): {
  sampleRate: number;
  channels: number;
} {
  const raw = (mimeType || "").toLowerCase();
  const rateMatch = raw.match(/rate\\s*=\\s*(\\d+)/i);
  const channelMatch = raw.match(/channels\\s*=\\s*(\\d+)/i);
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    channels: channelMatch ? Number(channelMatch[1]) : 1
  };
}

function detectAudioMimeAndExtension(buffer: Buffer): {
  mimeType: string;
  extension: string;
} | null {
  if (buffer.length < 4) {
    return null;
  }

  // RIFF....WAVE
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    return { mimeType: "audio/wav", extension: "wav" };
  }

  // ID3 tag or MP3 frame sync
  if (
    buffer.subarray(0, 3).toString("ascii") === "ID3" ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", extension: "mp3" };
  }

  // OGG container
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return { mimeType: "audio/ogg", extension: "ogg" };
  }

  // FLAC
  if (buffer.subarray(0, 4).toString("ascii") === "fLaC") {
    return { mimeType: "audio/flac", extension: "flac" };
  }

  // AAC ADTS
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return { mimeType: "audio/aac", extension: "aac" };
  }

  return null;
}

async function rewritePromptForSafetyOpenAi(args: {
  client: OpenAI;
  prompt: string;
  imageAspectRatio?: ImageAspectRatio;
  textModel: string;
}): Promise<string> {
  const response = await args.client.responses.create({
    model: args.textModel,
    input: [
      {
        role: "system",
        content:
          "Rewrite image prompts to be policy-safe for general audiences while preserving topic/style intent. " +
          "No explicit violence, injury, blood, death moments, or self-harm depiction. " +
          "Return exactly one single-line prompt."
      },
      {
        role: "user",
        content: args.prompt
      }
    ]
  });

  const rewritten = (response.output_text || "").trim();
  if (!rewritten) {
    return args.imageAspectRatio === "16:9"
      ? "Ancient Egyptian temple interior, cinematic lighting, educational historical atmosphere, landscape 16:9."
      : "Ancient Egyptian temple interior, cinematic lighting, educational historical atmosphere, vertical 9:16.";
  }
  return rewritten;
}

async function rewritePromptForSafetyGemini(args: {
  client: GoogleGenAI;
  prompt: string;
  imageAspectRatio?: ImageAspectRatio;
  textModel: string;
}): Promise<string> {
  const response = await runGeminiWithRetry({
    label: "Safety prompt rewrite",
    task: () =>
      args.client.models.generateContent({
        model: args.textModel,
        contents:
          "Rewrite image prompts to be policy-safe for general audiences while preserving topic/style intent. " +
          "No explicit violence, injury, blood, death moments, or self-harm depiction. " +
          "Return exactly one single-line prompt.\n" +
          args.prompt
      })
  });

  const rewritten = (response.text || "").trim();
  if (!rewritten) {
    return args.imageAspectRatio === "16:9"
      ? "Ancient Egyptian temple interior, cinematic lighting, educational historical atmosphere, landscape 16:9."
      : "Ancient Egyptian temple interior, cinematic lighting, educational historical atmosphere, vertical 9:16.";
  }
  return rewritten;
}

async function generateImageWithRetryOpenAi(args: {
  client: OpenAI;
  prompt: string;
  imageAspectRatio: ImageAspectRatio;
  timeoutMs: number;
  retryCount: number;
  promptIndex: number;
  imageModel: string;
  textModel: string;
}): Promise<OpenAI.Images.ImagesResponse> {
  let currentPrompt = args.prompt;
  let rewrittenForSafety = false;
  let lastError: unknown;
  for (let attempt = 0; attempt <= args.retryCount; attempt += 1) {
    try {
      return await withTimeout(
        args.client.images.generate({
          model: args.imageModel,
          prompt: currentPrompt,
          size: args.imageAspectRatio === "16:9" ? "1536x1024" : "1024x1536"
        }),
        args.timeoutMs,
        `Image generation timed out for prompt ${args.promptIndex + 1}.`
      );
    } catch (error) {
      if (isSafetyRejectionError(error) && !rewrittenForSafety) {
        currentPrompt = await rewritePromptForSafetyOpenAi({
          client: args.client,
          prompt: currentPrompt,
          imageAspectRatio: args.imageAspectRatio,
          textModel: args.textModel
        });
        rewrittenForSafety = true;
        continue;
      }
      lastError = error;
      if (attempt < args.retryCount) {
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Image generation failed for prompt ${args.promptIndex + 1}.`);
}

async function generateImageWithRetryGemini(args: {
  client: GoogleGenAI;
  prompt: string;
  imageAspectRatio: ImageAspectRatio;
  timeoutMs: number;
  retryCount: number;
  promptIndex: number;
  imageModel: string;
  textModel: string;
}): Promise<GeminiInlineData> {
  let currentPrompt = args.prompt;
  let rewrittenForSafety = false;
  let lastError: unknown;

  for (let attempt = 0; attempt <= args.retryCount; attempt += 1) {
    try {
      const response = await withTimeout(
        args.client.models.generateContent({
          model: args.imageModel,
          contents: currentPrompt,
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            imageConfig: {
              aspectRatio: args.imageAspectRatio
            }
          }
        }),
        args.timeoutMs,
        `Image generation timed out for prompt ${args.promptIndex + 1}.`
      );

      const inline = extractInlineData(response, "image/");
      if (!inline) {
        throw new Error(`Gemini did not return image bytes for prompt ${args.promptIndex + 1}.`);
      }
      return inline;
    } catch (error) {
      if (isSafetyRejectionError(error) && !rewrittenForSafety) {
        currentPrompt = await rewritePromptForSafetyGemini({
          client: args.client,
          prompt: currentPrompt,
          imageAspectRatio: args.imageAspectRatio,
          textModel: args.textModel
        });
        rewrittenForSafety = true;
        continue;
      }
      lastError = error;
      if (attempt < args.retryCount) {
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Image generation failed for prompt ${args.promptIndex + 1}.`);
}

/** Generate images and store them under configured storage (local or S3). */
export async function generateImages(
  jobId: string,
  prompts: string[],
  options?: {
    startIndex?: number;
    imageAspectRatio?: ImageAspectRatio;
    visualPolicy?: ImageVisualPolicy;
    imageStyle?: string;
    providerOverride?: "openai" | "gemini";
    imageModelOverride?: string;
    fileNameSuffix?: string;
    onProgress?: (completed: number, total: number) => Promise<void> | void;
  },
  userId?: string
): Promise<string[]> {
  const provider = options?.providerOverride || (await resolveProviderForTask("image", userId));
  const resolvedImageModel = await resolveModelForTask(provider, "image", userId);
  const imageModel = String(options?.imageModelOverride || resolvedImageModel).trim() || resolvedImageModel;
  const textModel = await resolveModelForTask(provider, "text", userId);
  const urls: string[] = [];
  const timeoutMs = parsePositiveInt(process.env.OPENAI_IMAGE_TIMEOUT_MS, 90000);
  const retryCount = parsePositiveInt(process.env.OPENAI_IMAGE_RETRY_COUNT, 1);
  const startIndex = Math.max(0, options?.startIndex ?? 0);
  const imageAspectRatio = options?.imageAspectRatio === "16:9" ? "16:9" : "9:16";
  const visualPolicy = options?.visualPolicy === "news_strict" ? "news_strict" : "default";
  const safeFileNameSuffix = String(options?.fileNameSuffix || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "");
  const styleAwarePrompts = prompts.map((prompt) => ensurePromptContainsStyle(prompt, options?.imageStyle));
  const sanitizedPrompts = styleAwarePrompts.map((prompt) => sanitizePromptByVisualPolicy(prompt, visualPolicy));

  function buildImageFileName(index: number, extension = "png"): string {
    const sequence = startIndex + index + 1;
    const suffix = safeFileNameSuffix ? `-${safeFileNameSuffix}` : "";
    return `image-${sequence}${suffix}.${extension}`;
  }

  if (provider === "gemini") {
    const client = await getGeminiClient(userId);

    for (let index = 0; index < sanitizedPrompts.length; index += 1) {
      const inline = await generateImageWithRetryGemini({
        client,
        prompt: sanitizedPrompts[index],
        imageAspectRatio,
        timeoutMs,
        retryCount,
        promptIndex: index,
        imageModel,
        textModel
      });

      const imageBuffer = Buffer.from(inline.data, "base64");
      const extension = extensionFromMime(inline.mimeType, "png");
      const fileName = buildImageFileName(index, extension);
      const stored = await storeGeneratedAsset({
        jobId,
        fileName,
        body: imageBuffer,
        contentType: inline.mimeType || `image/${extension}`,
        userId
      });
      urls.push(stored.publicUrl);
      if (options?.onProgress) {
        await options.onProgress(index + 1, sanitizedPrompts.length);
      }
    }

    return urls;
  }

  const client = await getOpenAiClient(userId);

  for (let index = 0; index < sanitizedPrompts.length; index += 1) {
    const result = await generateImageWithRetryOpenAi({
      client,
      prompt: sanitizedPrompts[index],
      imageAspectRatio,
      timeoutMs,
      retryCount,
      promptIndex: index,
      imageModel,
      textModel
    });

    const imageData = result.data?.[0];
    if (imageData?.b64_json) {
      const imageBuffer = Buffer.from(imageData.b64_json, "base64");
      const fileName = buildImageFileName(index, "png");
      const stored = await storeGeneratedAsset({
        jobId,
        fileName,
        body: imageBuffer,
        contentType: "image/png",
        userId
      });
      urls.push(stored.publicUrl);
      if (options?.onProgress) {
        await options.onProgress(index + 1, sanitizedPrompts.length);
      }
      continue;
    }

    if (imageData?.url) {
      const fileName = buildImageFileName(index, "png");
      const stored = await storeGeneratedAssetFromRemote({
        jobId,
        fileName,
        sourceUrl: imageData.url,
        contentType: "image/png",
        userId
      });
      urls.push(stored.publicUrl);
      if (options?.onProgress) {
        await options.onProgress(index + 1, sanitizedPrompts.length);
      }
      continue;
    }

    throw new Error(`Image generation failed for prompt ${index + 1}.`);
  }

  return urls;
}

type SynthesizedAudio = {
  buffer: Uint8Array;
  mimeType: string;
  extension: string;
};

async function synthesizeSpeechAudio(args: {
  voice: string;
  speed?: number;
  input: string;
  preferredMimeType?: string;
  provider?: "openai" | "gemini";
  userId?: string;
}): Promise<SynthesizedAudio> {
  const provider =
    args.provider === "openai" || args.provider === "gemini"
      ? args.provider
      : await resolveProviderForTask("tts", args.userId);
  const ttsModel = await resolveModelForTask(provider, "tts", args.userId);
  const speed = Math.max(0.5, Math.min(2, Number(args.speed) || 1));

  if (provider === "gemini") {
    const client = await getGeminiClient(args.userId);

    const prompt =
      `Read this script naturally at about ${speed.toFixed(2)}x speed. ` +
      "Keep pronunciation clear for subtitle alignment.\n" +
      args.input;

    const makeRequest = async (responseMimeType?: string) =>
      runGeminiWithRetry({
        label: "TTS generation",
        task: () =>
          client.models.generateContent({
            model: ttsModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              responseMimeType,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: toGeminiVoiceName(args.voice)
                  }
                }
              }
            }
          })
      });

    let response;
    try {
      response = await makeRequest(args.preferredMimeType || "audio/mp3");
    } catch {
      response = await makeRequest(undefined);
    }

    const inline = extractInlineData(response, "audio/");
    if (!inline) {
      throw new Error("Gemini did not return audio bytes.");
    }

    let decoded = Buffer.from(inline.data, "base64");
    const inlineMime = (inline.mimeType || "").toLowerCase();

    if (
      inlineMime.includes("audio/l16") ||
      inlineMime.includes("audio/pcm") ||
      inlineMime.includes("audio/raw")
    ) {
      const { sampleRate, channels } = parsePcmRateAndChannels(inline.mimeType);
      const wav = pcm16ToWav({
        pcm: decoded,
        sampleRate,
        channels
      });
      decoded = Buffer.from(wav);
    }

    let detected = detectAudioMimeAndExtension(decoded);
    if (!detected) {
      // Gemini may return raw PCM-like bytes without reliable mime metadata.
      // Fallback to PCM16->WAV for browser preview compatibility.
      const { sampleRate, channels } = parsePcmRateAndChannels(inline.mimeType);
      const wav = pcm16ToWav({
        pcm: decoded,
        sampleRate,
        channels
      });
      decoded = Buffer.from(wav);
      detected = detectAudioMimeAndExtension(decoded);
    }

    const mimeType = detected?.mimeType || inline.mimeType || args.preferredMimeType || "audio/mpeg";

    return {
      buffer: decoded,
      mimeType,
      extension: detected?.extension || extensionFromMime(mimeType, "mp3")
    };
  }

  const client = await getOpenAiClient(args.userId);
  const speech = await client.audio.speech.create({
    model: ttsModel,
    voice: toOpenAiVoiceName(args.voice),
    speed,
    input: args.input,
    response_format: "mp3"
  });
  return {
    buffer: Buffer.from(await speech.arrayBuffer()),
    mimeType: "audio/mpeg",
    extension: "mp3"
  };
}

/** Synthesize speech audio and include mime/extension for dynamic playback. */
export async function synthesizeSpeech(args: {
  voice: string;
  speed?: number;
  input: string;
  preferredMimeType?: string;
  provider?: "openai" | "gemini";
}, userId?: string): Promise<SynthesizedAudio> {
  return synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.input,
    preferredMimeType: args.preferredMimeType || "audio/wav",
    provider: args.provider,
    userId
  });
}

/** Generate narration speech audio and return a URL usable by the video engine. */
export async function generateTtsAudio(args: {
  jobId: string;
  narration: string;
  voice: string;
  speed?: number;
  provider?: "openai" | "gemini";
}, userId?: string): Promise<{ localPath: string; publicUrl: string }> {
  const audio = await synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.narration,
    preferredMimeType: "audio/mp3",
    provider: args.provider,
    userId
  });
  const fileName = `tts.${audio.extension}`;
  const stored = await storeGeneratedAsset({
    jobId: args.jobId,
    fileName,
    body: audio.buffer,
    contentType: audio.mimeType || "audio/mpeg",
    cacheControl: "public, max-age=31536000, immutable",
    userId
  });

  return {
    localPath: stored.localPath || stored.publicUrl,
    publicUrl: stored.publicUrl
  };
}

/** Synthesize speech audio for preview and render flows. */
export async function synthesizeSpeechMp3(args: {
  voice: string;
  speed?: number;
  input: string;
}, userId?: string): Promise<Buffer> {
  const audio = await synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.input,
    preferredMimeType: "audio/mp3",
    userId
  });
  return Buffer.from(audio.buffer);
}
