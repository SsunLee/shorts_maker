"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileJson,
  GripVertical,
  ImagePlus,
  Layers,
  Minus,
  Move,
  Paintbrush,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  Type,
  Undo2,
  Upload,
  WrapText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderInstagramPageToPngDataUrl } from "@/lib/instagram-page-renderer";
import { ensureInstagramCustomFontsLoaded } from "@/lib/instagram-font-runtime";
import { isLocalFontAccessSupported, mergeFontOptions, queryInstalledFontNames } from "@/lib/local-fonts";
import type { AppSettings } from "@/lib/types";
import { filterVoiceOptions, resolveTtsVoiceProvider } from "@/lib/voice-options";
import type {
  InstagramCustomFont,
  InstagramFeedPage,
  InstagramImageElement,
  InstagramPageElement,
  InstagramShapeElement,
  InstagramShapeType,
  InstagramTemplate,
  InstagramTextElement
} from "@/lib/instagram-types";

declare global {
  interface Window {
    __shortsMakerLocalFontAliasMap?: Record<string, string>;
  }
}

type TemplateResponse = {
  activeTemplateId?: string;
  templates?: InstagramTemplate[];
  error?: string;
};

type IdeasSheetTableResponse = {
  sheetName?: string;
  headers?: string[];
  rows?: Array<Record<string, string>>;
  error?: string;
};

type InteractionMode = "move" | "resize";
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState = {
  mode: InteractionMode;
  resizeHandle: ResizeHandle;
  toggleDeselectOnClick: boolean;
  pageId: string;
  layerId: string;
  layerIds: string[];
  initialByLayerId: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >;
  startClientX: number;
  startClientY: number;
  canvasWidth: number;
  canvasHeight: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
};

type ToolbarPosition = {
  x: number;
  y: number;
};

type ToolbarDragState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  canvasWidth: number;
  canvasHeight: number;
  toolbarWidth: number;
  toolbarHeight: number;
};

type ObjectToolbarOffset = {
  x: number;
  y: number;
};

type ObjectToolbarDragState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type SelectionBoxState = {
  pageId: string;
  canvasLeft: number;
  canvasTop: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  canvasWidth: number;
  canvasHeight: number;
  additive: boolean;
};

type PickerAnchorRect = {
  left: number;
  top: number;
  width: number;
};

type TextStyleSnapshot = Pick<
  InstagramTextElement,
  | "color"
  | "fontFamily"
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "autoWrap"
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "shadowEnabled"
  | "shadowColor"
  | "shadowBlur"
  | "shadowX"
  | "shadowY"
  | "backgroundColor"
  | "padding"
  | "opacity"
>;

type ShapeStyleSnapshot = Pick<
  InstagramShapeElement,
  "shape" | "fillEnabled" | "fillColor" | "strokeColor" | "strokeWidth" | "cornerRadius" | "opacity"
>;

const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;
const MIN_LAYER_SIZE_PERCENT = 1;
const LAST_USED_TEMPLATE_ID_KEY = "shorts-maker:instagram:last-template-id";
const FAVORITE_INSTAGRAM_FONTS_KEY = "shorts-maker:instagram:favorite-fonts";
const INSTAGRAM_BINDING_STATE_KEY = "shorts-maker:instagram:binding-state";
const DEFAULT_BINDING_FIELDS = ["id", "status", "type", "keyword", "subject", "description", "narration"];
const CUSTOM_CANVAS_PRESET = "custom";
const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  type: "과거 부정형",
  subject: "단일 이미지 강조하기",
  description: "시트 데이터와 연결되는 카드 템플릿",
  keyword: "instagram"
};
const DEFAULT_INSTAGRAM_AI_IMAGE_STYLE = "Cinematic photo-real";
const CUSTOM_FONT_ACCEPT = ".ttf,.otf,.ttc,.woff,.woff2";
const INSTAGRAM_AI_IMAGE_STYLE_PRESETS = [
  "Cinematic photo-real",
  "Ultra photoreal photographer",
  "Minimal flat illustration",
  "Anime cel-shaded",
  "3D Pixar-style",
  "Cyberpunk neon",
  "Watercolor painting",
  "Pencil sketch",
  "Retro VHS film",
  "Editorial product ad"
];

const CANVAS_PRESETS: Array<{ id: string; label: string; width: number; height: number }> = [
  { id: "instagram_feed_portrait", label: "Instagram Feed Portrait (1080x1350)", width: 1080, height: 1350 },
  { id: "instagram_story", label: "Story (1080x1920)", width: 1080, height: 1920 },
  { id: "instagram_square", label: "Feed Square (1080x1080)", width: 1080, height: 1080 },
  { id: "open_graph", label: "Open Graph (1200x630)", width: 1200, height: 630 },
  { id: "pinterest", label: "Pinterest (1000x1500)", width: 1000, height: 1500 },
  { id: "youtube_thumbnail", label: "YouTube Thumbnail (1280x720)", width: 1280, height: 720 }
];

const FONT_OPTIONS = [
  "Noto Sans KR",
  "Noto Sans JP",
  "Noto Sans",
  "Pretendard",
  "Spoqa Han Sans Neo",
  "Nanum Gothic",
  "Malgun Gothic",
  "Apple SD Gothic Neo",
  "Inter",
  "Montserrat",
  "Poppins",
  "Lato",
  "Roboto",
  "Source Sans 3",
  "Open Sans",
  "Merriweather",
  "Playfair Display",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Helvetica",
  "Trebuchet MS",
  "Verdana",
  "Tahoma",
  "Courier New",
  "Fira Sans",
  "PT Sans",
  "DM Sans",
  "Manrope",
  "Nunito"
];

const VOICE_SPEED_OPTIONS = ["0.75", "0.9", "1", "1.1", "1.25", "1.5"];

const SHAPE_OPTIONS: Array<{ value: InstagramShapeType; label: string }> = [
  { value: "rectangle", label: "Rectangle" },
  { value: "roundedRectangle", label: "Rounded Rectangle" },
  { value: "circle", label: "Circle" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "pentagon", label: "Pentagon" },
  { value: "hexagon", label: "Hexagon" },
  { value: "star", label: "Star" },
  { value: "arrowRight", label: "Arrow Right" },
  { value: "arrowLeft", label: "Arrow Left" },
  { value: "line", label: "Line" }
];

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

function shapeLabel(shape: InstagramShapeType): string {
  return SHAPE_OPTIONS.find((item) => item.value === shape)?.label || "Shape";
}

function getShapeClipPath(shape: InstagramShapeType): string | undefined {
  if (shape === "line") return undefined;
  if (shape === "triangle") return "polygon(50% 0%, 100% 100%, 0% 100%)";
  if (shape === "diamond") return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
  if (shape === "pentagon") return "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)";
  if (shape === "hexagon") return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
  if (shape === "star")
    return "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
  if (shape === "arrowRight")
    return "polygon(0% 26%, 68% 26%, 68% 0%, 100% 50%, 68% 100%, 68% 74%, 0% 74%)";
  if (shape === "arrowLeft")
    return "polygon(100% 26%, 32% 26%, 32% 0%, 0% 50%, 32% 100%, 32% 74%, 100% 74%)";
  return undefined;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ig_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

type NormalizedPoint = { x: number; y: number };

function getShapePolygonPoints(shape: InstagramShapeType): NormalizedPoint[] | undefined {
  if (shape === "triangle") {
    return [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];
  }
  if (shape === "diamond") {
    return [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 }
    ];
  }
  if (shape === "pentagon") {
    return [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.38 },
      { x: 0.82, y: 1 },
      { x: 0.18, y: 1 },
      { x: 0, y: 0.38 }
    ];
  }
  if (shape === "hexagon") {
    return [
      { x: 0.25, y: 0 },
      { x: 0.75, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.75, y: 1 },
      { x: 0.25, y: 1 },
      { x: 0, y: 0.5 }
    ];
  }
  if (shape === "star") {
    return [
      { x: 0.5, y: 0 },
      { x: 0.61, y: 0.35 },
      { x: 0.98, y: 0.35 },
      { x: 0.68, y: 0.57 },
      { x: 0.79, y: 0.91 },
      { x: 0.5, y: 0.7 },
      { x: 0.21, y: 0.91 },
      { x: 0.32, y: 0.57 },
      { x: 0.02, y: 0.35 },
      { x: 0.39, y: 0.35 }
    ];
  }
  if (shape === "arrowRight") {
    return [
      { x: 0, y: 0.26 },
      { x: 0.68, y: 0.26 },
      { x: 0.68, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.68, y: 1 },
      { x: 0.68, y: 0.74 },
      { x: 0, y: 0.74 }
    ];
  }
  if (shape === "arrowLeft") {
    return [
      { x: 1, y: 0.26 },
      { x: 0.32, y: 0.26 },
      { x: 0.32, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.32, y: 1 },
      { x: 0.32, y: 0.74 },
      { x: 1, y: 0.74 }
    ];
  }
  return undefined;
}

function isPointInsidePolygon(x: number, y: number, points: NormalizedPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointerInsideShapeTarget(
  event: React.PointerEvent<HTMLDivElement>,
  shape: InstagramShapeType,
  strokeWidth: number
): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const xRatio = (event.clientX - rect.left) / rect.width;
  const yRatio = (event.clientY - rect.top) / rect.height;
  if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return false;

  if (shape === "rectangle" || shape === "roundedRectangle") {
    return true;
  }

  if (shape === "circle") {
    const dx = xRatio - 0.5;
    const dy = yRatio - 0.5;
    return dx * dx + dy * dy <= 0.25;
  }

  if (shape === "line") {
    const ratio = (Math.max(1, strokeWidth) + 8) / Math.max(1, rect.height);
    const halfThickness = clamp(ratio / 2, 0.01, 0.2, 0.03);
    return Math.abs(yRatio - 0.5) <= halfThickness;
  }

  const polygon = getShapePolygonPoints(shape);
  if (!polygon) return true;
  return isPointInsidePolygon(xRatio, yRatio, polygon);
}

function normalizeFontName(value: string): string {
  return String(value || "").trim();
}

function isLocalhostRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function normalizeStoredFontFamily(value: unknown): string {
  const raw = normalizeFontName(String(value || ""));
  if (!raw) return "Noto Sans KR";
  // Replacement-char indicates previously corrupted persisted value.
  if (raw.includes("\uFFFD")) {
    return "Noto Sans KR";
  }
  return raw;
}

function getRuntimeLocalFontAlias(fontFamily: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const key = normalizeFontName(fontFamily).toLowerCase();
  if (!key) return undefined;
  const map = window.__shortsMakerLocalFontAliasMap || {};
  return map[key];
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

function uniqueFontNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  names.forEach((item) => {
    const normalized = normalizeFontName(item);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function normalizeCustomTemplateFonts(
  rawFonts: InstagramTemplate["customFonts"] | unknown
): InstagramCustomFont[] {
  if (!Array.isArray(rawFonts)) {
    return [];
  }
  const mapped: InstagramCustomFont[] = [];
  rawFonts.forEach((item) => {
    const record = (item || {}) as Partial<InstagramCustomFont>;
    const family = normalizeFontName(String(record.family || ""));
    const sourceUrl = String(record.sourceUrl || "").trim();
    if (!family || !sourceUrl) {
      return;
    }
    mapped.push({
      id: String(record.id || uid()),
      family,
      fileName: String(record.fileName || family).trim() || family,
      sourceUrl,
      mimeType: String(record.mimeType || "").trim() || undefined,
      uploadedAt:
        typeof record.uploadedAt === "string" && record.uploadedAt.trim()
          ? record.uploadedAt
          : new Date().toISOString()
    });
  });
  const normalized = mapped.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const seen = new Set<string>();
  const deduped: InstagramCustomFont[] = [];
  normalized.forEach((font) => {
    const key = font.family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(font);
  });
  return deduped;
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function toggleValues(base: string[], toggles: string[]): string[] {
  const current = new Set(uniqueValues(base));
  uniqueValues(toggles).forEach((id) => {
    if (current.has(id)) {
      current.delete(id);
      return;
    }
    current.add(id);
  });
  return Array.from(current);
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

function getTextDecorationLine(layer: InstagramTextElement): string {
  const lines: string[] = [];
  if (layer.underline) lines.push("underline");
  if (layer.strikeThrough) lines.push("line-through");
  return lines.length > 0 ? lines.join(" ") : "none";
}

function getTextShadowStyle(layer: InstagramTextElement): string {
  if (!layer.shadowEnabled) {
    return "none";
  }
  return `${layer.shadowX}px ${layer.shadowY}px ${layer.shadowBlur}px ${normalizeHex(layer.shadowColor, "#000000")}`;
}

function buildTextStyleSnapshot(layer: InstagramTextElement): TextStyleSnapshot {
  return {
    color: layer.color,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    textAlign: layer.textAlign,
    autoWrap: layer.autoWrap,
    bold: layer.bold,
    italic: layer.italic,
    underline: layer.underline,
    strikeThrough: layer.strikeThrough,
    shadowEnabled: layer.shadowEnabled,
    shadowColor: layer.shadowColor,
    shadowBlur: layer.shadowBlur,
    shadowX: layer.shadowX,
    shadowY: layer.shadowY,
    backgroundColor: layer.backgroundColor,
    padding: layer.padding,
    opacity: layer.opacity
  };
}

function buildShapeStyleSnapshot(layer: InstagramShapeElement): ShapeStyleSnapshot {
  return {
    shape: layer.shape,
    fillEnabled: layer.fillEnabled,
    fillColor: layer.fillColor,
    strokeColor: layer.strokeColor,
    strokeWidth: layer.strokeWidth,
    cornerRadius: layer.cornerRadius,
    opacity: layer.opacity
  };
}

function isToolbarInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("button, input, select, textarea, a, [role='button'], [data-no-toolbar-drag='true']"));
}

function isNearBottomRightResizeHandle(
  event: React.PointerEvent<HTMLElement>,
  element: HTMLElement,
  handleSize = 20
): boolean {
  const rect = element.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  return offsetX >= rect.width - handleSize && offsetY >= rect.height - handleSize;
}

function normalizeCanvasWidth(value: number): number {
  return clamp(Number(value), 320, 4000, DEFAULT_CANVAS_WIDTH);
}

function normalizeCanvasHeight(value: number): number {
  return clamp(Number(value), 320, 4000, DEFAULT_CANVAS_HEIGHT);
}

function toCanvasWidthUnit(value: number, canvasWidth: number): string {
  const safeCanvasWidth = Math.max(1, Number(canvasWidth) || 1);
  const numeric = Number(value) || 0;
  return `${(numeric * 100) / safeCanvasWidth}cqw`;
}

type InstagramBindingState = {
  sheetName: string;
  bindingFields: string[];
  sampleData: Record<string, string>;
  selectedRowKey: string;
};

type BindingRowOption = {
  key: string;
  label: string;
  values: Record<string, string>;
};

function mergeBindingFieldsWithDefaults(fields: string[]): string[] {
  const next = uniqueValues(fields);
  const lowered = new Set(next.map((field) => field.toLowerCase()));
  DEFAULT_BINDING_FIELDS.forEach((field) => {
    const key = field.toLowerCase();
    if (lowered.has(key)) return;
    next.push(field);
    lowered.add(key);
  });
  return next;
}

function normalizeBindingState(raw: unknown): InstagramBindingState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Partial<InstagramBindingState>;
  const sheetName = String(item.sheetName || "");
  const selectedRowKey = typeof item.selectedRowKey === "string" ? item.selectedRowKey : "";
  const bindingFields = Array.isArray(item.bindingFields)
    ? item.bindingFields.map((field) => String(field || "").trim()).filter(Boolean)
    : [];
  const sampleDataRaw = item.sampleData && typeof item.sampleData === "object" ? item.sampleData : {};
  const sampleData: Record<string, string> = {};
  Object.entries(sampleDataRaw as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    sampleData[normalizedKey] = String(value ?? "");
  });
  return {
    sheetName,
    bindingFields:
      bindingFields.length > 0
        ? mergeBindingFieldsWithDefaults(bindingFields)
        : mergeBindingFieldsWithDefaults(DEFAULT_BINDING_FIELDS),
    sampleData: Object.keys(sampleData).length > 0 ? sampleData : { ...DEFAULT_SAMPLE_DATA },
    selectedRowKey
  };
}

function normalizeBindingRowValues(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    mapped[normalizedKey] = String(value ?? "");
  });
  return mapped;
}

function readBindingRowValue(values: Record<string, string>, field: string): string {
  const exact = values[field];
  if (typeof exact !== "undefined") {
    return String(exact ?? "").trim();
  }
  const matchedKey = Object.keys(values).find((key) => key.toLowerCase() === field.toLowerCase());
  return matchedKey ? String(values[matchedKey] ?? "").trim() : "";
}

function createBindingRowOptions(rows: Array<Record<string, string>>): BindingRowOption[] {
  const usedKeys = new Set<string>();
  return rows.map((row, index) => {
    const values = normalizeBindingRowValues(row);
    const id = readBindingRowValue(values, "id");
    const subject = readBindingRowValue(values, "subject");
    const type = readBindingRowValue(values, "type");
    const status = readBindingRowValue(values, "status");
    const labelParts = [id, subject, type].filter(Boolean);
    const labelBase = labelParts.length > 0 ? labelParts.join(" | ") : "row";
    const label = status ? `${index + 1}. ${labelBase} (${status})` : `${index + 1}. ${labelBase}`;
    const baseKey = id ? `id:${id}` : `row:${index}`;
    let key = baseKey;
    let suffix = 1;
    while (usedKeys.has(key)) {
      key = `${baseKey}#${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return {
      key,
      label,
      values
    };
  });
}

function resolveCanvasPresetId(width: number, height: number): string {
  const matched = CANVAS_PRESETS.find((item) => item.width === width && item.height === height);
  return matched?.id || CUSTOM_CANVAS_PRESET;
}

function deepCloneTemplate(template: InstagramTemplate): InstagramTemplate {
  return JSON.parse(JSON.stringify(template)) as InstagramTemplate;
}

function buildTemplatePayload(source: InstagramTemplate, templateId: string): InstagramTemplate {
  const payload = deepCloneTemplate(source);
  payload.id = templateId || payload.id || uid();
  payload.canvasWidth = normalizeCanvasWidth(Number(payload.canvasWidth));
  payload.canvasHeight = normalizeCanvasHeight(Number(payload.canvasHeight));
  payload.canvasPreset = resolveCanvasPresetId(payload.canvasWidth, payload.canvasHeight);
  payload.pageCount = payload.pages.length;
  payload.pageDurationSec = clamp(Number(payload.pageDurationSec), 1, 60, 4);
  payload.customFonts = normalizeCustomTemplateFonts(payload.customFonts);
  payload.updatedAt = new Date().toISOString();
  payload.pages = payload.pages.map((page) => ({
    ...page,
    durationSec: clamp(Number(page.durationSec), 1, 60, payload.pageDurationSec)
  }));
  return payload;
}

function buildAutosaveSignature(template: InstagramTemplate): string {
  const cloned = deepCloneTemplate(template);
  cloned.id = "";
  cloned.updatedAt = "";
  return JSON.stringify(cloned);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function createTextLayer(mode: "variable" | "plain" = "variable"): InstagramTextElement {
  return {
    id: uid(),
    type: "text",
    textMode: mode,
    x: 50,
    y: 20,
    width: 84,
    height: 22,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    text: mode === "variable" ? "{{subject}}" : "텍스트 입력",
    autoWrap: true,
    color: "#111111",
    fontFamily: "Noto Sans KR",
    fontSize: 56,
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "center",
    bold: true,
    italic: false,
    underline: false,
    strikeThrough: false,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    backgroundColor: "#FFFFFF",
    padding: 0
  };
}

function createShapeLayer(shape: InstagramShapeType): InstagramShapeElement {
  const isCircle = shape === "circle";
  const isArrow = shape === "arrowRight" || shape === "arrowLeft";
  const isLine = shape === "line";
  const defaultCircleSize = normalizeCircleDimensions(36, 36, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
  return {
    id: uid(),
    type: "shape",
    shape,
    fillEnabled: isLine ? false : true,
    x: 50,
    y: 56,
    width: isLine ? 84 : isCircle ? defaultCircleSize.width : isArrow ? 60 : 84,
    height: isLine ? 4 : isCircle ? defaultCircleSize.height : 28,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fillColor: "#F4F1EA",
    strokeColor: "#111111",
    strokeWidth: isLine ? 3 : 2,
    cornerRadius: shape === "roundedRectangle" ? 24 : 0
  };
}

function normalizeCircleDimensions(
  widthPercent: number,
  heightPercent: number,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } {
  const safeCanvasWidth = Math.max(1, Number(canvasWidth) || DEFAULT_CANVAS_WIDTH);
  const safeCanvasHeight = Math.max(1, Number(canvasHeight) || DEFAULT_CANVAS_HEIGHT);
  const widthPx = (Math.max(MIN_LAYER_SIZE_PERCENT, widthPercent) / 100) * safeCanvasWidth;
  const heightPx = (Math.max(MIN_LAYER_SIZE_PERCENT, heightPercent) / 100) * safeCanvasHeight;
  const sidePx = clamp(Math.min(widthPx, heightPx), 1, Math.min(safeCanvasWidth, safeCanvasHeight), 260);
  return {
    width: clamp((sidePx / safeCanvasWidth) * 100, MIN_LAYER_SIZE_PERCENT, 100, 24),
    height: clamp((sidePx / safeCanvasHeight) * 100, MIN_LAYER_SIZE_PERCENT, 100, 24)
  };
}

function getShapeSizePx(
  shape: Pick<InstagramShapeElement, "width" | "height">,
  canvasWidth: number,
  canvasHeight: number
): { widthPx: number; heightPx: number } {
  return {
    widthPx: (clamp(Number(shape.width), MIN_LAYER_SIZE_PERCENT, 100, 20) / 100) * Math.max(1, canvasWidth),
    heightPx: (clamp(Number(shape.height), MIN_LAYER_SIZE_PERCENT, 100, 20) / 100) * Math.max(1, canvasHeight)
  };
}

function getRectangleCornerRatioPercent(
  shape: Pick<InstagramShapeElement, "width" | "height" | "cornerRadius">,
  canvasWidth: number,
  canvasHeight: number
): number {
  const { widthPx, heightPx } = getShapeSizePx(shape, canvasWidth, canvasHeight);
  const maxRadiusPx = Math.max(1, Math.min(widthPx, heightPx) / 2);
  return clamp((Math.max(0, Number(shape.cornerRadius) || 0) / maxRadiusPx) * 100, 0, 100, 0);
}

function cornerRatioPercentToRadiusPx(
  ratioPercent: number,
  shape: Pick<InstagramShapeElement, "width" | "height">,
  canvasWidth: number,
  canvasHeight: number
): number {
  const { widthPx, heightPx } = getShapeSizePx(shape, canvasWidth, canvasHeight);
  const maxRadiusPx = Math.max(1, Math.min(widthPx, heightPx) / 2);
  const normalizedRatio = clamp(Number(ratioPercent), 0, 100, 0) / 100;
  return clamp(maxRadiusPx * normalizedRatio, 0, maxRadiusPx, 0);
}

function createImageLayer(): InstagramImageElement {
  return {
    id: uid(),
    type: "image",
    x: 50,
    y: 57,
    width: 84,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    imageUrl: "",
    mediaType: "image",
    fit: "cover",
    borderRadius: 16,
    overlayColor: "#000000",
    overlayOpacity: 0,
    aiGenerateEnabled: false,
    aiPrompt: "",
    aiStylePreset: DEFAULT_INSTAGRAM_AI_IMAGE_STYLE
  };
}

function createPage(index: number): InstagramFeedPage {
  return {
    id: uid(),
    name: `Page ${index + 1}`,
    backgroundColor: "#FFFFFF",
    backgroundImageUrl: "",
    backgroundFit: "cover",
    durationSec: 4,
    audioEnabled: false,
    audioProvider: "auto",
    audioVoice: "alloy",
    audioSpeed: 1,
    audioPrompt: "",
    elements: [createShapeLayer("rectangle"), createTextLayer("variable"), createImageLayer()]
  };
}

function createTemplate(): InstagramTemplate {
  return {
    id: uid(),
    templateName: "Instagram Feed Template",
    sourceTitle: "{{subject}}",
    sourceTopic: "{{description}}",
    canvasPreset: "instagram_feed_portrait",
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    pageDurationSec: 4,
    pageCount: 1,
    pages: [createPage(0)],
    customFonts: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeTemplateForEditor(template: InstagramTemplate): InstagramTemplate {
  const normalized = deepCloneTemplate(template);
  const normalizedCanvasWidth = normalizeCanvasWidth(Number(normalized.canvasWidth));
  const normalizedCanvasHeight = normalizeCanvasHeight(Number(normalized.canvasHeight));
  normalized.canvasWidth = normalizedCanvasWidth;
  normalized.canvasHeight = normalizedCanvasHeight;
  normalized.canvasPreset = resolveCanvasPresetId(normalizedCanvasWidth, normalizedCanvasHeight);
  normalized.pageDurationSec = clamp(Number(normalized.pageDurationSec), 1, 60, 4);
  normalized.customFonts = normalizeCustomTemplateFonts(normalized.customFonts);
  normalized.pages = (normalized.pages || []).map((page, pageIndex) => ({
    ...page,
    id: String(page.id || uid()),
    name: String(page.name || `Page ${pageIndex + 1}`),
    durationSec: clamp(Number(page.durationSec), 1, 60, normalized.pageDurationSec),
    audioEnabled:
      typeof page.audioEnabled === "boolean"
        ? page.audioEnabled
        : Boolean(String(page.audioPrompt || "").trim() || String(page.audioUrl || "").trim()),
    audioProvider:
      page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
    audioVoice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
    audioSpeed: clamp(Number(page.audioSpeed), 0.5, 2, 1),
    backgroundColor: normalizeHex(String(page.backgroundColor || ""), "#FFFFFF"),
    backgroundImageUrl: String(page.backgroundImageUrl || ""),
    backgroundFit: page.backgroundFit === "contain" ? "contain" : "cover",
    elements: (page.elements || [])
      .map((element, elementIndex) => {
        const core = {
          ...element,
          id: String(element.id || uid()),
          x: clamp(Number(element.x), 0, 100, 50),
          y: clamp(Number(element.y), 0, 100, 50),
          width: clamp(Number(element.width), MIN_LAYER_SIZE_PERCENT, 100, 40),
          height: clamp(Number(element.height), MIN_LAYER_SIZE_PERCENT, 100, 24),
          rotation: clamp(Number(element.rotation), -180, 180, 0),
          opacity: clamp(Number(element.opacity), 0.05, 1, 1),
          zIndex: clamp(Number(element.zIndex), 0, 999, elementIndex)
        } as InstagramPageElement;

        if (core.type === "shape") {
          const shape = normalizeShapeType(core.shape);
          const size =
            shape === "circle"
              ? normalizeCircleDimensions(core.width, core.height, normalizedCanvasWidth, normalizedCanvasHeight)
              : { width: core.width, height: core.height };
          return {
            ...core,
            shape,
            width: size.width,
            height: size.height
          } as InstagramShapeElement;
        }
        if (core.type === "image") {
          return {
            ...core,
            aiGenerateEnabled: Boolean(core.aiGenerateEnabled),
            aiPrompt: String(core.aiPrompt || ""),
            aiStylePreset: String(core.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE)
          } as InstagramImageElement;
        }
        if (core.type === "text") {
          return {
            ...core,
            autoWrap: core.autoWrap !== false
          } as InstagramTextElement;
        }
        return core;
      })
      .sort((a, b) => a.zIndex - b.zIndex)
  }));
  if (!normalized.pages.length) {
    normalized.pages = [createPage(0)];
  }
  normalized.pageCount = normalized.pages.length;
  return normalized;
}

function resolveElementName(layer: InstagramPageElement): string {
  if (layer.type === "text") {
    const preview = String(layer.text || "").replace(/\s+/g, " ").trim().slice(0, 20);
    const prefix = layer.textMode === "plain" ? "Text(일반)" : "Text(변수)";
    return preview ? `${prefix} · ${preview}` : prefix;
  }
  if (layer.type === "image") return "Image";
  return shapeLabel(layer.shape);
}

function resolveLayerTokenText(
  rawText: string,
  sampleData: Record<string, string>,
  mode: "variable" | "plain" = "variable"
): string {
  if (mode === "plain") {
    return String(rawText || "");
  }
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
  return resolveLayerTokenText(layer.text, sampleData, layer.textMode === "plain" ? "plain" : "variable");
}

function inferMediaTypeFromSource(source: string): "image" | "video" {
  const raw = String(source || "").trim().toLowerCase();
  if (!raw) return "image";
  if (raw.startsWith("data:video/")) return "video";
  if (raw.startsWith("blob:")) return "image";
  const clean = raw.split("?")[0].split("#")[0];
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(clean)) return "video";
  return "image";
}

type RubySegment =
  | { type: "plain"; text: string }
  | { type: "ruby"; base: string; ruby: string };

type RubyTokenMatch = {
  index: number;
  base: string;
  ruby: string;
};

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
  if (!matched) {
    return [{ type: "plain", text: line }];
  }
  return segments;
}

function lineHasRuby(segments: RubySegment[]): boolean {
  return segments.some((segment) => segment.type === "ruby");
}

function extractRubyTokenMatches(text: string): RubyTokenMatch[] {
  const matches: RubyTokenMatch[] = [];
  const regex = /\[([^\]\|]+)\|([^\]]+)\]/g;
  let token: RegExpExecArray | null = regex.exec(String(text || ""));
  let index = 0;
  while (token) {
    matches.push({
      index,
      base: String(token[1] || ""),
      ruby: String(token[2] || "")
    });
    index += 1;
    token = regex.exec(String(text || ""));
  }
  return matches;
}

function updateRubyTokenByIndex(text: string, tokenIndex: number, ruby: string): string {
  let index = 0;
  return String(text || "").replace(/\[([^\]\|]+)\|([^\]]+)\]/g, (full, base) => {
    if (index !== tokenIndex) {
      index += 1;
      return full;
    }
    index += 1;
    return `[${String(base || "")}|${ruby}]`;
  });
}

function removeRubyTokenByIndex(text: string, tokenIndex: number): string {
  let index = 0;
  return String(text || "").replace(/\[([^\]\|]+)\|([^\]]+)\]/g, (full, base) => {
    if (index !== tokenIndex) {
      index += 1;
      return full;
    }
    index += 1;
    return String(base || "");
  });
}

function measureRubyLineWidth(ctx: CanvasRenderingContext2D, segments: RubySegment[]): number {
  let width = 0;
  segments.forEach((segment) => {
    width += ctx.measureText(segment.type === "ruby" ? segment.base : segment.text).width;
  });
  return width;
}

function renderRubyPreviewNodes(text: string): React.ReactNode {
  const lines = String(text || "").split("\n");
  return lines.map((line, lineIndex) => {
    const segments = parseRubySegments(line);
    return (
      <Fragment key={`line-${lineIndex}`}>
        {segments.map((segment, segmentIndex) => {
          if (segment.type === "ruby") {
            return (
              <ruby key={`ruby-${lineIndex}-${segmentIndex}`} className="mx-[1px] ruby">
                <span>{segment.base}</span>
                <rt className="text-[0.45em] leading-none">{segment.ruby}</rt>
              </ruby>
            );
          }
          return <span key={`plain-${lineIndex}-${segmentIndex}`}>{segment.text}</span>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function wrapTextForCanvas(
  ctx: CanvasRenderingContext2D,
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

async function renderPageToPngDataUrl(args: {
  page: InstagramFeedPage;
  sampleData: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
}): Promise<string> {
  return renderInstagramPageToPngDataUrl(args);
}

function toTemplateFromUnknown(input: unknown): InstagramTemplate | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Partial<InstagramTemplate> & Record<string, unknown>;
  const base = createTemplate();
  const canvasWidth = normalizeCanvasWidth(Number(source.canvasWidth));
  const canvasHeight = normalizeCanvasHeight(Number(source.canvasHeight));

  const pages: InstagramFeedPage[] = Array.isArray(source.pages)
    ? source.pages.reduce<InstagramFeedPage[]>((acc, page, index) => {
        const rawPage = page as Partial<InstagramFeedPage> | undefined;
        if (!rawPage) return acc;
        const pageBase = createPage(index);
        const elements: InstagramPageElement[] = Array.isArray(rawPage.elements)
          ? rawPage.elements
              .reduce<InstagramPageElement[]>((items, element, elementIndex) => {
                const rawElement = element as Partial<InstagramPageElement> | undefined;
                if (!rawElement || typeof rawElement !== "object") return items;
                const core = {
                  id: String(rawElement.id || uid()),
                  x: clamp(Number(rawElement.x), 0, 100, 50),
                  y: clamp(Number(rawElement.y), 0, 100, 50),
                  width: clamp(Number(rawElement.width), MIN_LAYER_SIZE_PERCENT, 100, 40),
                  height: clamp(Number(rawElement.height), MIN_LAYER_SIZE_PERCENT, 100, 24),
                  rotation: clamp(Number(rawElement.rotation), -180, 180, 0),
                  opacity: clamp(Number(rawElement.opacity), 0.05, 1, 1),
                  zIndex: clamp(Number(rawElement.zIndex), 0, 999, elementIndex)
                };

                if (rawElement.type === "shape") {
                  const shapeSource = rawElement as Partial<InstagramShapeElement>;
                  const normalizedShape = normalizeShapeType(shapeSource.shape);
                  const normalizedSize =
                    normalizedShape === "circle"
                      ? normalizeCircleDimensions(core.width, core.height, canvasWidth, canvasHeight)
                      : { width: core.width, height: core.height };
                  items.push({
                    ...core,
                    width: normalizedSize.width,
                    height: normalizedSize.height,
                    type: "shape",
                    shape: normalizedShape,
                    fillEnabled: shapeSource.fillEnabled !== false,
                    fillColor: normalizeHex(String(shapeSource.fillColor || ""), "#F4F1EA"),
                    strokeColor: normalizeHex(String(shapeSource.strokeColor || ""), "#111111"),
                    strokeWidth: clamp(Number(shapeSource.strokeWidth), 0, 20, 0),
                    cornerRadius: clamp(Number(shapeSource.cornerRadius), 0, 220, 24)
                  } satisfies InstagramShapeElement);
                  return items;
                }

                if (rawElement.type === "image") {
                  const imageSource = rawElement as Partial<InstagramImageElement>;
                  const normalizedImageUrl = String(imageSource.imageUrl || "");
                  items.push({
                    ...core,
                    type: "image",
                    imageUrl: normalizedImageUrl,
                    mediaType:
                      imageSource.mediaType === "video" || inferMediaTypeFromSource(normalizedImageUrl) === "video"
                        ? "video"
                        : "image",
                    fit: imageSource.fit === "contain" ? "contain" : "cover",
                    borderRadius: clamp(Number(imageSource.borderRadius), 0, 220, 16),
                    overlayColor: normalizeHex(String(imageSource.overlayColor || ""), "#000000"),
                    overlayOpacity: clamp(Number(imageSource.overlayOpacity), 0, 1, 0),
                    aiGenerateEnabled: Boolean(imageSource.aiGenerateEnabled),
                    aiPrompt: String(imageSource.aiPrompt || ""),
                    aiStylePreset: String(imageSource.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE)
                  } satisfies InstagramImageElement);
                  return items;
                }

                const textSource = rawElement as Partial<InstagramTextElement>;
                const rawTextMode = String((textSource as { textMode?: string }).textMode || "variable");
                const textMode = rawTextMode === "plain" ? "plain" : "variable";
                items.push({
                  ...core,
                  type: "text",
                  textMode,
                  text: String(textSource.text || (textMode === "plain" ? "텍스트 입력" : "{{subject}}")),
                  autoWrap: textSource.autoWrap !== false,
                  color: normalizeHex(String(textSource.color || ""), "#111111"),
                  fontFamily: normalizeStoredFontFamily(textSource.fontFamily),
                  fontSize: clamp(Number(textSource.fontSize), 10, 240, 56),
                  lineHeight: clamp(Number(textSource.lineHeight), 0.8, 3, 1.2),
                  letterSpacing: clamp(Number(textSource.letterSpacing), -2, 20, 0),
                  textAlign:
                    textSource.textAlign === "left" || textSource.textAlign === "right"
                      ? textSource.textAlign
                      : "center",
                  bold: Boolean(textSource.bold),
                  italic: Boolean(textSource.italic),
                  underline: Boolean(textSource.underline),
                  strikeThrough: Boolean(textSource.strikeThrough),
                  shadowEnabled: Boolean(textSource.shadowEnabled),
                  shadowColor: normalizeHex(String(textSource.shadowColor || ""), "#000000"),
                  shadowBlur: clamp(Number(textSource.shadowBlur), 0, 40, 0),
                  shadowX: clamp(Number(textSource.shadowX), -40, 40, 0),
                  shadowY: clamp(Number(textSource.shadowY), -40, 40, 0),
                  backgroundColor: normalizeHex(String(textSource.backgroundColor || ""), "#FFFFFF"),
                  padding: clamp(Number(textSource.padding), 0, 40, 0)
                } satisfies InstagramTextElement);
                return items;
              }, [])
              .sort((a, b) => a.zIndex - b.zIndex)
          : pageBase.elements;
        acc.push({
          id: String(rawPage.id || uid()),
          name: String(rawPage.name || pageBase.name),
          backgroundColor: normalizeHex(String(rawPage.backgroundColor || ""), "#FFFFFF"),
          backgroundImageUrl: String(rawPage.backgroundImageUrl || ""),
          backgroundFit: rawPage.backgroundFit === "contain" ? "contain" : "cover",
          durationSec: clamp(Number(rawPage.durationSec), 1, 60, 4),
          audioEnabled:
            typeof rawPage.audioEnabled === "boolean"
              ? rawPage.audioEnabled
              : Boolean(String(rawPage.audioPrompt || "").trim() || String(rawPage.audioUrl || "").trim()),
          audioProvider:
            rawPage.audioProvider === "openai" || rawPage.audioProvider === "gemini" ? rawPage.audioProvider : "auto",
          audioVoice: String(rawPage.audioVoice || "alloy").trim().toLowerCase() || "alloy",
          audioSpeed: clamp(Number(rawPage.audioSpeed), 0.5, 2, 1),
          audioPrompt: String(rawPage.audioPrompt || ""),
          elements
        } satisfies InstagramFeedPage);
        return acc;
      }, [])
    : [];

  const normalizedPages = pages.length > 0 ? pages : base.pages;
  return {
    id: String(source.id || uid()),
    templateName: String(source.templateName || "Instagram Feed Template"),
    sourceTitle: String(source.sourceTitle || "{{subject}}"),
    sourceTopic: String(source.sourceTopic || "{{description}}"),
    canvasPreset: String(source.canvasPreset || resolveCanvasPresetId(canvasWidth, canvasHeight)),
    canvasWidth,
    canvasHeight,
    pageDurationSec: clamp(Number(source.pageDurationSec), 1, 60, 4),
    pageCount: normalizedPages.length,
    pages: normalizedPages,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString()
  };
}

function ColorField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizeHex(props.value, "#000000")}
          onChange={(event) => props.onChange(event.target.value)}
          className="h-9 w-11 rounded border bg-transparent p-1"
        />
        <Input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      </div>
    </div>
  );
}

export function InstagramTemplatesClient(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveMessage, setAutoSaveMessage] = useState("자동 저장 대기 중");
  const [templates, setTemplates] = useState<InstagramTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>();
  const [selectedTemplateId, setSelectedTemplateId] = useState("__new__");
  const [editor, setEditor] = useState<InstagramTemplate>(createTemplate());
  const [selectedPageId, setSelectedPageId] = useState<string>(editor.pages[0].id);
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ x: 12, y: 12 });
  const [toolbarDrag, setToolbarDrag] = useState<ToolbarDragState | null>(null);
  const [objectToolbarOffset, setObjectToolbarOffset] = useState<ObjectToolbarOffset>({ x: 0, y: 0 });
  const [objectToolbarDrag, setObjectToolbarDrag] = useState<ObjectToolbarDragState | null>(null);
  const [objectToolbarWidth, setObjectToolbarWidth] = useState(760);
  const [pendingImageLayerId, setPendingImageLayerId] = useState<string>();
  const [aiImageGeneratingLayerId, setAiImageGeneratingLayerId] = useState<string>();
  const [sheetName, setSheetName] = useState("");
  const [bindingSearch, setBindingSearch] = useState("");
  const [bindingFields, setBindingFields] = useState<string[]>(DEFAULT_BINDING_FIELDS);
  const [bindingRowOptions, setBindingRowOptions] = useState<BindingRowOption[]>([]);
  const [bindingSelectedRowKey, setBindingSelectedRowKey] = useState("");
  const [bindingLoading, setBindingLoading] = useState(false);
  const [sampleData, setSampleData] = useState<Record<string, string>>({ ...DEFAULT_SAMPLE_DATA });
  const [defaultTtsVoiceProvider, setDefaultTtsVoiceProvider] = useState<"openai" | "gemini" | "both">("both");
  const [availableVoiceOptions, setAvailableVoiceOptions] = useState(() => filterVoiceOptions("both"));
  const [localFontNames, setLocalFontNames] = useState<string[]>([]);
  const [favoriteFontNames, setFavoriteFontNames] = useState<string[]>([]);
  const [localFontLoading, setLocalFontLoading] = useState(false);
  const [localFontMessage, setLocalFontMessage] = useState<string>();
  const [customFontUploading, setCustomFontUploading] = useState(false);
  const [customFontMessage, setCustomFontMessage] = useState<string>();
  const [, setFontAliasVersion] = useState(0);
  const [copiedTextStyle, setCopiedTextStyle] = useState<TextStyleSnapshot>();
  const [pendingTextStyleApplyFromLayerId, setPendingTextStyleApplyFromLayerId] = useState<string>();
  const [copiedShapeStyle, setCopiedShapeStyle] = useState<ShapeStyleSnapshot>();
  const [pendingShapeStyleApplyFromLayerId, setPendingShapeStyleApplyFromLayerId] = useState<string>();
  const [shapeToolOpen, setShapeToolOpen] = useState(false);
  const [panelToolOpen, setPanelToolOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontPickerQuery, setFontPickerQuery] = useState("");
  const [fontPickerAnchorRect, setFontPickerAnchorRect] = useState<PickerAnchorRect | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [pagePreviewVisible, setPagePreviewVisible] = useState<Record<string, boolean>>({});
  const [showAdvancedPosition, setShowAdvancedPosition] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string>();
  const [outputVideoUrl, setOutputVideoUrl] = useState<string>();
  const [renderingOutput, setRenderingOutput] = useState(false);
  const [renderingOutputVideo, setRenderingOutputVideo] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>();
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [audioPreviewError, setAudioPreviewError] = useState<string>();
  const [furiganaLoading, setFuriganaLoading] = useState(false);
  const [sections, setSections] = useState({
    layers: true,
    page: true,
    data: true,
    output: true,
    json: false
  });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const objectToolbarRef = useRef<HTMLDivElement | null>(null);
  const fontPickerRef = useRef<HTMLDivElement | null>(null);
  const fontPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const pageBackgroundImageInputRef = useRef<HTMLInputElement | null>(null);
  const layerImageInputRef = useRef<HTMLInputElement | null>(null);
  const customFontInputRef = useRef<HTMLInputElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef(editor);
  const selectedPageIdRef = useRef(selectedPageId);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRequestSeqRef = useRef(0);
  const lastSavedSignatureRef = useRef("");
  const bindingAutoLoadedRef = useRef(false);
  const undoStackRef = useRef<InstagramTemplate[]>([]);
  const redoStackRef = useRef<InstagramTemplate[]>([]);
  const historyLimitRef = useRef(120);
  const interactionMovedRef = useRef(false);
  const loadingFontAliasRef = useRef<Set<string>>(new Set());
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioPreviewPlayRef = useRef(false);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewportWidth = (): void => setViewportWidth(window.innerWidth);
    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    return () => window.removeEventListener("resize", syncViewportWidth);
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!audioPreviewUrl || !pendingAudioPreviewPlayRef.current) {
      return;
    }
    const audio = audioPreviewRef.current;
    if (!audio) {
      return;
    }
    pendingAudioPreviewPlayRef.current = false;
    void audio.play().catch(() => {
      // 브라우저 자동재생 정책으로 재생이 차단될 수 있습니다.
    });
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FAVORITE_INSTAGRAM_FONTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setFavoriteFontNames(uniqueFontNames(parsed.map((item) => String(item))));
    } catch {
      setFavoriteFontNames([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(FAVORITE_INSTAGRAM_FONTS_KEY, JSON.stringify(uniqueFontNames(favoriteFontNames)));
    } catch {
      // noop
    }
  }, [favoriteFontNames]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INSTAGRAM_BINDING_STATE_KEY);
      if (!raw) return;
      const parsed = normalizeBindingState(JSON.parse(raw));
      if (!parsed) return;
      setSheetName(parsed.sheetName);
      setBindingFields(parsed.bindingFields);
      setSampleData(parsed.sampleData);
      setBindingSelectedRowKey(parsed.selectedRowKey || "");
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: InstagramBindingState = {
        sheetName,
        bindingFields: uniqueValues(bindingFields),
        sampleData,
        selectedRowKey: bindingSelectedRowKey
      };
      window.localStorage.setItem(INSTAGRAM_BINDING_STATE_KEY, JSON.stringify(payload));
    } catch {
      // noop
    }
  }, [sheetName, bindingFields, sampleData, bindingSelectedRowKey]);

  useEffect(() => {
    const loadInstagramSheetDefault = async (): Promise<void> => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const settings = (await response.json()) as AppSettings;
        const instagramSheetName = String(settings.gsheetInstagramSheetName || "").trim();
        if (instagramSheetName) {
          setSheetName((prev) => (prev.trim() ? prev : instagramSheetName));
        }
        const voiceProvider = resolveTtsVoiceProvider({
          aiMode: settings.aiMode,
          aiTtsProvider: settings.aiTtsProvider,
          openaiApiKey: settings.openaiApiKey,
          geminiApiKey: settings.geminiApiKey
        });
        setDefaultTtsVoiceProvider(voiceProvider);
        const nextVoiceOptions = filterVoiceOptions(voiceProvider);
        setAvailableVoiceOptions(nextVoiceOptions.length > 0 ? nextVoiceOptions : filterVoiceOptions("both"));
      } catch {
        // noop
      }
    };
    void loadInstagramSheetDefault();
  }, []);

  const selectedPage = useMemo(
    () => editor.pages.find((page) => page.id === selectedPageId) || editor.pages[0],
    [editor.pages, selectedPageId]
  );
  const selectedPageVoiceOptions = useMemo(() => {
    const selectedProvider =
      selectedPage?.audioProvider === "openai" || selectedPage?.audioProvider === "gemini"
        ? selectedPage.audioProvider
        : defaultTtsVoiceProvider;
    const options = filterVoiceOptions(selectedProvider);
    return options.length > 0 ? options : availableVoiceOptions;
  }, [availableVoiceOptions, defaultTtsVoiceProvider, selectedPage?.audioProvider]);
  const resolvedSelectedPageAudioPrompt = useMemo(
    () => resolveLayerTokenText(String(selectedPage?.audioPrompt || ""), sampleData, "variable").trim(),
    [sampleData, selectedPage?.audioPrompt]
  );

  const selectedLayer = useMemo(
    () => selectedPage?.elements.find((item) => item.id === selectedElementId),
    [selectedPage, selectedElementId]
  );
  const selectedLayers = useMemo(
    () => selectedPage?.elements.filter((item) => selectedElementIds.includes(item.id)) || [],
    [selectedElementIds, selectedPage]
  );
  const hasMultiSelection = selectedLayers.length > 1;
  const selectedLayerRubyTokens = useMemo(
    () => (selectedLayer?.type === "text" ? extractRubyTokenMatches(selectedLayer.text) : []),
    [selectedLayer]
  );

  useEffect(() => {
    setObjectToolbarOffset({ x: 0, y: 0 });
    setFontPickerOpen(false);
    setFontPickerQuery("");
    setFontPickerAnchorRect(null);
  }, [selectedLayer?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__shortsMakerLocalFontAliasMap) {
      window.__shortsMakerLocalFontAliasMap = {};
    }
  }, []);

  useEffect(() => {
    if (!Array.isArray(editor.customFonts) || editor.customFonts.length === 0) {
      return;
    }
    void ensureInstagramCustomFontsLoaded(editor.customFonts);
  }, [editor.customFonts]);

  useEffect(() => {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    void ensureLocalFontFace(selectedLayer.fontFamily);
  }, [selectedLayer?.id, selectedLayer?.type === "text" ? selectedLayer.fontFamily : ""]);

  useEffect(() => {
    if (!pendingTextStyleApplyFromLayerId || !copiedTextStyle) return;
    if (!selectedLayer || selectedLayer.type !== "text") return;
    if (selectedLayer.id === pendingTextStyleApplyFromLayerId) return;
    updateLayerById(selectedLayer.id, (layer) => (layer.type === "text" ? { ...layer, ...copiedTextStyle } : layer));
    setPendingTextStyleApplyFromLayerId(undefined);
    setSuccess("복사한 텍스트 서식을 적용했습니다.");
  }, [copiedTextStyle, pendingTextStyleApplyFromLayerId, selectedLayer]);

  useEffect(() => {
    if (!pendingShapeStyleApplyFromLayerId || !copiedShapeStyle) return;
    if (!selectedLayer || selectedLayer.type !== "shape") return;
    if (selectedLayer.id === pendingShapeStyleApplyFromLayerId) return;
    updateLayerById(selectedLayer.id, (layer) =>
      layer.type === "shape"
        ? {
            ...layer,
            shape: copiedShapeStyle.shape,
            fillEnabled: copiedShapeStyle.fillEnabled,
            fillColor: copiedShapeStyle.fillColor,
            strokeColor: copiedShapeStyle.strokeColor,
            strokeWidth: copiedShapeStyle.strokeWidth,
            cornerRadius: copiedShapeStyle.cornerRadius,
            opacity: copiedShapeStyle.opacity
          }
        : layer
    );
    setPendingShapeStyleApplyFromLayerId(undefined);
    setSuccess("복사한 도형 서식을 적용했습니다.");
  }, [copiedShapeStyle, pendingShapeStyleApplyFromLayerId, selectedLayer]);

  useEffect(() => {
    setPagePreviewVisible((current) => {
      const next: Record<string, boolean> = {};
      editor.pages.forEach((page) => {
        next[page.id] = current[page.id] ?? true;
      });
      return next;
    });
  }, [editor.pages]);

  function refreshFontPickerAnchorRect(): void {
    const rect = fontPickerButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setFontPickerAnchorRect(null);
      return;
    }
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
    const preferredWidth = Math.min(460, Math.max(280, viewportWidth ? viewportWidth * 0.92 : 420));
    const safeLeft =
      viewportWidth > 0 ? Math.max(8, Math.min(rect.left, viewportWidth - preferredWidth - 8)) : rect.left;
    setFontPickerAnchorRect({
      left: safeLeft,
      top: rect.bottom,
      width: rect.width
    });
  }

  useEffect(() => {
    if (!fontPickerOpen) return;
    refreshFontPickerAnchorRect();

    const onViewportChange = (): void => {
      refreshFontPickerAnchorRect();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (fontPickerRef.current?.contains(target)) return;
      if (fontPickerButtonRef.current?.contains(target)) return;
      setFontPickerOpen(false);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [fontPickerOpen]);

  const sortedLayers = useMemo(
    () => [...(selectedPage?.elements || [])].sort((a, b) => a.zIndex - b.zIndex),
    [selectedPage?.elements]
  );

  const filteredBindingFields = useMemo(
    () => bindingFields.filter((field) => field.toLowerCase().includes(bindingSearch.trim().toLowerCase())),
    [bindingFields, bindingSearch]
  );
  const customFontFamilies = useMemo(
    () => uniqueFontNames((editor.customFonts || []).map((font) => String(font.family || ""))),
    [editor.customFonts]
  );
  const availableFontOptions = useMemo(
    () =>
      mergeFontOptions(
        mergeFontOptions(mergeFontOptions(FONT_OPTIONS, localFontNames), customFontFamilies),
        favoriteFontNames
      ),
    [localFontNames, customFontFamilies, favoriteFontNames]
  );
  const favoriteFontOptions = useMemo(() => {
    const favoriteSet = new Set(favoriteFontNames.map((item) => item.toLowerCase()));
    return availableFontOptions.filter((name) => favoriteSet.has(name.toLowerCase()));
  }, [availableFontOptions, favoriteFontNames]);
  const normalFontOptions = useMemo(() => {
    const favoriteSet = new Set(favoriteFontOptions.map((item) => item.toLowerCase()));
    return availableFontOptions.filter((name) => !favoriteSet.has(name.toLowerCase()));
  }, [availableFontOptions, favoriteFontOptions]);
  const filteredFavoriteFonts = useMemo(() => {
    const query = fontPickerQuery.trim().toLowerCase();
    if (!query) return favoriteFontOptions;
    return favoriteFontOptions.filter((font) => font.toLowerCase().includes(query));
  }, [favoriteFontOptions, fontPickerQuery]);
  const filteredNormalFonts = useMemo(() => {
    const query = fontPickerQuery.trim().toLowerCase();
    if (!query) return normalFontOptions;
    return normalFontOptions.filter((font) => font.toLowerCase().includes(query));
  }, [normalFontOptions, fontPickerQuery]);

  const canvasWidth = useMemo(
    () => normalizeCanvasWidth(Number(editor.canvasWidth)),
    [editor.canvasWidth]
  );

  const canvasHeight = useMemo(
    () => normalizeCanvasHeight(Number(editor.canvasHeight)),
    [editor.canvasHeight]
  );

  const canvasPresetId = useMemo(
    () => resolveCanvasPresetId(canvasWidth, canvasHeight),
    [canvasWidth, canvasHeight]
  );

  const currentAutosaveSignature = useMemo(() => buildAutosaveSignature(editor), [editor]);

  function autoExpandTextLayerIfNeeded(layer: InstagramTextElement): InstagramTextElement {
    if (layer.autoWrap === false) {
      return layer;
    }
    if (typeof document === "undefined") {
      return layer;
    }
    const measureCanvas = document.createElement("canvas");
    const ctx = measureCanvas.getContext("2d");
    if (!ctx) {
      return layer;
    }

    const widthPx = (clamp(layer.width, MIN_LAYER_SIZE_PERCENT, 100, layer.width) / 100) * canvasWidth;
    const heightPx = (clamp(layer.height, MIN_LAYER_SIZE_PERCENT, 100, layer.height) / 100) * canvasHeight;
    const paddingPx = Math.max(0, Number(layer.padding) || 0);
    const maxTextWidth = Math.max(10, widthPx - paddingPx * 2);
    const fontStyle = layer.italic ? "italic " : "";
    const fontWeight = layer.bold ? 700 : 400;
    const fontSize = Math.max(8, Number(layer.fontSize) || 8);
    ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${buildFontFamilyStack(layer.fontFamily)}`;

    const text = resolveTextLayerContent(layer, sampleData);
    const rawLines = text.split("\n");
    const rubyLines = rawLines.map((line) => parseRubySegments(line));
    const hasRuby = rubyLines.some((line) => lineHasRuby(line));
    const lines = hasRuby ? rawLines : wrapTextForCanvas(ctx, text, maxTextWidth);
    const rubyReserve = hasRuby ? Math.max(8, fontSize * 0.42) : 0;
    const lineHeightPx = Math.max(8, fontSize * clamp(layer.lineHeight, 0.8, 3, 1.2)) + rubyReserve;
    const requiredHeightPx = Math.max(8, lines.length * lineHeightPx + paddingPx * 2 + 2);

    if (requiredHeightPx <= heightPx) {
      return layer;
    }

    const nextHeight = clamp((requiredHeightPx / Math.max(1, canvasHeight)) * 100, MIN_LAYER_SIZE_PERCENT, 100, layer.height);
    if (!Number.isFinite(nextHeight) || nextHeight <= layer.height) {
      return layer;
    }
    return {
      ...layer,
      height: nextHeight
    };
  }

  function clearHistory(): void {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }

  function pushUndoSnapshot(snapshot: InstagramTemplate): void {
    undoStackRef.current.push(deepCloneTemplate(snapshot));
    if (undoStackRef.current.length > historyLimitRef.current) {
      undoStackRef.current = undoStackRef.current.slice(-historyLimitRef.current);
    }
    redoStackRef.current = [];
  }

  function applyHistorySnapshot(snapshot: InstagramTemplate): void {
    const cloned = deepCloneTemplate(snapshot);
    setEditor(cloned);
    const firstPage = cloned.pages[0];
    if (!firstPage) return;
    setSelectedPageId((current) => (cloned.pages.some((page) => page.id === current) ? current : firstPage.id));
    setSelectedElementId((current) => {
      if (!current) return firstPage.elements[0]?.id;
      const activePage = cloned.pages.find((page) => page.id === selectedPageIdRef.current) || firstPage;
      return activePage.elements.some((item) => item.id === current) ? current : activePage.elements[0]?.id;
    });
  }

  function undoEditor(): void {
    if (!undoStackRef.current.length) return;
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(deepCloneTemplate(editorRef.current));
    applyHistorySnapshot(previous);
    setSuccess("실행 취소했습니다.");
  }

  function redoEditor(): void {
    if (!redoStackRef.current.length) return;
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(deepCloneTemplate(editorRef.current));
    applyHistorySnapshot(next);
    setSuccess("다시 실행했습니다.");
  }

  function updateEditor(
    updater: (current: InstagramTemplate) => InstagramTemplate,
    options?: { keepSuccess?: boolean; recordHistory?: boolean }
  ): void {
    setEditor((current) => {
      const before = deepCloneTemplate(current);
      const nextRaw = updater(deepCloneTemplate(current));
      const next = normalizeTemplateForEditor(nextRaw);
      if (!next.pages.length) {
        next.pages = [createPage(0)];
      }
      next.pageCount = next.pages.length;
      next.pageDurationSec = clamp(Number(next.pageDurationSec), 1, 60, 4);
      next.canvasWidth = normalizeCanvasWidth(Number(next.canvasWidth));
      next.canvasHeight = normalizeCanvasHeight(Number(next.canvasHeight));
      next.canvasPreset = next.canvasPreset || resolveCanvasPresetId(next.canvasWidth, next.canvasHeight);
      const shouldRecord = options?.recordHistory !== false;
      if (shouldRecord && buildAutosaveSignature(before) !== buildAutosaveSignature(next)) {
        pushUndoSnapshot(before);
      }
      return next;
    });
    if (!options?.keepSuccess) {
      setSuccess(undefined);
    }
  }

  function updatePageById(
    pageId: string,
    mutator: (page: InstagramFeedPage) => InstagramFeedPage,
    options?: { keepSuccess?: boolean; recordHistory?: boolean }
  ): void {
    updateEditor((current) => {
      const pageIndex = current.pages.findIndex((page) => page.id === pageId);
      if (pageIndex < 0) return current;
      current.pages[pageIndex] = mutator(current.pages[pageIndex]);
      return current;
    }, options);
  }

  function updateSelectedPage(
    mutator: (page: InstagramFeedPage) => InstagramFeedPage,
    options?: { keepSuccess?: boolean; recordHistory?: boolean }
  ): void {
    updatePageById(selectedPageIdRef.current, mutator, options);
  }

  function updateLayerById(
    layerId: string,
    mutator: (layer: InstagramPageElement) => InstagramPageElement,
    pageId?: string,
    options?: { keepSuccess?: boolean; recordHistory?: boolean }
  ): void {
    updatePageById(pageId || selectedPageIdRef.current, (page) => ({
      ...page,
      elements: page.elements.map((layer) => (layer.id === layerId ? mutator(layer) : layer))
    }), options);
  }

  function setLayerOrder(
    page: InstagramFeedPage,
    layerId: string,
    direction: "up" | "down"
  ): InstagramFeedPage {
    const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex((item) => item.id === layerId);
    if (index < 0) return page;
    const target = direction === "up" ? index + 1 : index - 1;
    if (target < 0 || target >= sorted.length) return page;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    return {
      ...page,
      elements: sorted.map((item, idx) => ({ ...item, zIndex: idx }))
    };
  }

  function getLayerForPointer(pageId: string, layerId: string): InstagramPageElement | undefined {
    return editor.pages.find((page) => page.id === pageId)?.elements.find((item) => item.id === layerId);
  }

  function beginLayerInteraction(
    pageId: string,
    mode: InteractionMode,
    layerId: string,
    event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>,
    targetCanvas?: HTMLDivElement | null,
    resizeHandle: ResizeHandle = "se"
  ): void {
    const layer = getLayerForPointer(pageId, layerId);
    const canvasElement = targetCanvas || canvasRef.current;
    if (!layer || !canvasElement) return;
    const rect = canvasElement.getBoundingClientRect();
    const isModifierPressed = event.shiftKey || event.ctrlKey || event.metaKey;

    if (mode === "move" && isModifierPressed) {
      setSelectedPageId(pageId);
      const exists = selectedElementIds.includes(layerId);
      const nextSelection = exists
        ? selectedElementIds.filter((id) => id !== layerId)
        : uniqueValues([...selectedElementIds, layerId]);
      setSelectedElementIds(nextSelection);
      setSelectedElementId(exists ? nextSelection[0] : layerId);
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const movingLayerIds =
      mode === "move" && selectedElementIds.includes(layerId) && selectedElementIds.length > 1
        ? uniqueValues(selectedElementIds)
        : [layerId];
    const initialByLayerId = movingLayerIds.reduce<
      Record<string, { x: number; y: number; width: number; height: number }>
    >((acc, id) => {
      const targetLayer = getLayerForPointer(pageId, id);
      if (targetLayer) {
        acc[id] = {
          x: targetLayer.x,
          y: targetLayer.y,
          width: targetLayer.width,
          height: targetLayer.height
        };
      }
      return acc;
    }, {});

    setSelectedPageId(pageId);
    setSelectedElementId(layerId);
    setSelectedElementIds(movingLayerIds);
    pushUndoSnapshot(editorRef.current);
    interactionMovedRef.current = false;
    setInteraction({
      mode,
      resizeHandle,
      toggleDeselectOnClick:
        mode === "move" &&
        !isModifierPressed &&
        selectedElementIds.length === 1 &&
        selectedElementIds[0] === layerId,
      pageId,
      layerId,
      layerIds: movingLayerIds,
      initialByLayerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      initialX: layer.x,
      initialY: layer.y,
      initialWidth: layer.width,
      initialHeight: layer.height
    });
    event.stopPropagation();
    event.preventDefault();
  }

  function beginSelectionBox(event: React.PointerEvent<HTMLDivElement>): void {
    if (!canvasRef.current || !selectedPage) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    setSelectionBox({
      pageId: selectedPage.id,
      canvasLeft: rect.left,
      canvasTop: rect.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      additive
    });
    if (!additive) {
      setSelectedElementIds([]);
      setSelectedElementId(undefined);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function beginToolbarDrag(event: React.PointerEvent<HTMLElement>): void {
    if (!canvasRef.current || !toolbarRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    setToolbarDrag({
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: toolbarPosition.x,
      startY: toolbarPosition.y,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
      toolbarWidth: toolbarRect.width,
      toolbarHeight: toolbarRect.height
    });
    event.preventDefault();
    event.stopPropagation();
  }

  function beginObjectToolbarDrag(event: React.PointerEvent<HTMLElement>): void {
    setObjectToolbarDrag({
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: objectToolbarOffset.x,
      startY: objectToolbarOffset.y
    });
    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    if (!interaction) return;

    const onPointerMove = (event: PointerEvent): void => {
      const dxPercent = ((event.clientX - interaction.startClientX) / interaction.canvasWidth) * 100;
      const dyPercent = ((event.clientY - interaction.startClientY) / interaction.canvasHeight) * 100;
      const dxPx = Math.abs(event.clientX - interaction.startClientX);
      const dyPx = Math.abs(event.clientY - interaction.startClientY);
      if (dxPx > 3 || dyPx > 3) {
        interactionMovedRef.current = true;
      }

      if (interaction.mode === "move") {
        const moveIds = interaction.layerIds.length > 0 ? interaction.layerIds : [interaction.layerId];
        updatePageById(interaction.pageId, (page) => ({
          ...page,
          elements: page.elements.map((layer) => {
            if (!moveIds.includes(layer.id)) {
              return layer;
            }
            const initial = interaction.initialByLayerId[layer.id] || {
              x: layer.x,
              y: layer.y,
              width: layer.width,
              height: layer.height
            };
            const width = clamp(initial.width, MIN_LAYER_SIZE_PERCENT, 100, initial.width);
            const height = clamp(initial.height, MIN_LAYER_SIZE_PERCENT, 100, initial.height);
            return {
              ...layer,
              x: clamp(initial.x + dxPercent, width / 2, 100 - width / 2, initial.x),
              y: clamp(initial.y + dyPercent, height / 2, 100 - height / 2, initial.y)
            };
          })
        }), { recordHistory: false, keepSuccess: true });
        return;
      }

      updateLayerById(interaction.layerId, (layer) => {
        const initialLeft = interaction.initialX - interaction.initialWidth / 2;
        const initialRight = interaction.initialX + interaction.initialWidth / 2;
        const initialTop = interaction.initialY - interaction.initialHeight / 2;
        const initialBottom = interaction.initialY + interaction.initialHeight / 2;

        const handle = interaction.resizeHandle || "se";
        const hasW = handle.includes("w");
        const hasE = handle.includes("e");
        const hasN = handle.includes("n");
        const hasS = handle.includes("s");
        const hasHorizontalHandle = hasW || hasE;
        const hasVerticalHandle = hasN || hasS;
        let nextLeft = initialLeft;
        let nextRight = initialRight;
        let nextTop = initialTop;
        let nextBottom = initialBottom;

        if (hasW) {
          nextLeft = clamp(
            initialLeft + dxPercent,
            0,
            initialRight - MIN_LAYER_SIZE_PERCENT,
            initialLeft
          );
        }
        if (hasE) {
          nextRight = clamp(
            initialRight + dxPercent,
            initialLeft + MIN_LAYER_SIZE_PERCENT,
            100,
            initialRight
          );
        }
        if (hasN) {
          nextTop = clamp(
            initialTop + dyPercent,
            0,
            initialBottom - MIN_LAYER_SIZE_PERCENT,
            initialTop
          );
        }
        if (hasS) {
          nextBottom = clamp(
            initialBottom + dyPercent,
            initialTop + MIN_LAYER_SIZE_PERCENT,
            100,
            initialBottom
          );
        }

        let nextWidth = clamp(nextRight - nextLeft, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialWidth);
        let nextHeight = clamp(nextBottom - nextTop, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialHeight);

        const isCircleShape =
          layer.type === "shape" && normalizeShapeType(layer.shape) === "circle";
        const keepAspectRatio = event.shiftKey || isCircleShape;
        if (keepAspectRatio) {
          const aspectRatio = isCircleShape
            ? clamp(
                interaction.canvasHeight / Math.max(interaction.canvasWidth, 0.0001),
                0.05,
                20,
                1
              )
            : clamp(
                interaction.initialWidth / Math.max(interaction.initialHeight, 0.0001),
                0.05,
                20,
                1
              );
          const widthDelta = Math.abs(nextWidth - interaction.initialWidth);
          const heightDelta = Math.abs(nextHeight - interaction.initialHeight);
          const useWidthDriver =
            hasHorizontalHandle && !hasVerticalHandle
              ? true
              : hasVerticalHandle && !hasHorizontalHandle
                ? false
                : widthDelta >= heightDelta;

          if (useWidthDriver) {
            nextHeight = clamp(nextWidth / aspectRatio, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialHeight);
          } else {
            nextWidth = clamp(nextHeight * aspectRatio, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialWidth);
          }

          if (hasHorizontalHandle) {
            if (hasE && !hasW) {
              nextLeft = initialLeft;
              nextRight = nextLeft + nextWidth;
            } else if (hasW && !hasE) {
              nextRight = initialRight;
              nextLeft = nextRight - nextWidth;
            }
          } else {
            nextLeft = interaction.initialX - nextWidth / 2;
            nextRight = interaction.initialX + nextWidth / 2;
          }

          if (hasVerticalHandle) {
            if (hasS && !hasN) {
              nextTop = initialTop;
              nextBottom = nextTop + nextHeight;
            } else if (hasN && !hasS) {
              nextBottom = initialBottom;
              nextTop = nextBottom - nextHeight;
            }
          } else {
            nextTop = interaction.initialY - nextHeight / 2;
            nextBottom = interaction.initialY + nextHeight / 2;
          }

          nextWidth = clamp(nextRight - nextLeft, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialWidth);
          nextHeight = clamp(nextBottom - nextTop, MIN_LAYER_SIZE_PERCENT, 100, interaction.initialHeight);
        }

        const nextX = clamp(nextLeft + nextWidth / 2, nextWidth / 2, 100 - nextWidth / 2, interaction.initialX);
        const nextY = clamp(nextTop + nextHeight / 2, nextHeight / 2, 100 - nextHeight / 2, interaction.initialY);
        const resizedLayer = {
          ...layer,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight
        };
        if (resizedLayer.type === "text") {
          return autoExpandTextLayerIfNeeded(resizedLayer);
        }
        return resizedLayer;
      }, interaction.pageId, { recordHistory: false, keepSuccess: true });
    };

    const endInteraction = (): void => {
      if (
        interaction.mode === "move" &&
        interaction.toggleDeselectOnClick &&
        !interactionMovedRef.current
      ) {
        clearSelection();
      }
      setInteraction(null);
      interactionMovedRef.current = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endInteraction);
    window.addEventListener("pointercancel", endInteraction);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endInteraction);
      window.removeEventListener("pointercancel", endInteraction);
    };
  }, [interaction, selectedPage?.id]);

  useEffect(() => {
    if (!selectionBox) return;

    const onPointerMove = (event: PointerEvent): void => {
      setSelectionBox((current) =>
        current
          ? {
              ...current,
              currentClientX: event.clientX,
              currentClientY: event.clientY
            }
          : current
      );
    };

    const endSelection = (): void => {
      setSelectionBox((current) => {
        if (!current) return null;
        const page = editor.pages.find((item) => item.id === current.pageId);
        if (!page) return null;

        const dragDistanceX = Math.abs(current.currentClientX - current.startClientX);
        const dragDistanceY = Math.abs(current.currentClientY - current.startClientY);
        const isClickOnly = dragDistanceX < 4 && dragDistanceY < 4;
        if (isClickOnly) {
          if (!current.additive) {
            setSelectedElementIds([]);
            setSelectedElementId(undefined);
          }
          return null;
        }

        const leftPx = Math.min(current.startClientX, current.currentClientX);
        const rightPx = Math.max(current.startClientX, current.currentClientX);
        const topPx = Math.min(current.startClientY, current.currentClientY);
        const bottomPx = Math.max(current.startClientY, current.currentClientY);

        const left = ((leftPx - current.canvasLeft) / Math.max(1, current.canvasWidth)) * 100;
        const right = ((rightPx - current.canvasLeft) / Math.max(1, current.canvasWidth)) * 100;
        const top = ((topPx - current.canvasTop) / Math.max(1, current.canvasHeight)) * 100;
        const bottom = ((bottomPx - current.canvasTop) / Math.max(1, current.canvasHeight)) * 100;

        const hitIds = page.elements
          .filter((layer) => {
            const layerLeft = layer.x - layer.width / 2;
            const layerRight = layer.x + layer.width / 2;
            const layerTop = layer.y - layer.height / 2;
            const layerBottom = layer.y + layer.height / 2;
            return layerRight >= left && layerLeft <= right && layerBottom >= top && layerTop <= bottom;
          })
          .map((layer) => layer.id);

        const selectedIds = current.additive ? toggleValues(selectedElementIds, hitIds) : uniqueValues(hitIds);
        setSelectedElementIds(selectedIds);
        setSelectedElementId(selectedIds[0]);
        return null;
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endSelection);
    window.addEventListener("pointercancel", endSelection);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endSelection);
      window.removeEventListener("pointercancel", endSelection);
    };
  }, [editor.pages, selectedElementIds, selectionBox]);

  useEffect(() => {
    if (!toolbarDrag) return;

    const onPointerMove = (event: PointerEvent): void => {
      const dx = event.clientX - toolbarDrag.startClientX;
      const dy = event.clientY - toolbarDrag.startClientY;
      const nextX = clamp(
        toolbarDrag.startX + dx,
        4,
        Math.max(4, toolbarDrag.canvasWidth - toolbarDrag.toolbarWidth - 4),
        toolbarDrag.startX
      );
      const nextY = clamp(
        toolbarDrag.startY + dy,
        4,
        Math.max(4, toolbarDrag.canvasHeight - toolbarDrag.toolbarHeight - 4),
        toolbarDrag.startY
      );
      setToolbarPosition({ x: nextX, y: nextY });
    };

    const stopDrag = (): void => {
      setToolbarDrag(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [toolbarDrag]);

  useEffect(() => {
    if (!objectToolbarDrag) return;

    const onPointerMove = (event: PointerEvent): void => {
      const dx = event.clientX - objectToolbarDrag.startClientX;
      const dy = event.clientY - objectToolbarDrag.startClientY;
      setObjectToolbarOffset({
        x: objectToolbarDrag.startX + dx,
        y: objectToolbarDrag.startY + dy
      });
    };

    const stopDrag = (): void => {
      setObjectToolbarDrag(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [objectToolbarDrag]);

  useEffect(() => {
    const normalizeToolbarPosition = (): void => {
      if (!canvasRef.current || !toolbarRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const toolbarRect = toolbarRef.current.getBoundingClientRect();
      setToolbarPosition((current) => ({
        x: clamp(current.x, 4, Math.max(4, canvasRect.width - toolbarRect.width - 4), current.x),
        y: clamp(current.y, 4, Math.max(4, canvasRect.height - toolbarRect.height - 4), current.y)
      }));
    };
    normalizeToolbarPosition();
    window.addEventListener("resize", normalizeToolbarPosition);
    return () => window.removeEventListener("resize", normalizeToolbarPosition);
  }, [canvasWidth, canvasHeight, selectedPageId]);

  useEffect(() => {
    setOutputPreviewUrl(undefined);
    setOutputVideoUrl(undefined);
  }, [selectedPageId]);

  useEffect(() => {
    if (!selectedPage) return;
    if (!selectedElementId) return;
    if (!selectedPage.elements.some((item) => item.id === selectedElementId)) {
      setSelectedElementId(undefined);
    }
  }, [selectedPage, selectedElementId]);

  useEffect(() => {
    if (!selectedPage) return;
    const validIds = new Set(selectedPage.elements.map((item) => item.id));
    setSelectedElementIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      if (selectedElementId && validIds.has(selectedElementId) && !next.includes(selectedElementId)) {
        return [selectedElementId, ...next];
      }
      if (!next.length && selectedElementId && validIds.has(selectedElementId)) {
        return [selectedElementId];
      }
      return next;
    });
  }, [selectedPage, selectedElementId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTypingContext = Boolean(target?.closest("input, textarea, [contenteditable='true']"));
      const key = event.key.toLowerCase();
      const withMeta = event.metaKey || event.ctrlKey;

      if (withMeta && key === "z" && !event.shiftKey) {
        if (isTypingContext) return;
        event.preventDefault();
        undoEditor();
        return;
      }

      if (withMeta && (key === "y" || (key === "z" && event.shiftKey))) {
        if (isTypingContext) return;
        event.preventDefault();
        redoEditor();
        return;
      }

      if (event.key !== "Delete") return;
      if (!selectedLayer && selectedElementIds.length === 0) return;
      if (isTypingContext) return;
      event.preventDefault();
      if (selectedElementIds.length > 1) {
        deleteSelectedLayers(selectedElementIds);
        return;
      }
      if (selectedLayer) {
        deleteLayer(selectedLayer.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElementIds, selectedLayer?.id]);

  async function fetchTemplates(preferredTemplateId?: string): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/instagram/templates", { cache: "no-store" });
      const data = (await response.json()) as TemplateResponse;
      if (!response.ok) {
        throw new Error(data.error || "템플릿 목록을 불러오지 못했습니다.");
      }
      const list = (data.templates || []).map((item) => normalizeTemplateForEditor(item));
      const preferredFromStorage =
        preferredTemplateId ||
        (typeof window !== "undefined" ? window.localStorage.getItem(LAST_USED_TEMPLATE_ID_KEY) || undefined : undefined);
      const selectedId =
        preferredFromStorage && list.some((item) => item.id === preferredFromStorage)
          ? preferredFromStorage
          : data.activeTemplateId && list.some((item) => item.id === data.activeTemplateId)
            ? data.activeTemplateId
            : list[0]?.id;

      setTemplates(list);
      setActiveTemplateId(data.activeTemplateId);

      if (!selectedId) {
        const fresh = createTemplate();
        setSelectedTemplateId("__new__");
        clearHistory();
        setEditor(fresh);
        setSelectedPageId(fresh.pages[0].id);
        setSelectedElementId(fresh.pages[0].elements[0]?.id);
        lastSavedSignatureRef.current = buildAutosaveSignature(fresh);
        setAutoSaveStatus("idle");
        setAutoSaveMessage("자동 저장 대기 중");
        return;
      }

      const picked = list.find((item) => item.id === selectedId);
      if (!picked) return;
      const cloned = normalizeTemplateForEditor(picked);
      setSelectedTemplateId(selectedId);
      clearHistory();
      setEditor(cloned);
      setSelectedPageId(cloned.pages[0]?.id || createPage(0).id);
      setSelectedElementId(cloned.pages[0]?.elements[0]?.id);
      lastSavedSignatureRef.current = buildAutosaveSignature(cloned);
      setAutoSaveStatus("saved");
      setAutoSaveMessage("저장된 템플릿을 불러왔습니다.");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_USED_TEMPLATE_ID_KEY, selectedId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "템플릿을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchTemplates();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (bindingAutoLoadedRef.current) return;
    bindingAutoLoadedRef.current = true;
    void loadSheetBindings();
  }, [loading]);

  useEffect(() => {
    if (loading || busy) {
      return;
    }
    if (!lastSavedSignatureRef.current) {
      lastSavedSignatureRef.current = currentAutosaveSignature;
      return;
    }
    if (lastSavedSignatureRef.current === currentAutosaveSignature) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    setAutoSaveStatus("saving");
    setAutoSaveMessage("자동 저장 중...");
    const requestSeq = ++autoSaveRequestSeqRef.current;
    const snapshot = deepCloneTemplate(editor);
    const selectedIdSnapshot = selectedTemplateId;
    const snapshotSignature = currentAutosaveSignature;

    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const targetTemplateId = selectedIdSnapshot === "__new__" ? uid() : snapshot.id;
          const payload = buildTemplatePayload(snapshot, targetTemplateId);
          const response = await fetch("/api/instagram/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: payload })
          });
          const data = (await response.json()) as TemplateResponse;
          if (!response.ok) {
            throw new Error(data.error || "자동 저장에 실패했습니다.");
          }
          if (requestSeq !== autoSaveRequestSeqRef.current) {
            return;
          }
          setTemplates((data.templates || []).map((item) => normalizeTemplateForEditor(item)));
          setActiveTemplateId(data.activeTemplateId);
          if (selectedIdSnapshot === "__new__") {
            setSelectedTemplateId(targetTemplateId);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(LAST_USED_TEMPLATE_ID_KEY, targetTemplateId);
            }
            setEditor((current) =>
              normalizeTemplateForEditor({ ...current, id: targetTemplateId, updatedAt: payload.updatedAt })
            );
          }
          lastSavedSignatureRef.current = snapshotSignature;
          setAutoSaveStatus("saved");
          setAutoSaveMessage(`자동 저장됨 · ${new Date().toLocaleTimeString()}`);
        } catch (autoSaveError) {
          if (requestSeq !== autoSaveRequestSeqRef.current) {
            return;
          }
          setAutoSaveStatus("error");
          setAutoSaveMessage(autoSaveError instanceof Error ? autoSaveError.message : "자동 저장에 실패했습니다.");
        }
      })();
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [currentAutosaveSignature, loading, busy, editor, selectedTemplateId]);

  async function persistTemplate(mode: "new" | "update"): Promise<void> {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const targetTemplateId = mode === "new" || selectedTemplateId === "__new__" ? uid() : editor.id;
      const payload = buildTemplatePayload(editor, targetTemplateId);
      const response = await fetch("/api/instagram/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: payload })
      });
      const data = (await response.json()) as TemplateResponse;
      if (!response.ok) {
        throw new Error(data.error || "템플릿 저장에 실패했습니다.");
      }
      lastSavedSignatureRef.current = buildAutosaveSignature(payload);
      setAutoSaveStatus("saved");
      setAutoSaveMessage(`자동 저장됨 · ${new Date().toLocaleTimeString()}`);
      setSuccess(mode === "new" ? "다른 이름으로 복제 저장했습니다." : "템플릿을 저장했습니다.");
      await fetchTemplates(payload.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "템플릿 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(templateId: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId })
      });
      const data = (await response.json()) as TemplateResponse;
      if (!response.ok) {
        throw new Error(data.error || "템플릿 삭제에 실패했습니다.");
      }
      setSuccess("템플릿을 삭제했습니다.");
      await fetchTemplates();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "템플릿 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(templateId: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId })
      });
      const data = (await response.json()) as TemplateResponse;
      if (!response.ok) {
        throw new Error(data.error || "활성 템플릿 변경에 실패했습니다.");
      }
      setActiveTemplateId(templateId);
      setSuccess("자동화 기본 템플릿으로 지정했습니다.");
      await fetchTemplates(templateId);
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : "활성 템플릿 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function selectTemplate(templateId: string): void {
    setError(undefined);
    setSuccess(undefined);
    if (templateId === "__new__") {
      const fresh = createTemplate();
      setSelectedTemplateId("__new__");
      clearHistory();
      setEditor(fresh);
      setSelectedPageId(fresh.pages[0].id);
      setSelectedElementId(fresh.pages[0].elements[0]?.id);
      lastSavedSignatureRef.current = buildAutosaveSignature(fresh);
      setAutoSaveStatus("idle");
      setAutoSaveMessage("자동 저장 대기 중");
      return;
    }
    const picked = templates.find((item) => item.id === templateId);
    if (!picked) return;
    const cloned = normalizeTemplateForEditor(picked);
    setSelectedTemplateId(templateId);
    clearHistory();
    setEditor(cloned);
    setSelectedPageId(cloned.pages[0]?.id || createPage(0).id);
    setSelectedElementId(cloned.pages[0]?.elements[0]?.id);
    lastSavedSignatureRef.current = buildAutosaveSignature(cloned);
    setAutoSaveStatus("saved");
    setAutoSaveMessage("저장된 템플릿을 불러왔습니다.");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_USED_TEMPLATE_ID_KEY, templateId);
    }
  }

  function applyCanvasPreset(presetId: string): void {
    if (presetId === CUSTOM_CANVAS_PRESET) {
      updateEditor((current) => ({
        ...current,
        canvasPreset: CUSTOM_CANVAS_PRESET
      }));
      return;
    }
    const preset = CANVAS_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    updateEditor((current) => ({
      ...current,
      canvasPreset: preset.id,
      canvasWidth: preset.width,
      canvasHeight: preset.height
    }));
  }

  function addPage(): void {
    updateEditor((current) => {
      const nextPage = createPage(current.pages.length);
      nextPage.durationSec = clamp(current.pageDurationSec, 1, 60, 4);
      current.pages.push(nextPage);
      setSelectedPageId(nextPage.id);
      setSelectedElementId(nextPage.elements[0]?.id);
      return current;
    });
    setSuccess("페이지를 추가했습니다.");
  }

  function removePage(pageId: string): void {
    if (editor.pages.length <= 1) {
      setError("페이지는 최소 1개 이상 필요합니다.");
      return;
    }
    updateEditor((current) => {
      current.pages = current.pages.filter((page) => page.id !== pageId);
      const fallback = current.pages[0];
      setSelectedPageId(fallback.id);
      setSelectedElementId(fallback.elements[0]?.id);
      return current;
    });
    setSuccess("페이지를 삭제했습니다.");
  }

  function duplicatePage(pageId: string): void {
    updateEditor((current) => {
      const index = current.pages.findIndex((item) => item.id === pageId);
      if (index < 0) return current;
      const copy = deepCloneTemplate({ ...current, pages: [current.pages[index]] } as InstagramTemplate).pages[0];
      copy.id = uid();
      copy.name = `${current.pages[index].name} Copy`;
      copy.elements = copy.elements.map((element) => ({ ...element, id: uid() }));
      current.pages.splice(index + 1, 0, copy);
      setSelectedPageId(copy.id);
      setSelectedElementId(copy.elements[0]?.id);
      return current;
    });
    setSuccess("페이지를 복제했습니다.");
  }

  function movePage(pageId: string, direction: "up" | "down"): void {
    updateEditor((current) => {
      const index = current.pages.findIndex((item) => item.id === pageId);
      if (index < 0) return current;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.pages.length) return current;
      const pages = [...current.pages];
      [pages[index], pages[target]] = [pages[target], pages[index]];
      current.pages = pages.map((page, idx) => ({ ...page, name: page.name || `Page ${idx + 1}` }));
      return current;
    });
    setSuccess(direction === "up" ? "페이지를 위로 이동했습니다." : "페이지를 아래로 이동했습니다.");
  }

  function insertPageAfter(pageId: string): void {
    updateEditor((current) => {
      const index = current.pages.findIndex((item) => item.id === pageId);
      const nextPage = createPage(index >= 0 ? index + 1 : current.pages.length);
      nextPage.durationSec = clamp(current.pageDurationSec, 1, 60, 4);
      if (index >= 0) {
        current.pages.splice(index + 1, 0, nextPage);
      } else {
        current.pages.push(nextPage);
      }
      setSelectedPageId(nextPage.id);
      setSelectedElementId(nextPage.elements[0]?.id);
      return current;
    });
    setSuccess("페이지를 추가했습니다.");
  }

  function togglePagePreview(pageId: string): void {
    setPagePreviewVisible((current) => ({
      ...current,
      [pageId]: !(current[pageId] ?? true)
    }));
  }

  function addShapeLayer(shape: InstagramShapeType): void {
    const layer = createShapeLayer(shape);
    updateSelectedPage((page) => ({
      ...page,
      elements: [...page.elements, { ...layer, zIndex: page.elements.length }]
    }));
    setShapeToolOpen(false);
    setPanelToolOpen(false);
    setSelectedElementId(layer.id);
    setSuccess(`${shapeLabel(shape)} 레이어를 추가했습니다.`);
  }

  function addLayer(kind: "textVariable" | "textPlain" | "image"): void {
    const layer =
      kind === "image"
        ? createImageLayer()
        : kind === "textPlain"
          ? createTextLayer("plain")
          : createTextLayer("variable");
    updateSelectedPage((page) => ({
      ...page,
      elements: [...page.elements, { ...layer, zIndex: page.elements.length }]
    }));
    setShapeToolOpen(false);
    setPanelToolOpen(false);
    setSelectedElementId(layer.id);
    setSuccess(
      kind === "textVariable"
        ? "변수 텍스트 레이어를 추가했습니다."
        : kind === "textPlain"
          ? "일반 텍스트 레이어를 추가했습니다."
          : "이미지 레이어를 추가했습니다."
    );
  }

  function copySelectedTextStyle(): void {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    setCopiedTextStyle(buildTextStyleSnapshot(selectedLayer));
    setPendingTextStyleApplyFromLayerId(selectedLayer.id);
    setPendingShapeStyleApplyFromLayerId(undefined);
    setSuccess("서식을 복사했습니다. 다른 텍스트 오브젝트를 선택하면 자동 적용됩니다.");
  }

  function duplicateSelectedTextLayer(): void {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    const duplicated: InstagramTextElement = {
      ...selectedLayer,
      id: uid(),
      y: clamp(
        selectedLayer.y + 6,
        selectedLayer.height / 2,
        100 - selectedLayer.height / 2,
        selectedLayer.y
      )
    };
    updateSelectedPage((page) => ({
      ...page,
      elements: [...page.elements, { ...duplicated, zIndex: page.elements.length }]
    }));
    setSelectedElementId(duplicated.id);
    setSuccess("텍스트 오브젝트를 복제했습니다.");
  }

  function copySelectedShapeStyle(): void {
    if (!selectedLayer || selectedLayer.type !== "shape") return;
    setCopiedShapeStyle(buildShapeStyleSnapshot(selectedLayer));
    setPendingShapeStyleApplyFromLayerId(selectedLayer.id);
    setPendingTextStyleApplyFromLayerId(undefined);
    setSuccess("도형 서식을 복사했습니다. 다른 도형 오브젝트를 선택하면 자동 적용됩니다.");
  }

  function duplicateSelectedShapeLayer(): void {
    if (!selectedLayer || selectedLayer.type !== "shape") return;
    const duplicated: InstagramShapeElement = {
      ...selectedLayer,
      id: uid(),
      y: clamp(selectedLayer.y + 6, selectedLayer.height / 2, 100 - selectedLayer.height / 2, selectedLayer.y)
    };
    updateSelectedPage((page) => ({
      ...page,
      elements: [...page.elements, { ...duplicated, zIndex: page.elements.length }]
    }));
    setSelectedElementId(duplicated.id);
    setSuccess("도형 오브젝트를 복제했습니다.");
  }

  function createPanelLayer(position: "top" | "bottom" | "left"): InstagramShapeElement {
    if (position === "top") {
      return {
        ...createShapeLayer("rectangle"),
        x: 50,
        y: 12,
        width: 100,
        height: 24,
        fillColor: "#111111",
        cornerRadius: 0,
        opacity: 0.92
      };
    }
    if (position === "bottom") {
      return {
        ...createShapeLayer("rectangle"),
        x: 50,
        y: 88,
        width: 100,
        height: 24,
        fillColor: "#111111",
        cornerRadius: 0,
        opacity: 0.92
      };
    }
    return {
      ...createShapeLayer("rectangle"),
      x: 12,
      y: 50,
      width: 24,
      height: 100,
      fillColor: "#111111",
      cornerRadius: 0,
      opacity: 0.92
    };
  }

  function addPanel(position: "top" | "bottom" | "left"): void {
    const panel = createPanelLayer(position);
    updateSelectedPage((page) => ({
      ...page,
      elements: [...page.elements, { ...panel, zIndex: page.elements.length }]
    }));
    setSelectedElementId(panel.id);
    setPanelToolOpen(false);
    setSuccess(
      position === "top"
        ? "상단 고정 패널을 추가했습니다."
        : position === "bottom"
          ? "하단 고정 패널을 추가했습니다."
          : "좌측 고정 패널을 추가했습니다."
    );
  }

  function deleteSelectedLayers(layerIds: string[]): void {
    const targets = uniqueValues(layerIds).filter(Boolean);
    if (!targets.length) return;
    updateSelectedPage((page) => ({
      ...page,
      elements: page.elements.filter((item) => !targets.includes(item.id))
    }));
    setSelectedElementIds([]);
    setSelectedElementId(undefined);
    setSuccess(targets.length > 1 ? `레이어 ${targets.length}개를 삭제했습니다.` : "레이어를 삭제했습니다.");
  }

  function deleteLayer(layerId: string): void {
    deleteSelectedLayers([layerId]);
  }

  function clearSelection(): void {
    setSelectedElementIds([]);
    setSelectedElementId(undefined);
  }

  function openLayerImagePicker(layerId: string): void {
    if (!layerImageInputRef.current) return;
    setPendingImageLayerId(layerId);
    setSelectedElementId(layerId);
    setSelectedElementIds([layerId]);
    layerImageInputRef.current.click();
  }

  function alignSelectedElements(mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom"): void {
    if (selectedElementIds.length < 2) return;
    updateSelectedPage((page) => {
      const selected = page.elements.filter((item) => selectedElementIds.includes(item.id));
      if (selected.length < 2) return page;

      const minLeft = Math.min(...selected.map((item) => item.x - item.width / 2));
      const maxRight = Math.max(...selected.map((item) => item.x + item.width / 2));
      const minTop = Math.min(...selected.map((item) => item.y - item.height / 2));
      const maxBottom = Math.max(...selected.map((item) => item.y + item.height / 2));
      const centerX = (minLeft + maxRight) / 2;
      const centerY = (minTop + maxBottom) / 2;

      return {
        ...page,
        elements: page.elements.map((item) => {
          if (!selectedElementIds.includes(item.id)) return item;
          if (mode === "left") {
            return { ...item, x: minLeft + item.width / 2 };
          }
          if (mode === "centerX") {
            return { ...item, x: centerX };
          }
          if (mode === "right") {
            return { ...item, x: maxRight - item.width / 2 };
          }
          if (mode === "top") {
            return { ...item, y: minTop + item.height / 2 };
          }
          if (mode === "centerY") {
            return { ...item, y: centerY };
          }
          return { ...item, y: maxBottom - item.height / 2 };
        })
      };
    });
    setSuccess("선택한 오브젝트를 정렬했습니다.");
  }

  function distributeSelectedElementsVertically(): void {
    if (selectedElementIds.length < 3) {
      setError("세로 간격 균등 정렬은 3개 이상 선택해야 합니다.");
      return;
    }
    updateSelectedPage((page) => {
      const selected = page.elements.filter((item) => selectedElementIds.includes(item.id));
      if (selected.length < 3) return page;
      const sorted = [...selected].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const step = (last.y - first.y) / (sorted.length - 1);
      const targetYById = sorted.reduce<Record<string, number>>((acc, item, index) => {
        acc[item.id] = first.y + step * index;
        return acc;
      }, {});

      return {
        ...page,
        elements: page.elements.map((item) => {
          if (!selectedElementIds.includes(item.id)) return item;
          const targetY = targetYById[item.id];
          if (!Number.isFinite(targetY)) return item;
          return {
            ...item,
            y: clamp(targetY, item.height / 2, 100 - item.height / 2, item.y)
          };
        })
      };
    });
    setSuccess("선택한 오브젝트를 세로 간격 균등 정렬했습니다.");
  }

  function insertBindingToken(field: string): void {
    if (!selectedLayer || selectedLayer.type !== "text") {
      setError("텍스트 레이어를 선택한 뒤 컬럼 토큰을 넣어주세요.");
      return;
    }
    if (selectedLayer.textMode !== "variable") {
      setError("변수 텍스트 오브젝트에서만 컬럼 토큰을 사용할 수 있습니다.");
      return;
    }
    const token = `{{${field}}}`;
    updateLayerById(selectedLayer.id, (layer) =>
      layer.type === "text"
        ? { ...layer, text: layer.text.includes(token) ? layer.text : `${layer.text}${layer.text ? " " : ""}${token}` }
        : layer
    );
    setSuccess(`{{${field}}} 토큰을 추가했습니다.`);
  }

  function applyRubyToSelectedText(): void {
    if (!selectedLayer || selectedLayer.type !== "text") {
      setError("텍스트 레이어를 선택한 뒤 루비를 적용해 주세요.");
      return;
    }
    const input = textEditorRef.current;
    if (!input) {
      setError("텍스트 입력 박스를 찾지 못했습니다.");
      return;
    }
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    if (start === end) {
      setError("루비를 적용할 텍스트 구간을 먼저 선택해 주세요.");
      return;
    }
    const sourceText = selectedLayer.text || "";
    const base = sourceText.slice(start, end);
    const ruby = window.prompt("루비(후리가나) 텍스트를 입력하세요.", "");
    if (ruby === null) {
      return;
    }
    const rubyText = ruby.trim();
    if (!rubyText) {
      setError("루비 텍스트가 비어 있습니다.");
      return;
    }
    const token = `[${base}|${rubyText}]`;
    const nextText = `${sourceText.slice(0, start)}${token}${sourceText.slice(end)}`;
    updateLayerById(selectedLayer.id, (layer) => (layer.type === "text" ? { ...layer, text: nextText } : layer));
    setSuccess("루비를 적용했습니다.");
  }

  async function applyAutoRuby(): Promise<void> {
    if (!selectedLayer || selectedLayer.type !== "text") {
      setError("텍스트 레이어를 선택한 뒤 자동 루비를 실행해 주세요.");
      return;
    }
    if (selectedLayer.textMode === "variable" && /\{\{[^}]+\}\}/.test(String(selectedLayer.text || ""))) {
      setError("변수 텍스트({{컬럼}})에는 자동 루비를 직접 적용할 수 없습니다. 일반 텍스트 오브젝트에서 실행해 주세요.");
      return;
    }
    setFuriganaLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/furigana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedLayer.text || "" })
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ? `자동 루비 생성 실패 (HTTP ${response.status}): ${data.error}` : `자동 루비 생성 실패 (HTTP ${response.status})`);
      }
      const nextText = String(data.text || "");
      updateLayerById(selectedLayer.id, (layer) => (layer.type === "text" ? { ...layer, text: nextText } : layer));
      if (nextText === String(selectedLayer.text || "")) {
        setSuccess("자동 루비 실행 완료: 변경 사항이 없습니다. (한자 없음/이미 동일 발음)");
      } else {
        setSuccess("자동 루비를 적용했습니다. 아래에서 후리가나를 수정할 수 있습니다.");
      }
    } catch (autoRubyError) {
      setError(autoRubyError instanceof Error ? autoRubyError.message : "자동 루비 생성에 실패했습니다.");
    } finally {
      setFuriganaLoading(false);
    }
  }

  function updateSelectedLayerRubyToken(tokenIndex: number, ruby: string): void {
    if (!selectedLayer || selectedLayer.type !== "text") {
      return;
    }
    updateLayerById(selectedLayer.id, (layer) =>
      layer.type === "text" ? { ...layer, text: updateRubyTokenByIndex(layer.text, tokenIndex, ruby) } : layer
    );
  }

  function removeSelectedLayerRubyToken(tokenIndex: number): void {
    if (!selectedLayer || selectedLayer.type !== "text") {
      return;
    }
    updateLayerById(selectedLayer.id, (layer) =>
      layer.type === "text" ? { ...layer, text: removeRubyTokenByIndex(layer.text, tokenIndex) } : layer
    );
  }

  async function onPageBackgroundImageUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateSelectedPage((page) => ({ ...page, backgroundImageUrl: dataUrl }));
      setSuccess("페이지 배경 이미지를 적용했습니다.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "배경 이미지 업로드에 실패했습니다.");
    } finally {
      event.target.value = "";
    }
  }

  async function onLayerImageUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    const targetLayerId = pendingImageLayerId || selectedElementId;
    if (!targetLayerId) {
      event.target.value = "";
      setPendingImageLayerId(undefined);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const mediaType = String(file.type || "").toLowerCase().startsWith("video/") ? "video" : "image";
      updateLayerById(targetLayerId, (layer) =>
        layer.type === "image" ? { ...layer, imageUrl: dataUrl, mediaType } : layer
      );
      setSuccess(mediaType === "video" ? "비디오 레이어 파일을 적용했습니다." : "이미지 레이어에 파일을 적용했습니다.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "이미지 레이어 업로드에 실패했습니다.");
    } finally {
      event.target.value = "";
      setPendingImageLayerId(undefined);
    }
  }

  async function generateAiLayerImage(layerId: string): Promise<void> {
    const page = editorRef.current.pages.find((item) => item.id === selectedPageIdRef.current);
    const layer = page?.elements.find((item) => item.id === layerId);
    if (!layer || layer.type !== "image") {
      setError("이미지 레이어를 선택해 주세요.");
      return;
    }
    const prompt = String(layer.aiPrompt || "").trim();
    if (!prompt) {
      setError("AI 이미지 프롬프트를 입력해 주세요.");
      return;
    }

    setAiImageGeneratingLayerId(layerId);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          stylePreset: layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE,
          canvasWidth,
          canvasHeight
        })
      });
      const data = (await response.json()) as { imageUrl?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "AI 이미지 생성에 실패했습니다.");
      }
      const imageUrl = String(data.imageUrl || "").trim();
      if (!imageUrl) {
        throw new Error("이미지 URL을 받지 못했습니다.");
      }
      updateLayerById(layerId, (targetLayer) =>
        targetLayer.type === "image" ? { ...targetLayer, imageUrl, mediaType: "image" } : targetLayer
      );
      setSuccess("AI 이미지를 생성해 레이어에 적용했습니다.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "AI 이미지 생성에 실패했습니다.");
    } finally {
      setAiImageGeneratingLayerId(undefined);
    }
  }

  async function loadSheetBindings(overrideSheetName?: string): Promise<void> {
    setBindingLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const search = new URLSearchParams();
      search.set("mode", "instagram");
      const effectiveSheetName =
        typeof overrideSheetName === "string" ? overrideSheetName.trim() : sheetName.trim();
      if (effectiveSheetName) {
        search.set("sheetName", effectiveSheetName);
      }
      const response = await fetch(`/api/ideas/sheet?${search.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as IdeasSheetTableResponse;
      if (!response.ok) {
        throw new Error(data.error || "시트 컬럼을 불러오지 못했습니다.");
      }
      const headers = Array.isArray(data.headers) ? data.headers.map((item) => String(item).trim()).filter(Boolean) : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (headers.length === 0) {
        throw new Error("시트 헤더를 찾지 못했습니다. 첫 번째 행(헤더)을 확인해 주세요.");
      }
      setBindingFields(mergeBindingFieldsWithDefaults(headers));
      const nextRowOptions = createBindingRowOptions(rows);
      setBindingRowOptions(nextRowOptions);
      if (nextRowOptions.length > 0) {
        const preferredKey = nextRowOptions.find((item) => item.key === bindingSelectedRowKey)?.key || nextRowOptions[0].key;
        const selectedRow = nextRowOptions.find((item) => item.key === preferredKey) || nextRowOptions[0];
        setBindingSelectedRowKey(preferredKey);
        setSampleData((prev) => ({ ...prev, ...selectedRow.values }));
      } else {
        setBindingSelectedRowKey("");
      }
      if (data.sheetName) {
        setSheetName(data.sheetName);
      }
      setSuccess(
        `시트 컬럼 ${headers.length}개, row ${rows.length}개를 불러왔습니다.${data.sheetName ? ` (${data.sheetName})` : ""}`
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "시트 컬럼을 불러오지 못했습니다.");
    } finally {
      setBindingLoading(false);
    }
  }

  function onSelectBindingRow(rowKey: string): void {
    setBindingSelectedRowKey(rowKey);
    const selectedRow = bindingRowOptions.find((item) => item.key === rowKey);
    if (!selectedRow) return;
    setSampleData((prev) => ({ ...prev, ...selectedRow.values }));
  }

  function onTemplateJsonFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportJson(String(reader.result || ""));
      setSuccess("JSON 파일을 불러왔습니다. 텍스트 가져오기 버튼을 눌러 반영하세요.");
    };
    reader.onerror = () => setError("JSON 파일을 읽지 못했습니다.");
    reader.readAsText(file, "utf8");
    event.target.value = "";
  }

  async function importTemplateFromJsonText(): Promise<void> {
    setError(undefined);
    setSuccess(undefined);
    try {
      const parsed = JSON.parse(importJson);
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { templates?: unknown[] })?.templates)
          ? (parsed as { templates: unknown[] }).templates
          : [parsed];
      const normalized = candidates
        .map((item) => toTemplateFromUnknown(item))
        .filter((item): item is InstagramTemplate => Boolean(item));
      if (normalized.length === 0) {
        throw new Error("유효한 템플릿 JSON을 찾지 못했습니다.");
      }

      setBusy(true);
      let lastId = "";
      for (const template of normalized) {
        const payload = deepCloneTemplate(template);
        payload.id = uid();
        payload.updatedAt = new Date().toISOString();
        payload.pageCount = payload.pages.length;
        const response = await fetch("/api/instagram/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: payload })
        });
        const data = (await response.json()) as TemplateResponse;
        if (!response.ok) {
          throw new Error(data.error || "템플릿 저장 중 오류가 발생했습니다.");
        }
        lastId = payload.id;
      }
      setSuccess(`${normalized.length}개 템플릿을 추가했습니다.`);
      await fetchTemplates(lastId || undefined);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "JSON 가져오기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCurrentTemplateJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(editor, null, 2));
      setSuccess("현재 템플릿 JSON을 클립보드에 복사했습니다.");
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  }

  function loadCurrentTemplateJsonToTextarea(): void {
    setImportJson(JSON.stringify(editor, null, 2));
    setSuccess("현재 템플릿 JSON을 텍스트 영역에 불러왔습니다.");
  }

  async function renderOutputPreview(): Promise<void> {
    if (!selectedPage) return;
    setRenderingOutput(true);
    setError(undefined);
    try {
      const preview = await renderPageToPngDataUrl({
        page: selectedPage,
        sampleData,
        canvasWidth,
        canvasHeight
      });
      setOutputPreviewUrl(preview);
      setSuccess("현재 페이지를 최종 PNG로 렌더링했습니다.");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "PNG 렌더링에 실패했습니다.");
    } finally {
      setRenderingOutput(false);
    }
  }

  async function renderOutputVideo(): Promise<void> {
    if (!selectedPage) return;
    if (selectedPage.audioEnabled && !String(selectedPage.audioPrompt || "").trim()) {
      setError("오디오 사용이 켜져 있습니다. 오디오 스크립트를 입력해 주세요.");
      return;
    }
    setRenderingOutputVideo(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const imageDataUrl = await renderPageToPngDataUrl({
        page: selectedPage,
        sampleData,
        canvasWidth,
        canvasHeight
      });
      const response = await fetch("/api/instagram/render-page-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: editor.templateName,
          pageName: selectedPage.name,
          imageDataUrl,
          useAudio: Boolean(selectedPage.audioEnabled),
          audioPrompt: String(selectedPage.audioPrompt || "").trim() || undefined,
          ttsProvider:
            selectedPage.audioProvider === "openai" || selectedPage.audioProvider === "gemini"
              ? selectedPage.audioProvider
              : "auto",
          sampleData,
          audioVoice: String(selectedPage.audioVoice || "alloy").trim().toLowerCase() || "alloy",
          audioSpeed: clamp(Number(selectedPage.audioSpeed), 0.5, 2, 1),
          durationSec: selectedPage.durationSec,
          outputWidth: canvasWidth,
          outputHeight: canvasHeight
        })
      });
      const data = (await response.json()) as { outputUrl?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "MP4 렌더링에 실패했습니다.");
      }
      if (!data.outputUrl) {
        throw new Error("MP4 결과 URL을 받지 못했습니다.");
      }
      setOutputVideoUrl(data.outputUrl);
      setSuccess("현재 페이지 MP4 렌더링을 완료했습니다.");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "MP4 렌더링에 실패했습니다.");
    } finally {
      setRenderingOutputVideo(false);
    }
  }

  async function previewSelectedPageAudio(): Promise<void> {
    if (!selectedPage) return;
    setAudioPreviewLoading(true);
    setAudioPreviewError(undefined);
    setError(undefined);
    try {
      const resolvedText = resolveLayerTokenText(String(selectedPage.audioPrompt || ""), sampleData, "variable").trim();
      if (!resolvedText) {
        throw new Error("오디오 스크립트를 입력해 주세요. ({{변수}} 치환 후 기준)");
      }
      const previewText = resolvedText.slice(0, 320);
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: String(selectedPage.audioVoice || "alloy").trim().toLowerCase() || "alloy",
          speed: clamp(Number(selectedPage.audioSpeed), 0.5, 2, 1),
          provider:
            selectedPage.audioProvider === "openai" || selectedPage.audioProvider === "gemini"
              ? selectedPage.audioProvider
              : "auto",
          text: previewText
        })
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "음성 미리듣기에 실패했습니다.");
      }
      const blob = await response.blob();
      const playableBlob =
        blob.type && blob.type.startsWith("audio/")
          ? blob
          : new Blob([blob], { type: "audio/wav" });
      const url = URL.createObjectURL(playableBlob);
      pendingAudioPreviewPlayRef.current = true;
      setAudioPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
    } catch (previewError) {
      setAudioPreviewError(previewError instanceof Error ? previewError.message : "Unknown error");
    } finally {
      setAudioPreviewLoading(false);
    }
  }

  async function ensureLocalFontFace(fontName: string): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const normalized = normalizeFontName(fontName);
    if (!normalized) return;
    const customFont = (editorRef.current.customFonts || []).find(
      (font) => String(font.family || "").trim().toLowerCase() === normalized.toLowerCase()
    );
    if (customFont) {
      await ensureInstagramCustomFontsLoaded([customFont]);
      return;
    }
    // Local font file API is intended for localhost (developer machine) only.
    // On production (e.g., Vercel), browser local fonts should be used directly
    // via font-family without calling /api/local-fonts/file.
    if (!isLocalhostRuntime()) return;
    const key = normalized.toLowerCase();
    const currentMap = window.__shortsMakerLocalFontAliasMap || {};
    if (currentMap[key]) return;
    if (loadingFontAliasRef.current.has(key)) return;
    loadingFontAliasRef.current.add(key);
    try {
      const alias = `SM_LOCAL_${Math.abs(
        Array.from(normalized).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)
      )}`;
      const styleId = `sm-local-font-${alias}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `@font-face { font-family: "${alias}"; src: url("/api/local-fonts/file?name=${encodeURIComponent(
          normalized
        )}"); font-display: swap; }`;
        document.head.appendChild(style);
      }
      try {
        await document.fonts.load(`16px "${alias}"`, "가나다abcあいう");
      } catch {
        // Keep alias registration attempt even if load promise rejects.
      }
      window.__shortsMakerLocalFontAliasMap = {
        ...currentMap,
        [key]: alias
      };
      setFontAliasVersion((v) => v + 1);
    } finally {
      loadingFontAliasRef.current.delete(key);
    }
  }

  async function applySelectedTextFont(fontName: string): Promise<void> {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    const normalized = normalizeFontName(fontName);
    if (!normalized) return;
    await ensureLocalFontFace(normalized);
    updateLayerById(selectedLayer.id, (layer) =>
      layer.type === "text" ? autoExpandTextLayerIfNeeded({ ...layer, fontFamily: normalized }) : layer
    );
  }

  async function loadLocalFonts(): Promise<void> {
    setLocalFontLoading(true);
    setLocalFontMessage(undefined);
    try {
      const names = await queryInstalledFontNames();
      const cleanedNames = uniqueFontNames(names);
      if (cleanedNames.length > 0) {
        setLocalFontNames(cleanedNames);
        cleanedNames.slice(0, 24).forEach((fontName) => {
          void ensureLocalFontFace(fontName);
        });
      }
      const sourceHint =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "::1")
          ? " (로컬 API 기준)"
          : isLocalFontAccessSupported()
            ? ""
            : " (브라우저 API 미지원)";
      setLocalFontMessage(
        cleanedNames.length > 0
          ? `내 PC 폰트 ${cleanedNames.length}개를 불러왔습니다.${sourceHint}`
          : "불러온 설치 폰트가 없습니다."
      );
    } catch (fontError) {
      setLocalFontMessage(
        fontError instanceof Error ? `폰트 불러오기 실패: ${fontError.message}` : "폰트 불러오기에 실패했습니다."
      );
    } finally {
      setLocalFontLoading(false);
    }
  }

  async function uploadCustomFontFile(file: File): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    setCustomFontUploading(true);
    setCustomFontMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/instagram/fonts", {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as {
        font?: InstagramCustomFont;
        error?: string;
      };
      if (!response.ok || !data.font) {
        throw new Error(data.error || "커스텀 폰트 업로드에 실패했습니다.");
      }
      const uploadedFont = {
        ...data.font,
        family: normalizeFontName(data.font.family),
        fileName: String(data.font.fileName || data.font.family).trim() || data.font.family,
        sourceUrl: String(data.font.sourceUrl || "").trim()
      };
      if (!uploadedFont.family || !uploadedFont.sourceUrl) {
        throw new Error("업로드된 폰트 메타데이터가 올바르지 않습니다.");
      }
      await ensureInstagramCustomFontsLoaded([uploadedFont]);
      setEditor((current) => {
        const existing = normalizeCustomTemplateFonts(current.customFonts);
        const merged = normalizeCustomTemplateFonts([
          uploadedFont,
          ...existing.filter((font) => font.family.toLowerCase() !== uploadedFont.family.toLowerCase())
        ]);
        return {
          ...current,
          customFonts: merged
        };
      });
      setCustomFontMessage(`업로드 완료: ${uploadedFont.family}`);
      setSuccess(`커스텀 폰트 업로드 완료: ${uploadedFont.family}`);
      if (selectedLayer?.type === "text") {
        await applySelectedTextFont(uploadedFont.family);
      }
    } catch (fontError) {
      const message = fontError instanceof Error ? fontError.message : "커스텀 폰트 업로드에 실패했습니다.";
      setError(message);
      setCustomFontMessage(message);
    } finally {
      setCustomFontUploading(false);
    }
  }

  async function handleCustomFontFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await uploadCustomFontFile(file);
  }

  function toggleFavoriteFont(fontName: string): void {
    const normalized = normalizeFontName(fontName);
    if (!normalized) return;
    setFavoriteFontNames((current) => {
      const exists = current.some((item) => item.toLowerCase() === normalized.toLowerCase());
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
      }
      return uniqueFontNames([normalized, ...current]);
    });
  }

  function downloadOutputPreview(): void {
    if (!outputPreviewUrl) return;
    const link = document.createElement("a");
    link.href = outputPreviewUrl;
    link.download = `${editor.templateName || "instagram-template"}-${selectedPage?.name || "page"}.png`;
    link.click();
  }

  function downloadOutputVideo(): void {
    if (!outputVideoUrl) return;
    const link = document.createElement("a");
    link.href = outputVideoUrl;
    link.download = `${editor.templateName || "instagram-template"}-${selectedPage?.name || "page"}.mp4`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  }

  const canvasLayers = useMemo(() => [...sortedLayers].sort((a, b) => a.zIndex - b.zIndex), [sortedLayers]);
  const selectedPageIndex = useMemo(
    () => editor.pages.findIndex((page) => page.id === selectedPageId),
    [editor.pages, selectedPageId]
  );
  const selectedPagePreviewVisible = selectedPage ? (pagePreviewVisible[selectedPage.id] ?? true) : true;
  const isDockedTextToolbar = selectedLayer?.type === "text";
  const isMobileViewport = viewportWidth <= 768;
  const minObjectToolbarWidth = isMobileViewport ? 260 : 320;
  const maxObjectToolbarWidth = 1120;
  const objectToolbarWidthFallback = isMobileViewport ? 320 : 760;
  const objectToolbarStep = isMobileViewport ? 24 : 40;
  const objectToolbarClampedWidth = clamp(
    objectToolbarWidth,
    minObjectToolbarWidth,
    maxObjectToolbarWidth,
    objectToolbarWidthFallback
  );
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const resizeHandles: Array<{ key: ResizeHandle; className: string; cursor: string; label: string }> = [
    { key: "n", className: "-top-2 left-1/2 -translate-x-1/2", cursor: "cursor-n-resize", label: "상단 리사이즈" },
    { key: "s", className: "-bottom-2 left-1/2 -translate-x-1/2", cursor: "cursor-s-resize", label: "하단 리사이즈" },
    { key: "e", className: "right-[-8px] top-1/2 -translate-y-1/2", cursor: "cursor-e-resize", label: "우측 리사이즈" },
    { key: "w", className: "left-[-8px] top-1/2 -translate-y-1/2", cursor: "cursor-w-resize", label: "좌측 리사이즈" },
    { key: "ne", className: "-top-2 -right-2", cursor: "cursor-ne-resize", label: "우상단 리사이즈" },
    { key: "nw", className: "-top-2 -left-2", cursor: "cursor-nw-resize", label: "좌상단 리사이즈" },
    { key: "se", className: "-bottom-2 -right-2", cursor: "cursor-se-resize", label: "우하단 리사이즈" },
    { key: "sw", className: "-bottom-2 -left-2", cursor: "cursor-sw-resize", label: "좌하단 리사이즈" }
  ];

  function renderResizeHandleButtons(layerId: string): React.ReactNode {
    return resizeHandles.map((handle) => (
      <button
        key={`${layerId}-${handle.key}`}
        type="button"
        className={`absolute ${handle.className} h-4 w-4 rounded-full border border-white bg-sky-500 ${handle.cursor}`}
        onPointerDown={(event) =>
          beginLayerInteraction(selectedPageId, "resize", layerId, event, undefined, handle.key)
        }
        title={handle.label}
      />
    ));
  }

  function handleBackgroundPointerDownCapture(event: React.PointerEvent<HTMLElement>): void {
    if (!selectedElementId && selectedElementIds.length === 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-layer-element='true']")) return;
    if (
      target.closest(
        "button, input, select, textarea, a, [role='button'], [data-keep-selection='true'], [data-no-toolbar-drag='true']"
      )
    ) {
      return;
    }
    clearSelection();
  }

  return (
    <section className="space-y-4" onPointerDownCapture={handleBackgroundPointerDownCapture}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Instagram 템플릿</h1>
        <p className="text-sm text-muted-foreground">
          캔바형 편집: 레이어를 직접 드래그/리사이즈하고, 이미지 업로드/배경 설정/시트 컬럼 바인딩으로 즉시 결과물을 확인합니다.
        </p>
      </header>

      <div className="rounded-xl border bg-card p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto_auto]">
          <div className="space-y-1">
            <Label>저장된 템플릿</Label>
            <Select value={selectedTemplateId} onValueChange={selectTemplate}>
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue placeholder="템플릿 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ 새 템플릿</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.templateName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="group relative">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-9 p-0"
              onClick={() => void fetchTemplates(selectedTemplateId)}
              disabled={loading || busy}
              aria-label="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <span className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover:visible group-hover:opacity-100">
              새로고침
            </span>
          </div>
          <Button
            type="button"
            onClick={() => void persistTemplate("new")}
            disabled={busy}
            title="현재 편집 상태를 새 템플릿으로 복제 저장합니다."
          >
            <Plus className="h-4 w-4" />
            다른 이름으로 저장
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void persistTemplate("update")}
            disabled={busy || selectedTemplateId === "__new__"}
          >
            <Save className="h-4 w-4" />
            저장
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void setActive(selectedTemplateId)}
            disabled={busy || selectedTemplateId === "__new__"}
            title="자동화 실행 시 기본으로 사용할 인스타 템플릿으로 지정합니다."
          >
            <Check className="h-4 w-4" />
            자동화 기본 지정
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void removeTemplate(selectedTemplateId)}
            disabled={busy || selectedTemplateId === "__new__"}
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.9fr)_minmax(240px,1fr)_120px_120px]">
          <div className="space-y-1">
            <Label>템플릿 이름</Label>
            <Input
              value={editor.templateName}
              onChange={(event) => updateEditor((current) => ({ ...current, templateName: event.target.value }))}
              placeholder="Template name"
            />
          </div>
          <div className="space-y-1">
            <Label>기본 페이지 길이(초)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={String(editor.pageDurationSec)}
              onChange={(event) =>
                updateEditor((current) => ({ ...current, pageDurationSec: clamp(Number(event.target.value), 1, 60, 4) }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>이미지 사이즈 프리셋</Label>
            <Select value={canvasPresetId} onValueChange={applyCanvasPreset}>
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANVAS_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_CANVAS_PRESET}>Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>W</Label>
            <Input
              type="number"
              min={320}
              max={4000}
              value={String(canvasWidth)}
              onChange={(event) =>
                updateEditor((current) => ({
                  ...current,
                  canvasPreset: CUSTOM_CANVAS_PRESET,
                  canvasWidth: normalizeCanvasWidth(Number(event.target.value))
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>H</Label>
            <Input
              type="number"
              min={320}
              max={4000}
              value={String(canvasHeight)}
              onChange={(event) =>
                updateEditor((current) => ({
                  ...current,
                  canvasPreset: CUSTOM_CANVAS_PRESET,
                  canvasHeight: normalizeCanvasHeight(Number(event.target.value))
                }))
              }
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addPage}>
            <Plus className="h-4 w-4" />
            페이지 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => selectedPage && duplicatePage(selectedPage.id)}
            disabled={!selectedPage}
          >
            <Copy className="h-4 w-4" />
            페이지 복제
          </Button>
        </div>
        {activeTemplateId === selectedTemplateId && selectedTemplateId !== "__new__" ? (
          <p className="mt-2 text-xs text-emerald-500">현재 자동화 기본 템플릿입니다.</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">다른 이름으로 저장: 현재 템플릿을 복제해서 새 템플릿으로 저장합니다.</p>
        {selectedTemplateId !== "__new__" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            자동화 기본 지정: 대시보드 자동화 실행 시 기본으로 선택되는 템플릿입니다.
          </p>
        ) : null}
        <p
          className={`mt-2 text-xs ${
            autoSaveStatus === "error"
              ? "text-destructive"
              : autoSaveStatus === "saving"
                ? "text-amber-500"
                : autoSaveStatus === "saved"
                  ? "text-emerald-500"
                  : "text-muted-foreground"
          }`}
        >
          {autoSaveMessage}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{selectedPage ? `${selectedPageIndex + 1}. ${selectedPage.name}` : "현재 편집 페이지"}</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{`${canvasWidth}x${canvasHeight}`}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && movePage(selectedPage.id, "up")}
                  disabled={!selectedPage || selectedPageIndex <= 0}
                  title="위로"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && movePage(selectedPage.id, "down")}
                  disabled={!selectedPage || selectedPageIndex >= editor.pages.length - 1}
                  title="아래로"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && togglePagePreview(selectedPage.id)}
                  disabled={!selectedPage}
                  title={selectedPagePreviewVisible ? "페이지 숨기기" : "페이지 보이기"}
                >
                  {selectedPagePreviewVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && insertPageAfter(selectedPage.id)}
                  disabled={!selectedPage}
                  title="추가"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && duplicatePage(selectedPage.id)}
                  disabled={!selectedPage}
                  title="복제"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => selectedPage && removePage(selectedPage.id)}
                  disabled={!selectedPage || editor.pages.length <= 1}
                  title={editor.pages.length <= 1 ? "페이지는 최소 1개 필요합니다." : "페이지 삭제"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {selectedPagePreviewVisible ? (
              <>
                <div
              ref={canvasRef}
                className="relative mx-auto w-full max-w-[900px] overflow-visible border bg-zinc-100 shadow-inner select-none touch-none"
                style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}`, containerType: "inline-size" }}
                onPointerDown={(event) => {
                  if (isToolbarInteractiveTarget(event.target)) {
                    return;
                  }
                  setShapeToolOpen(false);
                  setPanelToolOpen(false);
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("[data-layer-element='true']")) {
                    return;
                  }
                  const isModifierPressed = event.shiftKey || event.ctrlKey || event.metaKey;
                  if (!isModifierPressed) {
                    clearSelection();
                    return;
                  }
                  beginSelectionBox(event);
                }}
              >
              <div
                ref={toolbarRef}
                className="absolute z-30 rounded-2xl border border-white/30 bg-black/45 p-1.5 shadow-xl backdrop-blur"
                style={{ left: `${toolbarPosition.x}px`, top: `${toolbarPosition.y}px` }}
                data-keep-selection="true"
                onPointerDown={(event) => {
                  if (isToolbarInteractiveTarget(event.target)) {
                    return;
                  }
                  beginToolbarDrag(event);
                }}
              >
                <div className="mb-1 flex items-center justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 w-8 cursor-grab border-white/25 bg-black/30 p-0 active:cursor-grabbing"
                    onPointerDown={beginToolbarDrag}
                    aria-label="Move toolbar"
                    title="툴바 이동"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 lg:flex-col">
                  <div className="relative group/tool-variable-text">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setShapeToolOpen(false);
                        setPanelToolOpen(false);
                        addLayer("textVariable");
                      }}
                      aria-label="Variable Text"
                      title="Variable Text"
                    >
                      <FileJson className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-variable-text:visible group-hover/tool-variable-text:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Variable Text
                    </span>
                  </div>
                  <div className="relative group/tool-plain-text">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setShapeToolOpen(false);
                        setPanelToolOpen(false);
                        addLayer("textPlain");
                      }}
                      aria-label="Plain Text"
                      title="Plain Text"
                    >
                      <Type className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-plain-text:visible group-hover/tool-plain-text:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Plain Text
                    </span>
                  </div>
                  <div className="relative group">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setShapeToolOpen(false);
                        setPanelToolOpen(false);
                        addLayer("image");
                      }}
                      aria-label="Image"
                      title="Image"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Image
                    </span>
                  </div>
                  <div className="relative group/tool-shape">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setPanelToolOpen(false);
                        setShapeToolOpen((prev) => !prev);
                      }}
                      aria-label="Shape"
                      title="Shape"
                    >
                      <Layers className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-shape:visible group-hover/tool-shape:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Shape
                    </span>
                    {shapeToolOpen ? (
                      <div
                        className="absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-lg border bg-popover p-2 shadow-xl lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0"
                        data-no-toolbar-drag="true"
                      >
                        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">도형 선택</p>
                        <div className="grid grid-cols-4 gap-1">
                          {SHAPE_OPTIONS.map((shape) => {
                            const clipPath = getShapeClipPath(shape.value);
                            const outlineOnly =
                              shape.value === "rectangle" ||
                              shape.value === "roundedRectangle" ||
                              shape.value === "circle";
                            const isLineShape = shape.value === "line";
                            return (
                              <div key={shape.value} className="group/shape-option relative">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addShapeLayer(shape.value)}
                                  className="h-8 w-10 p-0"
                                >
                                  <span
                                    className="block h-4 w-4"
                                    style={{
                                      borderRadius:
                                        shape.value === "circle"
                                          ? "9999px"
                                          : shape.value === "roundedRectangle"
                                            ? "4px"
                                            : "0px",
                                      clipPath,
                                      border: isLineShape ? "none" : outlineOnly ? "1.5px solid currentColor" : "none",
                                      backgroundColor: isLineShape
                                        ? "transparent"
                                        : outlineOnly
                                          ? "transparent"
                                          : "currentColor",
                                      borderTop: isLineShape ? "2px solid currentColor" : undefined
                                    }}
                                  />
                                </Button>
                                <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground opacity-0 shadow transition-opacity group-hover/shape-option:visible group-hover/shape-option:opacity-100">
                                  {shape.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="relative group/tool-panel">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setShapeToolOpen(false);
                        setPanelToolOpen((prev) => !prev);
                      }}
                      aria-label="Panel"
                      title="Panel"
                    >
                      <Paintbrush className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-panel:visible group-hover/tool-panel:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Panel
                    </span>
                    {panelToolOpen ? (
                      <div
                        className="absolute left-1/2 top-full z-30 mt-2 w-44 -translate-x-1/2 rounded-lg border bg-popover p-2 shadow-xl lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0"
                        data-no-toolbar-drag="true"
                      >
                        <p className="mb-2 text-[11px] font-semibold text-muted-foreground">패널 추가</p>
                        <div className="grid gap-1.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => addPanel("top")}>
                            상단 고정
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => addPanel("bottom")}>
                            하단 고정
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => addPanel("left")}>
                            좌측 고정
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="relative group/tool-undo">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={undoEditor}
                      disabled={!canUndo}
                      aria-label="Undo"
                      title="Undo (Ctrl/Cmd+Z)"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-undo:visible group-hover/tool-undo:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Undo
                    </span>
                  </div>
                  <div className="relative group/tool-redo">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={redoEditor}
                      disabled={!canRedo}
                      aria-label="Redo"
                      title="Redo (Ctrl/Cmd+Shift+Z)"
                    >
                      <Redo2 className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-redo:visible group-hover/tool-redo:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Redo
                    </span>
                  </div>
                </div>
              </div>

              {selectedLayer ? (
                <div
                  ref={objectToolbarRef}
                  className={
                    isDockedTextToolbar
                      ? "absolute top-0 z-30 max-h-[42vh] min-w-[260px] resize overflow-auto rounded-xl border border-white/25 bg-black/70 p-2 text-white shadow-xl backdrop-blur"
                      : "absolute z-30 w-[min(96%,820px)] max-h-[56vh] resize overflow-auto rounded-xl border border-white/25 bg-black/70 p-2 text-white shadow-xl backdrop-blur"
                  }
                  style={
                    isDockedTextToolbar
                      ? isMobileViewport
                        ? {
                            left: `calc(6px + ${objectToolbarOffset.x}px)`,
                            top: `calc(8px + ${objectToolbarOffset.y}px)`,
                            width: `min(calc(100% - 12px), ${objectToolbarClampedWidth}px)`,
                            transform: "none"
                          }
                        : {
                            left: `calc(8px + ${objectToolbarOffset.x}px)`,
                            top: `${objectToolbarOffset.y}px`,
                            width: `min(calc(100% - 16px), ${objectToolbarClampedWidth}px)`,
                            transform: "translateY(calc(-100% - 10px))"
                          }
                      : {
                          width: `min(96%, ${objectToolbarClampedWidth}px)`,
                          left: `calc(${selectedLayer.x}% + ${objectToolbarOffset.x}px)`,
                          top: `calc(${clamp(selectedLayer.y - selectedLayer.height / 2 - 4, 4, 92, 4)}% + ${objectToolbarOffset.y}px)`,
                          transform: "translate(-50%, -100%)"
                        }
                  }
                  data-keep-selection="true"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (
                      event.currentTarget instanceof HTMLElement &&
                      isNearBottomRightResizeHandle(event, event.currentTarget)
                    ) {
                      return;
                    }
                    if (isToolbarInteractiveTarget(event.target)) {
                      return;
                    }
                    beginObjectToolbarDrag(event);
                  }}
                  onPointerUp={() => {
                    const width = objectToolbarRef.current?.offsetWidth;
                    if (width) {
                      setObjectToolbarWidth(clamp(width, minObjectToolbarWidth, maxObjectToolbarWidth, objectToolbarWidthFallback));
                    }
                  }}
                >
                  <div
                    className={`mb-2 flex items-center gap-2 ${isDockedTextToolbar ? "cursor-grab active:cursor-grabbing" : ""}`}
                    onPointerDown={(event) => {
                      if (isToolbarInteractiveTarget(event.target)) {
                        return;
                      }
                      beginObjectToolbarDrag(event);
                    }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 w-8 cursor-grab border-white/25 bg-black/30 p-0 active:cursor-grabbing"
                      onPointerDown={beginObjectToolbarDrag}
                      title="오브젝트 툴바 이동"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] text-zinc-200">{resolveElementName(selectedLayer)}</span>
                    {selectedLayer.type === "text" ? (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant={
                            pendingTextStyleApplyFromLayerId && copiedTextStyle ? "default" : "outline"
                          }
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={copySelectedTextStyle}
                          title="서식 복사"
                        >
                          <Paintbrush className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={duplicateSelectedTextLayer}
                          title="텍스트 오브젝트 복제"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : selectedLayer.type === "shape" ? (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant={
                            pendingShapeStyleApplyFromLayerId && copiedShapeStyle ? "default" : "outline"
                          }
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={copySelectedShapeStyle}
                          title="도형 서식 복사"
                        >
                          <Paintbrush className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={duplicateSelectedShapeLayer}
                          title="도형 오브젝트 복제"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                    {isDockedTextToolbar ? null : (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 text-xs"
                          onClick={() =>
                            setObjectToolbarWidth((prev) =>
                              clamp(prev - objectToolbarStep, minObjectToolbarWidth, maxObjectToolbarWidth, objectToolbarWidthFallback)
                            )
                          }
                          title="툴바 폭 줄이기"
                        >
                          -
                        </Button>
                        <input
                          type="range"
                          min={minObjectToolbarWidth}
                          max={maxObjectToolbarWidth}
                          step={isMobileViewport ? 10 : 20}
                          value={objectToolbarClampedWidth}
                          onChange={(event) =>
                            setObjectToolbarWidth(
                              clamp(Number(event.target.value), minObjectToolbarWidth, maxObjectToolbarWidth, objectToolbarWidthFallback)
                            )
                          }
                          className="h-2 w-20 accent-emerald-400 sm:w-28"
                          title="툴바 폭 조절"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0 text-xs"
                          onClick={() =>
                            setObjectToolbarWidth((prev) =>
                              clamp(prev + objectToolbarStep, minObjectToolbarWidth, maxObjectToolbarWidth, objectToolbarWidthFallback)
                            )
                          }
                          title="툴바 폭 늘리기"
                        >
                          +
                        </Button>
                      </div>
                    )}
                  </div>
                  {hasMultiSelection ? (
                    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md border border-white/15 bg-black/25 px-2 py-2">
                      <span className="mr-1 text-[11px] text-zinc-200">{`다중 선택 ${selectedLayers.length}개`}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("left")}
                        title="왼쪽 정렬"
                      >
                        <AlignLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("centerX")}
                        title="가운데 정렬"
                      >
                        <AlignCenter className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("right")}
                        title="오른쪽 정렬"
                      >
                        <AlignRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("top")}
                        title="맨 위 정렬"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("centerY")}
                        title="세로 가운데 정렬"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => alignSelectedElements("bottom")}
                        title="맨 아래 정렬"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={distributeSelectedElementsVertically}
                        title="세로 간격 균등"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                  {selectedLayer.type === "text" ? (
                    <div className="space-y-2">
                      <Textarea
                        ref={textEditorRef}
                        value={selectedLayer.text}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text"
                              ? autoExpandTextLayerIfNeeded({ ...layer, text: event.target.value })
                              : layer
                          )
                        }
                        rows={2}
                        className="min-h-[58px] w-full resize border-white/20 bg-black/30 text-xs text-white placeholder:text-zinc-300"
                        placeholder={selectedLayer.textMode === "plain" ? "일반 텍스트 입력" : "변수 텍스트 입력 (예: {{subject}})"}
                      />
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-zinc-200">텍스트 타입</Label>
                        <select
                          value={selectedLayer.textMode}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "text"
                                ? { ...layer, textMode: event.target.value === "plain" ? "plain" : "variable" }
                                : layer
                            )
                          }
                          className="h-8 min-w-[150px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                        >
                          <option value="variable">변수 텍스트 오브젝트</option>
                          <option value="plain">일반 텍스트 오브젝트</option>
                        </select>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={applyRubyToSelectedText}>
                          루비
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => void applyAutoRuby()}
                          disabled={furiganaLoading}
                        >
                          {furiganaLoading ? "자동 루비 생성 중..." : "자동 루비"}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="relative min-w-[180px] flex-[1_1_220px]"
                        data-no-toolbar-drag="true"
                      >
                        <Button
                          ref={fontPickerButtonRef}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full justify-between truncate border-white/20 bg-black/30 px-2 text-xs"
                          onClick={() => {
                            if (fontPickerOpen) {
                              setFontPickerOpen(false);
                              return;
                            }
                            refreshFontPickerAnchorRect();
                            setFontPickerOpen(true);
                          }}
                          title="폰트 선택"
                        >
                          <span className="truncate" style={{ fontFamily: buildFontFamilyStack(selectedLayer.fontFamily) }}>
                            {selectedLayer.fontFamily}
                          </span>
                          <span className="ml-2 text-[10px] text-zinc-300">{fontPickerOpen ? "▲" : "▼"}</span>
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant={
                          favoriteFontOptions.some((item) => item.toLowerCase() === selectedLayer.fontFamily.toLowerCase())
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => toggleFavoriteFont(selectedLayer.fontFamily)}
                        title="폰트 즐겨찾기"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => void loadLocalFonts()}
                        disabled={localFontLoading}
                        title="내 PC 설치 폰트 불러오기"
                      >
                        {localFontLoading ? "불러오는 중..." : "내 PC 폰트"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => customFontInputRef.current?.click()}
                        disabled={customFontUploading}
                        title="커스텀 폰트 파일 업로드"
                      >
                        <Upload className="mr-1 h-3.5 w-3.5" />
                        {customFontUploading ? "업로드 중..." : "폰트 업로드"}
                      </Button>
                      <input
                        ref={customFontInputRef}
                        type="file"
                        accept={CUSTOM_FONT_ACCEPT}
                        className="hidden"
                        onChange={(event) => void handleCustomFontFileChange(event)}
                      />
                      <Input
                        type="number"
                        min={8}
                        max={240}
                        value={String(selectedLayer.fontSize)}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text"
                              ? autoExpandTextLayerIfNeeded({
                                  ...layer,
                                  fontSize: clamp(Number(event.target.value), 8, 240, layer.fontSize)
                                })
                              : layer
                          )
                        }
                        className="h-8 w-20 border-white/20 bg-black/30 text-xs text-white"
                      />
                      <Button
                        type="button"
                        variant={selectedLayer.bold ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, bold: !layer.bold } : layer
                          )
                        }
                      >
                        B
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.italic ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, italic: !layer.italic } : layer
                          )
                        }
                      >
                        I
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.strikeThrough ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, strikeThrough: !layer.strikeThrough } : layer
                          )
                        }
                      >
                        S
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.underline ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, underline: !layer.underline } : layer
                          )
                        }
                      >
                        U
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.textAlign === "left" ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, textAlign: "left" } : layer
                          )
                        }
                        title="좌측 정렬"
                      >
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.textAlign === "center" ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, textAlign: "center" } : layer
                          )
                        }
                        title="가운데 정렬"
                      >
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.textAlign === "right" ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, textAlign: "right" } : layer
                          )
                        }
                        title="우측 정렬"
                      >
                        <AlignRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLayer.autoWrap !== false ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text"
                              ? autoExpandTextLayerIfNeeded({ ...layer, autoWrap: layer.autoWrap === false })
                              : layer
                          )
                        }
                        title="자동 줄바꿈"
                      >
                        <WrapText className="h-4 w-4" />
                      </Button>
                      <input
                        type="color"
                        value={normalizeHex(selectedLayer.color, "#111111")}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, color: event.target.value } : layer
                          )
                        }
                        className="h-8 w-14 rounded border border-white/20 bg-black/30 p-1"
                        title="텍스트 색상"
                      />
                      <Button
                        type="button"
                        variant={selectedLayer.shadowEnabled ? "default" : "outline"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, shadowEnabled: !layer.shadowEnabled } : layer
                          )
                        }
                      >
                        그림자
                      </Button>
                      <input
                        type="color"
                        value={normalizeHex(selectedLayer.shadowColor, "#000000")}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, shadowColor: event.target.value } : layer
                          )
                        }
                        className="h-8 w-14 rounded border border-white/20 bg-black/30 p-1"
                        title="그림자 색상"
                        disabled={!selectedLayer.shadowEnabled}
                      />
                      </div>
                      {localFontMessage ? <p className="text-[10px] text-zinc-300">{localFontMessage}</p> : null}
                      {customFontMessage ? <p className="text-[10px] text-zinc-300">{customFontMessage}</p> : null}
                      {selectedLayerRubyTokens.length > 0 ? (
                        <div className="space-y-2 rounded-md border border-white/15 bg-black/25 p-2">
                          <p className="text-[11px] text-zinc-200">
                            자동 루비 결과 수정 ({selectedLayerRubyTokens.length})
                          </p>
                          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                            {selectedLayerRubyTokens.map((token) => (
                              <div key={`${token.index}-${token.base}`} className="grid grid-cols-[1fr_1fr_auto] gap-1">
                                <Input
                                  value={token.base}
                                  readOnly
                                  className="h-8 border-white/20 bg-black/20 text-[11px] text-zinc-300"
                                  title="원문"
                                />
                                <Input
                                  value={token.ruby}
                                  onChange={(event) => updateSelectedLayerRubyToken(token.index, event.target.value)}
                                  className="h-8 border-white/20 bg-black/30 text-[11px] text-white"
                                  title="후리가나"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-[11px]"
                                  onClick={() => removeSelectedLayerRubyToken(token.index)}
                                  title="루비 해제"
                                >
                                  해제
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <p className="text-[10px] text-zinc-300">
                        루비 입력 형식: [漢字|かな] (예: [雨|あめ]). 부분 글자 색상/굵기 개별 편집은 아직 미지원입니다.
                      </p>
                    </div>
                  ) : selectedLayer.type === "shape" ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedLayer.shape}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? (() => {
                                    const nextShape = normalizeShapeType(event.target.value);
                                    const isLineShape = nextShape === "line";
                                    const normalizedSize =
                                      nextShape === "circle"
                                        ? normalizeCircleDimensions(layer.width, layer.height, canvasWidth, canvasHeight)
                                        : { width: layer.width, height: layer.height };
                                    return {
                                      ...layer,
                                      shape: nextShape,
                                      width: normalizedSize.width,
                                      height: normalizedSize.height,
                                      fillEnabled: isLineShape ? false : layer.fillEnabled,
                                      strokeWidth: isLineShape ? Math.max(1, layer.strokeWidth || 0) : layer.strokeWidth || 2
                                    };
                                  })()
                                : layer
                            )
                          }
                          className="h-8 w-[220px] max-w-full rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                        >
                          {SHAPE_OPTIONS.map((shape) => (
                            <option key={shape.value} value={shape.value}>
                              {shape.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant={selectedLayer.fillEnabled ? "default" : "outline"}
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape" ? { ...layer, fillEnabled: !layer.fillEnabled } : layer
                            )
                          }
                        >
                          Fill
                        </Button>
                        <input
                          type="color"
                          value={normalizeHex(selectedLayer.fillColor, "#F4F1EA")}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape" ? { ...layer, fillColor: event.target.value } : layer
                            )
                          }
                          className="h-8 w-14 rounded border border-white/20 bg-black/30 p-1"
                          disabled={!selectedLayer.fillEnabled}
                          title="채우기 색상"
                        />
                        <input
                          type="color"
                          value={normalizeHex(selectedLayer.strokeColor, "#111111")}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? {
                                    ...layer,
                                    strokeColor: event.target.value,
                                    strokeWidth: Math.max(1, layer.strokeWidth || 0)
                                  }
                                : layer
                            )
                          }
                          className="h-8 w-14 rounded border border-white/20 bg-black/30 p-1"
                          title="테두리 색상"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-2">
                        <Label className="text-[11px] text-zinc-200">테두리</Label>
                        <Input
                          type="range"
                          min={0}
                          max={20}
                          step={1}
                          value={String(clamp(Number(selectedLayer.strokeWidth), 0, 20, 2))}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? { ...layer, strokeWidth: clamp(Number(event.target.value), 0, 20, layer.strokeWidth) }
                                : layer
                            )
                          }
                          className="h-8 w-24 flex-none sm:w-28"
                          title="테두리 굵기"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          step={1}
                          value={String(clamp(Number(selectedLayer.strokeWidth), 0, 20, 2))}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? { ...layer, strokeWidth: clamp(Number(event.target.value), 0, 20, layer.strokeWidth) }
                                : layer
                            )
                          }
                          className="h-8 w-16 border-white/20 bg-black/30 text-xs text-white"
                          title="테두리 굵기(px)"
                        />
                        <Label className="ml-1 text-[11px] text-zinc-200">투명도</Label>
                        <Input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={String(selectedLayer.opacity)}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) => ({
                              ...layer,
                              opacity: clamp(Number(event.target.value), 0.05, 1, layer.opacity)
                            }))
                          }
                          className="h-8 w-24 flex-none sm:w-28"
                        />
                        <Input
                          type="number"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={String(selectedLayer.opacity)}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) => ({
                              ...layer,
                              opacity: clamp(Number(event.target.value), 0.05, 1, layer.opacity)
                            }))
                          }
                          className="h-8 w-16 border-white/20 bg-black/30 text-xs text-white"
                        />
                      </div>
                      {selectedLayer.shape === "rectangle" || selectedLayer.shape === "roundedRectangle" ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-2">
                          <Label className="text-[11px] text-zinc-200">모서리 비율(%)</Label>
                          <Input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={String(
                              Math.round(getRectangleCornerRatioPercent(selectedLayer, canvasWidth, canvasHeight))
                            )}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) =>
                                layer.type === "shape"
                                  ? {
                                      ...layer,
                                      cornerRadius: cornerRatioPercentToRadiusPx(
                                        Number(event.target.value),
                                        layer,
                                        canvasWidth,
                                        canvasHeight
                                      )
                                    }
                                  : layer
                              )
                            }
                            className="h-8 w-24 flex-none sm:w-28"
                            title="사각형 모서리 둥글기 비율"
                          />
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={String(
                              Math.round(getRectangleCornerRatioPercent(selectedLayer, canvasWidth, canvasHeight))
                            )}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) =>
                                layer.type === "shape"
                                  ? {
                                      ...layer,
                                      cornerRadius: cornerRatioPercentToRadiusPx(
                                        Number(event.target.value),
                                        layer,
                                        canvasWidth,
                                        canvasHeight
                                      )
                                    }
                                  : layer
                              )
                            }
                            className="h-8 w-16 border-white/20 bg-black/30 text-xs text-white"
                            title="사각형 모서리 둥글기 비율(%)"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label className="text-xs text-zinc-200">이미지 맞춤</Label>
                        <select
                          value={selectedLayer.fit}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "image"
                                ? { ...layer, fit: event.target.value === "contain" ? "contain" : "cover" }
                                : layer
                            )
                          }
                          className="h-8 min-w-[120px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                        >
                          <option value="cover">Cover</option>
                          <option value="contain">Contain</option>
                        </select>
                        <label className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs text-zinc-100">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLayer.aiGenerateEnabled)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) =>
                                layer.type === "image"
                                  ? {
                                      ...layer,
                                      aiGenerateEnabled: event.target.checked,
                                      aiStylePreset: layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE
                                    }
                                  : layer
                              )
                            }
                          />
                          AI 생성 사용
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => openLayerImagePicker(selectedLayer.id)}
                        >
                          <ImagePlus className="mr-1 h-4 w-4" />
                          가져오기
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "image" ? { ...layer, imageUrl: "" } : layer
                            )
                          }
                        >
                          제거
                        </Button>
                      </div>
                      {selectedLayer.aiGenerateEnabled ? (
                        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-zinc-200">AI 이미지 프롬프트</Label>
                            <Textarea
                              rows={2}
                              value={String(selectedLayer.aiPrompt || "")}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" ? { ...layer, aiPrompt: event.target.value } : layer
                                )
                              }
                              placeholder="예: 일본 전통 거리의 현실감 있는 사진, 자연광, 고해상도"
                              className="min-h-[58px] text-xs"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={selectedLayer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image"
                                    ? { ...layer, aiStylePreset: event.target.value || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE }
                                    : layer
                                )
                              }
                              className="h-8 min-w-[220px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                            >
                              {INSTAGRAM_AI_IMAGE_STYLE_PRESETS.map((preset) => (
                                <option key={preset} value={preset}>
                                  {preset}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              onClick={() => void generateAiLayerImage(selectedLayer.id)}
                              disabled={aiImageGeneratingLayerId === selectedLayer.id}
                            >
                              {aiImageGeneratingLayerId === selectedLayer.id ? "생성 중..." : "AI 이미지 생성"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <p className="text-[10px] text-zinc-300">PNG/WebP 투명 배경 이미지를 그대로 지원합니다.</p>
                    </div>
                  )}
                </div>
              ) : null}
              <input
                ref={layerImageInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
                className="hidden"
                onChange={(event) => void onLayerImageUpload(event)}
              />

              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: normalizeHex(selectedPage?.backgroundColor || "#FFFFFF", "#FFFFFF") }}
                />
                {selectedPage?.backgroundImageUrl ? (
                  inferMediaTypeFromSource(selectedPage.backgroundImageUrl) === "video" ? (
                    <video
                      src={selectedPage.backgroundImageUrl}
                      className={`absolute inset-0 h-full w-full ${selectedPage.backgroundFit === "contain" ? "object-contain" : "object-cover"}`}
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={selectedPage.backgroundImageUrl}
                      alt="background"
                      className={`absolute inset-0 h-full w-full ${selectedPage.backgroundFit === "contain" ? "object-contain" : "object-cover"}`}
                      draggable={false}
                    />
                  )
                ) : null}

                {selectionBox && selectedPage && selectionBox.pageId === selectedPage.id ? (
                  <div
                    className="pointer-events-none absolute border border-sky-400 bg-sky-400/10"
                    style={{
                      left: `${(((Math.min(selectionBox.startClientX, selectionBox.currentClientX) - selectionBox.canvasLeft) / Math.max(1, selectionBox.canvasWidth)) * 100).toFixed(3)}%`,
                      top: `${(((Math.min(selectionBox.startClientY, selectionBox.currentClientY) - selectionBox.canvasTop) / Math.max(1, selectionBox.canvasHeight)) * 100).toFixed(3)}%`,
                      width: `${(((Math.abs(selectionBox.currentClientX - selectionBox.startClientX) / Math.max(1, selectionBox.canvasWidth)) * 100)).toFixed(3)}%`,
                      height: `${(((Math.abs(selectionBox.currentClientY - selectionBox.startClientY) / Math.max(1, selectionBox.canvasHeight)) * 100)).toFixed(3)}%`,
                      zIndex: 999
                    }}
                  />
                ) : null}

                {canvasLayers.map((layer) => {
                const isSelected = selectedElementIds.includes(layer.id);
                const sharedStyle: React.CSSProperties = {
                  position: "absolute",
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                  transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                  opacity: clamp(layer.opacity, 0.05, 1, 1),
                  zIndex: layer.zIndex + 10,
                  borderStyle: "solid",
                  borderWidth: isSelected ? "2px" : "1px",
                  borderColor: isSelected ? "#0EA5E9" : "rgba(14,165,233,0.35)"
                };

                if (layer.type === "text") {
                  const text = resolveTextLayerContent(layer, sampleData) || "(텍스트)";
                  return (
                    <div
                      key={layer.id}
                      data-layer-element="true"
                      style={{
                        ...sharedStyle,
                        color: normalizeHex(layer.color, "#111111"),
                        fontFamily: buildFontFamilyStack(layer.fontFamily),
                        fontWeight: layer.bold ? 700 : 400,
                        fontStyle: layer.italic ? "italic" : "normal",
                        textAlign: layer.textAlign,
                        fontSize: toCanvasWidthUnit(Math.max(10, layer.fontSize), canvasWidth),
                        lineHeight: String(clamp(layer.lineHeight, 0.8, 3, 1.2)),
                        letterSpacing: toCanvasWidthUnit(layer.letterSpacing, canvasWidth),
                        backgroundColor:
                          layer.padding > 0 || normalizeHex(layer.backgroundColor, "#FFFFFF") !== "#FFFFFF"
                            ? withAlpha(layer.backgroundColor, 0.95)
                            : "transparent",
                        padding: toCanvasWidthUnit(Math.max(0, layer.padding), canvasWidth),
                        overflow: "hidden",
                        whiteSpace: layer.autoWrap === false ? "pre" : "pre-wrap",
                        overflowWrap: layer.autoWrap === false ? "normal" : "anywhere",
                        wordBreak: layer.autoWrap === false ? "normal" : "break-word",
                        textDecorationLine: getTextDecorationLine(layer),
                        textShadow: getTextShadowStyle(layer)
                      }}
                      className="cursor-move"
                      onPointerDown={(event) => beginLayerInteraction(selectedPageId, "move", layer.id, event)}
                    >
                      <div className="h-full w-full">{renderRubyPreviewNodes(text)}</div>
                      {isSelected ? renderResizeHandleButtons(layer.id) : null}
                    </div>
                  );
                }

                if (layer.type === "shape") {
                  const shapeType = normalizeShapeType(layer.shape);
                  const clipPath = getShapeClipPath(shapeType);
                  const isLineShape = shapeType === "line";
                  return (
                    <div
                      key={layer.id}
                      data-layer-element="true"
                      style={{
                        ...sharedStyle,
                        outline: isSelected ? "2px solid #0EA5E9" : "none",
                        outlineOffset: 0,
                        borderRadius:
                          shapeType === "circle"
                            ? "9999px"
                            : shapeType === "roundedRectangle" || shapeType === "rectangle"
                              ? `${clamp(layer.cornerRadius, 0, 200, 24) * 0.5}px`
                              : "0px",
                        clipPath: isLineShape ? undefined : clipPath,
                        backgroundColor:
                          isLineShape || layer.fillEnabled === false ? "transparent" : normalizeHex(layer.fillColor, "#F4F1EA"),
                        borderStyle: isLineShape ? undefined : "solid",
                        borderWidth: isLineShape ? undefined : `${Math.max(0, layer.strokeWidth || 0)}px`,
                        borderColor: isLineShape ? undefined : normalizeHex(layer.strokeColor, "#111111")
                      }}
                      className="cursor-move"
                      onPointerDown={(event) => {
                        if (
                          !isPointerInsideShapeTarget(
                            event,
                            shapeType,
                            Math.max(0, Number(layer.strokeWidth) || 0)
                          )
                        ) {
                          clearSelection();
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }
                        beginLayerInteraction(selectedPageId, "move", layer.id, event);
                      }}
                    >
                      {isLineShape ? (
                        <div
                          className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2"
                          style={{
                            borderTop: `${Math.max(1, layer.strokeWidth || 2)}px solid ${normalizeHex(layer.strokeColor, "#111111")}`
                          }}
                        />
                      ) : null}
                      {isSelected ? renderResizeHandleButtons(layer.id) : null}
                    </div>
                  );
                }

                return (
                  <div
                    key={layer.id}
                    data-layer-element="true"
                    style={{
                      ...sharedStyle,
                      borderRadius: `${clamp(layer.borderRadius, 0, 220, 16) * 0.5}px`,
                      overflow: "hidden"
                    }}
                    className="cursor-move bg-transparent"
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement | null;
                      if (target?.closest("button")) {
                        return;
                      }
                      if (!layer.imageUrl && !(event.shiftKey || event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        event.stopPropagation();
                        openLayerImagePicker(layer.id);
                        return;
                      }
                      beginLayerInteraction(selectedPageId, "move", layer.id, event);
                    }}
                  >
                    {layer.imageUrl ? (
                      layer.mediaType === "video" || inferMediaTypeFromSource(layer.imageUrl) === "video" ? (
                        <video
                          src={layer.imageUrl}
                          className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                          autoPlay
                          muted
                          loop
                          playsInline
                          controls
                        />
                      ) : (
                        <img
                          src={layer.imageUrl}
                          alt="layer"
                          className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                          draggable={false}
                        />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-200">
                        클릭 후 이미지 업로드
                      </div>
                    )}
                    {layer.overlayOpacity > 0 ? (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{ backgroundColor: withAlpha(layer.overlayColor, layer.overlayOpacity) }}
                      />
                    ) : null}
                    {isSelected ? renderResizeHandleButtons(layer.id) : null}
                  </div>
                );
                })}
              </div>
            </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  레이어를 직접 드래그해 위치를 조정하고, 테두리 핸들로 리사이즈하세요. 선택 후 Del 키로 빠르게 삭제할 수 있습니다.
                </p>
              </>
            ) : (
              <div className="mx-auto flex w-full max-w-[900px] items-center justify-center rounded-md border border-dashed py-16 text-xs text-muted-foreground">
                페이지 미리보기 숨김
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 text-sm font-semibold">다른 페이지 캔버스 목록</p>
            <div className="space-y-4">
              {editor.pages.filter((page) => page.id !== selectedPageId).length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
                  추가 페이지가 없습니다.
                </div>
              ) : (
                editor.pages
                  .filter((page) => page.id !== selectedPageId)
                  .map((page) => {
                const pageIndex = editor.pages.findIndex((item) => item.id === page.id);
                const layers = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
                const isPreviewVisible = pagePreviewVisible[page.id] ?? true;
                return (
                  <div
                    key={page.id}
                    role="button"
                    tabIndex={0}
                    className="w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/60"
                    onClick={() => {
                      setSelectedPageId(page.id);
                      setSelectedElementId(page.elements[0]?.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedPageId(page.id);
                      setSelectedElementId(page.elements[0]?.id);
                    }}
                    >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">{`${pageIndex + 1}. ${page.name}`}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{`${canvasWidth}x${canvasHeight}`}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            movePage(page.id, "up");
                          }}
                          disabled={pageIndex === 0}
                          title="위로"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            movePage(page.id, "down");
                          }}
                          disabled={pageIndex === editor.pages.length - 1}
                          title="아래로"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePagePreview(page.id);
                          }}
                          title={isPreviewVisible ? "페이지 숨기기" : "페이지 보이기"}
                        >
                          {isPreviewVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            insertPageAfter(page.id);
                          }}
                          title="추가"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            duplicatePage(page.id);
                          }}
                          title="복제"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            removePage(page.id);
                          }}
                          disabled={editor.pages.length <= 1}
                          title={editor.pages.length <= 1 ? "페이지는 최소 1개 필요합니다." : "페이지 삭제"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {isPreviewVisible ? (
                      <div
                        className="relative mx-auto w-full max-w-[480px] overflow-hidden border bg-zinc-100 shadow-inner"
                        style={{ containerType: "inline-size" }}
                      >
                        <div style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }} />
                        <div
                          className="absolute inset-0"
                          style={{ backgroundColor: normalizeHex(page.backgroundColor || "#FFFFFF", "#FFFFFF") }}
                        />
                        {page.backgroundImageUrl ? (
                          inferMediaTypeFromSource(page.backgroundImageUrl) === "video" ? (
                            <video
                              src={page.backgroundImageUrl}
                              className={`absolute inset-0 h-full w-full ${page.backgroundFit === "contain" ? "object-contain" : "object-cover"}`}
                              autoPlay
                              muted
                              loop
                              playsInline
                            />
                          ) : (
                            <img
                              src={page.backgroundImageUrl}
                              alt={`${page.name} background`}
                              className={`absolute inset-0 h-full w-full ${page.backgroundFit === "contain" ? "object-contain" : "object-cover"}`}
                              draggable={false}
                            />
                          )
                        ) : null}
                        {layers.map((layer) => {
                          const sharedStyle: React.CSSProperties = {
                            position: "absolute",
                            left: `${layer.x}%`,
                            top: `${layer.y}%`,
                            width: `${layer.width}%`,
                            height: `${layer.height}%`,
                            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                            opacity: clamp(layer.opacity, 0.05, 1, 1),
                            zIndex: layer.zIndex + 10,
                            borderStyle: "solid",
                            borderWidth: "1px",
                            borderColor: "rgba(14,165,233,0.22)"
                          };

                          if (layer.type === "text") {
                            const text = resolveTextLayerContent(layer, sampleData) || "(텍스트)";
                            return (
                              <div
                                key={layer.id}
                                style={{
                                  ...sharedStyle,
                                  color: normalizeHex(layer.color, "#111111"),
                                  fontFamily: buildFontFamilyStack(layer.fontFamily),
                                  fontWeight: layer.bold ? 700 : 400,
                                  fontStyle: layer.italic ? "italic" : "normal",
                                  textAlign: layer.textAlign,
                                  fontSize: toCanvasWidthUnit(Math.max(10, layer.fontSize), canvasWidth),
                                  lineHeight: String(clamp(layer.lineHeight, 0.8, 3, 1.2)),
                                  letterSpacing: toCanvasWidthUnit(layer.letterSpacing, canvasWidth),
                                  backgroundColor:
                                    layer.padding > 0 || normalizeHex(layer.backgroundColor, "#FFFFFF") !== "#FFFFFF"
                                      ? withAlpha(layer.backgroundColor, 0.95)
                                      : "transparent",
                                  padding: toCanvasWidthUnit(Math.max(0, layer.padding), canvasWidth),
                                  overflow: "hidden",
                                  whiteSpace: layer.autoWrap === false ? "pre" : "pre-wrap",
                                  overflowWrap: layer.autoWrap === false ? "normal" : "anywhere",
                                  wordBreak: layer.autoWrap === false ? "normal" : "break-word",
                                  textDecorationLine: getTextDecorationLine(layer),
                                  textShadow: getTextShadowStyle(layer)
                                }}
                              >
                                <div className="h-full w-full">{renderRubyPreviewNodes(text)}</div>
                              </div>
                            );
                          }

                          if (layer.type === "shape") {
                            const shapeType = normalizeShapeType(layer.shape);
                            const clipPath = getShapeClipPath(shapeType);
                            const isLineShape = shapeType === "line";
                            return (
                              <div
                                key={layer.id}
                                style={{
                                  ...sharedStyle,
                                  borderRadius:
                                    shapeType === "circle"
                                      ? "9999px"
                                      : shapeType === "roundedRectangle" || shapeType === "rectangle"
                                        ? `${clamp(layer.cornerRadius, 0, 200, 24) * 0.5}px`
                                        : "0px",
                                  clipPath: isLineShape ? undefined : clipPath,
                                  backgroundColor:
                                    isLineShape || layer.fillEnabled === false ? "transparent" : normalizeHex(layer.fillColor, "#F4F1EA"),
                                  borderStyle: isLineShape ? undefined : "solid",
                                  borderWidth: isLineShape ? undefined : `${Math.max(0, layer.strokeWidth || 0)}px`,
                                  borderColor: isLineShape ? undefined : normalizeHex(layer.strokeColor, "#111111")
                                }}
                              >
                                {isLineShape ? (
                                  <div
                                    className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2"
                                    style={{
                                      borderTop: `${Math.max(1, layer.strokeWidth || 2)}px solid ${normalizeHex(layer.strokeColor, "#111111")}`
                                    }}
                                  />
                                ) : null}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={layer.id}
                              style={{
                                ...sharedStyle,
                                borderRadius: `${clamp(layer.borderRadius, 0, 220, 16) * 0.5}px`,
                                overflow: "hidden"
                              }}
                              className="bg-transparent"
                            >
                              {layer.imageUrl ? (
                                layer.mediaType === "video" || inferMediaTypeFromSource(layer.imageUrl) === "video" ? (
                                  <video
                                    src={layer.imageUrl}
                                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    controls
                                  />
                                ) : (
                                  <img
                                    src={layer.imageUrl}
                                    alt="layer"
                                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                                    draggable={false}
                                  />
                                )
                              ) : null}
                              {layer.overlayOpacity > 0 ? (
                                <div
                                  className="pointer-events-none absolute inset-0"
                                  style={{ backgroundColor: withAlpha(layer.overlayColor, layer.overlayOpacity) }}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mx-auto flex w-full max-w-[480px] items-center justify-center rounded-md border border-dashed py-10 text-xs text-muted-foreground">
                        페이지 미리보기 숨김
                      </div>
                    )}
                  </div>
                );
              })
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setSections((prev) => ({ ...prev, layers: !prev.layers }))}
            >
              <span className="inline-flex items-center gap-1">
                <Layers className="h-4 w-4" />
                Layers
              </span>
              <span>{sections.layers ? "접기" : "펼치기"}</span>
            </button>
            {sections.layers ? (
              <div className="mt-3 space-y-2">
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {[...sortedLayers]
                    .sort((a, b) => b.zIndex - a.zIndex)
                    .map((layer) => (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => {
                          setSelectedElementId(layer.id);
                          setSelectedElementIds([layer.id]);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                          selectedElementIds.includes(layer.id) ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        <span className="truncate">{resolveElementName(layer)}</span>
                        <span className="ml-2 text-[10px] opacity-70">z:{layer.zIndex}</span>
                      </button>
                    ))}
                </div>
                {selectedLayer ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "up"))}
                    >
                      <Plus className="h-4 w-4" />
                      앞으로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "down"))}
                    >
                      <Minus className="h-4 w-4" />
                      뒤로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        selectedElementIds.length > 1 ? deleteSelectedLayers(selectedElementIds) : deleteLayer(selectedLayer.id)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      삭제
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setSections((prev) => ({ ...prev, page: !prev.page }))}
            >
              <span className="inline-flex items-center gap-1">
                <Paintbrush className="h-4 w-4" />
                Page / Layer
              </span>
              <span>{sections.page ? "접기" : "펼치기"}</span>
            </button>
            {sections.page ? (
              <div className="mt-3 space-y-3">
                {selectedPage ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs font-semibold text-muted-foreground">현재 페이지</p>
                    <Input
                      value={selectedPage.name}
                      onChange={(event) => updateSelectedPage((page) => ({ ...page, name: event.target.value }))}
                      placeholder="Page name"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={String(selectedPage.durationSec)}
                      onChange={(event) =>
                        updateSelectedPage((page) => ({
                          ...page,
                          durationSec: clamp(Number(event.target.value), 1, 60, 4)
                        }))
                      }
                    />
                    <ColorField
                      label="배경 색상"
                      value={selectedPage.backgroundColor}
                      onChange={(value) => updateSelectedPage((page) => ({ ...page, backgroundColor: value }))}
                    />
                    <div className="space-y-1">
                      <Label>배경 이미지</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => pageBackgroundImageInputRef.current?.click()}>
                          <ImagePlus className="h-4 w-4" />
                          업로드
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateSelectedPage((page) => ({ ...page, backgroundImageUrl: "" }))}
                        >
                          제거
                        </Button>
                      </div>
                      <input
                        ref={pageBackgroundImageInputRef}
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
                        className="hidden"
                        onChange={(event) => void onPageBackgroundImageUpload(event)}
                      />
                      <Select
                        value={selectedPage.backgroundFit === "contain" ? "contain" : "cover"}
                        onValueChange={(value) =>
                          updateSelectedPage((page) => ({
                            ...page,
                            backgroundFit: value === "contain" ? "contain" : "cover"
                          }))
                        }
                      >
                        <SelectTrigger className="bg-card dark:bg-zinc-900">
                          <SelectValue placeholder="배경 맞춤" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cover">Cover</SelectItem>
                          <SelectItem value="contain">Contain</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>페이지 오디오</Label>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedPage.audioEnabled)}
                          onChange={(event) =>
                            updateSelectedPage((page) => ({
                              ...page,
                              audioEnabled: event.target.checked
                            }))
                          }
                        />
                        오디오 사용 (체크된 페이지만 AI 오디오 합성)
                      </label>
                      {selectedPage.audioEnabled ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="space-y-1">
                            <Label>TTS 제공자</Label>
                            <Select
                              value={
                                selectedPage.audioProvider === "openai" || selectedPage.audioProvider === "gemini"
                                  ? selectedPage.audioProvider
                                  : "auto"
                              }
                              onValueChange={(value) =>
                                updateSelectedPage((page) => {
                                  const nextProvider =
                                    value === "openai" || value === "gemini" ? value : "auto";
                                  const nextVoiceOptions = filterVoiceOptions(
                                    nextProvider === "auto" ? defaultTtsVoiceProvider : nextProvider
                                  );
                                  const normalizedVoice = String(page.audioVoice || "").trim().toLowerCase();
                                  const nextVoice = nextVoiceOptions.some((item) => item.id === normalizedVoice)
                                    ? normalizedVoice
                                    : (nextVoiceOptions[0]?.id ?? "alloy");
                                  return {
                                    ...page,
                                    audioProvider: nextProvider,
                                    audioVoice: nextVoice
                                  };
                                })
                              }
                            >
                              <SelectTrigger className="bg-card dark:bg-zinc-900">
                                <SelectValue placeholder="TTS 제공자 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">설정 따름 (Auto)</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="gemini">Gemini</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>AI 목소리</Label>
                            <Select
                              value={
                                selectedPageVoiceOptions.some(
                                  (item) =>
                                    item.id === (String(selectedPage.audioVoice || "").trim().toLowerCase() || "alloy")
                                )
                                  ? String(selectedPage.audioVoice || "alloy").trim().toLowerCase()
                                  : (selectedPageVoiceOptions[0]?.id ?? "alloy")
                              }
                              onValueChange={(value) =>
                                updateSelectedPage((page) => ({
                                  ...page,
                                  audioVoice: value
                                }))
                              }
                            >
                              <SelectTrigger className="bg-card dark:bg-zinc-900">
                                <SelectValue placeholder="목소리 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedPageVoiceOptions.map((voice) => (
                                  <SelectItem key={voice.id} value={voice.id}>
                                    {voice.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label>배속</Label>
                            <Select
                              value={String(clamp(Number(selectedPage.audioSpeed), 0.5, 2, 1))}
                              onValueChange={(value) =>
                                updateSelectedPage((page) => ({
                                  ...page,
                                  audioSpeed: clamp(Number(value), 0.5, 2, 1)
                                }))
                              }
                            >
                              <SelectTrigger className="bg-card dark:bg-zinc-900">
                                <SelectValue placeholder="배속 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {VOICE_SPEED_OPTIONS.map((speed) => (
                                  <SelectItem key={speed} value={speed}>
                                    {speed}x
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : null}
                      <Textarea
                        value={String(selectedPage.audioPrompt || "")}
                        onChange={(event) =>
                          updateSelectedPage((page) => ({
                            ...page,
                            audioPrompt: event.target.value
                          }))
                        }
                        disabled={!selectedPage.audioEnabled}
                        rows={3}
                        placeholder="오디오 사용 시 이 텍스트를 AI 음성(TTS)으로 생성해 MP4에 합성합니다."
                      />
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void previewSelectedPageAudio()}
                            disabled={!selectedPage.audioEnabled || audioPreviewLoading}
                          >
                            {audioPreviewLoading ? "음성 생성 중..." : "음성 미리 듣기"}
                          </Button>
                          {audioPreviewUrl ? (
                            <audio ref={audioPreviewRef} src={audioPreviewUrl} controls className="h-9 w-full max-w-md" />
                          ) : null}
                        </div>
                        {selectedPage.audioEnabled ? (
                          <p className="text-xs text-muted-foreground">
                            미리듣기 기준(치환 후): {resolvedSelectedPageAudioPrompt || "(비어 있음)"}
                          </p>
                        ) : null}
                        {audioPreviewError ? <p className="text-xs text-red-400">{audioPreviewError}</p> : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => duplicatePage(selectedPage.id)}>
                        <Copy className="h-4 w-4" />
                        복제
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removePage(selectedPage.id)}
                        disabled={editor.pages.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </Button>
                    </div>
                  </div>
                ) : null}

                {selectedLayer ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">레이어 공통</p>
                      <Button
                        type="button"
                        variant={showAdvancedPosition ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowAdvancedPosition((prev) => !prev)}
                      >
                        <Move className="h-4 w-4" />
                        좌표 고급
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>회전</Label>
                        <Input
                          type="number"
                          min={-180}
                          max={180}
                          value={String(selectedLayer.rotation)}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) => ({
                              ...layer,
                              rotation: clamp(Number(event.target.value), -180, 180, layer.rotation)
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>투명도(0~1)</Label>
                        <Input
                          type="number"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={String(selectedLayer.opacity)}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) => ({
                              ...layer,
                              opacity: clamp(Number(event.target.value), 0.05, 1, layer.opacity)
                            }))
                          }
                        />
                      </div>
                    </div>
                    {showAdvancedPosition ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>X(%)</Label>
                          <Input
                            type="number"
                            value={String(selectedLayer.x)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) => ({
                                ...layer,
                                x: clamp(Number(event.target.value), 0, 100, layer.x)
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Y(%)</Label>
                          <Input
                            type="number"
                            value={String(selectedLayer.y)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) => ({
                                ...layer,
                                y: clamp(Number(event.target.value), 0, 100, layer.y)
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>폭(%)</Label>
                          <Input
                            type="number"
                            value={String(selectedLayer.width)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) => {
                                const nextWidth = clamp(
                                  Number(event.target.value),
                                  MIN_LAYER_SIZE_PERCENT,
                                  100,
                                  layer.width
                                );
                                if (layer.type === "shape" && normalizeShapeType(layer.shape) === "circle") {
                                  const normalizedSize = normalizeCircleDimensions(
                                    nextWidth,
                                    layer.height,
                                    canvasWidth,
                                    canvasHeight
                                  );
                                  return {
                                    ...layer,
                                    width: normalizedSize.width,
                                    height: normalizedSize.height
                                  };
                                }
                                if (layer.type === "text") {
                                  return autoExpandTextLayerIfNeeded({
                                    ...layer,
                                    width: nextWidth
                                  });
                                }
                                return {
                                  ...layer,
                                  width: nextWidth
                                };
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>높이(%)</Label>
                          <Input
                            type="number"
                            value={String(selectedLayer.height)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) => {
                                const nextHeight = clamp(
                                  Number(event.target.value),
                                  MIN_LAYER_SIZE_PERCENT,
                                  100,
                                  layer.height
                                );
                                if (layer.type === "shape" && normalizeShapeType(layer.shape) === "circle") {
                                  const normalizedSize = normalizeCircleDimensions(
                                    layer.width,
                                    nextHeight,
                                    canvasWidth,
                                    canvasHeight
                                  );
                                  return {
                                    ...layer,
                                    width: normalizedSize.width,
                                    height: normalizedSize.height
                                  };
                                }
                                return {
                                  ...layer,
                                  height: nextHeight
                                };
                              })
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-md border p-3 text-xs text-muted-foreground">레이어를 선택하세요.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setSections((prev) => ({ ...prev, data: !prev.data }))}
            >
              <span className="inline-flex items-center gap-1">
                <FileJson className="h-4 w-4" />
                Data Binding
              </span>
              <span>{sections.data ? "접기" : "펼치기"}</span>
            </button>
            {sections.data ? (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    placeholder="인스타 Sheet Name (비우면 Settings 기본값)"
                  />
                  <Button type="button" variant="outline" onClick={() => void loadSheetBindings()} disabled={bindingLoading}>
                    {bindingLoading ? "가져오는 중..." : "컬럼 가져오기"}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={bindingSearch}
                    onChange={(event) => setBindingSearch(event.target.value)}
                    className="pl-8"
                    placeholder="컬럼 검색"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">미리보기 row 선택</Label>
                  {bindingRowOptions.length > 0 ? (
                    <>
                      <Select value={bindingSelectedRowKey || bindingRowOptions[0].key} onValueChange={onSelectBindingRow}>
                        <SelectTrigger className="bg-card dark:bg-zinc-900">
                          <SelectValue placeholder="row 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {bindingRowOptions.map((rowOption) => (
                            <SelectItem key={rowOption.key} value={rowOption.key}>
                              {rowOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        총 {bindingRowOptions.length}개 row 중 선택한 row 값을 샘플 미리보기에 반영합니다.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">시트 row를 불러오면 여기서 예시 row를 선택할 수 있습니다.</p>
                  )}
                </div>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border p-2">
                  {filteredBindingFields.map((field) => (
                    <Button key={field} type="button" size="sm" variant="outline" onClick={() => insertBindingToken(field)}>
                      {field}
                    </Button>
                  ))}
                  {filteredBindingFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">조건에 맞는 컬럼이 없습니다.</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  토큰 버튼 클릭 시 선택 텍스트 레이어에 `{"{{column}}"}`이 삽입됩니다.
                </p>

                <div className="space-y-2 rounded-md border p-2">
                  <p className="text-xs font-semibold text-muted-foreground">미리보기 샘플값</p>
                  {bindingFields.map((field) => (
                    <div key={field} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
                      <Label className="truncate text-xs">{field}</Label>
                      <Input
                        value={sampleData[field] || ""}
                        onChange={(event) =>
                          setSampleData((prev) => ({
                            ...prev,
                            [field]: event.target.value
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setSections((prev) => ({ ...prev, output: !prev.output }))}
            >
              <span className="inline-flex items-center gap-1">
                <FileImage className="h-4 w-4" />
                Output (Final PNG / MP4)
              </span>
              <span>{sections.output ? "접기" : "펼치기"}</span>
            </button>
            {sections.output ? (
              <div className="mt-3 space-y-2">
                <Button type="button" onClick={() => void renderOutputPreview()} disabled={renderingOutput}>
                  {renderingOutput ? "렌더링 중..." : "현재 페이지 PNG 렌더"}
                </Button>
                <Button type="button" variant="outline" onClick={downloadOutputPreview} disabled={!outputPreviewUrl}>
                  <Download className="h-4 w-4" />
                  PNG 다운로드
                </Button>
                <Button type="button" onClick={() => void renderOutputVideo()} disabled={renderingOutputVideo}>
                  {renderingOutputVideo ? "렌더링 중..." : "현재 페이지 MP4 렌더"}
                </Button>
                <Button type="button" variant="outline" onClick={downloadOutputVideo} disabled={!outputVideoUrl}>
                  <Download className="h-4 w-4" />
                  MP4 다운로드
                </Button>
                {outputPreviewUrl ? (
                  <div className="rounded-md border p-2">
                    <img src={outputPreviewUrl} alt="output preview" className="mx-auto w-full rounded border" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{`이 렌더 이미지는 현재 캔버스 레이어를 그대로 ${canvasWidth}x${canvasHeight}로 출력한 결과입니다.`}</p>
                )}
                {outputVideoUrl ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <video src={outputVideoUrl} controls className="w-full rounded border bg-black" />
                    <a
                      href={outputVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 underline"
                    >
                      MP4 결과 새 창에서 열기
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setSections((prev) => ({ ...prev, json: !prev.json }))}
            >
              <span className="inline-flex items-center gap-1">
                <FileJson className="h-4 w-4" />
                Template JSON
              </span>
              <span>{sections.json ? "접기" : "펼치기"}</span>
            </button>
            {sections.json ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={8}
                  value={importJson}
                  onChange={(event) => setImportJson(event.target.value)}
                  placeholder='{"templateName":"example","pages":[...]}'
                />
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={onTemplateJsonFileChange}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={loadCurrentTemplateJsonToTextarea}>
                    현재 JSON 불러오기
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void copyCurrentTemplateJson()}>
                    JSON 복사
                  </Button>
                  <Button type="button" variant="outline" onClick={() => jsonFileInputRef.current?.click()}>
                    JSON 파일 선택
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void importTemplateFromJsonText()} disabled={busy}>
                    JSON 텍스트로 추가
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  객체 1개, 배열, 또는 {"{ templates: [...] }"} 형태를 지원합니다.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {fontPickerOpen && fontPickerAnchorRect
        ? createPortal(
            <div
              ref={fontPickerRef}
              className="fixed z-[120] w-[min(460px,92vw)] rounded-md border border-white/20 bg-black/95 p-2 shadow-2xl backdrop-blur"
              style={{
                left: `${fontPickerAnchorRect.left}px`,
                top: `${fontPickerAnchorRect.top + 8}px`,
                maxWidth: "92vw"
              }}
              data-no-toolbar-drag="true"
            >
              <Input
                value={fontPickerQuery}
                onChange={(event) => setFontPickerQuery(event.target.value)}
                placeholder="폰트 검색"
                className="mb-2 h-8 border-white/20 bg-black/40 text-xs text-white"
              />
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredFavoriteFonts.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Favorites</p>
                    {filteredFavoriteFonts.map((font) => (
                      <button
                        key={`picker-fav-${font}`}
                        type="button"
                        className="block w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-left hover:bg-white/10"
                        onClick={() => {
                          void applySelectedTextFont(font);
                          setFontPickerOpen(false);
                        }}
                        title={font}
                      >
                        <div className="truncate text-[11px] text-zinc-200">{font}</div>
                        <div className="truncate text-sm text-white" style={{ fontFamily: buildFontFamilyStack(font) }}>
                          たべます | 단일 이미지 강조하기 | ABC abc 123
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {filteredNormalFonts.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">All Fonts</p>
                    {filteredNormalFonts.map((font) => (
                      <button
                        key={`picker-font-${font}`}
                        type="button"
                        className="block w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-left hover:bg-white/10"
                        onClick={() => {
                          void applySelectedTextFont(font);
                          setFontPickerOpen(false);
                        }}
                        title={font}
                      >
                        <div className="truncate text-[11px] text-zinc-200">{font}</div>
                        <div className="truncate text-sm text-white" style={{ fontFamily: buildFontFamilyStack(font) }}>
                          たべます | 단일 이미지 강조하기 | ABC abc 123
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {filteredFavoriteFonts.length === 0 && filteredNormalFonts.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-zinc-400">검색 결과가 없습니다.</p>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-500">{success}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
    </section>
  );
}
