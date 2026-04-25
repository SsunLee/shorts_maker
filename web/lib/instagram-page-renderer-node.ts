import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { InstagramFeedPage, InstagramShapeType, InstagramTextElement } from "@/lib/instagram-types";
import {
  inferInstagramMediaTypeFromSource,
  resolveInstagramTemplateVariables
} from "@/lib/instagram-page-renderer";

const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;

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

function resolveSampleDataValueByKey(sampleData: Record<string, string>, key: string): string | undefined {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(sampleData, normalizedKey)) {
    return String(sampleData[normalizedKey] ?? "");
  }
  const matchedKey = Object.keys(sampleData).find(
    (candidate) => candidate.toLowerCase() === normalizedKey.toLowerCase()
  );
  return matchedKey ? String(sampleData[matchedKey] ?? "") : undefined;
}

function resolveTextLayerContent(layer: InstagramTextElement, sampleData: Record<string, string>): string {
  if (layer.textMode === "variable") {
    const source = String(layer.text || "");
    const hasToken = /\{\{[^}]+\}\}/.test(source);
    const bindingKey = String(layer.bindingKey || "").trim();
    if (!hasToken && bindingKey) {
      const byBindingKey = resolveSampleDataValueByKey(sampleData, bindingKey);
      if (typeof byBindingKey === "string" && byBindingKey.length > 0) {
        return byBindingKey;
      }
    }
  }
  return resolveInstagramTemplateVariables(layer.text, sampleData, layer.textMode === "plain" ? "plain" : "variable");
}

function wrapTextForCanvas(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number
): string[] {
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

function drawRoundedRect(
  ctx: SKRSContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = clamp(radius, 0, Math.min(width, height) / 2, 0);
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + width - r, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + r);
  ctx.lineTo(left + width, top + height - r);
  ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
  ctx.lineTo(left + r, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
}

async function loadImageSafe(source: string): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
  const value = String(source || "").trim();
  if (!value) {
    return null;
  }
  try {
    return await loadImage(value);
  } catch {
    return null;
  }
}

export async function renderInstagramPageToPngDataUrlNode(args: {
  page: InstagramFeedPage;
  sampleData: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
}): Promise<string> {
  const canvasWidth = normalizeCanvasWidth(args.canvasWidth);
  const canvasHeight = normalizeCanvasHeight(args.canvasHeight);
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  const page = args.page;
  ctx.fillStyle = normalizeHex(page.backgroundColor || "#FFFFFF", "#FFFFFF");
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (page.backgroundImageUrl && inferInstagramMediaTypeFromSource(page.backgroundImageUrl) !== "video") {
    const bgImage = await loadImageSafe(page.backgroundImageUrl);
    if (bgImage) {
      const fit = page.backgroundFit === "contain" ? "contain" : "cover";
      const sourceWidth = bgImage.width;
      const sourceHeight = bgImage.height;
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
      ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
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
        drawRoundedRect(ctx, left, top, width, height, radius);
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
        ctx.closePath();
      }
      if (layer.fillEnabled !== false) {
        ctx.fillStyle = withAlpha(
          normalizeHex(layer.fillColor, "#F4F1EA"),
          clamp(Number((layer as { fillOpacity?: number }).fillOpacity), 0, 1, 1)
        );
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
      if (layer.imageUrl && inferInstagramMediaTypeFromSource(layer.imageUrl) !== "video") {
        const image = await loadImageSafe(layer.imageUrl);
        if (image) {
          const fit = layer.fit === "contain" ? "contain" : "cover";
          const sourceWidth = image.width;
          const sourceHeight = image.height;
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
          if (radius <= 0) {
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.closePath();
          } else {
            drawRoundedRect(ctx, left, top, width, height, radius);
          }
          ctx.clip();
          ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
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
    const fontWeight = textLayer.bold ? 600 : 400;
    ctx.font = `${fontStyle}${fontWeight} ${Math.max(8, textLayer.fontSize)}px ${String(textLayer.fontFamily || "sans-serif")}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = normalizeHex(textLayer.color, "#111111");
    ctx.textAlign = textLayer.textAlign === "left" || textLayer.textAlign === "right" ? textLayer.textAlign : "center";

    const lines = textLayer.autoWrap === false ? text.split("\n") : wrapTextForCanvas(ctx, text, maxTextWidth);
    const baseFontSize = Math.max(8, textLayer.fontSize);
    const lineHeightPx = Math.max(8, textLayer.fontSize * clamp(textLayer.lineHeight, 0.8, 3, 1.2));
    const textHeight = Math.max(lineHeightPx, lines.length * lineHeightPx);
    const verticalInset = Math.max(2, Math.round(baseFontSize * 0.12));
    const availableHeight = Math.max(0, height - verticalInset * 2);
    const textBlockTop = top + verticalInset + Math.max(0, (availableHeight - textHeight) / 2);
    const textX =
      textLayer.textAlign === "left"
        ? left + padding
        : textLayer.textAlign === "right"
          ? left + width - padding
          : left + width / 2;

    const textBackgroundOpacity = clamp(Number(textLayer.backgroundOpacity), 0, 1, 1);
    if (
      textLayer.padding > 0 ||
      normalizeHex(textLayer.backgroundColor, "#FFFFFF") !== "#FFFFFF" ||
      textBackgroundOpacity < 1
    ) {
      ctx.fillStyle = withAlpha(textLayer.backgroundColor, textBackgroundOpacity);
      ctx.fillRect(left, top, width, height);
      ctx.fillStyle = normalizeHex(textLayer.color, "#111111");
    }

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

    const clipBleedX = Math.max(12, Math.round(baseFontSize * 0.45));
    const clipBleedY = Math.max(10, Math.round(baseFontSize * 0.45));
    ctx.beginPath();
    ctx.rect(left - clipBleedX, top - clipBleedY, width + clipBleedX * 2, height + clipBleedY * 2);
    ctx.clip();

    lines.forEach((line, index) => {
      const y = textBlockTop + lineHeightPx * index;
      ctx.fillText(line, textX, y);
    });
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
