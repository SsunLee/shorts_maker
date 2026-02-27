import { BuildVideoPayload, RenderOptions } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";

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
        x: asFiniteNumber(row.x, 50),
        y: asFiniteNumber(row.y, 10),
        width: asFiniteNumber(row.width, 60),
        fontSize: Math.round(asFiniteNumber(row.fontSize, 48)),
        color: asText(row.color, "#FFFFFF"),
        paddingX: Math.round(asFiniteNumber(row.paddingX, 8)),
        paddingY: Math.round(asFiniteNumber(row.paddingY, 4)),
        shadowX: Math.round(asFiniteNumber(row.shadowX, 2)),
        shadowY: Math.round(asFiniteNumber(row.shadowY, 2)),
        shadowColor: asText(row.shadowColor, "#000000"),
        shadowOpacity: asFiniteNumber(row.shadowOpacity, 1),
        fontThickness: Math.round(asFiniteNumber(row.fontThickness, 0)),
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
      fontSize: Math.round(asFiniteNumber(subtitleRaw.fontSize, 16)),
      primaryColor: asText(subtitleRaw.primaryColor, "#FFFFFF"),
      outlineColor: asText(subtitleRaw.outlineColor, "#000000"),
      outline: Math.round(asFiniteNumber(subtitleRaw.outline, 2)),
      shadow: Math.round(asFiniteNumber(subtitleRaw.shadow, 1)),
      shadowOpacity: asFiniteNumber(subtitleRaw.shadowOpacity, 1),
      fontThickness: Math.round(asFiniteNumber(subtitleRaw.fontThickness, 0)),
      subtitleDelayMs: Math.round(asFiniteNumber(subtitleRaw.subtitleDelayMs, 180)),
      position: (asText(subtitleRaw.position, "bottom") as RenderOptions["subtitle"]["position"]),
      subtitleYPercent: asFiniteNumber(subtitleRaw.subtitleYPercent, 86),
      wordsPerCaption: Math.round(asFiniteNumber(subtitleRaw.wordsPerCaption, 5)),
      manualCues
    },
    overlay: {
      showTitle: Boolean(overlayRaw.showTitle),
      titleText: asText(overlayRaw.titleText, ""),
      titlePosition: asText(overlayRaw.titlePosition, "top") as RenderOptions["overlay"]["titlePosition"],
      titleFontSize: Math.round(asFiniteNumber(overlayRaw.titleFontSize, 48)),
      titleColor: asText(overlayRaw.titleColor, "#FFFFFF"),
      titleFontName: asText(overlayRaw.titleFontName, "Malgun Gothic"),
      titleFontBold: Boolean(overlayRaw.titleFontBold),
      titleFontItalic: Boolean(overlayRaw.titleFontItalic),
      titleFontFile: asText(overlayRaw.titleFontFile),
      sceneMotionPreset: asText(overlayRaw.sceneMotionPreset, "gentle_zoom") as RenderOptions["overlay"]["sceneMotionPreset"],
      motionSpeedPercent: asFiniteNumber(overlayRaw.motionSpeedPercent, 135),
      focusXPercent: asFiniteNumber(overlayRaw.focusXPercent, 50),
      focusYPercent: asFiniteNumber(overlayRaw.focusYPercent, 50),
      focusDriftPercent: asFiniteNumber(overlayRaw.focusDriftPercent, 6),
      focusZoomPercent: asFiniteNumber(overlayRaw.focusZoomPercent, 9),
      outputFps: (Math.round(asFiniteNumber(overlayRaw.outputFps, 30)) as RenderOptions["overlay"]["outputFps"]),
      videoLayout: asText(overlayRaw.videoLayout, "fill_9_16") as RenderOptions["overlay"]["videoLayout"],
      usePreviewAsFinal: Boolean(overlayRaw.usePreviewAsFinal),
      panelTopPercent: asFiniteNumber(overlayRaw.panelTopPercent, 34),
      panelWidthPercent: asFiniteNumber(overlayRaw.panelWidthPercent, 100),
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
  const baseUrl = process.env.VIDEO_ENGINE_URL || "http://localhost:8000";
  const imageUrls = await Promise.all(
    payload.imageUrls.map((source) => toEngineReadableAsset(source))
  );
  const ttsPath = await toEngineReadableAsset(payload.ttsPath);
  const sanitizedRenderOptions = normalizeRenderOptionsForEngine(payload.renderOptions);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/build-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        jobId: asText(payload.jobId, "job"),
        subtitlesText: asText(payload.subtitlesText),
        titleText: asText(payload.titleText),
        renderOptions: sanitizedRenderOptions,
        imageUrls,
        ttsPath
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    throw new Error(
      `Cannot connect to video engine at ${baseUrl}. ` +
        `Start FastAPI engine (uvicorn app.main:app --reload --port 8000). Cause: ${message}`
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Video engine error (${response.status}): ${message}`);
  }

  return (await response.json()) as BuildVideoResult;
}
