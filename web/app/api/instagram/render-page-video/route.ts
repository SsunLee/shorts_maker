import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateTtsAudio } from "@/lib/openai-service";
import {
  storeGeneratedAsset,
  storeGeneratedAssetFromRemote,
  toSignedStorageReadUrl
} from "@/lib/object-storage";
import { buildVideoWithEngine } from "@/lib/video-engine-service";
import type { BuildVideoPayload, RenderOptions } from "@/lib/types";
import { GEMINI_VOICE_IDS, OPENAI_VOICE_IDS } from "@/lib/voice-options";

export const runtime = "nodejs";

const schema = z.object({
  templateName: z.string().optional(),
  pageName: z.string().optional(),
  imageDataUrl: z.string().min(1),
  useAudio: z.boolean().optional(),
  audioPrompt: z.string().optional(),
  ttsProvider: z.enum(["auto", "openai", "gemini"]).optional(),
  sampleData: z.record(z.string(), z.string()).optional(),
  audioVoice: z.string().optional(),
  audioSpeed: z.number().optional(),
  durationSec: z.number().optional(),
  outputWidth: z.number().optional(),
  outputHeight: z.number().optional()
});

function resolveEffectiveTtsProvider(
  requested?: "auto" | "openai" | "gemini",
  voice?: string
): "openai" | "gemini" | undefined {
  if (requested === "openai" || requested === "gemini") {
    return requested;
  }
  const normalizedVoice = String(voice || "").trim().toLowerCase();
  if (!normalizedVoice) {
    return undefined;
  }
  if ((GEMINI_VOICE_IDS as readonly string[]).includes(normalizedVoice)) {
    return "gemini";
  }
  if ((OPENAI_VOICE_IDS as readonly string[]).includes(normalizedVoice)) {
    return "openai";
  }
  return undefined;
}

type DataUrlPayload = {
  mime: string;
  body: Buffer;
};

function sanitizeSlug(raw: string, fallback: string): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned || fallback;
}

function extFromMime(mime: string, fallback: string): string {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("mp3") || normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("mp4")) return "mp4";
  return fallback;
}

function parseDataUrl(input: string): DataUrlPayload {
  const text = String(input || "").trim();
  const match = text.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("지원하지 않는 데이터 URL 형식입니다.");
  }
  const mime = String(match[1] || "application/octet-stream");
  const body = Buffer.from(match[2], "base64");
  if (body.length === 0) {
    throw new Error("데이터 URL이 비어 있습니다.");
  }
  return { mime, body };
}

function resolveTemplateVariables(rawText: string, sampleData: Record<string, string> = {}): string {
  const source = String(rawText || "");
  const keys = Object.keys(sampleData || {});
  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (full, tokenRaw) => {
    const token = String(tokenRaw || "").trim();
    if (!token) return full;
    if (Object.prototype.hasOwnProperty.call(sampleData, token)) {
      return String(sampleData[token] ?? "");
    }
    const lower = token.toLowerCase();
    const matchedKey = keys.find((key) => key.toLowerCase() === lower);
    if (matchedKey) {
      return String(sampleData[matchedKey] ?? "");
    }
    return full;
  });
}

async function resolveImagePublicUrl(args: {
  jobId: string;
  imageDataUrl: string;
  userId: string;
}): Promise<string> {
  const imageDataUrl = String(args.imageDataUrl || "").trim();
  if (imageDataUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageDataUrl);
    const extension = extFromMime(parsed.mime, "png");
    const stored = await storeGeneratedAsset({
      jobId: args.jobId,
      fileName: `instagram-page.${extension}`,
      body: parsed.body,
      contentType: parsed.mime,
      userId: args.userId
    });
    return stored.publicUrl;
  }

  const stored = await storeGeneratedAssetFromRemote({
    jobId: args.jobId,
    fileName: "instagram-page.png",
    sourceUrl: imageDataUrl,
    userId: args.userId
  });
  return stored.publicUrl;
}

function buildSilentWav(durationSec: number): Buffer {
  const sampleRate = 22050;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const safeDuration = Math.max(1, Math.min(120, Math.round(durationSec)));
  const sampleCount = sampleRate * safeDuration;
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function resolveAudioPublicUrl(args: {
  jobId: string;
  useAudio?: boolean;
  audioPrompt?: string;
  ttsProvider?: "auto" | "openai" | "gemini";
  sampleData?: Record<string, string>;
  audioVoice?: string;
  audioSpeed?: number;
  durationSec?: number;
  userId: string;
}): Promise<{ publicUrl: string; providerUsed: "openai" | "gemini" | "auto" | "silent" }> {
  const safeDurationSec = Math.max(10, Number(args.durationSec) || 10);
  const prompt = resolveTemplateVariables(String(args.audioPrompt || ""), args.sampleData || {}).trim();
  const shouldUseAudio = typeof args.useAudio === "boolean" ? args.useAudio : Boolean(prompt);
  if (!shouldUseAudio) {
    const silentWav = buildSilentWav(safeDurationSec);
    const stored = await storeGeneratedAsset({
      jobId: args.jobId,
      fileName: "instagram-audio-silent.wav",
      body: silentWav,
      contentType: "audio/wav",
      userId: args.userId
    });
    return {
      publicUrl: stored.publicUrl,
      providerUsed: "silent"
    };
  }

  if (!prompt) {
    throw new Error("오디오 사용이 켜져 있습니다. 오디오 스크립트를 입력해 주세요.");
  }
  const voice = String(args.audioVoice || "alloy").trim().toLowerCase() || "alloy";
  const speed = Math.max(0.5, Math.min(2, Number(args.audioSpeed) || 1));
  const effectiveProvider = resolveEffectiveTtsProvider(args.ttsProvider, voice);
  const tts = await generateTtsAudio(
    {
      jobId: args.jobId,
      narration: prompt,
      voice,
      speed,
      provider: effectiveProvider
    },
    args.userId
  );
  return {
    publicUrl: tts.publicUrl,
    providerUsed: effectiveProvider || "auto"
  };
}

function buildRenderOptions(outputWidth?: number, outputHeight?: number): RenderOptions {
  const safeOutputWidth = Math.max(320, Math.min(4000, Math.round(Number(outputWidth) || 1080)));
  const safeOutputHeight = Math.max(320, Math.min(4000, Math.round(Number(outputHeight) || 1350)));
  return {
    subtitle: {
      fontName: "Arial",
      fontSize: 10,
      primaryColor: "#FFFFFF",
      outlineColor: "#000000",
      outline: 0,
      shadow: 0,
      shadowOpacity: 0,
      fontThickness: 0,
      subtitleDelayMs: 0,
      position: "bottom",
      subtitleYPercent: 98,
      wordsPerCaption: 5,
      maxCharsPerCaption: 18,
      manualCues: []
    },
    overlay: {
      showTitle: false,
      titleText: "",
      titlePosition: "top",
      titleFontSize: 40,
      titleColor: "#FFFFFF",
      titleFontName: "Arial",
      titleFontBold: false,
      titleFontItalic: false,
      titleFontFile: "",
      // Instagram feed card mode: keep frame static to prevent text/box clipping.
      sceneMotionPreset: "none",
      motionSpeedPercent: 100,
      focusXPercent: 50,
      focusYPercent: 50,
      focusDriftPercent: 0,
      focusZoomPercent: 3,
      outputFps: 30,
      outputWidth: safeOutputWidth,
      outputHeight: safeOutputHeight,
      videoLayout: "fill_9_16",
      usePreviewAsFinal: false,
      panelTopPercent: 34,
      panelWidthPercent: 100,
      titleTemplates: []
    }
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const payload = schema.parse(body);
    const safeDurationSec = Math.max(10, Number(payload.durationSec) || 10);
    const templateSlug = sanitizeSlug(payload.templateName || "", "instagram-template");
    const pageSlug = sanitizeSlug(payload.pageName || "", "page");
    const jobId = `${templateSlug}-${pageSlug}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const [imageUrl, resolvedAudio] = await Promise.all([
      resolveImagePublicUrl({
        jobId,
        imageDataUrl: payload.imageDataUrl,
        userId
      }),
      resolveAudioPublicUrl({
        jobId,
        useAudio: payload.useAudio,
        audioPrompt: payload.audioPrompt,
        ttsProvider: payload.ttsProvider,
        sampleData: payload.sampleData,
        audioVoice: payload.audioVoice,
        audioSpeed: payload.audioSpeed,
        durationSec: safeDurationSec,
        userId
      })
    ]);
    const audioUrl = resolvedAudio.publicUrl;

    const resolvedAudioPrompt = resolveTemplateVariables(String(payload.audioPrompt || ""), payload.sampleData || {}).trim();
    const shouldUseAudio = typeof payload.useAudio === "boolean" ? payload.useAudio : Boolean(resolvedAudioPrompt);
    // Instagram feed audio-video mode should not auto-generate subtitles on top of card image.
    // Keep one-char payload for schema(min_length=1) while producing empty SRT after normalization.
    const subtitlesSeed = " ";
    const buildPayload: BuildVideoPayload = {
      jobId,
      imageUrls: [imageUrl],
      ttsPath: audioUrl,
      subtitlesText: subtitlesSeed,
      titleText: " ",
      useSfx: false,
      targetDurationSec: safeDurationSec,
      renderOptions: buildRenderOptions(payload.outputWidth, payload.outputHeight)
    };

    const result = await buildVideoWithEngine(buildPayload, userId);
    if (!result.outputUrl) {
      throw new Error("MP4 출력 URL을 받지 못했습니다.");
    }
    const signedOutputUrl = await toSignedStorageReadUrl(result.outputUrl, 60 * 60 * 6);
    return NextResponse.json({
      jobId,
      outputUrl: signedOutputUrl,
      ttsProviderUsed: resolvedAudio.providerUsed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "페이지 MP4 렌더링에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
