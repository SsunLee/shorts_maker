import { GoogleGenAI, Modality } from "@google/genai";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";
import { getSettings } from "@/lib/settings-store";
import type { ImageAspectRatio, WorkflowScene } from "@/lib/types";
import { toGeminiVoiceName, toOpenAiVoiceName } from "@/lib/voice-options";

type AiProvider = "openai" | "gemini";

type GeminiInlineData = {
  data: string;
  mimeType?: string;
};

async function resolveOpenAiKey(): Promise<string | undefined> {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  const settings = await getSettings();
  return settings.openaiApiKey;
}

async function resolveGeminiKey(): Promise<string | undefined> {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  const settings = await getSettings();
  return settings.geminiApiKey;
}

async function resolveProvider(): Promise<AiProvider> {
  const requested = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const geminiKey = await resolveGeminiKey();
  const openAiKey = await resolveOpenAiKey();

  if (requested === "gemini") {
    if (!geminiKey) {
      throw new Error(
        "Gemini API key is missing. Set GEMINI_API_KEY or save it in /settings."
      );
    }
    return "gemini";
  }

  if (requested === "openai") {
    if (!openAiKey) {
      throw new Error(
        "OpenAI API key is missing. Set OPENAI_API_KEY or save it in /settings."
      );
    }
    return "openai";
  }

  if (geminiKey) {
    return "gemini";
  }
  if (openAiKey) {
    return "openai";
  }

  throw new Error(
    "No AI provider key found. Add GEMINI_API_KEY or OPENAI_API_KEY in /settings."
  );
}

function getOpenAiTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
}

function getOpenAiImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
}

function getOpenAiTtsModel(): string {
  return process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
}

function getGeminiTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
}

function getGeminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
}

function getGeminiTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
}

/** Create an OpenAI client from env/settings and throw if no key exists. */
export async function getOpenAiClient(): Promise<OpenAI> {
  const apiKey = await resolveOpenAiKey();
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing. Set OPENAI_API_KEY or save it in /settings."
    );
  }
  return new OpenAI({ apiKey });
}

/** Create a Gemini client from env/settings and throw if no key exists. */
async function getGeminiClient(): Promise<GoogleGenAI> {
  const apiKey = await resolveGeminiKey();
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

function fallbackSplitScenes(args: {
  narration: string;
  imageStyle: string;
  imageAspectRatio: ImageAspectRatio;
  sceneCount: number;
}): WorkflowScene[] {
  const composition =
    args.imageAspectRatio === "16:9"
      ? "Landscape 16:9 composition for cinematic widescreen framing."
      : "Vertical 9:16 composition for short-form mobile framing.";
  const words = args.narration.split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(1, Math.ceil(words.length / args.sceneCount));
  return Array.from({ length: args.sceneCount }).map((_, idx) => {
    const chunk = words.slice(idx * chunkSize, (idx + 1) * chunkSize).join(" ");
    return {
      index: idx + 1,
      sceneTitle: `Scene ${idx + 1}`,
      narrationText: chunk || args.narration,
      imagePrompt: `${args.imageStyle}. ${chunk || args.narration}. ${composition}`
    };
  });
}

/** Build short-form narration text based on topic + title + target length. */
export async function generateNarration(args: {
  title: string;
  topic?: string;
  targetLengthSec: number;
}): Promise<string> {
  const provider = await resolveProvider();

  if (provider === "gemini") {
    const client = await getGeminiClient();
    const response = await client.models.generateContent({
      model: getGeminiTextModel(),
      contents:
        "You write concise viral short-video narration scripts. Keep it spoken and punchy. " +
        `Write narration for a ${args.targetLengthSec}-second short.\n` +
        `Title: ${args.title}\n` +
        `Topic: ${args.topic ?? "N/A"}\n` +
        "Include a hook, value, and CTA."
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini did not return narration text.");
    }
    return text;
  }

  const client = await getOpenAiClient();
  const response = await client.responses.create({
    model: getOpenAiTextModel(),
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

  return text;
}

/** Create stylized image prompts from narration text. */
export async function generateImagePrompts(args: {
  title: string;
  narration: string;
  imageStyle: string;
  imageAspectRatio?: ImageAspectRatio;
  sceneCount?: number;
}): Promise<string[]> {
  const sceneCount = Math.max(3, Math.min(12, args.sceneCount ?? 5));
  const imageAspectRatio = args.imageAspectRatio === "16:9" ? "16:9" : "9:16";
  const compositionGuide =
    imageAspectRatio === "16:9"
      ? "Use cinematic landscape 16:9 composition with strong horizontal framing."
      : "Use vertical storytelling composition optimized for 9:16 mobile shorts.";
  const provider = await resolveProvider();

  if (provider === "gemini") {
    const client = await getGeminiClient();
    const response = await client.models.generateContent({
      model: getGeminiTextModel(),
      contents:
        `Output only a JSON array with exactly ${sceneCount} short image prompts. ` +
        "Prompts must be non-graphic, educational, and safe for general audiences. " +
        "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction.\n" +
        `${compositionGuide}\n` +
        `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${args.imageStyle}`
    });

    const prompts = parseStringArray(response.text || "", sceneCount);
    if (prompts.length !== sceneCount) {
      throw new Error(`Failed to generate exactly ${sceneCount} image prompts.`);
    }
    return prompts;
  }

  const client = await getOpenAiClient();
  const response = await client.responses.create({
    model: getOpenAiTextModel(),
    input: [
      {
        role: "system",
        content:
          `Output only a JSON array with exactly ${sceneCount} short image prompts. ` +
          "Prompts must be non-graphic, educational, and safe for general audiences. " +
          "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction. " +
          compositionGuide
      },
      {
        role: "user",
        content: `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${args.imageStyle}`
      }
    ]
  });

  const prompts = parseStringArray(response.output_text || "", sceneCount);
  if (prompts.length !== sceneCount) {
    throw new Error(`Failed to generate exactly ${sceneCount} image prompts.`);
  }
  return prompts;
}

/** Split narration into N scenes and generate one image prompt per scene. */
export async function splitNarrationToScenes(args: {
  title: string;
  narration: string;
  imageStyle: string;
  imageAspectRatio?: ImageAspectRatio;
  sceneCount?: number;
}): Promise<WorkflowScene[]> {
  const sceneCount = Math.max(3, Math.min(12, args.sceneCount ?? 5));
  const imageAspectRatio = args.imageAspectRatio === "16:9" ? "16:9" : "9:16";
  const compositionGuide =
    imageAspectRatio === "16:9"
      ? "All image prompts must explicitly request landscape 16:9 composition."
      : "All image prompts must explicitly request vertical 9:16 composition.";
  const provider = await resolveProvider();

  if (provider === "gemini") {
    const client = await getGeminiClient();
    const response = await client.models.generateContent({
      model: getGeminiTextModel(),
      contents:
        `Return only JSON array with exactly ${sceneCount} objects: sceneTitle, narrationText, imagePrompt. ` +
        "All imagePrompt values must be non-graphic, educational, and safe for general audiences. " +
        "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction.\n" +
        `${compositionGuide}\n` +
        `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${args.imageStyle}\n` +
        `Split the narration flow into ${sceneCount} logical scenes and write one visual prompt per scene.`
    });

    const parsed = safeParseScenes(response.text || "", sceneCount);
    if (parsed) {
      return parsed;
    }

    return fallbackSplitScenes({
      narration: args.narration,
      imageStyle: args.imageStyle,
      imageAspectRatio,
      sceneCount
    });
  }

  const client = await getOpenAiClient();
  const response = await client.responses.create({
    model: getOpenAiTextModel(),
    input: [
      {
        role: "system",
        content:
          `Return only JSON array with exactly ${sceneCount} objects: sceneTitle, narrationText, imagePrompt. ` +
          "All imagePrompt values must be non-graphic, educational, and safe for general audiences. " +
          "Avoid explicit violence, injury, blood, death scenes, and self-harm depiction. " +
          compositionGuide
      },
      {
        role: "user",
        content:
          `Title: ${args.title}\nNarration: ${args.narration}\nImage style: ${args.imageStyle}\n` +
          `Split the narration flow into ${sceneCount} logical scenes and write one visual prompt per scene.`
      }
    ]
  });

  const parsed = safeParseScenes(response.output_text || "", sceneCount);
  if (parsed) {
    return parsed;
  }

  return fallbackSplitScenes({
    narration: args.narration,
    imageStyle: args.imageStyle,
    imageAspectRatio,
    sceneCount
  });
}

async function ensureOutputDir(jobId: string): Promise<string> {
  const dir = path.join(process.cwd(), "public", "generated", jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
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
}): Promise<string> {
  const response = await args.client.responses.create({
    model: getOpenAiTextModel(),
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
}): Promise<string> {
  const response = await args.client.models.generateContent({
    model: getGeminiTextModel(),
    contents:
      "Rewrite image prompts to be policy-safe for general audiences while preserving topic/style intent. " +
      "No explicit violence, injury, blood, death moments, or self-harm depiction. " +
      "Return exactly one single-line prompt.\n" +
      args.prompt
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
}): Promise<OpenAI.Images.ImagesResponse> {
  let currentPrompt = args.prompt;
  let rewrittenForSafety = false;
  let lastError: unknown;
  for (let attempt = 0; attempt <= args.retryCount; attempt += 1) {
    try {
      return await withTimeout(
        args.client.images.generate({
          model: getOpenAiImageModel(),
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
          imageAspectRatio: args.imageAspectRatio
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
}): Promise<GeminiInlineData> {
  let currentPrompt = args.prompt;
  let rewrittenForSafety = false;
  let lastError: unknown;

  for (let attempt = 0; attempt <= args.retryCount; attempt += 1) {
    try {
      const response = await withTimeout(
        args.client.models.generateContent({
          model: getGeminiImageModel(),
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
          imageAspectRatio: args.imageAspectRatio
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

/** Generate images and store them under `/public/generated/{id}`. */
export async function generateImages(
  jobId: string,
  prompts: string[],
  options?: {
    startIndex?: number;
    imageAspectRatio?: ImageAspectRatio;
    onProgress?: (completed: number, total: number) => Promise<void> | void;
  }
): Promise<string[]> {
  const provider = await resolveProvider();
  const outputDir = await ensureOutputDir(jobId);
  const urls: string[] = [];
  const timeoutMs = parsePositiveInt(process.env.OPENAI_IMAGE_TIMEOUT_MS, 90000);
  const retryCount = parsePositiveInt(process.env.OPENAI_IMAGE_RETRY_COUNT, 1);
  const startIndex = Math.max(0, options?.startIndex ?? 0);
  const imageAspectRatio = options?.imageAspectRatio === "16:9" ? "16:9" : "9:16";

  if (provider === "gemini") {
    const client = await getGeminiClient();

    for (let index = 0; index < prompts.length; index += 1) {
      const inline = await generateImageWithRetryGemini({
        client,
        prompt: prompts[index],
        imageAspectRatio,
        timeoutMs,
        retryCount,
        promptIndex: index
      });

      const imageBuffer = Buffer.from(inline.data, "base64");
      const extension = extensionFromMime(inline.mimeType, "png");
      const fileName = `image-${startIndex + index + 1}.${extension}`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, imageBuffer);
      urls.push(`/generated/${jobId}/${fileName}`);
      if (options?.onProgress) {
        await options.onProgress(index + 1, prompts.length);
      }
    }

    return urls;
  }

  const client = await getOpenAiClient();

  for (let index = 0; index < prompts.length; index += 1) {
    const result = await generateImageWithRetryOpenAi({
      client,
      prompt: prompts[index],
      imageAspectRatio,
      timeoutMs,
      retryCount,
      promptIndex: index
    });

    const imageData = result.data?.[0];
    if (imageData?.b64_json) {
      const imageBuffer = Buffer.from(imageData.b64_json, "base64");
      const fileName = `image-${startIndex + index + 1}.png`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, imageBuffer);
      urls.push(`/generated/${jobId}/${fileName}`);
      if (options?.onProgress) {
        await options.onProgress(index + 1, prompts.length);
      }
      continue;
    }

    if (imageData?.url) {
      urls.push(imageData.url);
      if (options?.onProgress) {
        await options.onProgress(index + 1, prompts.length);
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
}): Promise<SynthesizedAudio> {
  const provider = await resolveProvider();
  const speed = Math.max(0.5, Math.min(2, Number(args.speed) || 1));

  if (provider === "gemini") {
    const client = await getGeminiClient();

    const prompt =
      `Read this script naturally at about ${speed.toFixed(2)}x speed. ` +
      "Keep pronunciation clear for subtitle alignment.\n" +
      args.input;

    const makeRequest = async (responseMimeType?: string) =>
      client.models.generateContent({
        model: getGeminiTtsModel(),
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

  const client = await getOpenAiClient();
  const speech = await client.audio.speech.create({
    model: getOpenAiTtsModel(),
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
}): Promise<SynthesizedAudio> {
  return synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.input,
    preferredMimeType: args.preferredMimeType || "audio/wav"
  });
}

/** Generate narration speech audio and return a URL usable by the video engine. */
export async function generateTtsAudio(args: {
  jobId: string;
  narration: string;
  voice: string;
  speed?: number;
}): Promise<{ localPath: string; publicUrl: string }> {
  const outputDir = await ensureOutputDir(args.jobId);
  const audio = await synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.narration,
    preferredMimeType: "audio/mp3"
  });
  const fileName = `tts.${audio.extension}`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, audio.buffer);

  return {
    localPath: filePath,
    publicUrl: `/generated/${args.jobId}/${fileName}`
  };
}

/** Synthesize speech audio for preview and render flows. */
export async function synthesizeSpeechMp3(args: {
  voice: string;
  speed?: number;
  input: string;
}): Promise<Buffer> {
  const audio = await synthesizeSpeechAudio({
    voice: args.voice,
    speed: args.speed,
    input: args.input,
    preferredMimeType: "audio/mp3"
  });
  return Buffer.from(audio.buffer);
}
