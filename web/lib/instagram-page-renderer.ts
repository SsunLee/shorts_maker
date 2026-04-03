import type { InstagramFeedPage, InstagramShapeType, InstagramTextElement } from "@/lib/instagram-types";

const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;

type RubySegment =
  | { type: "plain"; text: string }
  | { type: "ruby"; base: string; ruby: string };

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeCanvasWidth(value: number): number {
  return clamp(Number(value), 320, 4000, DEFAULT_CANVAS_WIDTH);
}

function normalizeCanvasHeight(value: number): number {
  return clamp(Number(value), 320, 4000, DEFAULT_CANVAS_HEIGHT);
}

function normalizeShapeType(raw: unknown): InstagramShapeType {
  const value = String(raw || "rectangle");
  if (
    value === "roundedRectangle" ||
    value === "circle" ||
    value === "triangle" ||
    value === "diamond" ||
    value === "pentagon" ||
    value === "hexagon" ||
    value === "star" ||
    value === "arrowRight" ||
    value === "arrowLeft" ||
    value === "line"
  ) {
    return value;
  }
  return "rectangle";
}

function normalizeFontName(value: string): string {
  return String(value || "").trim();
}

function normalizeStoredFontFamily(value: unknown): string {
  const raw = normalizeFontName(String(value || ""));
  if (!raw) return "Noto Sans KR";
  if (raw.includes("\uFFFD")) return "Noto Sans KR";
  return raw;
}

function getRuntimeLocalFontAlias(fontFamily: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const key = normalizeFontName(fontFamily).toLowerCase();
  if (!key) return undefined;
  const mapped = (window as Window & { __shortsMakerLocalFontAliasMap?: Record<string, string> })
    .__shortsMakerLocalFontAliasMap;
  return mapped?.[key];
}

function buildKnownFontAliases(fontFamily: string): string[] {
  const name = normalizeFontName(fontFamily);
  if (!name) return [];
  const aliases: string[] = [];

  if (name.includes("카페24")) {
    if (name.includes("빛나는별")) {
      aliases.push("Cafe24 Shiningstar", "Cafe24Shiningstar");
    }
    if (name.includes("프로슬림 에어")) {
      aliases.push("Cafe24 PROSlimAir", "Cafe24PROSlimAir", "Cafe24 Proslim Air");
    }
    if (name.includes("슈퍼매직")) {
      aliases.push("Cafe24 Supermagic", "Cafe24Supermagic", "Cafe24 Supermagic Bold", "Cafe24Supermagic Bold");
    }
    if (name.includes("써라운드")) {
      aliases.push("Cafe24 Ssurround", "Cafe24Ssurround");
    }
  }

  return aliases;
}

function buildFontFamilyStack(fontFamily: string): string {
  const primary = normalizeStoredFontFamily(fontFamily).replace(/"/g, '\\"');
  const fallbackFamilies = [
    "Noto Sans KR",
    "Malgun Gothic",
    "Apple SD Gothic Neo",
    "Noto Sans JP",
    "Yu Gothic",
    "Meiryo",
    "sans-serif"
  ];
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (value: string): void => {
    const normalized = normalizeFontName(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  };

  const runtimeAlias = getRuntimeLocalFontAlias(primary);
  if (runtimeAlias) {
    push(runtimeAlias);
  }
  push(primary);
  buildKnownFontAliases(primary).forEach(push);
  fallbackFamilies.forEach(push);

  return ordered
    .map((family) => (family === "sans-serif" ? family : `"${family.replace(/"/g, '\\"')}"`))
    .join(", ");
}

function normalizeHex(value: string, fallback: string): string {
  const raw = String(value || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(raw)) {
    return raw.toUpperCase();
  }
  return fallback;
}

function withAlpha(hex: string, alpha: number): string {
  const safeHex = normalizeHex(hex, "#000000");
  const safeAlpha = clamp(alpha, 0, 1, 1);
  const r = Number.parseInt(safeHex.slice(1, 3), 16);
  const g = Number.parseInt(safeHex.slice(3, 5), 16);
  const b = Number.parseInt(safeHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function resolveInstagramTemplateVariables(
  rawText: string,
  sampleData: Record<string, string>,
  mode: "variable" | "plain" = "variable"
): string {
  if (mode === "plain") return String(rawText || "");
  const source = String(rawText || "");
  const entries = Object.entries(sampleData || {});
  const keys = entries.map(([key]) => key);

  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (fullToken, tokenKeyRaw) => {
    const tokenKey = String(tokenKeyRaw || "").trim();
    if (!tokenKey) return fullToken;

    if (Object.prototype.hasOwnProperty.call(sampleData, tokenKey)) {
      return String(sampleData[tokenKey] ?? "");
    }

    const lower = tokenKey.toLowerCase();
    const matchedKeys = keys.filter((key) => key.toLowerCase() === lower);
    if (matchedKeys.length === 1) {
      return String(sampleData[matchedKeys[0]] ?? "");
    }
    return fullToken;
  });
}

function resolveTextLayerContent(layer: InstagramTextElement, sampleData: Record<string, string>): string {
  return resolveInstagramTemplateVariables(layer.text, sampleData, layer.textMode === "plain" ? "plain" : "variable");
}

export function inferInstagramMediaTypeFromSource(source: string): "image" | "video" {
  const raw = String(source || "").trim().toLowerCase();
  if (!raw) return "image";
  if (raw.startsWith("data:video/")) return "video";
  if (raw.startsWith("blob:")) return "image";
  const clean = raw.split("?")[0].split("#")[0];
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(clean)) return "video";
  return "image";
}

function parseRubySegments(line: string): RubySegment[] {
  const segments: RubySegment[] = [];
  const regex = /\[([^\]\|]+)\|([^\]]+)\]/g;
  let lastIndex = 0;
  let matched = false;
  let token: RegExpExecArray | null = regex.exec(line);
  while (token) {
    matched = true;
    if (token.index > lastIndex) {
      segments.push({ type: "plain", text: line.slice(lastIndex, token.index) });
    }
    segments.push({
      type: "ruby",
      base: String(token[1] || ""),
      ruby: String(token[2] || "")
    });
    lastIndex = token.index + token[0].length;
    token = regex.exec(line);
  }
  if (lastIndex < line.length) {
    segments.push({ type: "plain", text: line.slice(lastIndex) });
  }
  if (!matched) return [{ type: "plain", text: line }];
  return segments;
}

function lineHasRuby(segments: RubySegment[]): boolean {
  return segments.some((segment) => segment.type === "ruby");
}

function measureRubyLineWidth(ctx: CanvasRenderingContext2D, segments: RubySegment[]): number {
  let width = 0;
  segments.forEach((segment) => {
    width += ctx.measureText(segment.type === "ruby" ? segment.base : segment.text).width;
  });
  return width;
}

function wrapTextForCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const safeMaxWidth = Math.max(4, Number(maxWidth) || 4);
  const splitTokenByWidth = (token: string): string[] => {
    const chars = Array.from(token || "");
    if (chars.length === 0) return [""];
    const segments: string[] = [];
    let line = "";
    chars.forEach((char) => {
      const candidate = `${line}${char}`;
      if (!line || ctx.measureText(candidate).width <= safeMaxWidth) {
        line = candidate;
        return;
      }
      segments.push(line);
      line = char;
    });
    if (line) {
      segments.push(line);
    }
    return segments.length > 0 ? segments : [""];
  };

  const lines: string[] = [];
  const paragraphs = text.split("\n");
  paragraphs.forEach((paragraph) => {
    const raw = String(paragraph || "");
    if (!raw.trim()) {
      lines.push("");
      return;
    }

    if (!raw.includes(" ")) {
      splitTokenByWidth(raw).forEach((line) => lines.push(line));
      return;
    }

    const words = raw.split(" ").filter(Boolean);
    let line = "";
    words.forEach((word, index) => {
      const spacer = line ? " " : "";
      const candidate = `${line}${spacer}${word}`;
      if (ctx.measureText(candidate).width <= safeMaxWidth) {
        line = candidate;
        return;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      const brokenWordLines = splitTokenByWidth(word);
      if (brokenWordLines.length === 1) {
        line = brokenWordLines[0];
        return;
      }

      brokenWordLines.forEach((chunk, chunkIndex) => {
        const isLastChunk = chunkIndex === brokenWordLines.length - 1;
        if (isLastChunk && index < words.length - 1) {
          line = chunk;
          return;
        }
        lines.push(chunk);
      });
    });
    if (line) {
      lines.push(line);
    }
  });
  return lines;
}

async function ensurePageFontsReady(
  page: InstagramFeedPage,
  sampleData: Record<string, string>
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const textLayers = (page.elements || []).filter(
    (layer): layer is InstagramTextElement => layer.type === "text"
  );
  if (textLayers.length === 0) return;
  const loaders = textLayers.map(async (layer) => {
    const size = Math.max(8, Number(layer.fontSize) || 16);
    const weight = layer.bold ? "700" : "400";
    const style = layer.italic ? "italic" : "normal";
    const family = buildFontFamilyStack(layer.fontFamily);
    const sample = resolveTextLayerContent(layer, sampleData) || "가나다abcあいう";
    try {
      await document.fonts.load(`${style} ${weight} ${size}px ${family}`, sample.slice(0, 40));
    } catch {
      // Ignore single-font failures and continue with fallbacks.
    }
  });
  await Promise.all(loaders);
}

async function loadImageElement(source: string): Promise<HTMLImageElement | null> {
  if (!source) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function loadVideoElement(source: string): Promise<HTMLVideoElement | null> {
  if (!source) return null;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const cleanup = (): void => {
      video.onloadeddata = null;
      video.onerror = null;
    };
    video.onloadeddata = () => {
      cleanup();
      resolve(video);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = source;
    try {
      video.load();
    } catch {
      resolve(null);
    }
  });
}

export async function renderInstagramPageToPngDataUrl(args: {
  page: InstagramFeedPage;
  sampleData: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
}): Promise<string> {
  const canvas = document.createElement("canvas");
  const canvasWidth = normalizeCanvasWidth(args.canvasWidth);
  const canvasHeight = normalizeCanvasHeight(args.canvasHeight);
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("캔버스 렌더러를 만들지 못했습니다.");
  }
  await ensurePageFontsReady(args.page, args.sampleData);

  const page = args.page;
  ctx.fillStyle = normalizeHex(page.backgroundColor || "#FFFFFF", "#FFFFFF");
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (page.backgroundImageUrl) {
    const bgMediaType = inferInstagramMediaTypeFromSource(page.backgroundImageUrl);
    const bgImage =
      bgMediaType === "video" ? await loadVideoElement(page.backgroundImageUrl) : await loadImageElement(page.backgroundImageUrl);
    if (bgImage) {
      const fit = page.backgroundFit === "contain" ? "contain" : "cover";
      const sourceWidth = "videoWidth" in bgImage ? bgImage.videoWidth : bgImage.width;
      const sourceHeight = "videoHeight" in bgImage ? bgImage.videoHeight : bgImage.height;
      const imageRatio = sourceWidth / Math.max(1, sourceHeight);
      const canvasRatio = canvasWidth / canvasHeight;
      let drawWidth = canvasWidth;
      let drawHeight = canvasHeight;
      if (fit === "cover") {
        if (imageRatio > canvasRatio) {
          drawHeight = canvasHeight;
          drawWidth = drawHeight * imageRatio;
        } else {
          drawWidth = canvasWidth;
          drawHeight = drawWidth / imageRatio;
        }
      } else if (imageRatio > canvasRatio) {
        drawWidth = canvasWidth;
        drawHeight = drawWidth / imageRatio;
      } else {
        drawHeight = canvasHeight;
        drawWidth = drawHeight * imageRatio;
      }

      const drawX = (canvasWidth - drawWidth) / 2;
      const drawY = (canvasHeight - drawHeight) / 2;
      ctx.drawImage(bgImage as CanvasImageSource, drawX, drawY, drawWidth, drawHeight);
    }
  }

  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of sorted) {
    const centerX = (layer.x / 100) * canvasWidth;
    const centerY = (layer.y / 100) * canvasHeight;
    const width = (layer.width / 100) * canvasWidth;
    const height = (layer.height / 100) * canvasHeight;
    const left = centerX - width / 2;
    const top = centerY - height / 2;

    ctx.save();
    ctx.globalAlpha = clamp(layer.opacity, 0.05, 1, 1);
    ctx.translate(centerX, centerY);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);

    if (layer.type === "shape") {
      const shape = normalizeShapeType(layer.shape);
      if (shape === "line") {
        const thickness = Math.max(1, layer.strokeWidth || 2);
        ctx.beginPath();
        ctx.moveTo(left, centerY);
        ctx.lineTo(left + width, centerY);
        ctx.strokeStyle = normalizeHex(layer.strokeColor, "#111111");
        ctx.lineWidth = thickness;
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const radius = shape === "circle" ? Math.min(width, height) / 2 : layer.cornerRadius;
      ctx.beginPath();
      if (shape === "circle") {
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      } else if (shape === "rectangle" || shape === "roundedRectangle") {
        const r = clamp(radius, 0, Math.min(width, height) / 2, 0);
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + width - r, top);
        ctx.quadraticCurveTo(left + width, top, left + width, top + r);
        ctx.lineTo(left + width, top + height - r);
        ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
        ctx.lineTo(left + r, top + height);
        ctx.quadraticCurveTo(left, top + height, left, top + height - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
      } else {
        const points: Array<[number, number]> =
          shape === "triangle"
            ? [
                [centerX, top],
                [left + width, top + height],
                [left, top + height]
              ]
            : shape === "diamond"
              ? [
                  [centerX, top],
                  [left + width, centerY],
                  [centerX, top + height],
                  [left, centerY]
                ]
              : shape === "pentagon"
                ? [
                    [centerX, top],
                    [left + width, top + height * 0.38],
                    [left + width * 0.82, top + height],
                    [left + width * 0.18, top + height],
                    [left, top + height * 0.38]
                  ]
                : shape === "hexagon"
                  ? [
                      [left + width * 0.25, top],
                      [left + width * 0.75, top],
                      [left + width, centerY],
                      [left + width * 0.75, top + height],
                      [left + width * 0.25, top + height],
                      [left, centerY]
                    ]
                  : shape === "star"
                    ? [
                        [centerX, top],
                        [left + width * 0.61, top + height * 0.35],
                        [left + width * 0.98, top + height * 0.35],
                        [left + width * 0.68, top + height * 0.57],
                        [left + width * 0.79, top + height * 0.91],
                        [centerX, top + height * 0.7],
                        [left + width * 0.21, top + height * 0.91],
                        [left + width * 0.32, top + height * 0.57],
                        [left + width * 0.02, top + height * 0.35],
                        [left + width * 0.39, top + height * 0.35]
                      ]
                    : shape === "arrowLeft"
                      ? [
                          [left + width, top + height * 0.26],
                          [left + width * 0.32, top + height * 0.26],
                          [left + width * 0.32, top],
                          [left, centerY],
                          [left + width * 0.32, top + height],
                          [left + width * 0.32, top + height * 0.74],
                          [left + width, top + height * 0.74]
                        ]
                      : [
                          [left, top + height * 0.26],
                          [left + width * 0.68, top + height * 0.26],
                          [left + width * 0.68, top],
                          [left + width, centerY],
                          [left + width * 0.68, top + height],
                          [left + width * 0.68, top + height * 0.74],
                          [left, top + height * 0.74]
                        ];
        points.forEach(([pointX, pointY], index) => {
          if (index === 0) {
            ctx.moveTo(pointX, pointY);
            return;
          }
          ctx.lineTo(pointX, pointY);
        });
      }
      ctx.closePath();
      if (layer.fillEnabled !== false) {
        ctx.fillStyle = normalizeHex(layer.fillColor, "#F4F1EA");
        ctx.fill();
      }
      if (layer.strokeWidth > 0) {
        ctx.strokeStyle = normalizeHex(layer.strokeColor, "#111111");
        ctx.lineWidth = layer.strokeWidth;
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    if (layer.type === "image") {
      if (layer.imageUrl) {
        const mediaType =
          layer.mediaType === "video" || inferInstagramMediaTypeFromSource(layer.imageUrl) === "video" ? "video" : "image";
        const image = mediaType === "video" ? await loadVideoElement(layer.imageUrl) : await loadImageElement(layer.imageUrl);
        if (image) {
          const fit = layer.fit === "contain" ? "contain" : "cover";
          const sourceWidth = "videoWidth" in image ? image.videoWidth : image.width;
          const sourceHeight = "videoHeight" in image ? image.videoHeight : image.height;
          const imageRatio = sourceWidth / Math.max(1, sourceHeight);
          const boxRatio = width / Math.max(1, height);
          let drawWidth = width;
          let drawHeight = height;
          if (fit === "cover") {
            if (imageRatio > boxRatio) {
              drawHeight = height;
              drawWidth = drawHeight * imageRatio;
            } else {
              drawWidth = width;
              drawHeight = drawWidth / imageRatio;
            }
          } else if (imageRatio > boxRatio) {
            drawWidth = width;
            drawHeight = drawWidth / imageRatio;
          } else {
            drawHeight = height;
            drawWidth = drawHeight * imageRatio;
          }

          const drawX = centerX - drawWidth / 2;
          const drawY = centerY - drawHeight / 2;
          const radius = clamp(layer.borderRadius, 0, 220, 0);
          ctx.save();
          ctx.beginPath();
          if (radius <= 0) {
            ctx.rect(left, top, width, height);
          } else {
            const r = Math.min(radius, width / 2, height / 2);
            ctx.moveTo(left + r, top);
            ctx.arcTo(left + width, top, left + width, top + height, r);
            ctx.arcTo(left + width, top + height, left, top + height, r);
            ctx.arcTo(left, top + height, left, top, r);
            ctx.arcTo(left, top, left + width, top, r);
          }
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(image as CanvasImageSource, drawX, drawY, drawWidth, drawHeight);
          if (layer.overlayOpacity > 0) {
            ctx.fillStyle = withAlpha(layer.overlayColor, layer.overlayOpacity);
            ctx.fillRect(left, top, width, height);
          }
          ctx.restore();
        }
      }
      ctx.restore();
      continue;
    }

    const textLayer = layer as InstagramTextElement;
    const text = resolveTextLayerContent(textLayer, args.sampleData);
    const padding = Math.max(0, textLayer.padding);
    const maxTextWidth = Math.max(10, width - padding * 2);
    const fontStyle = textLayer.italic ? "italic " : "";
    const fontWeight = textLayer.bold ? 700 : 400;
    ctx.font = `${fontStyle}${fontWeight} ${Math.max(8, textLayer.fontSize)}px ${buildFontFamilyStack(textLayer.fontFamily)}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = normalizeHex(textLayer.color, "#111111");
    ctx.textAlign = textLayer.textAlign === "left" || textLayer.textAlign === "right" ? textLayer.textAlign : "center";

    if (textLayer.shadowEnabled) {
      ctx.shadowColor = normalizeHex(textLayer.shadowColor, "#000000");
      ctx.shadowBlur = clamp(Number(textLayer.shadowBlur), 0, 40, 0);
      ctx.shadowOffsetX = clamp(Number(textLayer.shadowX), -40, 40, 0);
      ctx.shadowOffsetY = clamp(Number(textLayer.shadowY), -40, 40, 0);
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (textLayer.padding > 0 || normalizeHex(textLayer.backgroundColor, "#FFFFFF") !== "#FFFFFF") {
      ctx.fillStyle = normalizeHex(textLayer.backgroundColor, "#FFFFFF");
      ctx.fillRect(left, top, width, height);
      ctx.fillStyle = normalizeHex(textLayer.color, "#111111");
    }

    // Keep clipping inside layer bounds but add enough bleed for font overhang (CJK display fonts).
    const baseFontSize = Math.max(8, textLayer.fontSize);
    const clipBleedX = Math.max(12, Math.round(baseFontSize * 0.45));
    const clipBleedY = Math.max(4, Math.round(baseFontSize * 0.18));
    ctx.beginPath();
    ctx.rect(left - clipBleedX, top - clipBleedY, width + clipBleedX * 2, height + clipBleedY * 2);
    ctx.clip();

    const rawLines = text.split("\n");
    const rubyLines = rawLines.map((line) => parseRubySegments(line));
    const hasRuby = rubyLines.some((line) => lineHasRuby(line));
    const shouldAutoWrap = textLayer.autoWrap !== false;
    const lines = hasRuby || !shouldAutoWrap ? rawLines : wrapTextForCanvas(ctx, text, maxTextWidth);
    const measuredLines = hasRuby ? rubyLines : lines.map((line) => parseRubySegments(line));
    const rubyReserve = hasRuby ? Math.max(8, textLayer.fontSize * 0.42) : 0;
    const lineHeight = Math.max(8, textLayer.fontSize * clamp(textLayer.lineHeight, 0.8, 3, 1.2)) + rubyReserve;
    const totalHeight = lines.length * lineHeight;
    const verticalInset = Math.max(2, Math.round(baseFontSize * 0.08));
    const availableHeight = Math.max(0, height - verticalInset * 2);
    const startY = top + verticalInset + Math.max(0, (availableHeight - totalHeight) / 2);
    let textX = left + padding;
    if (ctx.textAlign === "center") textX = left + width / 2;
    if (ctx.textAlign === "right") textX = left + width - padding;

    lines.forEach((line, index) => {
      const segments = measuredLines[index] || [{ type: "plain", text: line } as RubySegment];
      const lineWidth = measureRubyLineWidth(ctx, segments);
      const lineBaseText = segments.map((segment) => (segment.type === "ruby" ? segment.base : segment.text)).join("");
      const lineMetrics = ctx.measureText(lineBaseText || " ");
      const leftBearing = Number(lineMetrics.actualBoundingBoxLeft) || 0;
      const rightBearing = Number(lineMetrics.actualBoundingBoxRight) || Number(lineMetrics.width) || 0;
      const visualWidth = Math.max(1, leftBearing + rightBearing);
      const y = startY + index * lineHeight + rubyReserve;
      let drawX = left + padding + leftBearing;
      let lineLeft = left + padding;
      if (ctx.textAlign === "center") {
        drawX = textX - (rightBearing - leftBearing) / 2;
        lineLeft = textX - visualWidth / 2;
      } else if (ctx.textAlign === "right") {
        drawX = textX - rightBearing;
        lineLeft = textX - visualWidth;
      }

      segments.forEach((segment) => {
        if (segment.type === "plain") {
          ctx.fillText(segment.text, drawX, y);
          drawX += ctx.measureText(segment.text).width;
          return;
        }
        const baseText = segment.base;
        ctx.fillText(baseText, drawX, y);
        const baseWidth = ctx.measureText(baseText).width;
        if (segment.ruby.trim()) {
          const rubyFontSize = Math.max(8, textLayer.fontSize * 0.42);
          const rubyFont = `${textLayer.bold ? "700" : "500"} ${textLayer.italic ? "italic " : ""}${rubyFontSize}px ${buildFontFamilyStack(textLayer.fontFamily)}`;
          const mainFont = ctx.font;
          ctx.font = rubyFont;
          const rubyWidth = ctx.measureText(segment.ruby).width;
          const rubyX = drawX + (baseWidth - rubyWidth) / 2;
          const rubyY = y - Math.max(6, rubyFontSize * 0.95);
          ctx.fillText(segment.ruby, rubyX, rubyY);
          ctx.font = mainFont;
        }
        drawX += baseWidth;
      });

      if (textLayer.strikeThrough && line.trim()) {
        const strikeY = y + (lineHeight - rubyReserve) * 0.55;
        const strikeWidth = Math.max(lineWidth, visualWidth);
        ctx.fillRect(lineLeft, strikeY, strikeWidth, 2);
      }
      if (textLayer.underline && line.trim()) {
        const underlineY = y + (lineHeight - rubyReserve) - 3;
        const underlineWidth = Math.max(lineWidth, visualWidth);
        ctx.fillRect(lineLeft, underlineY, underlineWidth, 2);
      }
    });

    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

export async function renderImageDataUrlToNineSixteenContain(args: {
  imageDataUrl: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
}): Promise<string> {
  const targetWidth = Math.max(320, Math.min(4000, Math.round(Number(args.width) || 1080)));
  const targetHeight = Math.max(320, Math.min(4000, Math.round(Number(args.height) || 1920)));
  const image = await loadImageElement(String(args.imageDataUrl || ""));
  if (!image) {
    throw new Error("9:16 변환용 이미지를 로드하지 못했습니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("9:16 변환 캔버스를 생성하지 못했습니다.");
  }

  const bg = normalizeHex(String(args.backgroundColor || ""), "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const imageRatio = image.width / Math.max(1, image.height);
  const targetRatio = targetWidth / targetHeight;
  let drawWidth = targetWidth;
  let drawHeight = targetHeight;

  if (imageRatio > targetRatio) {
    drawWidth = targetWidth;
    drawHeight = drawWidth / imageRatio;
  } else {
    drawHeight = targetHeight;
    drawWidth = drawHeight * imageRatio;
  }

  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = (targetHeight - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas.toDataURL("image/png");
}
