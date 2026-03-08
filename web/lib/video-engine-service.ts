import { BuildVideoPayload, RenderOptions } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";
import { mirrorRenderedVideoToStorage } from "@/lib/object-storage";
import {
  resolveVideoEngineBaseUrls,
  resolveVideoEngineTimeoutMs
} from "@/lib/video-engine-endpoint-config";

export interface BuildVideoResult {
  outputPath: string;
  outputUrl?: string;
  srtPath?: string;
  ffmpegSteps?: string[];
}

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeComparableText(value: string | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replaceAllUnsafe(source: string, from: string, to: string): string {
  if (!from) {
    return source;
  }
  return source.split(from).join(to);
}

function materializeTemplateText(args: {
  original: string;
  isPrimary: boolean;
  currentTitle: string;
  currentTopic?: string;
  currentNarration?: string;
  currentKeyword?: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): string {
  const normalizedOriginal = String(args.original || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
  const currentTitle = String(args.currentTitle || "").trim();
  const currentTopic = String(args.currentTopic || "").trim();
  const currentNarration = String(args.currentNarration || "").trim();
  const currentKeyword = String(args.currentKeyword || "").trim();

  if (args.isPrimary) {
    return currentTitle || normalizedOriginal;
  }

  let output = normalizedOriginal;
  output = output
    .replace(/\{\{\s*title\s*\}\}|\{title\}/gi, currentTitle)
    .replace(/\{\{\s*topic\s*\}\}|\{topic\}/gi, currentTopic)
    .replace(/\{\{\s*narration\s*\}\}|\{narration\}/gi, currentNarration)
    .replace(/\{\{\s*keyword\s*\}\}|\{keyword\}/gi, currentKeyword);
  if (output !== normalizedOriginal) {
    return output;
  }

  const normalizedSourceTitle = normalizeComparableText(args.sourceTitle);
  const normalizedSourceTopic = normalizeComparableText(args.sourceTopic);
  const normalizedCurrent = normalizeComparableText(normalizedOriginal);
  if (normalizedSourceTitle && normalizedCurrent === normalizedSourceTitle) {
    return currentTitle || normalizedOriginal;
  }
  if (normalizedSourceTopic && normalizedCurrent === normalizedSourceTopic) {
    return currentTopic || currentTitle || normalizedOriginal;
  }

  if (args.sourceTitle && currentTitle) {
    output = replaceAllUnsafe(output, args.sourceTitle, currentTitle);
  }
  if (args.sourceTopic && currentTopic) {
    output = replaceAllUnsafe(output, args.sourceTopic, currentTopic);
  }
  return output;
}

function materializeRenderOptionsForVideo(args: {
  renderOptions: RenderOptions | undefined;
  titleText: string;
  topicText?: string;
  narrationText?: string;
  keywordText?: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): RenderOptions | undefined {
  const renderOptions = args.renderOptions;
  if (!renderOptions) {
    return undefined;
  }

  const titleTemplates = renderOptions.overlay.titleTemplates || [];
  if (titleTemplates.length === 0) {
    return renderOptions;
  }

  const nextTemplates = titleTemplates.map((item) => ({
    ...item,
    text: materializeTemplateText({
      original: item.text,
      isPrimary: item.id === "__primary_title__",
      currentTitle: args.titleText,
      currentTopic: args.topicText,
      currentNarration: args.narrationText,
      currentKeyword: args.keywordText,
      sourceTitle: args.sourceTitle,
      sourceTopic: args.sourceTopic
    })
  }));

  return {
    ...renderOptions,
    overlay: {
      ...renderOptions.overlay,
      titleText: args.titleText || renderOptions.overlay.titleText || "",
      titleTemplates: nextTemplates
    }
  };
}

function normalizeRenderOptionsForEngine(
  renderOptions: BuildVideoPayload["renderOptions"]
): RenderOptions | undefined {
  if (!renderOptions) {
    return undefined;
  }

  const subtitleRaw = (renderOptions.subtitle ?? {}) as unknown as Record<string, unknown>;
  const overlayRaw = (renderOptions.overlay ?? {}) as unknown as Record<string, unknown>;
  const manualCuesRaw = Array.isArray(subtitleRaw.manualCues) ? subtitleRaw.manualCues : [];
  const titleTemplatesRaw = Array.isArray(overlayRaw.titleTemplates) ? overlayRaw.titleTemplates : [];

  const manualCues = manualCuesRaw
    .map((cue, index) => {
      const row = (cue || {}) as Record<string, unknown>;
      const text = asText(row.text).trim();
      if (!text) {
        return undefined;
      }
      return {
        id: asText(row.id, `cue-${index + 1}`),
        startMs: Math.max(0, Math.round(asFiniteNumber(row.startMs, index * 1000))),
        endMs: Math.max(1, Math.round(asFiniteNumber(row.endMs, index * 1000 + 900))),
        text
      };
    })
    .filter((cue): cue is { id: string; startMs: number; endMs: number; text: string } => Boolean(cue));

  const titleTemplates = titleTemplatesRaw
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        id: asText(row.id, `layer-${index + 1}`),
        text: asText(row.text),
        x: clampNumber(asFiniteNumber(row.x, 50), 0, 100),
        y: clampNumber(asFiniteNumber(row.y, 10), 0, 100),
        width: clampNumber(asFiniteNumber(row.width, 60), 10, 100),
        fontSize: Math.round(clampNumber(asFiniteNumber(row.fontSize, 48), 12, 120)),
        color: asText(row.color, "#FFFFFF"),
        backgroundColor: asText(row.backgroundColor, "#000000"),
        backgroundOpacity: clampNumber(asFiniteNumber(row.backgroundOpacity, 0), 0, 1),
        paddingX: Math.round(clampNumber(asFiniteNumber(row.paddingX, 8), 0, 80)),
        paddingY: Math.round(clampNumber(asFiniteNumber(row.paddingY, 4), 0, 80)),
        shadowX: Math.round(clampNumber(asFiniteNumber(row.shadowX, 2), -20, 20)),
        shadowY: Math.round(clampNumber(asFiniteNumber(row.shadowY, 2), -20, 20)),
        shadowColor: asText(row.shadowColor, "#000000"),
        shadowOpacity: clampNumber(asFiniteNumber(row.shadowOpacity, 1), 0, 1),
        fontThickness: Math.round(clampNumber(asFiniteNumber(row.fontThickness, 0), 0, 8)),
        fontName: asText(row.fontName),
        fontBold: Boolean(row.fontBold),
        fontItalic: Boolean(row.fontItalic),
        fontFile: asText(row.fontFile)
      };
    })
    .filter((item) => item.id.trim().length > 0);

  return {
    subtitle: {
      fontName: asText(subtitleRaw.fontName, "Arial"),
      fontSize: Math.round(clampNumber(asFiniteNumber(subtitleRaw.fontSize, 16), 8, 80)),
      primaryColor: asText(subtitleRaw.primaryColor, "#FFFFFF"),
      outlineColor: asText(subtitleRaw.outlineColor, "#000000"),
      outline: Math.round(clampNumber(asFiniteNumber(subtitleRaw.outline, 2), 0, 8)),
      shadow: Math.round(clampNumber(asFiniteNumber(subtitleRaw.shadow, 1), 0, 8)),
      shadowOpacity: clampNumber(asFiniteNumber(subtitleRaw.shadowOpacity, 1), 0, 1),
      fontThickness: Math.round(clampNumber(asFiniteNumber(subtitleRaw.fontThickness, 0), 0, 8)),
      subtitleDelayMs: Math.round(clampNumber(asFiniteNumber(subtitleRaw.subtitleDelayMs, 180), -500, 1500)),
      position: (asText(subtitleRaw.position, "bottom") as RenderOptions["subtitle"]["position"]),
      subtitleYPercent: clampNumber(asFiniteNumber(subtitleRaw.subtitleYPercent, 86), 0, 100),
      wordsPerCaption: Math.round(clampNumber(asFiniteNumber(subtitleRaw.wordsPerCaption, 5), 2, 10)),
      maxCharsPerCaption: Math.round(
        clampNumber(asFiniteNumber(subtitleRaw.maxCharsPerCaption, 18), 8, 60)
      ),
      manualCues
    },
    overlay: {
      showTitle: Boolean(overlayRaw.showTitle),
      titleText: asText(overlayRaw.titleText, ""),
      titlePosition: asText(overlayRaw.titlePosition, "top") as RenderOptions["overlay"]["titlePosition"],
      titleFontSize: Math.round(clampNumber(asFiniteNumber(overlayRaw.titleFontSize, 48), 16, 120)),
      titleColor: asText(overlayRaw.titleColor, "#FFFFFF"),
      titleFontName: asText(overlayRaw.titleFontName, "Malgun Gothic"),
      titleFontBold: Boolean(overlayRaw.titleFontBold),
      titleFontItalic: Boolean(overlayRaw.titleFontItalic),
      titleFontFile: asText(overlayRaw.titleFontFile),
      sceneMotionPreset: asText(overlayRaw.sceneMotionPreset, "gentle_zoom") as RenderOptions["overlay"]["sceneMotionPreset"],
      motionSpeedPercent: clampNumber(asFiniteNumber(overlayRaw.motionSpeedPercent, 135), 60, 220),
      focusXPercent: clampNumber(asFiniteNumber(overlayRaw.focusXPercent, 50), 0, 100),
      focusYPercent: clampNumber(asFiniteNumber(overlayRaw.focusYPercent, 50), 0, 100),
      focusDriftPercent: clampNumber(asFiniteNumber(overlayRaw.focusDriftPercent, 6), 0, 20),
      focusZoomPercent: clampNumber(asFiniteNumber(overlayRaw.focusZoomPercent, 9), 3, 20),
      outputFps: (Math.round(asFiniteNumber(overlayRaw.outputFps, 30)) as RenderOptions["overlay"]["outputFps"]),
      videoLayout: asText(overlayRaw.videoLayout, "fill_9_16") as RenderOptions["overlay"]["videoLayout"],
      usePreviewAsFinal: Boolean(overlayRaw.usePreviewAsFinal),
      panelTopPercent: clampNumber(asFiniteNumber(overlayRaw.panelTopPercent, 34), 0, 85),
      panelWidthPercent: clampNumber(asFiniteNumber(overlayRaw.panelWidthPercent, 100), 60, 100),
      titleTemplates
    }
  };
}

function parsePathname(source: string): string | null {
  if (!source) {
    return null;
  }
  if (source.startsWith("/")) {
    return source;
  }
  try {
    const parsed = new URL(source);
    return parsed.pathname || null;
  } catch {
    return null;
  }
}

function shouldRetryWithFallback(status: number): boolean {
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500;
}

async function buildVideoAtEndpoint(args: {
  baseUrl: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  sharedSecret?: string;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    return await fetch(`${args.baseUrl}/build-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(args.sharedSecret ? { "X-Video-Engine-Secret": args.sharedSecret } : {})
      },
      body: JSON.stringify(args.body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function toEngineReadableAsset(source: string): Promise<string> {
  const pathname = parsePathname(source);
  if (!pathname || !pathname.startsWith("/generated/")) {
    return source;
  }

  const localPath = path.join(
    process.cwd(),
    "public",
    ...pathname.replace(/^\/+/, "").split("/").filter(Boolean)
  );

  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    return source;
  }
}

/** Send render instructions to the external FastAPI video engine. */
export async function buildVideoWithEngine(
  payload: BuildVideoPayload
): Promise<BuildVideoResult> {
  const baseUrls = resolveVideoEngineBaseUrls();
  const timeoutMs = resolveVideoEngineTimeoutMs();
  const sharedSecret = String(process.env.VIDEO_ENGINE_SHARED_SECRET || "").trim() || undefined;
  const imageUrls = await Promise.all(
    payload.imageUrls.map((source) => toEngineReadableAsset(source))
  );
  const ttsPath = await toEngineReadableAsset(payload.ttsPath);
  const normalizedRenderOptions = normalizeRenderOptionsForEngine(payload.renderOptions);
  const sanitizedRenderOptions = materializeRenderOptionsForVideo({
    renderOptions: normalizedRenderOptions,
    titleText: asText(payload.titleText),
    topicText: asText(payload.topicText),
    narrationText: asText(payload.subtitlesText),
    keywordText: asText(payload.keywordText),
    sourceTitle: asText(payload.sourceTitle),
    sourceTopic: asText(payload.sourceTopic)
  });

  const requestBody: Record<string, unknown> = {
    ...payload,
    jobId: asText(payload.jobId, "job"),
    subtitlesText: asText(payload.subtitlesText),
    titleText: asText(payload.titleText),
    renderOptions: sanitizedRenderOptions,
    imageUrls,
    ttsPath
  };

  let lastResponse: Response | undefined;
  let lastNetworkError: string | undefined;
  const endpointErrors: string[] = [];

  for (const baseUrl of baseUrls) {
    try {
      const response = await buildVideoAtEndpoint({
        baseUrl,
        body: requestBody,
        timeoutMs,
        sharedSecret
      });
      if (response.ok) {
        const result = (await response.json()) as BuildVideoResult;
        result.outputUrl = await mirrorRenderedVideoToStorage({
          jobId: payload.jobId,
          sourceUrl: result.outputUrl
        });
        return result;
      }

      const message = await response.text();
      endpointErrors.push(`${baseUrl} -> HTTP ${response.status}: ${message}`);
      lastResponse = response;
      if (!shouldRetryWithFallback(response.status)) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error";
      endpointErrors.push(`${baseUrl} -> ${message}`);
      lastNetworkError = message;
      continue;
    }
  }

  if (lastResponse && !shouldRetryWithFallback(lastResponse.status)) {
    const detailed = endpointErrors[endpointErrors.length - 1] || `HTTP ${lastResponse.status}`;
    throw new Error(`Video engine request rejected: ${detailed}`);
  }

  const hint = [
    "Video engine endpoints failed.",
    `Tried: ${baseUrls.join(" -> ")}`,
    `Timeout: ${timeoutMs}ms`,
    endpointErrors.length > 0 ? `Details: ${endpointErrors.join(" | ")}` : undefined,
    !sharedSecret
      ? "Tip: for public exposure, set VIDEO_ENGINE_SHARED_SECRET on both web and video-engine."
      : undefined,
    lastNetworkError
      ? "Check primary PC engine connectivity/tunnel and fallback Cloud Run health."
      : undefined
  ]
    .filter(Boolean)
    .join(" ");
  throw new Error(hint);
}
