"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
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
  Music,
  Paintbrush,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  WrapText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { renderInstagramPageToPngDataUrl } from "@/lib/instagram-page-renderer";
import {
  buildSentenceReadingPages as buildSentenceReadingPagesShared,
  buildSentenceReadingUploadInfo,
  normalizeSentenceReadingCardTitle,
  normalizeSentenceReadingCardSet as normalizeSentenceReadingCardSetShared,
  repairMalformedRubyHtml
} from "@/lib/instagram-sentence-reading";
import {
  readInstagramLastSheetName,
  resolveInstagramPreferredSheetName,
  resolveInstagramSettingsSheetName,
  saveInstagramLastSheetName
} from "@/lib/instagram-sheet-name-storage";
import { ensureInstagramCustomFontsLoaded } from "@/lib/instagram-font-runtime";
import {
  INSTAGRAM_FEED_DRAFT_KEY,
  INSTAGRAM_FEED_STORAGE_KEY,
  INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY,
  type InstagramTemplateEditDraft
} from "@/lib/instagram-feed-storage";
import { isLocalFontAccessSupported, mergeFontOptions, queryInstalledFontNames } from "@/lib/local-fonts";
import type { AppSettings } from "@/lib/types";
import { filterVoiceOptions, resolveTtsVoiceProvider } from "@/lib/voice-options";
import type {
  InstagramAiImageOrientation,
  InstagramCustomFont,
  InstagramFeedPage,
  InstagramGeneratedFeedItem,
  InstagramImageElement,
  InstagramVideoElement,
  InstagramPageElement,
  InstagramShapeElement,
  InstagramShapeType,
  InstagramTemplateMode,
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

type TemplateMediaUploadUrlResponse = {
  ok?: boolean;
  uploadMethod?: "put" | "post";
  uploadUrl?: string;
  postUrl?: string;
  fields?: Record<string, string>;
  publicUrl?: string;
  error?: string;
};

type PixabaySoundEffectResult = {
  id: string;
  title: string;
  user?: string;
  tags?: string;
  duration?: number;
  pageUrl?: string;
  audioUrl: string;
};

type PixabaySoundEffectSearchResponse = {
  ok?: boolean;
  results?: PixabaySoundEffectResult[];
  error?: string;
};

type PixabaySoundEffectImportResponse = {
  ok?: boolean;
  publicUrl?: string;
  error?: string;
};

type AiVideoGenerationProgress = {
  layerId: string;
  status: "running" | "success" | "error";
  provider: "gemini" | "openai";
  startedAt: number;
  message: string;
  estimatedCostUsd: number;
};

type LayerMediaUploadProgress = {
  status: "uploading" | "processing" | "success" | "error";
  percent: number;
  message: string;
  fileName?: string;
};

type IdeasSheetTableResponse = {
  sheetName?: string;
  headers?: string[];
  rows?: Array<Record<string, string>>;
  error?: string;
};

type GoogleNewsItem = {
  title: string;
  titleKo: string;
  description: string;
  summaryOriginal: string;
  summaryKo: string;
  detailOriginal: string;
  detailKo: string;
  imagePrompt: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  link: string;
};

type InstagramNewsResponse = {
  country?: string;
  count?: number;
  fetchedAt?: string;
  items?: GoogleNewsItem[];
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
  | "rubyGap"
  | "textOffsetY"
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
  | "backgroundOpacity"
  | "padding"
  | "opacity"
>;

type ShapeStyleSnapshot = Pick<
  InstagramShapeElement,
  | "shape"
  | "fillEnabled"
  | "fillColor"
  | "fillOpacity"
  | "strokeColor"
  | "strokeWidth"
  | "cornerRadius"
  | "opacity"
>;

type ElementClipboardPayload = {
  copiedAt: number;
  elements: InstagramPageElement[];
};

const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;
const MIN_LAYER_SIZE_PERCENT = 1;
const AUTO_TEXT_BINDING_KEY_PREFIX = "auto_txt_";
const LAST_USED_TEMPLATE_ID_KEY = "shorts-maker:instagram:last-template-id";
const FAVORITE_INSTAGRAM_FONTS_KEY = "shorts-maker:instagram:favorite-fonts";
const INSTAGRAM_BINDING_STATE_KEY = "shorts-maker:instagram:binding-state";
const DEFAULT_BINDING_FIELDS = ["id", "status", "type", "keyword", "subject", "description", "narration"];
const NEWS_BINDING_FIELDS = [
  "id",
  "status",
  "keyword",
  "newsTitle",
  "newsTitleKR",
  "newsTitle_KR",
  "news_title_kr",
  "news_title",
  "newsBody",
  "news_body",
  "sourceArticleOriginal",
  "source_article_original",
  "sourceArticleKo",
  "source_article_ko",
  "subject",
  "title",
  "description",
  "narration",
  "source",
  "sourceName",
  "link",
  "url",
  "newsLink",
  "news_link",
  "articleLink",
  "article_link",
  "publishedAt",
  "published_at",
  "summaryKo",
  "summary_ko",
  "summaryOriginal",
  "summary_original",
  "detailKo",
  "detail_ko",
  "detailOriginal",
  "detail_original",
  "articleBodyKo",
  "article_body_ko",
  "articlePart1",
  "articlePart2",
  "article_part_1",
  "article_part_2",
  "imagePrompt",
  "image_prompt",
  "newsImagePage1",
  "news_image_page1",
  "newsImagePage2",
  "news_image_page2",
  "newsImagePrimary",
  "news_image_primary",
  "imageUrl",
  "image_url"
];
const NEWS_ONLY_BINDING_FIELD_SET = new Set(
  NEWS_BINDING_FIELDS.filter((field) => !DEFAULT_BINDING_FIELDS.includes(field))
);
const CUSTOM_CANVAS_PRESET = "custom";
const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  type: "과거 부정형",
  subject: "단일 이미지 강조하기",
  description: "시트 데이터와 연결되는 카드 템플릿",
  keyword: "instagram"
};
const DEFAULT_NEWS_SAMPLE_DATA: Record<string, string> = {
  type: "뉴스",
  status: "준비",
  keyword: "news",
  newsTitle: "뉴스 제목",
  newsTitleKR: "뉴스 제목(한국어)",
  newsTitle_KR: "뉴스 제목(한국어)",
  news_title_kr: "뉴스 제목(한국어)",
  newsBody: "뉴스 본문(한국어 요약)",
  sourceArticleOriginal: "뉴스 출처 전문(원문)",
  sourceArticleKo: "뉴스 출처 전문(한국어 번역)",
  subject: "긴급 뉴스 핵심 요약",
  title: "뉴스 제목",
  description: "뉴스 본문 요약",
  narration: "뉴스 본문 전체 내용",
  source: "Google News",
  link: "https://news.google.com",
  newsImagePage1: "",
  newsImagePage2: "",
  newsImagePrimary: "",
  imagePrompt:
    "뉴스 상황을 시각화한 사실적인 사진, natural light, documentary photography, high detail, 9:16 vertical"
};
const NEWS_IMAGE_PROMPT_FALLBACK =
  "뉴스 상황을 시각화한 사실적인 사진, natural light, documentary photography, high detail, 9:16 vertical";
const NEWS_COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "KR", label: "대한민국 (KR)" },
  { value: "US", label: "미국 (US)" },
  { value: "JP", label: "일본 (JP)" },
  { value: "GB", label: "영국 (GB)" },
  { value: "CA", label: "캐나다 (CA)" },
  { value: "AU", label: "호주 (AU)" },
  { value: "IN", label: "인도 (IN)" },
  { value: "SG", label: "싱가포르 (SG)" }
];
const NEWS_COUNT_OPTIONS = ["5", "10", "20", "30"];
const NEWS_TOPIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "전체" },
  { value: "politics", label: "정치" },
  { value: "economy", label: "경제" },
  { value: "technology", label: "기술" },
  { value: "ai", label: "AI" },
  { value: "world", label: "국제" },
  { value: "society", label: "사회" },
  { value: "sports", label: "스포츠" },
  { value: "entertainment", label: "연예" }
];

const NEWS_TOPIC_QUERY_BY_COUNTRY: Record<string, Record<string, string>> = {
  KR: {
    politics: "정치",
    economy: "경제",
    technology: "기술",
    ai: "AI 인공지능",
    world: "국제",
    society: "사회",
    sports: "스포츠",
    entertainment: "연예"
  },
  JP: {
    politics: "政治",
    economy: "経済",
    technology: "技術",
    ai: "AI 人工知能",
    world: "国際",
    society: "社会",
    sports: "スポーツ",
    entertainment: "エンタメ"
  },
  DE: {
    politics: "Politik",
    economy: "Wirtschaft",
    technology: "Technologie",
    ai: "KI künstliche Intelligenz",
    world: "Welt",
    society: "Gesellschaft",
    sports: "Sport",
    entertainment: "Unterhaltung"
  },
  FR: {
    politics: "politique",
    economy: "économie",
    technology: "technologie",
    ai: "IA intelligence artificielle",
    world: "monde",
    society: "société",
    sports: "sport",
    entertainment: "divertissement"
  },
  DEFAULT: {
    politics: "politics",
    economy: "economy",
    technology: "technology",
    ai: "AI artificial intelligence",
    world: "world",
    society: "society",
    sports: "sports",
    entertainment: "entertainment"
  }
};

function resolveNewsTopicQuery(topicValue: string, country: string): string {
  if (!topicValue || topicValue === "all") {
    return "";
  }
  const byCountry =
    NEWS_TOPIC_QUERY_BY_COUNTRY[String(country || "").toUpperCase()] || NEWS_TOPIC_QUERY_BY_COUNTRY.DEFAULT;
  return byCountry[topicValue] || NEWS_TOPIC_QUERY_BY_COUNTRY.DEFAULT[topicValue] || "";
}
const DEFAULT_INSTAGRAM_AI_IMAGE_STYLE = "Cinematic photo-real";
const CUSTOM_FONT_ACCEPT = ".ttf,.otf,.ttc,.woff,.woff2";
const MIN_TEXT_FONT_SIZE = 8;
const MAX_TEXT_FONT_SIZE = 144;
const TEXT_FONT_SIZE_STEP = 2;
const DEFAULT_RUBY_GAP = 6;
const MIN_TEXT_OFFSET_Y = -120;
const MAX_TEXT_OFFSET_Y = 120;
const SENTENCE_READING_PAGE_FONT_STEP = 2;
const SENTENCE_READING_PAGE_FONT_MIN_DELTA = -12;
const SENTENCE_READING_PAGE_FONT_MAX_DELTA = 12;
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
const INSTAGRAM_AI_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "자동 (설정값)" },
  { value: "openai:gpt-image-1", label: "OpenAI · gpt-image-1" },
  { value: "gemini:gemini-3.1-flash-image-preview", label: "Gemini · gemini-3.1-flash-image-preview" },
  { value: "gemini:gemini-3-pro-image-preview", label: "Gemini · gemini-3-pro-image-preview" },
  { value: "gemini:gemini-2.5-flash-image", label: "Gemini · gemini-2.5-flash-image (저비용)" }
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
  "문장 읽기 명조",
  "Nanum Pen Script",
  "Gaegu",
  "Kyobo Handwriting 2019",
  "Segoe Print",
  "Brush Script MT",
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

function sanitizeTextBindingKey(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^\{\{+|\}\}+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function isAutoTextBindingKey(value: string): boolean {
  return String(value || "").trim().toLowerCase().startsWith(AUTO_TEXT_BINDING_KEY_PREFIX);
}

function buildAutoTextBindingKey(): string {
  return `${AUTO_TEXT_BINDING_KEY_PREFIX}${uid().replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}

function ensureUniqueTextBindingKey(candidate: string, taken: Set<string>): string {
  const base = sanitizeTextBindingKey(candidate) || buildAutoTextBindingKey();
  let next = base;
  let suffix = 2;
  while (taken.has(next.toLowerCase())) {
    next = `${base}_${suffix}`;
    suffix += 1;
  }
  taken.add(next.toLowerCase());
  return next;
}

function assignTemplateTextBindingKeys(template: InstagramTemplate): InstagramTemplate {
  const taken = new Set<string>();
  return {
    ...template,
    pages: template.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (element.type !== "text") {
          return element;
        }
        const nextKey = ensureUniqueTextBindingKey(
          sanitizeTextBindingKey(element.bindingKey) || buildAutoTextBindingKey(),
          taken
        );
        return {
          ...element,
          bindingKey: nextKey
        };
      })
    }))
  };
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
  if (normalizeFontName(primary).toLowerCase() === "문장 읽기 명조") {
    return [
      "Yu Mincho",
      "Hiragino Mincho ProN",
      "Hiragino Mincho Pro",
      "Noto Serif CJK JP",
      "Noto Serif JP",
      "Noto Serif KR",
      "Nanum Myeongjo",
      "AppleMyungjo",
      "Batang",
      "serif"
    ]
      .map((family) => (family === "serif" ? family : `"${family}"`))
      .join(", ");
  }
  if (normalizeFontName(primary).toLowerCase() === "nanum pen script") {
    return [
      "Nanum Pen Script",
      "Gaegu",
      "Kyobo Handwriting 2019",
      "Segoe Print",
      "Brush Script MT",
      "Apple Chancery",
      "cursive"
    ]
      .map((family) => (family === "cursive" ? family : `"${family}"`))
      .join(", ");
  }
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

function toInstagramMediaPreviewUrl(source: string): string {
  const value = String(source || "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase();
  if (lowered.startsWith("data:") || lowered.startsWith("blob:")) {
    return value;
  }
  if (value.startsWith("/api/instagram/media-proxy?")) {
    return value;
  }
  return `/api/instagram/media-proxy?source=${encodeURIComponent(value)}`;
}

function sanitizeDownloadName(value: string): string {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
  return normalized || "instagram-image";
}

function getMediaDownloadExtension(contentType: string | null, source: string, fallback: string): string {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("png")) return "png";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
  if (normalizedType.includes("webp")) return "webp";
  if (normalizedType.includes("gif")) return "gif";
  const match = String(source || "")
    .split("?")[0]
    .split("#")[0]
    .match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : fallback;
}

async function downloadMediaBlob(source: string, fileNameBase: string, fallbackExtension = "png"): Promise<void> {
  const raw = String(source || "").trim();
  if (!raw) {
    throw new Error("다운로드할 이미지가 없습니다.");
  }
  const response = await fetch(toInstagramMediaPreviewUrl(raw), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`이미지 다운로드 요청 실패 (${response.status})`);
  }
  const blob = await response.blob();
  const extension = getMediaDownloadExtension(response.headers.get("content-type") || blob.type, raw, fallbackExtension);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${sanitizeDownloadName(fileNameBase)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
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

function normalizeTextFontSize(value: number, fallback: number): number {
  return clamp(Math.round(Number(value)), MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE, fallback);
}

function normalizeRubyGap(value: unknown, fallback = DEFAULT_RUBY_GAP): number {
  return clamp(Number(value), 0, 32, fallback);
}

function normalizeTextOffsetY(value: unknown, fallback = 0): number {
  return clamp(Number(value), MIN_TEXT_OFFSET_Y, MAX_TEXT_OFFSET_Y, fallback);
}

function buildTextFontSizeOptions(currentValue: number): number[] {
  const normalizedCurrent = normalizeTextFontSize(currentValue, MIN_TEXT_FONT_SIZE);
  const values = new Set<number>();
  for (let size = MIN_TEXT_FONT_SIZE; size <= MAX_TEXT_FONT_SIZE; size += TEXT_FONT_SIZE_STEP) {
    values.add(size);
  }
  values.add(normalizedCurrent);
  return Array.from(values).sort((a, b) => a - b);
}

function isSentenceReadingBodyTextLayer(layer: InstagramPageElement): layer is InstagramTextElement {
  if (layer.type !== "text") {
    return false;
  }
  const bindingKey = String(layer.bindingKey || "").trim();
  if (["sentence_title", "sentence_page_number", "sentence_signature"].includes(bindingKey)) {
    return false;
  }
  const text = String(layer.text || "").trim();
  if (!text || text === "쑨에듀" || text === "오늘의 한자 표현" || /^\d{1,2}$/.test(text)) {
    return false;
  }
  if (/^오늘의\s*일본어\s*일기/.test(text)) {
    return false;
  }
  if (bindingKey === "sentence_content") {
    return true;
  }
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text) || /<ruby\b/i.test(text)) {
    return true;
  }
  return true;
}

function relayoutSentenceReadingBodyTextLayers(
  elements: InstagramPageElement[],
  pageName: string,
  canvasHeight: number
): InstagramPageElement[] {
  const bodyLayers = elements
    .filter(isSentenceReadingBodyTextLayer)
    .sort((a, b) => a.y - b.y || a.zIndex - b.zIndex);
  if (bodyLayers.length <= 1) {
    return elements;
  }

  const safeCanvasHeight = Math.max(1, Number(canvasHeight) || DEFAULT_CANVAS_HEIGHT);
  const isFirstCard = /일본어만|japanese\s*only/i.test(String(pageName || ""));
  const contentTop = isFirstCard ? 280 : 180;
  const contentBottom = isFirstCard ? 170 : 110;
  const availableHeight = Math.max(120, safeCanvasHeight - contentTop - contentBottom);
  const heightsById = new Map(
    bodyLayers.map((layer) => [
      layer.id,
      Math.max(24, (clamp(Number(layer.height), MIN_LAYER_SIZE_PERCENT, 100, layer.height) / 100) * safeCanvasHeight)
    ])
  );
  const totalLayerHeight = bodyLayers.reduce((sum, layer) => sum + (heightsById.get(layer.id) || 0), 0);
  const gapCount = Math.max(0, bodyLayers.length - 1);
  let gap = 0;
  if (gapCount > 0) {
    const naturalGap = (availableHeight - totalLayerHeight) / gapCount;
    gap = clamp(naturalGap, 10, isFirstCard ? 52 : 72, naturalGap);
    if (totalLayerHeight + gap * gapCount > availableHeight) {
      gap = 10;
    }
  }

  const stackHeight = totalLayerHeight + gap * gapCount;
  let cursor = contentTop + Math.max(0, (availableHeight - stackHeight) / 2);
  const nextYById = new Map<string, number>();
  bodyLayers.forEach((layer) => {
    const heightPx = heightsById.get(layer.id) || 24;
    const nextCenterYPx = cursor + heightPx / 2;
    nextYById.set(
      layer.id,
      clamp((nextCenterYPx / safeCanvasHeight) * 100, MIN_LAYER_SIZE_PERCENT / 2, 100 - MIN_LAYER_SIZE_PERCENT / 2, layer.y)
    );
    cursor += heightPx + gap;
  });

  return elements.map((layer) => {
    if (!isSentenceReadingBodyTextLayer(layer)) {
      return layer;
    }
    return {
      ...layer,
      y: nextYById.get(layer.id) ?? layer.y
    };
  });
}

function buildTextStyleSnapshot(layer: InstagramTextElement): TextStyleSnapshot {
  return {
    color: layer.color,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    rubyGap: normalizeRubyGap(layer.rubyGap),
    textOffsetY: normalizeTextOffsetY(layer.textOffsetY),
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
    backgroundOpacity: clamp(Number(layer.backgroundOpacity), 0, 1, 1),
    padding: layer.padding,
    opacity: layer.opacity
  };
}

function buildShapeStyleSnapshot(layer: InstagramShapeElement): ShapeStyleSnapshot {
  return {
    shape: layer.shape,
    fillEnabled: layer.fillEnabled,
    fillColor: layer.fillColor,
    fillOpacity: layer.fillOpacity,
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

function normalizeTemplateEditDraft(raw: unknown): InstagramTemplateEditDraft | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const item = raw as Partial<InstagramTemplateEditDraft>;
  if (!item.template || typeof item.template !== "object") {
    return undefined;
  }

  const normalizedTemplate = normalizeTemplateForEditor(item.template as InstagramTemplate);
  const focusPageCandidate = String(item.focusPageId || "").trim();
  const focusPageId = normalizedTemplate.pages.some((page) => page.id === focusPageCandidate)
    ? focusPageCandidate
    : undefined;

  const sampleDataRaw = item.sampleData && typeof item.sampleData === "object" ? item.sampleData : undefined;
  const sampleData: Record<string, string> = {};
  Object.entries((sampleDataRaw || {}) as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    sampleData[normalizedKey] = String(value ?? "");
  });
  const sourceFeedItem =
    item.sourceFeedItem && typeof item.sourceFeedItem === "object"
      ? (item.sourceFeedItem as InstagramGeneratedFeedItem)
      : undefined;

  return {
    createdAt: String(item.createdAt || new Date().toISOString()),
    source: item.source === "instagram-feed" ? "instagram-feed" : undefined,
    focusPageId,
    template: normalizedTemplate,
    sampleData: Object.keys(sampleData).length > 0 ? sampleData : undefined,
    sourceFeedItem
  };
}

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

function normalizeBindingFieldKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

const SENTENCE_READING_ROW_FIELD_KEYS = new Set(
  [
    "audioScript",
    "audio_script",
    "japaneseOnlyBlocks",
    "japanese_only_blocks",
    "rubyFrontLines",
    "ruby_front_lines",
    "rubyBackLines",
    "ruby_back_lines",
    "rubyLines",
    "ruby_lines",
    "bilingualFront",
    "bilingual_front",
    "bilingualBack",
    "bilingual_back",
    "bilingualLines",
    "bilingual_lines",
    "kanjiGlossary",
    "kanji_glossary",
    "grammarPatterns",
    "grammar_patterns",
    "postTitle",
    "post_title",
    "shortTitle",
    "short_title"
  ].map(normalizeBindingFieldKey)
);

function hasSentenceReadingRowData(values: Record<string, string>): boolean {
  return Object.entries(values || {}).some(([key, value]) => {
    if (!String(value ?? "").trim()) return false;
    return SENTENCE_READING_ROW_FIELD_KEYS.has(normalizeBindingFieldKey(key));
  });
}

function isNewsGeneratedSampleValue(field: string, value: string): boolean {
  const normalizedField = String(field || "").trim();
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return false;
  }
  if (normalizedField === "id" && /^news-[a-z]{2}-\d+$/i.test(normalizedValue)) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(DEFAULT_NEWS_SAMPLE_DATA, normalizedField)) {
    return normalizedValue === String(DEFAULT_NEWS_SAMPLE_DATA[normalizedField] || "").trim();
  }
  return false;
}

function sanitizeGeneralSampleData(
  current: Record<string, string>,
  selectedRowValues?: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = { ...DEFAULT_SAMPLE_DATA };
  Object.entries(current || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || NEWS_ONLY_BINDING_FIELD_SET.has(normalizedKey)) {
      return;
    }
    next[normalizedKey] = String(value ?? "");
  });

  Object.entries(selectedRowValues || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || NEWS_ONLY_BINDING_FIELD_SET.has(normalizedKey)) {
      return;
    }
    next[normalizedKey] = String(value ?? "");
  });

  DEFAULT_BINDING_FIELDS.forEach((field) => {
    const rowValue = selectedRowValues ? readBindingRowValue(selectedRowValues, field) : "";
    if (rowValue) {
      next[field] = rowValue;
      return;
    }
    if (isNewsGeneratedSampleValue(field, next[field] || "")) {
      next[field] = DEFAULT_SAMPLE_DATA[field] || "";
    }
  });

  return next;
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

function resolveTemplateMode(mode: unknown): InstagramTemplateMode {
  if (mode === "news" || mode === "sentence_reading") {
    return mode;
  }
  return "general";
}

function resolveAiImageOrientation(value: unknown): InstagramAiImageOrientation {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function resolveAiImageModel(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "auto";
  }
  const matched = INSTAGRAM_AI_MODEL_OPTIONS.find((item) => item.value === normalized);
  return matched ? matched.value : normalized;
}

function applyOrientationToPrompt(prompt: string, orientation: InstagramAiImageOrientation): string {
  const base = collapseWhitespace(prompt);
  if (!base) return base;
  const ratioHint = orientation === "horizontal" ? "16:9 horizontal" : "9:16 vertical";
  const cleaned = base
    .replace(/\b(16:9|9:16)\s*(horizontal|vertical|가로|세로|가로형|세로형)?/gi, "")
    .replace(/최종\s*화면비\s*우선\s*:\s*[^\n]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `${cleaned}\nASPECT_RATIO_REQUIRED: ${ratioHint}`;
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function splitTextForPages(value: string, maxCharsPerPage: number, maxPages: number): string[] {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return [];
  }
  const output: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0 && output.length < maxPages) {
    if (remaining.length <= maxCharsPerPage) {
      output.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf(" ", maxCharsPerPage);
    if (cut < Math.floor(maxCharsPerPage * 0.6)) {
      cut = maxCharsPerPage;
    }
    output.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0 && output.length > 0) {
    output[output.length - 1] = truncateText(`${output[output.length - 1]} ${remaining}`, maxCharsPerPage);
  }
  return output;
}

function normalizeNewsKeyword(value: string): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "");
  return normalized.slice(0, 20) || "news";
}

function buildNewsItemKey(item: GoogleNewsItem, index = 0): string {
  return `${item.link || "news"}::${item.publishedAt || index}`;
}

function formatNewsDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function mergeNewsBindingFields(fields: string[]): string[] {
  return mergeBindingFieldsWithDefaults(uniqueValues([...NEWS_BINDING_FIELDS, ...fields]));
}

function isSameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function buildNewsSamplePayload(args: {
  item: GoogleNewsItem;
  country: string;
  generatedImageUrl?: string;
  generatedImageUrls?: Record<string, string>;
}): Record<string, string> {
  const item = args.item;
  const title = collapseWhitespace(item.title || item.summaryOriginal || item.description);
  const titleKo = collapseWhitespace(item.titleKo || item.summaryKo || title);
  const summaryKo = collapseWhitespace(item.summaryKo || item.summaryOriginal || item.title);
  const summaryOriginal = collapseWhitespace(item.summaryOriginal || item.description || item.title);
  const detailKo = collapseWhitespace(item.detailKo || summaryKo || item.description || item.title);
  const detailOriginal = collapseWhitespace(item.detailOriginal || summaryOriginal || item.description || item.title);
  const summaryForBody = collapseWhitespace(summaryKo || detailKo || title);
  const bodyParts = splitTextForPages(summaryForBody, 220, 2);
  const keyword = normalizeNewsKeyword(item.source || "news");
  const publishedAt = formatNewsDateTime(item.publishedAt);
  const rowId = `news-${String(args.country || "kr").toLowerCase()}-${Date.now()}`;
  const imagePrompt = collapseWhitespace(item.imagePrompt || NEWS_IMAGE_PROMPT_FALLBACK);
  const generatedImageUrl = String(args.generatedImageUrl || "").trim();
  const page1ImageUrl = String(args.generatedImageUrls?.["1"] || generatedImageUrl).trim();
  const page2ImageUrl = String(args.generatedImageUrls?.["2"] || "").trim();
  const primaryImageUrl = String(page1ImageUrl || generatedImageUrl || page2ImageUrl).trim();

  return {
    id: rowId,
    status: "준비",
    type: "뉴스",
    keyword,
    subject: summaryKo || title,
    title,
    newsTitle: title,
    newsTitleKR: titleKo,
    newsTitle_KR: titleKo,
    news_title_kr: titleKo,
    news_title: title,
    newsBody: summaryForBody || bodyParts[0] || detailKo,
    news_body: summaryForBody || bodyParts[0] || detailKo,
    sourceArticleOriginal: detailOriginal,
    source_article_original: detailOriginal,
    sourceArticleKo: detailKo,
    source_article_ko: detailKo,
    description: bodyParts[0] || summaryForBody || detailKo,
    narration: bodyParts.join("\n\n") || summaryForBody || detailKo,
    source: item.source || "Google News",
    sourceName: item.source || "Google News",
    link: item.link,
    url: item.link,
    newsLink: item.link,
    news_link: item.link,
    articleLink: item.link,
    article_link: item.link,
    publishedAt,
    published_at: publishedAt,
    summaryKo,
    summary_ko: summaryKo,
    summaryOriginal,
    summary_original: summaryOriginal,
    detailKo,
    detail_ko: detailKo,
    detailOriginal,
    detail_original: detailOriginal,
    articleBodyKo: detailKo,
    article_body_ko: detailKo,
    articlePart1: bodyParts[0] || "",
    articlePart2: bodyParts[1] || "",
    article_part_1: bodyParts[0] || "",
    article_part_2: bodyParts[1] || "",
    imagePrompt,
    image_prompt: imagePrompt,
    newsImagePage1: page1ImageUrl,
    news_image_page1: page1ImageUrl,
    newsImagePage2: page2ImageUrl,
    news_image_page2: page2ImageUrl,
    newsImagePrimary: primaryImageUrl,
    news_image_primary: primaryImageUrl,
    imageUrl: primaryImageUrl,
    image_url: primaryImageUrl
  };
}

type NewsImageTarget = {
  pageId: string;
  pageIndex: number;
  layerId: string;
  orientation: InstagramAiImageOrientation;
  aiModel: string;
};

function collectNewsImageTargets(template: InstagramTemplate, maxTargets = 2): NewsImageTarget[] {
  const targets: NewsImageTarget[] = [];
  for (const [pageIndex, page] of (template.pages || []).entries()) {
    const imageLayer = page.elements.find((element) => element.type === "image");
    if (!imageLayer || imageLayer.type !== "image") {
      continue;
    }
    targets.push({
      pageId: page.id,
      pageIndex,
      layerId: imageLayer.id,
      orientation: resolveAiImageOrientation(imageLayer.aiImageOrientation),
      aiModel: resolveAiImageModel(imageLayer.aiModel)
    });
    if (targets.length >= Math.max(1, maxTargets)) {
      break;
    }
  }
  return targets;
}

function buildNewsImageVariantPrompt(args: {
  item: GoogleNewsItem;
  pageIndex: number;
  totalTargets: number;
}): string {
  const basePrompt = collapseWhitespace(args.item.imagePrompt || NEWS_IMAGE_PROMPT_FALLBACK);
  const titleKo = collapseWhitespace(args.item.titleKo || args.item.summaryKo || args.item.title);
  const detailKo = collapseWhitespace(args.item.detailKo || args.item.summaryKo || args.item.summaryOriginal || args.item.title);
  const pageNumber = args.pageIndex + 1;
  const roleHint =
    args.pageIndex === 0
      ? "첫 장 메인 컷: 뉴스의 핵심 상황을 한 눈에 보이는 대표 장면."
      : args.pageIndex === 1
        ? "둘째 장 보조 컷: 첫 장과 다른 장소/시점/구도의 장면."
        : `${pageNumber}번째 장면: 앞선 장면과 다른 초점으로 세부 맥락을 전달.`;
  const compositionHint =
    args.pageIndex === 0
      ? "wide establishing shot, clear focal point"
      : args.pageIndex === 1
        ? "different camera angle, medium shot, contextual details"
        : "different subject emphasis, cinematic composition";
  return [
    basePrompt,
    `뉴스 제목(한국어): ${titleKo}`,
    `핵심 내용: ${truncateText(detailKo, 220)}`,
    `장면 역할: ${roleHint}`,
    `프레이밍: ${compositionHint}`,
    `중요: 총 ${args.totalTargets}장 중 ${pageNumber}번째 컷. 다른 페이지와 인물 배치/구도/배경이 겹치지 않게 생성.`
  ]
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)
    .join("\n");
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
  payload.mode = resolveTemplateMode(payload.mode);
  payload.canvasWidth = normalizeCanvasWidth(Number(payload.canvasWidth));
  payload.canvasHeight = normalizeCanvasHeight(Number(payload.canvasHeight));
  payload.canvasPreset = resolveCanvasPresetId(payload.canvasWidth, payload.canvasHeight);
  payload.pageCount = payload.pages.length;
  payload.pageDurationSec = clamp(Number(payload.pageDurationSec), 1, 60, 4);
  payload.bgmUrl = String(payload.bgmUrl || "");
  payload.bgmEnabled = Boolean(payload.bgmEnabled && payload.bgmUrl.trim());
  payload.bgmVolume = clamp(Number(payload.bgmVolume), 0, 1, 0.18);
  payload.customFonts = normalizeCustomTemplateFonts(payload.customFonts);
  payload.updatedAt = new Date().toISOString();
  payload.pages = payload.pages.map((page) => ({
    ...page,
    durationSec: clamp(Number(page.durationSec), 1, 60, payload.pageDurationSec)
  }));
  return assignTemplateTextBindingKeys(ensureImagePromptVariableKeys(payload));
}

async function replaceTemplateDataUrlMedia(template: InstagramTemplate): Promise<InstagramTemplate> {
  const next = deepCloneTemplate(template);
  const bgmSource = String(next.bgmUrl || "").trim();
  if (bgmSource.startsWith("data:audio/")) {
    const response = await fetch(bgmSource);
    const blob = await response.blob();
    const extension =
      blob.type.includes("mpeg") || blob.type.includes("mp3")
        ? "mp3"
        : blob.type.includes("wav")
          ? "wav"
          : blob.type.includes("ogg")
            ? "ogg"
            : blob.type.includes("aac")
              ? "aac"
              : "m4a";
    next.bgmUrl = await uploadTemplateMediaFile(
      new File([blob], `template-bgm.${extension}`, { type: blob.type || "audio/mpeg" })
    );
  }
  for (const page of next.pages) {
    for (const element of page.elements) {
      if (element.type !== "image" && element.type !== "video") {
        continue;
      }
      const source = String(element.imageUrl || "").trim();
      if (!source.startsWith("data:image/") && !source.startsWith("data:video/")) {
        continue;
      }
      const response = await fetch(source);
      const blob = await response.blob();
      const extension =
        blob.type.includes("video/mp4")
          ? "mp4"
          : blob.type.includes("webm")
            ? "webm"
            : blob.type.includes("jpeg")
              ? "jpg"
              : blob.type.includes("webp")
                ? "webp"
                : "png";
      const file = new File([blob], `${element.type}-${element.id}.${extension}`, {
        type: blob.type || (element.type === "video" ? "video/mp4" : "image/png")
      });
      element.imageUrl = await uploadTemplateMediaFile(file);
      element.mediaType = element.type === "video" || file.type.startsWith("video/") ? "video" : "image";
    }
  }
  return next;
}

function buildAutosaveSignature(template: InstagramTemplate): string {
  const cloned = deepCloneTemplate(template);
  cloned.id = "";
  cloned.updatedAt = "";
  return JSON.stringify(cloned);
}

function ensureImagePromptVariableKeys(template: InstagramTemplate): InstagramTemplate {
  return {
    ...template,
    pages: template.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        if (element.type !== "image") {
          return element;
        }
        const explicit = sanitizeAiPromptVariableKey(String(element.aiPromptVariableKey || ""));
        const promptMatch = String(element.aiPrompt || "").match(/\{\{\s*([^}]+?)\s*\}\}/);
        const imageUrlMatch = String(element.imageUrl || "").match(/\{\{\s*([^}]+?)\s*\}\}/);
        return {
          ...element,
          aiPromptVariableKey:
            explicit ||
            sanitizeAiPromptVariableKey(String(promptMatch?.[1] || "")) ||
            sanitizeAiPromptVariableKey(String(imageUrlMatch?.[1] || ""))
        };
      })
    }))
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  const bodyText = (await response.text()).trim();
  const message =
    bodyText.startsWith("Request Entity")
      ? "요청 본문이 너무 큽니다. 큰 이미지/비디오 파일은 템플릿 JSON에 직접 저장할 수 없습니다."
      : bodyText || fallbackMessage;
  throw new Error(message);
}

function uploadWithProgress(args: {
  url: string;
  method: "PUT" | "POST";
  body: XMLHttpRequestBodyInit | Document;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(args.method, args.url);
    Object.entries(args.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !args.onProgress) return;
      args.onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / Math.max(1, event.total)) * 100))));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || `업로드 실패(HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Failed to fetch"));
    xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
    xhr.send(args.body);
  });
}

function uploadFormDataWithProgress(args: {
  url: string;
  formData: FormData;
  onProgress?: (percent: number) => void;
}): Promise<TemplateMediaUploadUrlResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", args.url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !args.onProgress) return;
      args.onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / Math.max(1, event.total)) * 100))));
    };
    xhr.onload = () => {
      const text = String(xhr.responseText || "").trim();
      let data: TemplateMediaUploadUrlResponse = {};
      try {
        data = text ? (JSON.parse(text) as TemplateMediaUploadUrlResponse) : {};
      } catch {
        reject(new Error(text || "템플릿 미디어 업로드에 실패했습니다."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress?.(100);
        resolve(data);
        return;
      }
      reject(new Error(data.error || `템플릿 미디어 업로드 실패(HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Failed to fetch"));
    xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
    xhr.send(args.formData);
  });
}

function uploadWithPresignedPost(args: {
  postUrl: string;
  fields: Record<string, string>;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframeName = `s3-post-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("S3 form 업로드 완료 신호를 제한 시간 내에 받지 못했습니다."));
    }, 10 * 60 * 1000);
    let submitted = false;
    let progress = 15;
    const progressTimer = window.setInterval(() => {
      progress = Math.min(95, progress + 4);
      args.onProgress?.(progress);
    }, 1200);

    function cleanup(): void {
      window.clearTimeout(timeout);
      window.clearInterval(progressTimer);
      iframe.remove();
      form.remove();
    }

    iframe.name = iframeName;
    iframe.style.display = "none";
    iframe.onload = () => {
      if (!submitted) return;
      try {
        const text = iframe.contentDocument?.body?.textContent || "";
        if (text.includes("\"ok\":true") || text.includes('"ok": true')) {
          args.onProgress?.(100);
          cleanup();
          resolve();
          return;
        }
      } catch {
        cleanup();
        reject(new Error("S3 form 업로드 후 완료 redirect를 확인하지 못했습니다."));
        return;
      }
      cleanup();
      reject(new Error("S3 form 업로드가 완료 응답 없이 종료되었습니다."));
    };

    form.action = args.postUrl;
    form.method = "POST";
    form.enctype = "multipart/form-data";
    form.target = iframeName;
    form.style.display = "none";

    Object.entries(args.fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.name = "file";
    try {
      const transfer = new DataTransfer();
      transfer.items.add(args.file);
      fileInput.files = transfer.files;
    } catch {
      cleanup();
      reject(new Error("브라우저가 form 기반 S3 업로드 파일 첨부를 지원하지 않습니다."));
      return;
    }
    form.appendChild(fileInput);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    args.onProgress?.(10);
    submitted = true;
    form.submit();
  });
}

async function uploadTemplateMediaFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const isVideoFile = file.type.toLowerCase().startsWith("video/");

  async function uploadViaAppServer(): Promise<string> {
    const formData = new FormData();
    formData.append("file", file, file.name || "template-media");
    const data = await uploadFormDataWithProgress({
      url: "/api/instagram/template-media/upload-url",
      formData,
      onProgress
    });
    if (!data.publicUrl) {
      throw new Error(data.error || "템플릿 미디어 업로드에 실패했습니다.");
    }
    return data.publicUrl;
  }

  async function uploadViaPresignedUrl(): Promise<string> {
    const metadataResponse = await fetch("/api/instagram/template-media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name || "template-media",
        contentType: file.type || "application/octet-stream",
        contentLength: file.size
      })
    });
    const metadata = await readJsonOrThrow<TemplateMediaUploadUrlResponse>(
      metadataResponse,
      "템플릿 미디어 업로드 URL을 생성하지 못했습니다."
    );
    if (!metadataResponse.ok || !metadata.publicUrl) {
      throw new Error(metadata.error || "템플릿 미디어 업로드 URL을 생성하지 못했습니다.");
    }
    if (metadata.uploadMethod === "post" || metadata.postUrl || metadata.fields) {
      if (!metadata.postUrl || !metadata.fields) {
        throw new Error("S3 form 업로드 정보가 불완전합니다.");
      }
      await uploadWithPresignedPost({
        postUrl: metadata.postUrl,
        fields: metadata.fields,
        file,
        onProgress
      });
      return metadata.publicUrl;
    }
    if (!metadata.uploadUrl) {
      throw new Error(metadata.error || "템플릿 미디어 업로드 URL을 생성하지 못했습니다.");
    }

    await uploadWithProgress({
      url: metadata.uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file,
      onProgress
    });
    return metadata.publicUrl;
  }

  if (file.size <= 4 * 1024 * 1024 || isVideoFile) {
    try {
      return await uploadViaAppServer();
    } catch (serverUploadError) {
      if (file.size <= 4 * 1024 * 1024) {
        throw serverUploadError;
      }
      const serverMessage = serverUploadError instanceof Error ? serverUploadError.message : String(serverUploadError || "");
      try {
        return await uploadViaPresignedUrl();
      } catch (directUploadError) {
        const directMessage = directUploadError instanceof Error ? directUploadError.message : String(directUploadError || "");
        throw new Error(
          `서버 경유 업로드 실패: ${serverMessage}\n` +
            `S3 직접 업로드 실패: ${directMessage}\n` +
            "비디오 업로드를 완료하려면 서버 경유 업로드 제한 안의 파일을 사용하거나 S3 버킷 CORS에 PUT 허용 설정이 필요합니다."
        );
      }
    }
  }

  try {
    return await uploadViaPresignedUrl();
  } catch (uploadError) {
    try {
      return uploadViaAppServer();
    } catch (serverUploadError) {
      const directMessage = uploadError instanceof Error ? uploadError.message : String(uploadError || "Failed to fetch");
      const serverMessage =
        serverUploadError instanceof Error ? serverUploadError.message : String(serverUploadError || "업로드 실패");
      throw new Error(
        `S3 직접 업로드 실패: ${directMessage}\n` +
          `서버 경유 업로드 실패: ${serverMessage}\n` +
          "S3 직접 업로드가 브라우저 CORS에서 차단되었거나 서버 업로드 제한을 초과했습니다."
      );
    }
  }
}

function isSupportedAudioFile(file: File): boolean {
  const normalizedType = String(file.type || "").toLowerCase();
  const normalizedName = String(file.name || "").toLowerCase();
  return (
    normalizedType.startsWith("audio/") ||
    /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(normalizedName)
  );
}

function createTextLayer(mode: "variable" | "plain" = "variable"): InstagramTextElement {
  return {
    id: uid(),
    type: "text",
    textMode: mode,
    bindingKey: buildAutoTextBindingKey(),
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
    rubyGap: DEFAULT_RUBY_GAP,
    textOffsetY: 0,
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
    backgroundOpacity: 1,
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
    fillOpacity: 1,
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
    cropX: 50,
    cropY: 50,
    borderRadius: 16,
    overlayColor: "#000000",
    overlayOpacity: 0,
    aiGenerateEnabled: false,
    aiModel: "auto",
    aiPrompt: "",
    aiPromptVariableKey: "",
    aiStylePreset: DEFAULT_INSTAGRAM_AI_IMAGE_STYLE,
    aiImageOrientation: "vertical"
  };
}

function createVideoLayer(): InstagramVideoElement {
  return {
    id: uid(),
    type: "video",
    x: 50,
    y: 57,
    width: 84,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    imageUrl: "",
    mediaType: "video",
    fit: "cover",
    cropX: 50,
    cropY: 50,
    borderRadius: 16,
    overlayColor: "#000000",
    overlayOpacity: 0,
    aiGenerateEnabled: true,
    aiModel: "auto",
    aiPrompt: "",
    aiPromptVariableKey: "",
    aiStylePreset: DEFAULT_INSTAGRAM_AI_IMAGE_STYLE,
    aiImageOrientation: "vertical",
    aiVideoEnabled: true,
    aiVideoProvider: "gemini",
    aiVideoPrompt: "no music, no camera movement, no subtitles",
    aiVideoDurationSec: 6,
    aiVideoResolution: "720p"
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
    audioUrl: "",
    audioPrompt: "",
    elements: [createShapeLayer("rectangle"), createTextLayer("variable"), createImageLayer()]
  };
}

function createTemplate(): InstagramTemplate {
  return {
    id: uid(),
    templateName: "Instagram Feed Template",
    mode: "general",
    sourceTitle: "{{subject}}",
    sourceTopic: "{{description}}",
    bgmEnabled: false,
    bgmUrl: "",
    bgmVolume: 0.18,
    hashtags: ["#shorts", "#instagram", "#콘텐츠"],
    hashtagSourceFields: ["subject", "keyword", "type"],
    captionSourceFields: ["Caption", "Subject"],
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

type SentenceReadingRubyLine = {
  html: string;
  plain: string;
};

type SentenceReadingBilingualLine = {
  jaHtml: string;
  jaPlain: string;
  ko: string;
};

type SentenceReadingKanjiItem = {
  reading: string;
  word: string;
  meaning: string;
};

type SentenceReadingCardSet = {
  audioScript: string;
  bilingualBack: SentenceReadingBilingualLine[];
  bilingualFront: SentenceReadingBilingualLine[];
  hashtags: string;
  japaneseOnlyBlocks: string[];
  jlptLevel: string;
  kanjiGlossary: SentenceReadingKanjiItem[];
  postTitle: string;
  rubyBackLines: SentenceReadingRubyLine[];
  rubyFrontLines: SentenceReadingRubyLine[];
  title: string;
};

const SENTENCE_READING_SERIF_FONT = "문장 읽기 명조";
const SENTENCE_READING_SAFE_WIDTH = 76;

const SENTENCE_READING_SAMPLE: SentenceReadingCardSet = {
  title: "오늘의 일본어 일기 | 한국 워홀 일상",
  postTitle: "JLPT N5~N4 일본어 일기｜한국 워홀 일상",
  jlptLevel: "N5~N4",
  audioScript:
    "今日はアルバイトが早く終わったので、\n帰りにコンビニでキンパを買いました。\n\n韓国でのワーホリ生活にも、\n少しずつ慣れてきて、\n前より不安が少なくなりました。\n\n夜は部屋でラテを飲みながら、\n家族にメッセージを送りました。\n\n大変な日もありますが、\n今の毎日を大切にしたいです。",
  japaneseOnlyBlocks: [
    "今日はアルバイトが早く終わったので、\n帰りにコンビニでキンパを買いました。",
    "韓国でのワーホリ生活にも、\n少しずつ慣れてきて、\n前より不安が少なくなりました。",
    "夜は部屋でラテを飲みながら、\n家族にメッセージを送りました。",
    "大変な日もありますが、\n今の毎日を大切にしたいです。"
  ],
  rubyFrontLines: [
    {
      plain: "今日はアルバイトが早く終わったので、",
      html: "<ruby>今日<rt>きょう</rt></ruby>はアルバイトが<ruby>早<rt>はや</rt></ruby>く<ruby>終<rt>お</rt></ruby>わったので、"
    },
    {
      plain: "帰りにコンビニでキンパを買いました。",
      html: "<ruby>帰<rt>かえ</rt></ruby>りにコンビニでキンパを<ruby>買<rt>か</rt></ruby>いました。"
    },
    {
      plain: "韓国でのワーホリ生活にも、",
      html: "<ruby>韓国<rt>かんこく</rt></ruby>でのワーホリ<ruby>生活<rt>せいかつ</rt></ruby>にも、"
    },
    {
      plain: "少しずつ慣れてきて、",
      html: "<ruby>少<rt>すこ</rt></ruby>しずつ<ruby>慣<rt>な</rt></ruby>れてきて、"
    },
    {
      plain: "前より不安が少なくなりました。",
      html: "<ruby>前<rt>まえ</rt></ruby>より<ruby>不安<rt>ふあん</rt></ruby>が<ruby>少<rt>すく</rt></ruby>なくなりました。"
    }
  ],
  rubyBackLines: [
    {
      plain: "夜は部屋でラテを飲みながら、",
      html: "<ruby>夜<rt>よる</rt></ruby>は<ruby>部屋<rt>へや</rt></ruby>でラテを<ruby>飲<rt>の</rt></ruby>みながら、"
    },
    {
      plain: "家族にメッセージを送りました。",
      html: "<ruby>家族<rt>かぞく</rt></ruby>にメッセージを<ruby>送<rt>おく</rt></ruby>りました。"
    },
    {
      plain: "大変な日もありますが、",
      html: "<ruby>大変<rt>たいへん</rt></ruby>な<ruby>日<rt>ひ</rt></ruby>もありますが、"
    },
    {
      plain: "今の毎日を大切にしたいです。",
      html: "<ruby>今<rt>いま</rt></ruby>の<ruby>毎日<rt>まいにち</rt></ruby>を<ruby>大切<rt>たいせつ</rt></ruby>にしたいです。"
    }
  ],
  bilingualFront: [
    {
      jaPlain: "今日はアルバイトが早く終わったので、",
      jaHtml: "<ruby>今日<rt>きょう</rt></ruby>はアルバイトが<ruby>早<rt>はや</rt></ruby>く<ruby>終<rt>お</rt></ruby>わったので、",
      ko: "오늘은 아르바이트가 일찍 끝났기 때문에"
    },
    {
      jaPlain: "帰りにコンビニでキンパを買いました。",
      jaHtml: "<ruby>帰<rt>かえ</rt></ruby>りにコンビニでキンパを<ruby>買<rt>か</rt></ruby>いました。",
      ko: "돌아오는 길에 편의점에서 김밥을 샀습니다."
    },
    {
      jaPlain: "韓国でのワーホリ生活にも、",
      jaHtml: "<ruby>韓国<rt>かんこく</rt></ruby>でのワーホリ<ruby>生活<rt>せいかつ</rt></ruby>にも、",
      ko: "한국에서의 워홀 생활에도"
    },
    {
      jaPlain: "少しずつ慣れてきて、",
      jaHtml: "<ruby>少<rt>すこ</rt></ruby>しずつ<ruby>慣<rt>な</rt></ruby>れてきて、",
      ko: "조금씩 익숙해져서"
    },
    {
      jaPlain: "前より不安が少なくなりました。",
      jaHtml: "<ruby>前<rt>まえ</rt></ruby>より<ruby>不安<rt>ふあん</rt></ruby>が<ruby>少<rt>すく</rt></ruby>なくなりました。",
      ko: "전보다 불안이 줄어들었습니다."
    }
  ],
  bilingualBack: [
    {
      jaPlain: "夜は部屋でラテを飲みながら、",
      jaHtml: "<ruby>夜<rt>よる</rt></ruby>は<ruby>部屋<rt>へや</rt></ruby>でラテを<ruby>飲<rt>の</rt></ruby>みながら、",
      ko: "밤에는 방에서 라떼를 마시면서"
    },
    {
      jaPlain: "家族にメッセージを送りました。",
      jaHtml: "<ruby>家族<rt>かぞく</rt></ruby>にメッセージを<ruby>送<rt>おく</rt></ruby>りました。",
      ko: "가족에게 메시지를 보냈습니다."
    },
    {
      jaPlain: "大変な日もありますが、",
      jaHtml: "<ruby>大変<rt>たいへん</rt></ruby>な<ruby>日<rt>ひ</rt></ruby>もありますが、",
      ko: "힘든 날도 있지만"
    },
    {
      jaPlain: "今の毎日を大切にしたいです。",
      jaHtml: "<ruby>今<rt>いま</rt></ruby>の<ruby>毎日<rt>まいにち</rt></ruby>を<ruby>大切<rt>たいせつ</rt></ruby>にしたいです。",
      ko: "지금의 매일을 소중히 하고 싶습니다."
    }
  ],
  kanjiGlossary: [
    { reading: "きょう", word: "今日", meaning: "오늘" },
    { reading: "はやく", word: "早く", meaning: "일찍, 빨리" },
    { reading: "おわった", word: "終わった", meaning: "끝났다" },
    { reading: "かえり", word: "帰り", meaning: "돌아오는 길" },
    { reading: "かいました", word: "買いました", meaning: "샀습니다" },
    { reading: "かんこく", word: "韓国", meaning: "한국" },
    { reading: "せいかつ", word: "生活", meaning: "생활" },
    { reading: "すこし", word: "少し", meaning: "조금" },
    { reading: "なれて", word: "慣れて", meaning: "익숙해져서" },
    { reading: "まえ", word: "前", meaning: "전" },
    { reading: "ふあん", word: "不安", meaning: "불안" },
    { reading: "すくなく", word: "少なく", meaning: "적게, 줄어" },
    { reading: "よる", word: "夜", meaning: "밤" },
    { reading: "へや", word: "部屋", meaning: "방" },
    { reading: "のみながら", word: "飲みながら", meaning: "마시면서" },
    { reading: "かぞく", word: "家族", meaning: "가족" },
    { reading: "おくりました", word: "送りました", meaning: "보냈습니다" },
    { reading: "たいへん", word: "大変", meaning: "힘듦, 큰일" },
    { reading: "ひ", word: "日", meaning: "날" },
    { reading: "いま", word: "今", meaning: "지금" },
    { reading: "まいにち", word: "毎日", meaning: "매일" },
    { reading: "たいせつ", word: "大切", meaning: "소중함" }
  ],
  hashtags:
    "#일본어공부 #일본어읽기 #일본어일기 #JLPTN5 #JLPTN4 #일본어회화 #기초일본어 #초급일본어 #쑨에듀\n#日本語 #日本語学習 #日本語日記 #やさしい日本語 #JLPT #毎日日本語"
};

function safeJsonParse<T>(value: string, fallback: T): T {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sentencePaperSvgDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="lightA" cx="20%" cy="10%" r="45%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".78"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <radialGradient id="lightB" cx="80%" cy="70%" r="42%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".45"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <pattern id="gridA" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M0 0H13M0 0V13" stroke="#3c3228" stroke-opacity=".035" stroke-width="1"/></pattern>
    <pattern id="gridB" width="17" height="17" patternUnits="userSpaceOnUse"><path d="M0 0H17M0 0V17" stroke="#3c3228" stroke-opacity=".025" stroke-width="1"/></pattern>
    <pattern id="fiberA" width="9" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(100)"><path d="M0 0V64" stroke="#5f5546" stroke-opacity=".05" stroke-width="1"/></pattern>
    <pattern id="fiberB" width="11" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(10)"><path d="M0 0V64" stroke="#ffffff" stroke-opacity=".22" stroke-width="1"/></pattern>
  </defs>
  <rect width="1080" height="1350" fill="#f8f6f0"/>
  <rect width="1080" height="1350" fill="url(#lightA)"/>
  <rect width="1080" height="1350" fill="url(#lightB)"/>
  <rect width="1080" height="1350" fill="url(#gridA)"/>
  <rect width="1080" height="1350" fill="url(#gridB)"/>
  <rect width="1080" height="1350" fill="url(#fiberA)" opacity=".28"/>
  <rect width="1080" height="1350" fill="url(#fiberB)" opacity=".28"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function splitDiaryParagraphs(value: string): string[] {
  return String(value || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitFrontBack<T>(items: T[]): { front: T[]; back: T[] } {
  const middle = Math.ceil(items.length / 2);
  return {
    front: items.slice(0, middle),
    back: items.slice(middle)
  };
}

function readSentenceField(sampleData: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = resolveSampleValueByKey(sampleData, key);
    if (String(value || "").trim()) {
      return String(value || "").trim();
    }
  }
  return "";
}

function normalizeSentenceReadingCardSet(sampleData: Record<string, string>): SentenceReadingCardSet {
  const audioScript =
    readSentenceField(sampleData, ["audioScript", "audio_script", "diaryBody", "diary_body", "japaneseDiary", "japanese_diary", "body"]) ||
    SENTENCE_READING_SAMPLE.audioScript;
  const japaneseOnlyBlocks = safeJsonParse<string[]>(
    readSentenceField(sampleData, ["japaneseOnlyBlocks", "japanese_only_blocks"]),
    []
  );
  const rubyFrontLines = safeJsonParse<SentenceReadingRubyLine[]>(
    readSentenceField(sampleData, ["rubyFrontLines", "ruby_front_lines"]),
    []
  );
  const rubyBackLines = safeJsonParse<SentenceReadingRubyLine[]>(
    readSentenceField(sampleData, ["rubyBackLines", "ruby_back_lines"]),
    []
  );
  const rubyLines = safeJsonParse<SentenceReadingRubyLine[]>(
    readSentenceField(sampleData, ["rubyLines", "ruby_lines"]),
    []
  );
  const splitRubyLines = splitFrontBack(rubyLines);
  const bilingualFront = safeJsonParse<SentenceReadingBilingualLine[]>(
    readSentenceField(sampleData, ["bilingualFront", "bilingual_front"]),
    []
  );
  const bilingualBack = safeJsonParse<SentenceReadingBilingualLine[]>(
    readSentenceField(sampleData, ["bilingualBack", "bilingual_back"]),
    []
  );
  const bilingualLines = safeJsonParse<SentenceReadingBilingualLine[]>(
    readSentenceField(sampleData, ["bilingualLines", "bilingual_lines"]),
    []
  );
  const splitBilingualLines = splitFrontBack(bilingualLines);
  const kanjiGlossary = safeJsonParse<SentenceReadingKanjiItem[]>(
    readSentenceField(sampleData, ["kanjiGlossary", "kanji_glossary"]),
    []
  );
  const title =
    readSentenceField(sampleData, ["title", "shortTitle", "short_title", "Subject", "subject", "topic"]) ||
    SENTENCE_READING_SAMPLE.title;
  return {
    title,
    postTitle: readSentenceField(sampleData, ["postTitle", "post_title", "Caption", "caption"]) || title,
    jlptLevel: readSentenceField(sampleData, ["jlptLevel", "jlpt_level", "jlpt"]) || SENTENCE_READING_SAMPLE.jlptLevel,
    audioScript,
    japaneseOnlyBlocks: japaneseOnlyBlocks.length > 0 ? japaneseOnlyBlocks : splitDiaryParagraphs(audioScript),
    rubyFrontLines:
      rubyFrontLines.length > 0 ? rubyFrontLines : splitRubyLines.front.length > 0 ? splitRubyLines.front : SENTENCE_READING_SAMPLE.rubyFrontLines,
    rubyBackLines:
      rubyBackLines.length > 0 ? rubyBackLines : splitRubyLines.back.length > 0 ? splitRubyLines.back : SENTENCE_READING_SAMPLE.rubyBackLines,
    bilingualFront:
      bilingualFront.length > 0 ? bilingualFront : splitBilingualLines.front.length > 0 ? splitBilingualLines.front : SENTENCE_READING_SAMPLE.bilingualFront,
    bilingualBack:
      bilingualBack.length > 0 ? bilingualBack : splitBilingualLines.back.length > 0 ? splitBilingualLines.back : SENTENCE_READING_SAMPLE.bilingualBack,
    kanjiGlossary: kanjiGlossary.length > 0 ? kanjiGlossary : SENTENCE_READING_SAMPLE.kanjiGlossary,
    hashtags: readSentenceField(sampleData, ["hashtags", "hashTags", "tags"]) || SENTENCE_READING_SAMPLE.hashtags
  };
}

function makeSentenceLayerText(args: {
  text: string;
  x?: number;
  y: number;
  width?: number;
  height: number;
  fontSize: number;
  lineHeight?: number;
  zIndex: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  fontFamily?: string;
  rotation?: number;
  bindingKey?: string;
}): InstagramTextElement {
  return {
    ...createTextLayer("plain"),
    bindingKey: args.bindingKey || "sentence_content",
    text: args.text,
    x: args.x ?? 50,
    y: args.y,
    width: args.width ?? SENTENCE_READING_SAFE_WIDTH,
    height: args.height,
    zIndex: args.zIndex,
    color: args.color || "#1F1F1F",
    fontFamily: args.fontFamily || SENTENCE_READING_SERIF_FONT,
    fontSize: args.fontSize,
    lineHeight: args.lineHeight ?? 1.8,
    rotation: args.rotation ?? 0,
    letterSpacing: 0.6,
    textAlign: args.align || "center",
    bold: Boolean(args.bold),
    backgroundColor: "#FFFFFF",
    backgroundOpacity: 0,
    padding: 0,
    autoWrap: true
  };
}

function pctX(px: number): number {
  return (px / DEFAULT_CANVAS_WIDTH) * 100;
}

function pctY(px: number): number {
  return (px / DEFAULT_CANVAS_HEIGHT) * 100;
}

function sentenceTextLayerFromPx(args: {
  text: string;
  centerX?: number;
  centerY: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight?: number;
  zIndex: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  fontFamily?: string;
  rotation?: number;
  bindingKey?: string;
}): InstagramTextElement {
  return makeSentenceLayerText({
    text: args.text,
    x: pctX(args.centerX ?? DEFAULT_CANVAS_WIDTH / 2),
    y: pctY(args.centerY),
    width: pctX(args.width),
    height: pctY(args.height),
    fontSize: args.fontSize,
    lineHeight: args.lineHeight,
    zIndex: args.zIndex,
    color: args.color,
    align: args.align,
    bold: args.bold,
    fontFamily: args.fontFamily,
    rotation: args.rotation,
    bindingKey: args.bindingKey
  });
}

function makeSentenceShape(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  rotation?: number;
  shape?: InstagramShapeType;
}): InstagramShapeElement {
  return {
    ...createShapeLayer(args.shape || "roundedRectangle"),
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    zIndex: args.zIndex,
    fillColor: args.fillColor || "#F8F6F0",
    fillOpacity: 1,
    strokeColor: args.strokeColor || "#DED8CA",
    strokeWidth: args.strokeWidth ?? 2,
    rotation: args.rotation ?? 0,
    cornerRadius: args.cornerRadius ?? 22
  };
}

function sentenceBrandSvgDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
    <path d="M75 19c9 2 15 11 13 21-2 12-12 20-24 18-10-2-17-11-16-21 2-12 12-21 27-18Z" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <path d="M63 35h.1M78 38h.1M69 48c4 2 8 1 11-2" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 58c-7 8-9 19-5 32M88 58c8 11 10 22 7 34" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <path d="M24 55l36 20v42L25 96 24 55Z" fill="#f0f6ec" stroke="#5f7d62" stroke-width="4" stroke-linejoin="round"/>
    <path d="M60 75l36-16v40l-36 18V75Z" fill="#edf5e9" stroke="#5f7d62" stroke-width="4" stroke-linejoin="round"/>
    <path d="M42 92c8 4 18 6 28 2" stroke="#111" stroke-width="6" stroke-linecap="round"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeSentenceBrandLayer(zIndex: number): InstagramImageElement {
  return {
    ...createImageLayer(),
    imageUrl: sentenceBrandSvgDataUrl(),
    x: pctX(DEFAULT_CANVAS_WIDTH - 88 - 64),
    y: pctY(DEFAULT_CANVAS_HEIGHT - 100 - 66),
    width: pctX(128),
    height: pctY(132),
    fit: "contain",
    borderRadius: 0,
    zIndex
  };
}

function makeSentenceSignatureLayer(zIndex: number): InstagramTextElement {
  return {
    ...sentenceTextLayerFromPx({
      text: "쑨에듀",
      centerX: DEFAULT_CANVAS_WIDTH - 77 - 75,
      centerY: DEFAULT_CANVAS_HEIGHT - 74 - 16,
      width: 150,
      height: 42,
      fontSize: 30,
      lineHeight: 1,
      zIndex,
      color: "#2C362A",
      bindingKey: "sentence_signature"
    }),
    fontFamily: "Nanum Pen Script",
    rotation: -7,
    opacity: 0.86,
    letterSpacing: 0.6,
    shadowEnabled: true,
    shadowColor: "#FFFFFF",
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 1
  };
}

function buildSentenceBaseElements(cardSet: SentenceReadingCardSet, pageNumber: number, titleTop = pctY(74 + 24)): InstagramPageElement[] {
  return [
    makeSentenceLayerText({
      text: cardSet.title,
      y: titleTop,
      width: 68,
      height: 8,
      fontSize: 34,
      lineHeight: 1.35,
      zIndex: 2,
      color: "#333333",
      bold: true,
      bindingKey: "sentence_title"
    }),
    makeSentenceShape({
      x: pctX(DEFAULT_CANVAS_WIDTH - 72 - 36),
      y: pctY(54 + 36),
      width: pctX(72),
      height: pctY(72),
      zIndex: 3,
      shape: "circle",
      fillColor: "#FFFFFF",
      strokeColor: "#6A5F52",
      strokeWidth: 2,
      rotation: -7
    }),
    makeSentenceLayerText({
      text: String(pageNumber).padStart(2, "0"),
      x: pctX(DEFAULT_CANVAS_WIDTH - 72 - 36),
      y: pctY(54 + 36),
      width: pctX(62),
      height: pctY(50),
      fontSize: 40,
      lineHeight: 1,
      zIndex: 4,
      color: "#5A5348",
      bold: true,
      fontFamily: "Brush Script MT",
      rotation: -7,
      bindingKey: "sentence_page_number"
    }),
    makeSentenceBrandLayer(20),
    makeSentenceSignatureLayer(21)
  ];
}

function createSentencePage(name: string, elements: InstagramPageElement[]): InstagramFeedPage {
  return {
    ...createPage(0),
    id: uid(),
    name,
    backgroundColor: "#F8F6F0",
    backgroundImageUrl: sentencePaperSvgDataUrl(),
    backgroundFit: "cover",
    durationSec: 4,
    audioEnabled: false,
    audioPrompt: "",
    elements
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function buildKanjiText(items: SentenceReadingKanjiItem[]): string {
  return items.map((item) => `${item.reading}\n${item.word}\n${item.meaning}`).filter(Boolean).join("\n\n");
}

function lineCount(value: string): number {
  return Math.max(1, String(value || "").split("\n").length);
}

function buildJapaneseOnlyTextLayers(blocks: string[]): InstagramTextElement[] {
  const contentTop = 280;
  const contentBottom = 170;
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const gap = 52;
  const blockHeights = blocks.map((block) => Math.max(1, lineCount(block)) * 41 * 1.52);
  const totalHeight = blockHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, blocks.length - 1) * gap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  return blocks.map((block, index) => {
    const height = blockHeights[index] || 72;
    const layer = sentenceTextLayerFromPx({
      text: block,
      centerY: cursor + height / 2,
      width: 856,
      height: height + 16,
      fontSize: 41,
      lineHeight: 1.52,
      zIndex: 5 + index
    });
    cursor += height + gap;
    return layer;
  });
}

function buildRubyLineLayers(lines: SentenceReadingRubyLine[], options: { back?: boolean }): InstagramTextElement[] {
  const count = Math.max(1, lines.length);
  const lineHeight = 84;
  const gap = options.back ? 96 : 78;
  const contentTop = 180;
  const contentBottom = 110;
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const totalHeight = count * lineHeight + Math.max(0, count - 1) * gap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  return lines.map((line, index) => {
    const layer = sentenceTextLayerFromPx({
      text: line.html || line.plain,
      centerY: cursor + lineHeight / 2,
      width: 820,
      height: lineHeight + 20,
      fontSize: 42,
      lineHeight: 2,
      zIndex: 5 + index
    });
    cursor += lineHeight + gap;
    return layer;
  });
}

function buildBilingualPairLayers(lines: SentenceReadingBilingualLine[], options: { back?: boolean }): InstagramTextElement[] {
  const layers: InstagramTextElement[] = [];
  const jpHeight = 64;
  const koHeight = 40;
  const innerGap = 8;
  const pairGap = options.back ? 56 : 36;
  const pairHeight = jpHeight + innerGap + koHeight;
  const contentTop = 180;
  const contentBottom = 110;
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const totalHeight = lines.length * pairHeight + Math.max(0, lines.length - 1) * pairGap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  lines.forEach((line, index) => {
    layers.push(
      sentenceTextLayerFromPx({
        text: line.jaHtml || line.jaPlain,
        centerY: cursor + jpHeight / 2,
        width: 820,
        height: jpHeight + 18,
        fontSize: 37,
        lineHeight: 1.72,
        zIndex: 5 + index * 2
      })
    );
    layers.push(
      sentenceTextLayerFromPx({
        text: line.ko,
        centerY: cursor + jpHeight + innerGap + koHeight / 2,
        width: 820,
        height: koHeight + 8,
        fontSize: 29,
        lineHeight: 1.35,
        zIndex: 6 + index * 2,
        color: "#333333"
      })
    );
    cursor += pairHeight + pairGap;
  });
  return layers;
}

function buildSentenceReadingPages(cardSet: SentenceReadingCardSet): InstagramFeedPage[] {
  const pages: InstagramFeedPage[] = [];
  const firstBlocks = cardSet.japaneseOnlyBlocks.length > 0 ? cardSet.japaneseOnlyBlocks : splitDiaryParagraphs(cardSet.audioScript);
  pages.push(
    createSentencePage("01 일본어만 보기", [
      ...buildSentenceBaseElements(cardSet, 1, pctY(90 + 24)),
      ...buildJapaneseOnlyTextLayers(firstBlocks)
    ])
  );

  pages.push(
    createSentencePage("02 루비 앞부분", [
      ...buildSentenceBaseElements(cardSet, 2),
      ...buildRubyLineLayers(cardSet.rubyFrontLines, {})
    ])
  );
  pages.push(
    createSentencePage("03 루비 뒷부분", [
      ...buildSentenceBaseElements(cardSet, 3),
      ...buildRubyLineLayers(cardSet.rubyBackLines, { back: true })
    ])
  );
  pages.push(
    createSentencePage("04 뜻 앞부분", [
      ...buildSentenceBaseElements(cardSet, 4),
      ...buildBilingualPairLayers(cardSet.bilingualFront, {})
    ])
  );
  pages.push(
    createSentencePage("05 뜻 뒷부분", [
      ...buildSentenceBaseElements(cardSet, 5),
      ...buildBilingualPairLayers(cardSet.bilingualBack, { back: true })
    ])
  );

  const kanjiChunks = chunkItems(cardSet.kanjiGlossary, 16);
  kanjiChunks.forEach((chunk, index) => {
    const pageNumber = 6 + index;
    const half = Math.ceil(chunk.length / 2);
    const leftItems = chunk.slice(0, half);
    const rightItems = chunk.slice(half);
    pages.push(
      createSentencePage(`${String(pageNumber).padStart(2, "0")} 한자 표현`, [
        ...buildSentenceBaseElements(cardSet, pageNumber),
        makeSentenceLayerText({
          text: "오늘의 한자 표현",
          y: pctY(178),
          height: 6,
          fontSize: 38,
          lineHeight: 1.2,
          zIndex: 5,
          bold: true
        }),
        makeSentenceLayerText({
          text: buildKanjiText(leftItems),
          y: pctY(724),
          x: pctX(315),
          width: pctX(320),
          height: pctY(780),
          fontSize: 28,
          lineHeight: 1.08,
          zIndex: 6
        }),
        makeSentenceLayerText({
          text: buildKanjiText(rightItems),
          y: pctY(724),
          x: pctX(765),
          width: pctX(320),
          height: pctY(780),
          fontSize: 28,
          lineHeight: 1.08,
          zIndex: 7
        })
      ])
    );
  });
  return pages;
}

function buildSentenceInstagramDescription(cardSet: SentenceReadingCardSet): string {
  return [
    `${cardSet.postTitle}`,
    "",
    `JLPT ${cardSet.jlptLevel} 수준의 일본어 읽기 콘텐츠입니다.`,
    "",
    "먼저 일본어만 읽고, 그다음 루비와 뜻을 보면서 다시 읽어보세요.",
    "",
    cardSet.hashtags
  ].join("\n");
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob());
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sentenceReadingPngFileName(page: InstagramFeedPage, index: number): string {
  return `${String(index + 1).padStart(2, "0")}_${sanitizeDownloadName(page.name || `card-${index + 1}`)}.png`;
}

function normalizeTemplateHashtags(value: unknown): string[] {
  const blocked = new Set(["#한겨레"]);
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tag) => String(tag || "").trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .filter((tag) => !blocked.has(tag))
    .slice(0, 20);
}

function normalizeTemplateForEditor(template: InstagramTemplate): InstagramTemplate {
  const normalized = deepCloneTemplate(template);
  normalized.mode = resolveTemplateMode(normalized.mode);
  const normalizedCanvasWidth = normalizeCanvasWidth(Number(normalized.canvasWidth));
  const normalizedCanvasHeight = normalizeCanvasHeight(Number(normalized.canvasHeight));
  normalized.canvasWidth = normalizedCanvasWidth;
  normalized.canvasHeight = normalizedCanvasHeight;
  normalized.canvasPreset = resolveCanvasPresetId(normalizedCanvasWidth, normalizedCanvasHeight);
  normalized.pageDurationSec = clamp(Number(normalized.pageDurationSec), 1, 60, 4);
  normalized.bgmUrl = String((normalized as { bgmUrl?: unknown }).bgmUrl || "");
  normalized.bgmEnabled =
    typeof (normalized as { bgmEnabled?: unknown }).bgmEnabled === "boolean"
      ? Boolean((normalized as { bgmEnabled?: unknown }).bgmEnabled)
      : Boolean(normalized.bgmUrl.trim());
  normalized.bgmVolume = clamp(Number((normalized as { bgmVolume?: unknown }).bgmVolume), 0, 1, 0.18);
  normalized.hashtags = normalizeTemplateHashtags((normalized as { hashtags?: unknown }).hashtags);
  normalized.hashtagSourceFields = Array.isArray((normalized as { hashtagSourceFields?: unknown }).hashtagSourceFields)
    ? ((normalized as { hashtagSourceFields?: unknown }).hashtagSourceFields as unknown[])
        .map((field) => String(field || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : ["subject", "keyword", "type"];
  normalized.captionSourceFields = Array.isArray((normalized as { captionSourceFields?: unknown }).captionSourceFields)
    ? ((normalized as { captionSourceFields?: unknown }).captionSourceFields as unknown[])
        .map((field) => String(field || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : ["Caption", "Subject"];
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
    audioUrl: String(page.audioUrl || ""),
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
            height: size.height,
            fillOpacity: clamp(Number((core as InstagramShapeElement).fillOpacity), 0, 1, 1)
          } as InstagramShapeElement;
        }
        if (core.type === "image" || core.type === "video") {
          return {
            ...core,
            type: core.type === "video" ? "video" : "image",
            mediaType: core.type === "video" ? "video" : "image",
            aiGenerateEnabled: Boolean(core.aiGenerateEnabled),
            aiModel: resolveAiImageModel(core.aiModel),
            aiPrompt: String(core.aiPrompt || ""),
            aiPromptVariableKey: String(core.aiPromptVariableKey || "").trim(),
            aiStylePreset: String(core.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE),
            aiImageOrientation: resolveAiImageOrientation(core.aiImageOrientation),
            aiVideoEnabled: core.type === "video" && Boolean((core as InstagramVideoElement).aiVideoEnabled),
            aiVideoProvider: (core as InstagramVideoElement).aiVideoProvider === "openai" ? "openai" : "gemini",
            aiVideoPrompt:
              String((core as InstagramVideoElement).aiVideoPrompt || "").trim() ||
              "no music, no camera movement, no subtitles",
            aiVideoDurationSec: Math.max(4, Math.min(8, Math.round(Number((core as InstagramVideoElement).aiVideoDurationSec) || 6))),
            aiVideoResolution: (core as InstagramVideoElement).aiVideoResolution === "1080p" ? "1080p" : "720p"
          } as InstagramImageElement | InstagramVideoElement;
        }
        if (core.type === "text") {
          return {
            ...core,
            bindingKey: sanitizeTextBindingKey(core.bindingKey),
            autoWrap: core.autoWrap !== false,
            fontSize: normalizeTextFontSize(Number(core.fontSize), 56),
            backgroundOpacity: clamp(Number(core.backgroundOpacity), 0, 1, 1)
          } as InstagramTextElement;
        }
        return core;
      })
      .sort((a, b) => a.zIndex - b.zIndex)
  }));
  if (!normalized.pages.length) {
    normalized.pages = [createPage(0)];
  }
  const withBindingKeys = assignTemplateTextBindingKeys(normalized);
  withBindingKeys.pageCount = withBindingKeys.pages.length;
  return withBindingKeys;
}

function buildTopicDefaultHashtags(args: {
  templateName?: string;
  payload: Record<string, string>;
  sourceFields: string[];
}): string[] {
  const seeds = args.sourceFields
    .map((field) => String(args.payload[field] || "").trim())
    .filter(Boolean)
    .flatMap((value) => value.split(/[,\s/|]+/))
    .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  const fromFields = seeds.map((token) => `#${token.slice(0, 18)}`);
  if (fromFields.length > 0) {
    return fromFields;
  }
  const fallback = String(args.templateName || "").trim().replace(/[^\p{L}\p{N}]+/gu, "");
  return [fallback ? `#${fallback.slice(0, 18)}` : "#인스타콘텐츠"];
}

function resolveElementName(layer: InstagramPageElement): string {
  if (layer.type === "text") {
    const preview = String(layer.text || "").replace(/\s+/g, " ").trim().slice(0, 20);
    const bindingKey = String(layer.bindingKey || "").trim();
    const bindingSuffix =
      layer.textMode === "variable" && bindingKey
        ? ` · ${isAutoTextBindingKey(bindingKey) ? `${bindingKey}*` : bindingKey}`
        : "";
    const prefix = layer.textMode === "plain" ? "Text(일반)" : `Text(변수${bindingSuffix})`;
    return preview ? `${prefix} · ${preview}` : prefix;
  }
  if (layer.type === "image") return "Image";
  if (layer.type === "video") return "Video";
  return shapeLabel(layer.shape);
}

function resolveLayerTokenText(
  rawText: string,
  sampleData: Record<string, string>,
  mode: "variable" | "plain" = "variable",
  bindingKey?: string
): string {
  if (mode === "plain") {
    return String(rawText || "");
  }
  const source = String(rawText || "");
  const entries = Object.entries(sampleData || {});
  const keys = entries.map(([key]) => key);
  const normalizedBindingKey = String(bindingKey || "").trim();
  const hasToken = /\{\{[^}]+\}\}/.test(source);

  if (!hasToken && normalizedBindingKey) {
    if (Object.prototype.hasOwnProperty.call(sampleData, normalizedBindingKey)) {
      return String(sampleData[normalizedBindingKey] ?? "");
    }
    const matchedByBinding = keys.find((key) => key.toLowerCase() === normalizedBindingKey.toLowerCase());
    if (matchedByBinding) {
      return String(sampleData[matchedByBinding] ?? "");
    }
  }

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
    const normalizedTokenKey = lower.replace(/[\s_-]+/g, "");
    const normalizedMatchedKeys = keys.filter(
      (key) => key.toLowerCase().replace(/[\s_-]+/g, "") === normalizedTokenKey
    );
    if (normalizedMatchedKeys.length === 1) {
      return String(sampleData[normalizedMatchedKeys[0]] ?? "");
    }
    return fullToken;
  });
}

function sanitizeAiPromptVariableKey(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const unwrapped = raw.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
  return unwrapped.trim();
}

function resolveTextLayerContent(layer: InstagramTextElement, sampleData: Record<string, string>): string {
  return resolveLayerTokenText(
    layer.text,
    sampleData,
    layer.textMode === "plain" ? "plain" : "variable",
    layer.bindingKey
  );
}

function resolveSampleValueByKey(sampleData: Record<string, string>, key: string): string {
  const normalizedKey = sanitizeAiPromptVariableKey(key);
  if (!normalizedKey) {
    return "";
  }
  const keys = Object.keys(sampleData || {});
  if (Object.prototype.hasOwnProperty.call(sampleData, normalizedKey)) {
    return String(sampleData[normalizedKey] ?? "");
  }
  const lowerMatched = keys.find((candidate) => candidate.toLowerCase() === normalizedKey.toLowerCase());
  if (lowerMatched) {
    return String(sampleData[lowerMatched] ?? "");
  }
  const compact = normalizedKey.toLowerCase().replace(/[\s_-]+/g, "");
  const compactMatched = keys.find((candidate) => candidate.toLowerCase().replace(/[\s_-]+/g, "") === compact);
  return compactMatched ? String(sampleData[compactMatched] ?? "") : "";
}

function buildAiVideoFinalPromptPreview(layer: InstagramVideoElement, sampleData: Record<string, string>): string {
  const basePrompt =
    String(layer.aiVideoPrompt || "").trim() ||
    "no music, no camera movement, no subtitles";
  const variableKey = sanitizeAiPromptVariableKey(String(layer.aiPromptVariableKey || ""));
  const dialogue = collapseWhitespace(resolveSampleValueByKey(sampleData, variableKey));
  const dialogueText = dialogue || (variableKey ? `{{${variableKey}}}` : "{{변수명 값}}");
  return `${basePrompt}. The visible speaker naturally says exactly this line with synced mouth movement: "${dialogueText}". Keep the first-frame character and composition consistent.`;
}

function estimateAiVideoCostUsd(layer: InstagramVideoElement): number {
  const provider = layer.aiVideoProvider === "openai" ? "openai" : "gemini";
  const durationSec = Math.max(4, Math.min(8, Math.round(Number(layer.aiVideoDurationSec) || 6)));
  const resolution = layer.aiVideoResolution === "1080p" ? "1080p" : "720p";
  const openAiDurationSec = durationSec > 4 ? 8 : 4;
  const cost =
    provider === "openai"
      ? openAiDurationSec * 0.1
      : durationSec * (resolution === "1080p" ? 0.08 : 0.05);
  return Number(cost.toFixed(2));
}

function formatElapsedSeconds(startedAt: number, now = Date.now()): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds.toString().padStart(2, "0")}초` : `${seconds}초`;
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

function cleanRubyHtmlText(value: string): string {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseRubySegments(line: string): RubySegment[] {
  const repairedLine = repairMalformedRubyHtml(line);
  const segments: RubySegment[] = [];
  const regex = /<ruby[^>]*>([\s\S]*?)<rt[^>]*>([\s\S]*?)<\/rt>\s*<\/ruby>|\[([^\]\|]+)\|([^\]]+)\]/gi;
  let lastIndex = 0;
  let matched = false;
  let token: RegExpExecArray | null = regex.exec(repairedLine);
  while (token) {
    matched = true;
    if (token.index > lastIndex) {
      segments.push({ type: "plain", text: repairedLine.slice(lastIndex, token.index) });
    }
    segments.push({
      type: "ruby",
      base: cleanRubyHtmlText(token[1] || token[3] || ""),
      ruby: cleanRubyHtmlText(token[2] || token[4] || "")
    });
    lastIndex = token.index + token[0].length;
    token = regex.exec(repairedLine);
  }
  if (lastIndex < repairedLine.length) {
    segments.push({ type: "plain", text: repairedLine.slice(lastIndex) });
  }
  if (!matched) {
    return [{ type: "plain", text: repairedLine }];
  }
  return segments;
}

function lineHasRuby(segments: RubySegment[]): boolean {
  return segments.some((segment) => segment.type === "ruby");
}

function textHasRuby(value: string): boolean {
  return /<ruby[\s>]|<\/rt>|\[[^\]\|]+\|[^\]]+\]/i.test(String(value || ""));
}

function measureRubyLineWidth(ctx: CanvasRenderingContext2D, segments: RubySegment[]): number {
  let width = 0;
  segments.forEach((segment) => {
    width += ctx.measureText(segment.type === "ruby" ? segment.base : segment.text).width;
  });
  return width;
}

function renderRubyPreviewNodes(text: string, rubyGapCss = `${DEFAULT_RUBY_GAP}px`): React.ReactNode {
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
                <rt className="text-[0.45em] leading-none" style={{ position: "relative", top: `-${rubyGapCss}` }}>
                  {segment.ruby}
                </rt>
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
  const previewPage: InstagramFeedPage = {
    ...args.page,
    elements: args.page.elements.map((layer) =>
      layer.type === "image" || layer.type === "video"
        ? {
            ...layer,
            imageUrl: toInstagramMediaPreviewUrl(layer.imageUrl)
          }
        : layer
    )
  };
  return renderInstagramPageToPngDataUrl({ ...args, page: previewPage });
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
                    fillOpacity: clamp(Number(shapeSource.fillOpacity), 0, 1, 1),
                    strokeColor: normalizeHex(String(shapeSource.strokeColor || ""), "#111111"),
                    strokeWidth: clamp(Number(shapeSource.strokeWidth), 0, 20, 0),
                    cornerRadius: clamp(Number(shapeSource.cornerRadius), 0, 220, 24)
                  } satisfies InstagramShapeElement);
                  return items;
                }

                if (rawElement.type === "image" || rawElement.type === "video") {
                  const imageSource = rawElement as Partial<InstagramImageElement | InstagramVideoElement>;
                  const normalizedImageUrl = String(imageSource.imageUrl || "");
                  items.push({
                    ...core,
                    type: rawElement.type === "video" ? "video" : "image",
                    imageUrl: normalizedImageUrl,
                    mediaType:
                      rawElement.type === "video" || imageSource.mediaType === "video" || inferMediaTypeFromSource(normalizedImageUrl) === "video"
                        ? "video"
                        : "image",
                    fit: imageSource.fit === "contain" ? "contain" : "cover",
                    cropX: clamp(Number(imageSource.cropX), 0, 100, 50),
                    cropY: clamp(Number(imageSource.cropY), 0, 100, 50),
                    borderRadius: clamp(Number(imageSource.borderRadius), 0, 220, 16),
                    overlayColor: normalizeHex(String(imageSource.overlayColor || ""), "#000000"),
                    overlayOpacity: clamp(Number(imageSource.overlayOpacity), 0, 1, 0),
                    aiGenerateEnabled: Boolean(imageSource.aiGenerateEnabled),
                    aiModel: resolveAiImageModel(imageSource.aiModel),
                    aiPrompt: String(imageSource.aiPrompt || ""),
                    aiPromptVariableKey: sanitizeAiPromptVariableKey(String(imageSource.aiPromptVariableKey || "")),
                    aiStylePreset: String(imageSource.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE),
                    aiImageOrientation: resolveAiImageOrientation(imageSource.aiImageOrientation),
                    aiVideoEnabled: rawElement.type === "video" && Boolean((imageSource as { aiVideoEnabled?: boolean }).aiVideoEnabled),
                    aiVideoProvider:
                      (imageSource as { aiVideoProvider?: string }).aiVideoProvider === "openai" ? "openai" : "gemini",
                    aiVideoPrompt:
                      String((imageSource as { aiVideoPrompt?: string }).aiVideoPrompt || "").trim() ||
                      "no music, no camera movement, no subtitles",
                    aiVideoDurationSec: Math.max(
                      4,
                      Math.min(
                        8,
                        Math.round(Number((imageSource as { aiVideoDurationSec?: number }).aiVideoDurationSec) || 6)
                      )
                    ),
                    aiVideoResolution:
                      (imageSource as { aiVideoResolution?: string }).aiVideoResolution === "1080p" ? "1080p" : "720p"
                  } as InstagramImageElement | InstagramVideoElement);
                  return items;
                }

                const textSource = rawElement as Partial<InstagramTextElement>;
                const rawTextMode = String((textSource as { textMode?: string }).textMode || "variable");
                const textMode = rawTextMode === "plain" ? "plain" : "variable";
                items.push({
                  ...core,
                  type: "text",
                  textMode,
                  bindingKey: sanitizeTextBindingKey((textSource as { bindingKey?: string }).bindingKey),
                  text: String(textSource.text || (textMode === "plain" ? "텍스트 입력" : "{{subject}}")),
                  autoWrap: textSource.autoWrap !== false,
                  color: normalizeHex(String(textSource.color || ""), "#111111"),
                  fontFamily: normalizeStoredFontFamily(textSource.fontFamily),
                  fontSize: normalizeTextFontSize(Number(textSource.fontSize), 56),
                  lineHeight: clamp(Number(textSource.lineHeight), 0.8, 3, 1.2),
                  letterSpacing: clamp(Number(textSource.letterSpacing), -2, 20, 0),
                  rubyGap: normalizeRubyGap(textSource.rubyGap),
                  textOffsetY: normalizeTextOffsetY(textSource.textOffsetY),
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
                  backgroundOpacity: clamp(Number(textSource.backgroundOpacity), 0, 1, 1),
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
          audioUrl: String(rawPage.audioUrl || ""),
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
    mode: resolveTemplateMode(source.mode),
    sourceTitle: String(source.sourceTitle || "{{subject}}"),
    sourceTopic: String(source.sourceTopic || "{{description}}"),
    bgmEnabled:
      typeof source.bgmEnabled === "boolean"
        ? source.bgmEnabled
        : Boolean(String(source.bgmUrl || "").trim()),
    bgmUrl: String(source.bgmUrl || ""),
    bgmVolume: clamp(Number(source.bgmVolume), 0, 1, 0.18),
    hashtags: normalizeTemplateHashtags((source as { hashtags?: unknown }).hashtags),
    hashtagSourceFields: Array.isArray((source as { hashtagSourceFields?: unknown }).hashtagSourceFields)
      ? ((source as { hashtagSourceFields?: unknown }).hashtagSourceFields as unknown[])
          .map((field) => String(field || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : ["subject", "keyword", "type"],
    captionSourceFields: Array.isArray((source as { captionSourceFields?: unknown }).captionSourceFields)
      ? ((source as { captionSourceFields?: unknown }).captionSourceFields as unknown[])
          .map((field) => String(field || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : ["Caption", "Subject"],
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
  title?: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label title={props.title}>{props.label}</Label>
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
  const router = useRouter();
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
  const [imageApplyTargetPageId, setImageApplyTargetPageId] = useState<string>("__all__");
  const [audioApplyTargetPageId, setAudioApplyTargetPageId] = useState<string>("__all__");
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ x: 12, y: 12 });
  const [toolbarDrag, setToolbarDrag] = useState<ToolbarDragState | null>(null);
  const [objectToolbarOffset, setObjectToolbarOffset] = useState<ObjectToolbarOffset>(() => {
    if (typeof window === "undefined") {
      return { x: 0, y: 0 };
    }
    try {
      const saved = window.localStorage.getItem("instagram-template-object-toolbar-offset");
      if (!saved) {
        return { x: 0, y: 0 };
      }
      const parsed = JSON.parse(saved) as Partial<ObjectToolbarOffset>;
      return {
        x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : 0,
        y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : 0
      };
    } catch {
      return { x: 0, y: 0 };
    }
  });
  const [objectToolbarDrag, setObjectToolbarDrag] = useState<ObjectToolbarDragState | null>(null);
  const [objectToolbarWidth, setObjectToolbarWidth] = useState(760);
  const [objectToolbarVisible, setObjectToolbarVisible] = useState(false);
  const [pendingImageLayerId, setPendingImageLayerId] = useState<string>();
  const [layerMediaUploadProgress, setLayerMediaUploadProgress] = useState<Record<string, LayerMediaUploadProgress>>({});
  const [aiImageGeneratingLayerId, setAiImageGeneratingLayerId] = useState<string>();
  const [aiVideoGeneratingLayerId, setAiVideoGeneratingLayerId] = useState<string>();
  const [aiVideoGenerationProgress, setAiVideoGenerationProgress] = useState<AiVideoGenerationProgress | null>(null);
  const [aiVideoProgressTick, setAiVideoProgressTick] = useState(0);
  const [aiPromptGeneratingLayerId, setAiPromptGeneratingLayerId] = useState<string>();
  const [sheetName, setSheetName] = useState("");
  const [settingsSheetName, setSettingsSheetName] = useState("");
  const [bindingSearch, setBindingSearch] = useState("");
  const [bindingFields, setBindingFields] = useState<string[]>(DEFAULT_BINDING_FIELDS);
  const [bindingRowOptions, setBindingRowOptions] = useState<BindingRowOption[]>([]);
  const [bindingSelectedRowKey, setBindingSelectedRowKey] = useState("");
  const [bindingLoading, setBindingLoading] = useState(false);
  const [bindingApplyLoading, setBindingApplyLoading] = useState(false);
  const [bindingApplyMessage, setBindingApplyMessage] = useState("");
  const [sampleData, setSampleData] = useState<Record<string, string>>({ ...DEFAULT_SAMPLE_DATA });
  const [feedEditSourceItem, setFeedEditSourceItem] = useState<InstagramGeneratedFeedItem>();
  const [newsCountry, setNewsCountry] = useState("KR");
  const [newsCount, setNewsCount] = useState("10");
  const [newsTopic, setNewsTopic] = useState("all");
  const [newsKeyword, setNewsKeyword] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsImageRefreshing, setNewsImageRefreshing] = useState(false);
  const [newsError, setNewsError] = useState<string>();
  const [newsItems, setNewsItems] = useState<GoogleNewsItem[]>([]);
  const [selectedNewsItemKey, setSelectedNewsItemKey] = useState("");
  const [newsFetchedAt, setNewsFetchedAt] = useState<string>();
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
  const [elementClipboard, setElementClipboard] = useState<ElementClipboardPayload | null>(null);
  const [shapeToolOpen, setShapeToolOpen] = useState(false);
  const [panelToolOpen, setPanelToolOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontPickerQuery, setFontPickerQuery] = useState("");
  const [fontPickerAnchorRect, setFontPickerAnchorRect] = useState<PickerAnchorRect | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [editorFollowOffset, setEditorFollowOffset] = useState(0);
  const [pagePreviewVisible, setPagePreviewVisible] = useState<Record<string, boolean>>({});
  const [sentencePageFontDeltas, setSentencePageFontDeltas] = useState<Record<string, number>>({});
  const [pageThumbnailUrls, setPageThumbnailUrls] = useState<Record<string, string>>({});
  const [showAdvancedPosition, setShowAdvancedPosition] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [templateMenuOpen, setTemplateMenuOpen] = useState<"file" | "features" | undefined>();
  const [templateJsonModalOpen, setTemplateJsonModalOpen] = useState(false);
  const [templateJsonModalMode, setTemplateJsonModalMode] = useState<"import" | "export">("import");
  const [outputRenderModalOpen, setOutputRenderModalOpen] = useState(false);
  const [outputRenderModalMode, setOutputRenderModalMode] = useState<"png" | "mp4">("png");
  const [captionFieldsCollapsed, setCaptionFieldsCollapsed] = useState(false);
  const [objectToolbarHostReady, setObjectToolbarHostReady] = useState(false);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string>();
  const [outputVideoUrl, setOutputVideoUrl] = useState<string>();
  const [renderingOutput, setRenderingOutput] = useState(false);
  const [renderingOutputVideo, setRenderingOutputVideo] = useState(false);
  const [pageAudioUploading, setPageAudioUploading] = useState(false);
  const [pageAudioUploadProgress, setPageAudioUploadProgress] = useState<number>();
  const [templateBgmUploading, setTemplateBgmUploading] = useState(false);
  const [templateBgmUploadProgress, setTemplateBgmUploadProgress] = useState<number>();
  const [pixabayQuery, setPixabayQuery] = useState("");
  const [pixabayResults, setPixabayResults] = useState<PixabaySoundEffectResult[]>([]);
  const [pixabaySearching, setPixabaySearching] = useState(false);
  const [pixabayApplyingId, setPixabayApplyingId] = useState<string>();
  const [pixabayError, setPixabayError] = useState<string>();
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>();
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [audioPreviewError, setAudioPreviewError] = useState<string>();
  const [sections, setSections] = useState({
    layers: true,
    page: true,
    data: true,
    output: true,
    json: false
  });
  const [layerDragId, setLayerDragId] = useState<string>();
  const [layerDragOverId, setLayerDragOverId] = useState<string>();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const editorLayoutRef = useRef<HTMLDivElement | null>(null);
  const editorFollowRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const objectToolbarRef = useRef<HTMLDivElement | null>(null);
  const mobileObjectToolbarHostRef = useRef<HTMLDivElement | null>(null);
  const fontPickerRef = useRef<HTMLDivElement | null>(null);
  const fontPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const pageBackgroundImageInputRef = useRef<HTMLInputElement | null>(null);
  const pageAudioInputRef = useRef<HTMLInputElement | null>(null);
  const templateBgmInputRef = useRef<HTMLInputElement | null>(null);
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
  const sentencePageBodyFontBaselineRef = useRef<Record<string, Record<string, number>>>({});
  const interactionMovedRef = useRef(false);
  const loadingFontAliasRef = useRef<Set<string>>(new Set());
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudioPreviewPlayRef = useRef(false);
  const templateEditDraftLoadedRef = useRef(false);
  const suppressAutoNewsBindingRef = useRef(false);
  const feedEditSourceRowKeyRef = useRef("");
  const feedEditSessionRef = useRef(false);
  const isNewsMode = resolveTemplateMode(editor.mode) === "news";
  const isSentenceReadingMode = resolveTemplateMode(editor.mode) === "sentence_reading";
  const sentenceReadingCardSet = useMemo(
    () => normalizeSentenceReadingCardSetShared(sampleData),
    [sampleData]
  );
  const selectedNewsTopic = useMemo(
    () => NEWS_TOPIC_OPTIONS.find((item) => item.value === newsTopic) || NEWS_TOPIC_OPTIONS[0],
    [newsTopic]
  );
  const selectedNewsTopicQuery = useMemo(
    () => resolveNewsTopicQuery(newsTopic, newsCountry),
    [newsCountry, newsTopic]
  );
  const selectedNewsItem = useMemo(
    () => newsItems.find((item, index) => buildNewsItemKey(item, index) === selectedNewsItemKey),
    [newsItems, selectedNewsItemKey]
  );
  const selectedBindingRowValues = useMemo(
    () => bindingRowOptions.find((item) => item.key === bindingSelectedRowKey)?.values,
    [bindingRowOptions, bindingSelectedRowKey]
  );
  const applyNewsSampleData = useCallback(
    (
      item: GoogleNewsItem,
      options?: {
        generatedImageUrl?: string;
        generatedImageUrls?: Record<string, string>;
      }
    ): void => {
      const payload = buildNewsSamplePayload({
        item,
        country: newsCountry,
        generatedImageUrl: options?.generatedImageUrl,
        generatedImageUrls: options?.generatedImageUrls
      });
      setBindingFields((prev) => mergeNewsBindingFields([...prev, ...Object.keys(payload)]));
      setSampleData((prev) => ({
        ...DEFAULT_NEWS_SAMPLE_DATA,
        ...prev,
        ...payload
      }));
    },
    [newsCountry]
  );
  const generateNewsImagesForTemplate = useCallback(
    async (
      item: GoogleNewsItem,
      options?: {
        maxTargets?: number;
      }
    ): Promise<{ generatedCount: number; pageImageUrls: Record<string, string>; primaryImageUrl: string }> => {
      const resolvedMaxTargets =
        typeof options?.maxTargets === "number" && Number.isFinite(options.maxTargets)
          ? Math.max(1, Math.floor(options.maxTargets))
          : Number.MAX_SAFE_INTEGER;
      const targets = collectNewsImageTargets(editorRef.current, resolvedMaxTargets);
      if (targets.length === 0) {
        return { generatedCount: 0, pageImageUrls: {}, primaryImageUrl: "" };
      }
      const pageImageUrls: Record<string, string> = {};
      for (const target of targets) {
        const variantPrompt = buildNewsImageVariantPrompt({
          item,
          pageIndex: target.pageIndex,
          totalTargets: targets.length
        });
        const imageUrl = await generateAiLayerImage(target.layerId, {
          pageId: target.pageId,
          prompt: variantPrompt,
          orientation: target.orientation,
          aiModel: target.aiModel
        });
        if (imageUrl) {
          pageImageUrls[String(target.pageIndex + 1)] = imageUrl;
        }
      }
      const primaryImageUrl = String(pageImageUrls["1"] || Object.values(pageImageUrls)[0] || "").trim();
      return {
        generatedCount: Object.keys(pageImageUrls).length,
        pageImageUrls,
        primaryImageUrl
      };
    },
    [generateAiLayerImage]
  );
  const refreshNewsImagesForSelection = useCallback(async (): Promise<void> => {
    if (!isNewsMode) {
      setError("템플릿 모드를 뉴스로 바꾼 뒤 사용할 수 있습니다.");
      return;
    }
    if (!selectedNewsItem) {
      setError("뉴스 항목을 먼저 선택해 주세요.");
      return;
    }

    setNewsImageRefreshing(true);
    setNewsError(undefined);
    setError(undefined);
    setSuccess(undefined);
    try {
      const generated = await generateNewsImagesForTemplate(selectedNewsItem);
      if (generated.generatedCount > 0) {
        applyNewsSampleData(selectedNewsItem, {
          generatedImageUrl: generated.primaryImageUrl,
          generatedImageUrls: generated.pageImageUrls
        });
        setSuccess(`선택한 뉴스 기준으로 이미지 ${generated.generatedCount}장을 일괄 리프레시했습니다.`);
      } else {
        setSuccess("이미지 레이어를 찾지 못해 일괄 리프레시를 건너뛰었습니다.");
      }
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "뉴스 이미지 일괄 리프레시에 실패했습니다.";
      setNewsError(message);
      setError(message);
    } finally {
      setNewsImageRefreshing(false);
    }
  }, [applyNewsSampleData, generateNewsImagesForTemplate, isNewsMode, selectedNewsItem]);
  const loadNewsBindings = useCallback(async (): Promise<void> => {
    suppressAutoNewsBindingRef.current = false;
    setNewsLoading(true);
    setNewsError(undefined);
    setError(undefined);
    try {
      const params = new URLSearchParams();
      params.set("country", newsCountry);
      params.set("count", newsCount);
      if (selectedNewsTopicQuery) {
        params.set("topic", selectedNewsTopicQuery);
      }
      const trimmedKeyword = newsKeyword.trim();
      if (trimmedKeyword) {
        params.set("keyword", trimmedKeyword);
      }
      const response = await fetch(`/api/instagram/news?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as InstagramNewsResponse;
      if (!response.ok) {
        throw new Error(data.error || "뉴스 데이터를 불러오지 못했습니다.");
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setNewsItems(items);
      setNewsFetchedAt(data.fetchedAt || new Date().toISOString());
      if (items.length === 0) {
        setSelectedNewsItemKey("");
        setNewsError("조회된 뉴스가 없습니다.");
        return;
      }
      const nextKey =
        items.find((item, index) => buildNewsItemKey(item, index) === selectedNewsItemKey) !== undefined
          ? selectedNewsItemKey
          : buildNewsItemKey(items[0], 0);
      setSelectedNewsItemKey(nextKey);
      const targetItem =
        items.find((item, index) => buildNewsItemKey(item, index) === nextKey) || items[0];
      applyNewsSampleData(targetItem);
      const filterSummary = [selectedNewsTopicQuery ? `주제: ${selectedNewsTopic.label}` : "", trimmedKeyword ? `검색어: ${trimmedKeyword}` : ""]
        .filter(Boolean)
        .join(", ");
      setSuccess(
        `뉴스 ${items.length}건을 불러와 샘플 데이터에 반영했습니다.${filterSummary ? ` (${filterSummary})` : ""} 이미지는 자동 생성하지 않으며, 필요 시 '이미지 일괄 리프레시'를 눌러 생성해 주세요.`
      );
    } catch (newsLoadError) {
      setNewsItems([]);
      setSelectedNewsItemKey("");
      const message = newsLoadError instanceof Error ? newsLoadError.message : "뉴스 데이터를 불러오지 못했습니다.";
      setNewsError(message);
      setError(message);
    } finally {
      setNewsLoading(false);
    }
  }, [
    applyNewsSampleData,
    newsCount,
    newsCountry,
    newsKeyword,
    selectedNewsItemKey,
    selectedNewsTopic.label,
    selectedNewsTopicQuery
  ]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    if (!aiVideoGeneratingLayerId) {
      return;
    }
    const interval = window.setInterval(() => {
      setAiVideoProgressTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [aiVideoGeneratingLayerId]);

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
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1280px)");
    let rafId: number | undefined;

    const updateFollowOffset = (): void => {
      const layoutNode = editorLayoutRef.current;
      const followNode = editorFollowRef.current;
      if (!layoutNode || !followNode || !media.matches) {
        setEditorFollowOffset(0);
        return;
      }

      const layoutRect = layoutNode.getBoundingClientRect();
      const followHeight = followNode.offsetHeight;
      const topOffset = 8;
      const maxOffset = Math.max(0, layoutNode.scrollHeight - followHeight);
      const desiredOffset = topOffset - layoutRect.top;
      const nextOffset = Math.max(0, Math.min(maxOffset, desiredOffset));
      setEditorFollowOffset((prev) => (Math.abs(prev - nextOffset) > 0.5 ? nextOffset : prev));
    };

    const scheduleUpdate = (): void => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(updateFollowOffset);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleUpdate);
    media.addEventListener("change", scheduleUpdate);

    const scrollParents = new Set<HTMLElement>();
    let parent = editorLayoutRef.current?.parentElement || null;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      const overflow = `${style.overflow}${style.overflowY}${style.overflowX}`;
      if (/(auto|scroll|overlay)/.test(overflow)) {
        scrollParents.add(parent);
        parent.addEventListener("scroll", scheduleUpdate, { passive: true });
      }
      parent = parent.parentElement;
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            scheduleUpdate();
          });
    if (observer) {
      if (editorLayoutRef.current) {
        observer.observe(editorLayoutRef.current);
      }
      if (editorFollowRef.current) {
        observer.observe(editorFollowRef.current);
      }
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, { capture: true });
      document.removeEventListener("scroll", scheduleUpdate, { capture: true });
      window.removeEventListener("resize", scheduleUpdate);
      media.removeEventListener("change", scheduleUpdate);
      scrollParents.forEach((scrollParent) => scrollParent.removeEventListener("scroll", scheduleUpdate));
      observer?.disconnect();
    };
  }, [editor.pages.length, selectedPageId, sections.layers, sections.page, sections.data, selectedElementId]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl?.startsWith("blob:")) {
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
    if (!isNewsMode) {
      return;
    }
    setBindingFields((prev) => {
      const merged = mergeNewsBindingFields(prev);
      return isSameStringArray(merged, prev) ? prev : merged;
    });
    setSampleData((prev) => {
      const missingDefaults = Object.keys(DEFAULT_NEWS_SAMPLE_DATA).some((key) => !(key in prev));
      if (!missingDefaults) {
        return prev;
      }
      return {
        ...DEFAULT_NEWS_SAMPLE_DATA,
        ...prev
      };
    });
    if (suppressAutoNewsBindingRef.current) {
      return;
    }
    if (newsItems.length === 0 && !newsLoading) {
      void loadNewsBindings();
    }
    // loadNewsBindings is intentionally omitted to avoid callback identity churn causing effect loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewsMode, newsItems.length, newsLoading]);

  useEffect(() => {
    if (isNewsMode) {
      return;
    }
    const expectedFeedRowKey = feedEditSourceRowKeyRef.current;
    if (expectedFeedRowKey && selectedBindingRowValues) {
      const selectedRowId = readBindingRowValue(selectedBindingRowValues, "id");
      if (selectedRowId && selectedRowId !== expectedFeedRowKey) {
        return;
      }
    }
    setSampleData((prev) => {
      const next = sanitizeGeneralSampleData(prev, selectedBindingRowValues);
      const prevKeys = Object.keys(prev).sort();
      const nextKeys = Object.keys(next).sort();
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key, index) => key === nextKeys[index] && prev[key] === next[key])
      ) {
        return prev;
      }
      return next;
    });
  }, [isNewsMode, selectedBindingRowValues]);

  useEffect(() => {
    const loadInstagramSheetDefault = async (): Promise<void> => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const settings = (await response.json()) as AppSettings;
        const instagramSheetName = resolveInstagramSettingsSheetName(settings);
        setSettingsSheetName(instagramSheetName);
        const preferredSheetName = resolveInstagramPreferredSheetName(instagramSheetName);
        if (preferredSheetName) {
          setSheetName((prev) => (prev.trim() && !readInstagramLastSheetName() ? prev : preferredSheetName));
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
  const activeObjectToolbarLayerId = selectedLayer?.id;
  const selectedLayerOrder = useMemo(() => {
    if (!selectedLayer || !selectedPage) {
      return {
        index: -1,
        total: 0,
        canMoveBack: false,
        canMoveDown: false,
        canMoveUp: false,
        canMoveFront: false
      };
    }
    const sorted = [...selectedPage.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex((item) => item.id === selectedLayer.id);
    const total = sorted.length;
    return {
      index,
      total,
      canMoveBack: index > 0,
      canMoveDown: index > 0,
      canMoveUp: index >= 0 && index < total - 1,
      canMoveFront: index >= 0 && index < total - 1
    };
  }, [selectedLayer, selectedPage]);
  const hasMultiSelection = selectedLayers.length > 1;

  useEffect(() => {
    setFontPickerOpen(false);
    setFontPickerQuery("");
    setFontPickerAnchorRect(null);
  }, [selectedLayer?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("instagram-template-object-toolbar-offset", JSON.stringify(objectToolbarOffset));
    } catch {
      // localStorage가 차단된 환경에서는 현재 세션 상태만 유지합니다.
    }
  }, [objectToolbarOffset]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeObjectToolbarLayerId) return;
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 900;
    const toolbarWidth = Math.min(
      objectToolbarRef.current?.offsetWidth || 760,
      Math.max(260, viewportWidth - 24)
    );
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const baseLeft = viewportWidth <= 768 ? 8 : (canvasRect?.left || 84) + 12;
    const baseTop = viewportWidth <= 768 ? 64 : 72;
    const nextOffset = {
      x: clamp(
        objectToolbarOffset.x,
        8 - baseLeft,
        Math.max(8 - baseLeft, viewportWidth - toolbarWidth - 8 - baseLeft),
        0
      ),
      y: clamp(
        objectToolbarOffset.y,
        56 - baseTop,
        Math.max(56 - baseTop, viewportHeight - 132 - baseTop),
        0
      )
    };
    if (nextOffset.x !== objectToolbarOffset.x || nextOffset.y !== objectToolbarOffset.y) {
      setObjectToolbarOffset(nextOffset);
    }
  }, [activeObjectToolbarLayerId, objectToolbarOffset.x, objectToolbarOffset.y, viewportWidth]);

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
            fillOpacity: copiedShapeStyle.fillOpacity,
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

  const visibleBindingFields = useMemo(
    () => (isNewsMode ? bindingFields : bindingFields.filter((field) => !NEWS_ONLY_BINDING_FIELD_SET.has(field))),
    [bindingFields, isNewsMode]
  );
  const filteredBindingFields = useMemo(
    () => visibleBindingFields.filter((field) => field.toLowerCase().includes(bindingSearch.trim().toLowerCase())),
    [bindingSearch, visibleBindingFields]
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
    const rubyReserve = hasRuby ? Math.max(8, fontSize * 0.42 + normalizeRubyGap(layer.rubyGap)) : 0;
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

  function ensureSentencePageBodyFontBaseline(page: InstagramFeedPage): Record<string, number> {
    const current = sentencePageBodyFontBaselineRef.current[page.id] || {};
    const next = { ...current };
    page.elements.forEach((element) => {
      if (isSentenceReadingBodyTextLayer(element) && !Number.isFinite(next[element.id])) {
        next[element.id] = normalizeTextFontSize(Number(element.fontSize), element.fontSize);
      }
    });
    sentencePageBodyFontBaselineRef.current[page.id] = next;
    return next;
  }

  function changeSentenceReadingPageBodyFont(pageId: string, direction: -1 | 1): void {
    if (!isSentenceReadingMode) {
      return;
    }
    const page = editorRef.current.pages.find((item) => item.id === pageId);
    if (!page || !page.elements.some(isSentenceReadingBodyTextLayer)) {
      setError("문장 읽기 본문 텍스트 레이어가 없습니다.");
      return;
    }

    ensureSentencePageBodyFontBaseline(page);
    const currentDelta = sentencePageFontDeltas[pageId] ?? 0;
    const nextDelta = clamp(
      currentDelta + direction * SENTENCE_READING_PAGE_FONT_STEP,
      SENTENCE_READING_PAGE_FONT_MIN_DELTA,
      SENTENCE_READING_PAGE_FONT_MAX_DELTA,
      currentDelta
    );
    const effectiveStep = nextDelta - currentDelta;
    if (effectiveStep === 0) {
      return;
    }

    updatePageById(
      pageId,
      (targetPage) => {
        const expandedElements = targetPage.elements.map((element) => {
          if (!isSentenceReadingBodyTextLayer(element)) {
            return element;
          }
          return autoExpandTextLayerIfNeeded({
            ...element,
            autoWrap: true,
            fontSize: normalizeTextFontSize(Number(element.fontSize) + effectiveStep, element.fontSize)
          });
        });
        return {
          ...targetPage,
          elements: relayoutSentenceReadingBodyTextLayers(expandedElements, targetPage.name, canvasHeight)
        };
      },
      { keepSuccess: true }
    );
    setSentencePageFontDeltas((current) => ({ ...current, [pageId]: nextDelta }));
    setSuccess(`본문 폰트 크기를 ${nextDelta > 0 ? `+${nextDelta}` : nextDelta}px로 조정했습니다.`);
  }

  function resetSentenceReadingPageBodyFont(pageId: string): void {
    if (!isSentenceReadingMode) {
      return;
    }
    const page = editorRef.current.pages.find((item) => item.id === pageId);
    if (!page || !page.elements.some(isSentenceReadingBodyTextLayer)) {
      setError("문장 읽기 본문 텍스트 레이어가 없습니다.");
      return;
    }
    const baseline = ensureSentencePageBodyFontBaseline(page);
    updatePageById(
      pageId,
      (targetPage) => {
        const expandedElements = targetPage.elements.map((element) => {
          if (!isSentenceReadingBodyTextLayer(element)) {
            return element;
          }
          return autoExpandTextLayerIfNeeded({
            ...element,
            autoWrap: true,
            fontSize: normalizeTextFontSize(baseline[element.id] ?? element.fontSize, element.fontSize)
          });
        });
        return {
          ...targetPage,
          elements: relayoutSentenceReadingBodyTextLayers(expandedElements, targetPage.name, canvasHeight)
        };
      },
      { keepSuccess: true }
    );
    setSentencePageFontDeltas((current) => ({ ...current, [pageId]: 0 }));
    setSuccess("본문 폰트 크기를 초기화했습니다.");
  }

  function updateSelectedTextLayersFontSize(nextFontSize: number): void {
    const selectedTextIds = new Set(selectedLayers.filter((layer) => layer.type === "text").map((layer) => layer.id));
    if (selectedTextIds.size === 0 && selectedLayer?.type === "text") {
      selectedTextIds.add(selectedLayer.id);
    }
    if (selectedTextIds.size === 0) {
      setError("폰트 크기를 조정할 텍스트 레이어를 선택하세요.");
      return;
    }
    updateSelectedPage((page) => ({
      ...page,
      elements: page.elements.map((layer) => {
        if (layer.type !== "text" || !selectedTextIds.has(layer.id)) {
          return layer;
        }
        return autoExpandTextLayerIfNeeded({
          ...layer,
          fontSize: normalizeTextFontSize(nextFontSize, layer.fontSize)
        });
      })
    }));
  }

  function updateSelectedTextLayersRubyGap(nextRubyGap: number): void {
    const selectedTextIds = new Set(selectedLayers.filter((layer) => layer.type === "text").map((layer) => layer.id));
    if (selectedTextIds.size === 0 && selectedLayer?.type === "text") {
      selectedTextIds.add(selectedLayer.id);
    }
    if (selectedTextIds.size === 0) {
      setError("루비 간격을 조정할 텍스트 레이어를 선택하세요.");
      return;
    }
    updateSelectedPage((page) => ({
      ...page,
      elements: page.elements.map((layer) => {
        if (layer.type !== "text" || !selectedTextIds.has(layer.id)) {
          return layer;
        }
        return autoExpandTextLayerIfNeeded({
          ...layer,
          rubyGap: normalizeRubyGap(nextRubyGap, normalizeRubyGap(layer.rubyGap))
        });
      })
    }));
  }

  function updateSelectedTextLayersOffsetY(nextOffsetY: number): void {
    const selectedTextIds = new Set(selectedLayers.filter((layer) => layer.type === "text").map((layer) => layer.id));
    if (selectedTextIds.size === 0 && selectedLayer?.type === "text") {
      selectedTextIds.add(selectedLayer.id);
    }
    if (selectedTextIds.size === 0) {
      setError("상자 안 위치를 조정할 텍스트 레이어를 선택하세요.");
      return;
    }
    updateSelectedPage((page) => ({
      ...page,
      elements: page.elements.map((layer) => {
        if (layer.type !== "text" || !selectedTextIds.has(layer.id)) {
          return layer;
        }
        return {
          ...layer,
          textOffsetY: normalizeTextOffsetY(nextOffsetY, normalizeTextOffsetY(layer.textOffsetY))
        };
      })
    }));
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

  function applySelectedPageAudioToPages(targetPageId: string): void {
    const sourcePageId = selectedPageIdRef.current;
    const sourcePage = editorRef.current.pages.find((page) => page.id === sourcePageId);
    const audioUrl = String(sourcePage?.audioUrl || "").trim();
    if (!sourcePage || !audioUrl) {
      setError("다른 페이지에 적용할 첨부 오디오가 없습니다.");
      return;
    }
    const targetIds =
      targetPageId === "__all__"
        ? editorRef.current.pages.filter((page) => page.id !== sourcePageId).map((page) => page.id)
        : [targetPageId].filter((pageId) => pageId && pageId !== sourcePageId);
    if (targetIds.length === 0) {
      setError("첨부 오디오를 적용할 다른 페이지가 없습니다.");
      return;
    }
    const targetSet = new Set(targetIds);
    updateEditor((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        targetSet.has(page.id)
          ? {
              ...page,
              audioEnabled: true,
              audioUrl
            }
          : page
      )
    }));
    setSuccess(
      targetPageId === "__all__"
        ? `첨부 오디오를 다른 페이지 ${targetIds.length}개에 적용했습니다.`
        : "첨부 오디오를 선택한 페이지에 적용했습니다."
    );
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

  function getUniqueBindingKeyForLayer(rawValue: string, layerId: string): string {
    const desired = sanitizeTextBindingKey(rawValue);
    const taken = new Set<string>();
    editorRef.current.pages.forEach((page) => {
      page.elements.forEach((element) => {
        if (element.type !== "text" || element.id === layerId) {
          return;
        }
        const key = sanitizeTextBindingKey(element.bindingKey);
        if (!key) {
          return;
        }
        taken.add(key.toLowerCase());
      });
    });
    return ensureUniqueTextBindingKey(desired || buildAutoTextBindingKey(), taken);
  }

  function setLayerOrder(
    page: InstagramFeedPage,
    layerId: string,
    direction: "up" | "down" | "front" | "back"
  ): InstagramFeedPage {
    const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex((item) => item.id === layerId);
    if (index < 0) return page;
    if (direction === "front") {
      if (index === sorted.length - 1) return page;
      const [layer] = sorted.splice(index, 1);
      sorted.push(layer);
    } else if (direction === "back") {
      if (index === 0) return page;
      const [layer] = sorted.splice(index, 1);
      sorted.unshift(layer);
    } else {
      const target = direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target >= sorted.length) return page;
      [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    }
    return {
      ...page,
      elements: sorted.map((item, idx) => ({ ...item, zIndex: idx }))
    };
  }

  function reorderLayersByVisibleOrder(page: InstagramFeedPage, visibleLayerIds: string[]): InstagramFeedPage {
    const layerById = new Map(page.elements.map((item) => [item.id, item]));
    const orderedBackToFront = [...visibleLayerIds]
      .reverse()
      .map((layerId) => layerById.get(layerId))
      .filter((item): item is InstagramPageElement => Boolean(item));
    if (orderedBackToFront.length !== page.elements.length) {
      return page;
    }
    return {
      ...page,
      elements: orderedBackToFront.map((item, idx) => ({ ...item, zIndex: idx }))
    };
  }

  function moveLayerInList(sourceLayerId: string, targetLayerId: string): void {
    if (!sourceLayerId || !targetLayerId || sourceLayerId === targetLayerId) {
      return;
    }
    const visibleOrder = [...sortedLayers].sort((a, b) => b.zIndex - a.zIndex).map((item) => item.id);
    const sourceIndex = visibleOrder.indexOf(sourceLayerId);
    const targetIndex = visibleOrder.indexOf(targetLayerId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const nextOrder = [...visibleOrder];
    const [moved] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);
    updateSelectedPage((page) => reorderLayersByVisibleOrder(page, nextOrder));
    setSelectedElementId(sourceLayerId);
    setSelectedElementIds([sourceLayerId]);
    setSuccess("레이어 순서를 변경했습니다.");
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
    setObjectToolbarVisible(true);
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
    setObjectToolbarVisible(false);
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
      const viewportWidth = window.innerWidth || 1280;
      const viewportHeight = window.innerHeight || 900;
      const toolbarWidth = Math.min(
        objectToolbarRef.current?.offsetWidth || 760,
        Math.max(260, viewportWidth - 24)
      );
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const baseLeft = viewportWidth <= 768 ? 8 : (canvasRect?.left || 84) + 12;
      const baseTop = viewportWidth <= 768 ? 64 : 72;
      setObjectToolbarOffset({
        x: clamp(
          objectToolbarDrag.startX + dx,
          8 - baseLeft,
          Math.max(8 - baseLeft, viewportWidth - toolbarWidth - 8 - baseLeft),
          0
        ),
        y: clamp(
          objectToolbarDrag.startY + dy,
          56 - baseTop,
          Math.max(56 - baseTop, viewportHeight - 132 - baseTop),
          0
        )
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
    setObjectToolbarVisible(false);
  }, [selectedPageId]);

  useEffect(() => {
    if (!selectedPage) return;
    if (!selectedElementId) {
      setObjectToolbarVisible(false);
      return;
    }
    if (!selectedPage.elements.some((item) => item.id === selectedElementId)) {
      setSelectedElementId(undefined);
      setObjectToolbarVisible(false);
    }
  }, [selectedPage, selectedElementId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const entries = await Promise.all(
          editor.pages.map(async (page) => {
            try {
              const url = await renderPageToPngDataUrl({ page, sampleData, canvasWidth, canvasHeight });
              return [page.id, url] as const;
            } catch {
              return [page.id, ""] as const;
            }
          })
        );
        if (!cancelled) {
          setPageThumbnailUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editor.pages, sampleData, canvasWidth, canvasHeight]);

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

      if (withMeta && key === "c") {
        if (isTypingContext) return;
        if (!selectedLayer && selectedElementIds.length === 0) return;
        event.preventDefault();
        copySelectedElementsForCrossPage();
        return;
      }

      if (withMeta && key === "v") {
        if (isTypingContext) return;
        event.preventDefault();
        pasteCopiedElementsToSelectedPage();
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
  }, [elementClipboard, selectedElementIds, selectedLayer, selectedPage]);

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
    if (loading || templateEditDraftLoadedRef.current) {
      return;
    }
    templateEditDraftLoadedRef.current = true;
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY);
      if (!raw) {
        return;
      }
      window.localStorage.removeItem(INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY);

      const parsed = normalizeTemplateEditDraft(JSON.parse(raw));
      if (!parsed) {
        return;
      }

      if (parsed.source === "instagram-feed") {
        feedEditSessionRef.current = true;
        suppressAutoNewsBindingRef.current = true;
        setFeedEditSourceItem(parsed.sourceFeedItem);
        const sourceRowKey = String(
          parsed.sourceFeedItem?.rowId ||
            parsed.sourceFeedItem?.sampleData?.id ||
            parsed.sourceFeedItem?.sampleData?.ID ||
            parsed.sampleData?.id ||
            parsed.sampleData?.ID ||
            ""
        ).trim();
        feedEditSourceRowKeyRef.current = sourceRowKey;
        if (sourceRowKey) {
          setBindingSelectedRowKey(`id:${sourceRowKey}`);
        }
        setNewsItems([]);
        setSelectedNewsItemKey("");
        setNewsError(undefined);
      }

      const draftTemplate = normalizeTemplateForEditor(parsed.template);
      const targetPageId =
        parsed.focusPageId && draftTemplate.pages.some((page) => page.id === parsed.focusPageId)
          ? parsed.focusPageId
          : draftTemplate.pages[0]?.id;
      const targetPage = draftTemplate.pages.find((page) => page.id === targetPageId) || draftTemplate.pages[0];

      setSelectedTemplateId("__new__");
      clearHistory();
      setEditor(draftTemplate);
      setSelectedPageId(targetPage?.id || draftTemplate.pages[0]?.id || "");
      setSelectedElementId(targetPage?.elements[0]?.id);
      if (parsed.sampleData && Object.keys(parsed.sampleData).length > 0) {
        setSampleData(parsed.sampleData);
        setBindingFields((prev) => mergeBindingFieldsWithDefaults([...prev, ...Object.keys(parsed.sampleData || {})]));
      }
      if (resolveTemplateMode(draftTemplate.mode) === "news") {
        setBindingFields((prev) => mergeNewsBindingFields(prev));
      }
      lastSavedSignatureRef.current = buildAutosaveSignature(draftTemplate);
      setAutoSaveStatus("idle");
      setAutoSaveMessage("피드 편집본을 템플릿 에디터로 불러왔습니다.");
      setSuccess("피드에서 선택한 카드 구성을 템플릿 상세 편집으로 불러왔습니다.");
    } catch {
      // ignore invalid draft payload
    }
  }, [loading]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    let changed = false;
    setEditor((current) => {
      const nextPages = current.pages.map((page) => {
        const nextElements = page.elements.map((element) => {
          if (element.type !== "text") {
            return element;
          }
          const expanded = autoExpandTextLayerIfNeeded(element);
          if (expanded !== element) {
            changed = true;
          }
          return expanded;
        });
        return nextElements === page.elements ? page : { ...page, elements: nextElements };
      });
      if (!changed) {
        return current;
      }
      return normalizeTemplateForEditor({
        ...current,
        pages: nextPages,
        pageCount: nextPages.length
      });
    });
  }, [sampleData, canvasWidth, canvasHeight]);

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
    if (feedEditSessionRef.current || feedEditSourceItem) {
      setAutoSaveStatus("idle");
      setAutoSaveMessage("피드 편집본은 원본 템플릿에 자동 저장하지 않습니다.");
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
          const payload = await replaceTemplateDataUrlMedia(buildTemplatePayload(snapshot, targetTemplateId));
          const response = await fetch("/api/instagram/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: payload })
          });
          const data = await readJsonOrThrow<TemplateResponse>(response, "자동 저장에 실패했습니다.");
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
  }, [currentAutosaveSignature, loading, busy, editor, selectedTemplateId, feedEditSourceItem]);

  async function persistTemplate(mode: "new" | "update"): Promise<void> {
    if (feedEditSessionRef.current || feedEditSourceItem) {
      setError("피드 상세 편집본은 원본 템플릿으로 저장할 수 없습니다. 변경 내용은 '피드로 내보내기'로만 반영됩니다.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const targetTemplateId = mode === "new" || selectedTemplateId === "__new__" ? uid() : editor.id;
      const payload = await replaceTemplateDataUrlMedia(buildTemplatePayload(editor, targetTemplateId));
      const response = await fetch("/api/instagram/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: payload })
      });
      const data = await readJsonOrThrow<TemplateResponse>(response, "템플릿 저장에 실패했습니다.");
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

  async function duplicateTemplate(): Promise<void> {
    if (feedEditSessionRef.current || feedEditSourceItem) {
      setError("피드 상세 편집본은 원본 템플릿으로 복제할 수 없습니다. 변경 내용은 '피드로 내보내기'로만 반영됩니다.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const baseName = String(editor.templateName || "Instagram Template").trim() || "Instagram Template";
      const existingNames = new Set(templates.map((template) => template.templateName.trim().toLowerCase()));
      let copyName = `${baseName} 복제`;
      let copyIndex = 2;
      while (existingNames.has(copyName.toLowerCase())) {
        copyName = `${baseName} 복제 ${copyIndex}`;
        copyIndex += 1;
      }
      const targetTemplateId = uid();
      const payload = await replaceTemplateDataUrlMedia(
        buildTemplatePayload({ ...editor, id: targetTemplateId, templateName: copyName }, targetTemplateId)
      );
      const response = await fetch("/api/instagram/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: payload })
      });
      const data = await readJsonOrThrow<TemplateResponse>(response, "템플릿 복제에 실패했습니다.");
      if (!response.ok) {
        throw new Error(data.error || "템플릿 복제에 실패했습니다.");
      }
      lastSavedSignatureRef.current = buildAutosaveSignature(payload);
      setAutoSaveStatus("saved");
      setAutoSaveMessage(`복제 저장됨 · ${new Date().toLocaleTimeString()}`);
      setSuccess(`템플릿을 복제했습니다: ${copyName}`);
      await fetchTemplates(payload.id);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "템플릿 복제에 실패했습니다.");
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

  function addLayer(kind: "textVariable" | "textPlain" | "image" | "video"): void {
    const layer =
      kind === "video"
        ? createVideoLayer()
        : kind === "image"
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
          : kind === "video"
            ? "비디오 레이어를 추가했습니다."
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

  function copySelectedElementsForCrossPage(): void {
    if (!selectedPage) return;
    const ordered = [...selectedPage.elements].sort((a, b) => a.zIndex - b.zIndex);
    const selectedSet = new Set(
      selectedElementIds.length > 0
        ? selectedElementIds
        : selectedLayer
          ? [selectedLayer.id]
          : []
    );
    const picked = ordered.filter((element) => selectedSet.has(element.id));
    if (!picked.length) {
      setError("복사할 오브젝트를 먼저 선택해 주세요.");
      return;
    }
    setElementClipboard({
      copiedAt: Date.now(),
      elements: picked.map((element) => ({ ...element }))
    });
    setSuccess(`${picked.length}개 오브젝트를 복사했습니다. 다른 페이지에서 붙여넣기 하세요.`);
  }

  function pasteCopiedElementsToSelectedPage(): void {
    if (!selectedPage) return;
    if (!elementClipboard || elementClipboard.elements.length === 0) {
      setError("클립보드가 비어 있습니다. 먼저 오브젝트를 복사해 주세요.");
      return;
    }
    const pastedIds: string[] = [];
    updateSelectedPage((page) => {
      const baseZ = page.elements.length;
      const pasted = elementClipboard.elements.map((source, index) => {
        const nextId = uid();
        pastedIds.push(nextId);
        const nextX = clamp(source.x + 2, source.width / 2, 100 - source.width / 2, source.x);
        const nextY = clamp(source.y + 2, source.height / 2, 100 - source.height / 2, source.y);
        return {
          ...source,
          id: nextId,
          x: nextX,
          y: nextY,
          zIndex: baseZ + index
        };
      });
      return {
        ...page,
        elements: [...page.elements, ...pasted]
      };
    });
    if (pastedIds.length > 0) {
      setSelectedElementIds(pastedIds);
      setSelectedElementId(pastedIds[pastedIds.length - 1]);
    }
    setSuccess(`${pastedIds.length}개 오브젝트를 현재 페이지에 붙여넣었습니다.`);
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
    setObjectToolbarVisible(false);
    setSuccess(targets.length > 1 ? `레이어 ${targets.length}개를 삭제했습니다.` : "레이어를 삭제했습니다.");
  }

  function deleteLayer(layerId: string): void {
    deleteSelectedLayers([layerId]);
  }

  function clearSelection(): void {
    setSelectedElementIds([]);
    setSelectedElementId(undefined);
    setObjectToolbarVisible(false);
  }

  function openLayerImagePicker(layerId: string): void {
    if (!layerImageInputRef.current) return;
    setPendingImageLayerId(layerId);
    setSelectedElementId(layerId);
    setSelectedElementIds([layerId]);
    setObjectToolbarVisible(true);
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
        ? {
            ...layer,
            bindingKey: getUniqueBindingKeyForLayer(field, layer.id),
            text: layer.text.includes(token) ? layer.text : `${layer.text}${layer.text ? " " : ""}${token}`
          }
        : layer
    );
    setSuccess(`{{${field}}} 토큰을 추가했습니다.`);
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
    const existingLayer = editorRef.current.pages
      .flatMap((page) => page.elements)
      .find((layer) => layer.id === targetLayerId);
    const isVideoFile = String(file.type || "").toLowerCase().startsWith("video/");
    if (existingLayer?.type === "image" && isVideoFile) {
      event.target.value = "";
      setPendingImageLayerId(undefined);
      setError("비디오 파일은 비디오 오브젝트에 가져와 주세요.");
      return;
    }
    try {
      const mediaType = isVideoFile ? "video" : "image";
      let mediaUrl = "";
      setLayerMediaUploadProgress((prev) => ({
        ...prev,
        [targetLayerId]: {
          status: "uploading",
          percent: 1,
          fileName: file.name || "media",
          message: mediaType === "video" ? "비디오 업로드 준비 중..." : "이미지 업로드 준비 중..."
        }
      }));
      const updateUploadProgress = (percent: number): void => {
        setLayerMediaUploadProgress((prev) => ({
          ...prev,
          [targetLayerId]: {
            status: percent >= 100 ? "processing" : "uploading",
            percent: Math.max(1, Math.min(100, percent)),
            fileName: file.name || "media",
            message: percent >= 100 ? "업로드 완료. 레이어 반영 중..." : `업로드 중 ${Math.round(percent)}%`
          }
        }));
      };
      try {
        mediaUrl = await uploadTemplateMediaFile(file, updateUploadProgress);
      } catch (uploadError) {
        if (isVideoFile) {
          throw uploadError;
        }
        mediaUrl = await readFileAsDataUrl(file);
      }
      updateLayerById(targetLayerId, (layer) =>
        layer.type === "image"
          ? { ...layer, imageUrl: mediaUrl, mediaType: "image" }
          : layer.type === "video"
            ? { ...layer, imageUrl: mediaUrl, mediaType }
            : layer
      );
      setLayerMediaUploadProgress((prev) => ({
        ...prev,
        [targetLayerId]: {
          status: "success",
          percent: 100,
          fileName: file.name || "media",
          message: "업로드 완료"
        }
      }));
      window.setTimeout(() => {
        setLayerMediaUploadProgress((prev) => {
          const next = { ...prev };
          delete next[targetLayerId];
          return next;
        });
      }, 1400);
      setSuccess(mediaType === "video" ? "비디오 오브젝트에 파일을 적용했습니다." : "미디어 오브젝트에 이미지를 적용했습니다.");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "이미지 레이어 업로드에 실패했습니다.";
      setLayerMediaUploadProgress((prev) => ({
        ...prev,
        [targetLayerId]: {
          status: "error",
          percent: 100,
          fileName: file.name || "media",
          message
        }
      }));
      setError(message);
    } finally {
      event.target.value = "";
      setPendingImageLayerId(undefined);
    }
  }

  async function generateAiLayerImage(
    layerId: string,
    options?: {
      prompt?: string;
      stylePreset?: string;
      orientation?: InstagramAiImageOrientation;
      aiModel?: string;
      pageId?: string;
    }
  ): Promise<string | undefined> {
    const candidatePages = options?.pageId
      ? editorRef.current.pages.filter((item) => item.id === options.pageId)
      : [
          ...editorRef.current.pages.filter((item) => item.id === selectedPageIdRef.current),
          ...editorRef.current.pages.filter((item) => item.id !== selectedPageIdRef.current)
        ];
    let pageId = "";
    let layer: InstagramImageElement | InstagramVideoElement | undefined;
    for (const page of candidatePages) {
      const targetLayer = page.elements.find((item) => item.id === layerId);
      if (targetLayer && (targetLayer.type === "image" || targetLayer.type === "video")) {
        pageId = page.id;
        layer = targetLayer;
        break;
      }
    }
    if (!layer || (layer.type !== "image" && layer.type !== "video")) {
      setError("이미지 또는 비디오 오브젝트를 선택해 주세요.");
      return undefined;
    }
    const prompt = String(options?.prompt || layer.aiPrompt || "").trim();
    if (!prompt) {
      setError("AI 이미지 프롬프트를 입력해 주세요.");
      return undefined;
    }
    const stylePreset = String(options?.stylePreset || layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE);
    const orientation = resolveAiImageOrientation(options?.orientation || layer.aiImageOrientation);
    const aiModel = resolveAiImageModel(options?.aiModel || layer.aiModel);
    const orientedPrompt = applyOrientationToPrompt(prompt, orientation);
    const imageAspectRatio = orientation === "horizontal" ? "16:9" : "9:16";

    setAiImageGeneratingLayerId(layerId);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: orientedPrompt,
          aiModel,
          imageAspectRatio,
          stylePreset,
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
      updateLayerById(
        layerId,
        (targetLayer) =>
          targetLayer.type === "image" || targetLayer.type === "video"
            ? {
                ...targetLayer,
                imageUrl,
                mediaType: "image",
                fit: targetLayer.fit === "cover" ? "cover" : targetLayer.fit,
                cropX: clamp(Number(targetLayer.cropX), 0, 100, 50),
                cropY: clamp(Number(targetLayer.cropY), 0, 100, 50),
                aiPrompt: prompt,
                aiModel,
                aiStylePreset: stylePreset,
                aiImageOrientation: orientation
              }
            : targetLayer,
        pageId
      );
      setSuccess("AI 이미지를 생성해 레이어에 적용했습니다.");
      return imageUrl;
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "AI 이미지 생성에 실패했습니다.");
      return undefined;
    } finally {
      setAiImageGeneratingLayerId(undefined);
    }
  }

  async function generateAiLayerVideo(layerId: string): Promise<string | undefined> {
    if (aiVideoGeneratingLayerId) {
      setError("이미 AI 영상 생성이 진행 중입니다. 완료 또는 실패 로그를 확인해 주세요.");
      return undefined;
    }
    const page = editorRef.current.pages.find((item) => item.id === selectedPageIdRef.current);
    const layer = page?.elements.find((item) => item.id === layerId);
    if (!page || !layer || layer.type !== "video") {
      setError("AI 영상 생성은 비디오 오브젝트에서만 사용할 수 있습니다.");
      return undefined;
    }

    const estimatedCostUsd = estimateAiVideoCostUsd(layer);
    const provider = layer.aiVideoProvider === "openai" ? "openai" : "gemini";
    const durationSec = Math.max(4, Math.min(8, Math.round(Number(layer.aiVideoDurationSec) || 6)));
    const resolution = layer.aiVideoResolution === "1080p" ? "1080p" : "720p";
    const orientation = resolveAiImageOrientation(layer.aiImageOrientation);
    const aspectRatio = orientation === "horizontal" ? "16:9" : "9:16";
    const variableKey = sanitizeAiPromptVariableKey(String(layer.aiPromptVariableKey || ""));
    const dialogue = collapseWhitespace(resolveSampleValueByKey(sampleData, variableKey));
    const videoPrompt = String(layer.aiVideoPrompt || "no music, no camera movement, no subtitles");
    const confirmed = window.confirm(
      `AI 영상 생성 요청을 시작합니다.\n\n제공자: ${provider === "openai" ? "OpenAI Sora 2" : "Gemini Veo 3.1 Lite"}\n예상 비용: 약 $${estimatedCostUsd.toFixed(2)}\n\n요청을 보낸 뒤에는 중간 취소해도 과금될 수 있습니다. 진행할까요?`
    );
    if (!confirmed) {
      return undefined;
    }

    setAiVideoGeneratingLayerId(layerId);
    setAiVideoProgressTick((value) => value + 1);
    setAiVideoGenerationProgress({
      layerId,
      status: "running",
      provider,
      startedAt: Date.now(),
      estimatedCostUsd,
      message: "입력 이미지 확인 중..."
    });
    setError(undefined);
    setSuccess(undefined);
    try {
      let sourceImageUrl = String(layer.imageUrl || "").trim();
      if (!sourceImageUrl || inferMediaTypeFromSource(sourceImageUrl) === "video") {
        setAiVideoGenerationProgress((prev) =>
          prev && prev.layerId === layerId
            ? { ...prev, message: "입력 이미지가 없어 먼저 AI 이미지를 생성하는 중..." }
            : prev
        );
        sourceImageUrl = (await generateAiLayerImage(layerId)) || "";
      }
      if (!sourceImageUrl || inferMediaTypeFromSource(sourceImageUrl) === "video") {
        throw new Error("AI 영상화에 사용할 이미지가 필요합니다. 먼저 이미지를 생성하거나 업로드해 주세요.");
      }
      setAiVideoGenerationProgress((prev) =>
        prev && prev.layerId === layerId
          ? { ...prev, message: "입력 이미지 준비 완료. 영상 모델 작업 생성 및 완료 대기 중..." }
          : prev
      );
      const response = await fetch("/api/instagram/generate-image-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: sourceImageUrl,
          provider,
          prompt: videoPrompt,
          dialogue,
          durationSec,
          resolution,
          aspectRatio
        })
      });
      const data = (await response.json()) as { videoUrl?: string; error?: string };
      if (!response.ok || !data.videoUrl) {
        throw new Error(data.error || "AI 영상 생성에 실패했습니다.");
      }
      setAiVideoGenerationProgress((prev) =>
        prev && prev.layerId === layerId ? { ...prev, message: "영상 저장 및 레이어 반영 중..." } : prev
      );
      const videoUrl = String(data.videoUrl || "").trim();
      updateLayerById(
        layerId,
        (targetLayer) =>
          targetLayer.type === "video"
            ? {
                ...targetLayer,
                imageUrl: videoUrl,
                mediaType: "video",
                aiVideoEnabled: true,
                aiVideoProvider: provider,
                aiVideoPrompt: videoPrompt,
                aiVideoDurationSec: durationSec,
                aiVideoResolution: resolution
              }
            : targetLayer,
        page.id
      );
      setAiVideoGenerationProgress((prev) =>
        prev && prev.layerId === layerId
          ? { ...prev, status: "success", message: "AI 영상 생성 완료. 레이어에 적용되었습니다." }
          : prev
      );
      setSuccess("AI 영상을 생성해 레이어에 적용했습니다.");
      return videoUrl;
    } catch (videoError) {
      const message = videoError instanceof Error ? videoError.message : "AI 영상 생성에 실패했습니다.";
      setAiVideoGenerationProgress((prev) =>
        prev && prev.layerId === layerId ? { ...prev, status: "error", message } : prev
      );
      setError(message);
      return undefined;
    } finally {
      setAiVideoGeneratingLayerId(undefined);
    }
  }

  async function suggestAiPromptForLayer(layerId: string, mode: "magic" | "check" = "magic"): Promise<void> {
    const page = editorRef.current.pages.find((item) => item.id === selectedPageIdRef.current);
    const layer = page?.elements.find((item) => item.id === layerId);
    if (!page || !layer || (layer.type !== "image" && layer.type !== "video")) {
      setError("이미지 또는 비디오 오브젝트를 선택해 주세요.");
      return;
    }

    const textHints = page.elements
      .filter((item): item is InstagramTextElement => item.type === "text")
      .map((item) => collapseWhitespace(resolveTextLayerContent(item, sampleData)))
      .filter(Boolean)
      .slice(0, 8);
    const sampleTitle =
      sampleData.title ||
      sampleData.subject ||
      sampleData.newsTitleKR ||
      sampleData.newsTitle ||
      sampleData.topic ||
      "";

    const currentPromptRaw = String(layer.aiPrompt || "");
    const explicitVariableKey = sanitizeAiPromptVariableKey(String(layer.aiPromptVariableKey || ""));
    const tokenMatch = currentPromptRaw.match(/\{\{\s*([^}]+)\s*\}\}/);
    const variableKey = explicitVariableKey || (tokenMatch ? String(tokenMatch[1] || "").trim() : "");
    const variableToken = variableKey ? `{{${variableKey}}}` : tokenMatch?.[0] || "";
    const variableResolved = variableToken
      ? collapseWhitespace(resolveLayerTokenText(variableToken, sampleData, "variable"))
      : "";
    if (mode === "check") {
      if (!variableKey) {
        setError("변수명으로 실행하려면 '변수명' 필드 또는 {{변수명}} 프롬프트를 입력해 주세요.");
        return;
      }
      if (!variableResolved || variableResolved === variableToken) {
        setError(`변수 ${variableToken} 값을 sampleData에서 찾지 못했습니다.`);
        return;
      }
    }

    setAiPromptGeneratingLayerId(layerId);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/generate-image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: mode === "check" ? variableResolved : sampleData.topic || sampleData.keyword || sampleData.subject || "",
          subject: mode === "check" ? variableResolved : sampleData.subject || "",
          title: String((page as { title?: string }).title || sampleTitle || ""),
          description: mode === "check" ? "" : sampleData.description || "",
          narration: mode === "check" ? variableResolved : sampleData.narration || "",
          currentPrompt: currentPromptRaw,
          textHints: mode === "check" ? [] : textHints,
          sampleData,
          stylePreset: String(layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE),
          orientation: resolveAiImageOrientation(layer.aiImageOrientation),
          variableValue: mode === "check" ? variableResolved : "",
          variableKey: mode === "check" ? variableKey : "",
          strictVariableOnly: mode === "check"
        })
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "프롬프트 자동 완성에 실패했습니다.");
      }
      const prompt = collapseWhitespace(String(data.prompt || ""));
      if (!prompt) {
        throw new Error("생성된 프롬프트가 비어 있습니다.");
      }
      updateLayerById(layerId, (targetLayer) =>
        targetLayer.type === "image" || targetLayer.type === "video" ? { ...targetLayer, aiPrompt: prompt } : targetLayer
      );
      setSuccess(mode === "check" ? "변수 기반(check) 프롬프트를 완성했습니다." : "AI 이미지 프롬프트를 자동 완성했습니다.");
    } catch (suggestError) {
      setError(suggestError instanceof Error ? suggestError.message : "프롬프트 자동 완성에 실패했습니다.");
    } finally {
      setAiPromptGeneratingLayerId(undefined);
    }
  }

  function materializeTemplateValue(raw: string, row: Record<string, string>): string {
    return resolveLayerTokenText(String(raw || ""), row, "variable");
  }

  function buildFeedCaptionFromPayload(
    payload: Record<string, string>,
    hashtags: string[],
    captionSourceFields?: string[]
  ): string {
    const keys = Object.keys(payload || {});
    const findValue = (candidates: string[]): string => {
      for (const candidate of candidates) {
        const exact = payload[candidate];
        if (typeof exact === "string" && exact.trim()) {
          return exact.trim();
        }
        const matchedKey = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
        if (matchedKey) {
          const value = String(payload[matchedKey] || "").trim();
          if (value) {
            return value;
          }
        }
      }
      return "";
    };
    const selectedFields = (captionSourceFields || [])
      .map((field) => String(field || "").trim())
      .filter(Boolean);
    const bodyLines =
      selectedFields.length > 0
        ? selectedFields.map((field) => findValue([field])).filter(Boolean)
        : [findValue(["caption", "Caption", "subject", "Subject", "description"])].filter(Boolean);
    const body = Array.from(new Set(bodyLines)).join("\n").trim();
    const normalizedTags = hashtags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
    const tagLine = normalizedTags.join(" ").trim();
    return [body, tagLine].filter(Boolean).join("\n");
  }

  function pushCurrentTemplateToFeed(): void {
    try {
      const sourceItem = feedEditSourceItem;
      const currentPayload = sampleData || {};
      const sourcePayload = sourceItem?.sampleData || {};
      const currentRowId = String(currentPayload.id || currentPayload.ID || "").trim();
      const sourceRowId = String(sourceItem?.rowId || sourcePayload.id || sourcePayload.ID || "").trim();
      const payload =
        sourceItem && sourceRowId && currentRowId && currentRowId !== sourceRowId
          ? { ...currentPayload, ...sourcePayload }
          : { ...sourcePayload, ...currentPayload };
      const payloadKeys = Object.keys(payload || {});
      const findPayloadValue = (candidates: string[], fallback = ""): string => {
        for (const candidate of candidates) {
          const exact = payload[candidate];
          if (typeof exact === "string" && exact.trim()) {
            return exact.trim();
          }
          const matchedKey = payloadKeys.find((key) => key.toLowerCase() === candidate.toLowerCase());
          if (matchedKey) {
            const value = String(payload[matchedKey] || "").trim();
            if (value) return value;
          }
        }
        return fallback;
      };
      const templateHashtags = normalizeTemplateHashtags(editor.hashtags);
      const feedHashtags =
        templateHashtags.length > 0
          ? templateHashtags
          : buildTopicDefaultHashtags({
              templateName: editor.templateName,
              payload,
              sourceFields: (editor.hashtagSourceFields || []).length > 0 ? editor.hashtagSourceFields || [] : ["subject", "keyword", "type"]
            });
      const feedCaption = buildFeedCaptionFromPayload(payload, feedHashtags, editor.captionSourceFields);
      const pages: InstagramFeedPage[] = editor.pages.map((page) => ({
        ...page,
        backgroundImageUrl: materializeTemplateValue(String(page.backgroundImageUrl || ""), payload),
        audioPrompt: materializeTemplateValue(String(page.audioPrompt || ""), payload),
        elements: page.elements.map((element) =>
          element.type === "text"
            ? {
                ...element,
                text:
                  element.textMode === "plain"
                    ? String(element.text || "")
                    : resolveLayerTokenText(element.text, payload, "variable", element.bindingKey)
              }
            : element.type === "image"
              ? {
                  ...element,
                  imageUrl: materializeTemplateValue(String(element.imageUrl || ""), payload),
                  aiPrompt: materializeTemplateValue(String(element.aiPrompt || ""), payload),
                  aiPromptVariableKey: sanitizeAiPromptVariableKey(String(element.aiPromptVariableKey || ""))
                }
              : element
        )
      }));
      const feedItem: InstagramGeneratedFeedItem = {
        id: sourceItem?.id || uid(),
        templateId: sourceItem?.templateId || editor.id,
        templateName: editor.templateName,
        rowId: sourceRowId || findPayloadValue(["id", "ID"], `template-${Date.now()}`),
        subject: findPayloadValue(["subject", "Subject"], sourceItem?.subject || editor.templateName || "Template Draft"),
        keyword: findPayloadValue(["keyword", "Keyword", "type", "jlpt"], sourceItem?.keyword || "template"),
        bgmEnabled: Boolean(editor.bgmEnabled && String(editor.bgmUrl || "").trim()),
        bgmUrl: String(editor.bgmUrl || ""),
        bgmVolume: clamp(Number(editor.bgmVolume), 0, 1, 0.18),
        templateMode: resolveTemplateMode(editor.mode),
        canvasPreset: editor.canvasPreset,
        canvasWidth: editor.canvasWidth,
        canvasHeight: editor.canvasHeight,
        pageDurationSec: editor.pageDurationSec,
        customFonts: editor.customFonts || [],
        captionSourceFields: editor.captionSourceFields || [],
        hashtagSourceFields: editor.hashtagSourceFields || [],
        caption: feedCaption,
        hashtags: feedHashtags,
        generatedAt: new Date().toISOString(),
        sampleData: payload,
        pages
      };
      const currentRaw = typeof window !== "undefined" ? window.localStorage.getItem(INSTAGRAM_FEED_STORAGE_KEY) : null;
      const currentItems = currentRaw ? ((JSON.parse(currentRaw) as InstagramGeneratedFeedItem[]) || []) : [];
      const nextItems = [feedItem, ...currentItems.filter((item) => item.id !== feedItem.id)].slice(0, 200);
      window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(nextItems));
      window.localStorage.setItem(
        INSTAGRAM_FEED_DRAFT_KEY,
        JSON.stringify({
          selectedItemId: feedItem.id,
          caption: feedCaption,
          source: "instagram-news"
        })
      );
      setSuccess("현재 템플릿을 피드로 보냈습니다. 피드 화면에서 바로 업로드할 수 있습니다.");
      router.push("/instagram/feed");
    } catch (error) {
      setError(error instanceof Error ? error.message : "템플릿을 피드로 보내는 중 오류가 발생했습니다.");
    }
  }

  function fillImageLayerToCanvas(layerId: string): void {
    updateLayerById(layerId, (layer) =>
      layer.type === "image" || layer.type === "video"
        ? {
            ...layer,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            fit: "cover",
            cropX: 50,
            cropY: 50,
            borderRadius: 0
          }
        : layer
    );
    setSuccess("미디어 오브젝트를 화면에 꽉 차게 배치했습니다.");
  }

  function applySelectedImageToAllPages(layerId: string, targetPageId: string = "__all__"): void {
    const page = editorRef.current.pages.find((item) => item.id === selectedPageIdRef.current);
    const sourceLayer = page?.elements.find((item) => item.id === layerId);
    if (!sourceLayer || (sourceLayer.type !== "image" && sourceLayer.type !== "video")) {
      setError("이미지 또는 비디오 오브젝트를 선택해 주세요.");
      return;
    }
    const imageUrl = String(sourceLayer.imageUrl || "").trim();
    if (!imageUrl) {
      setError("적용할 미디어가 없습니다. 먼저 AI 생성 또는 가져오기를 해주세요.");
      return;
    }
    const sourceMediaType = sourceLayer.mediaType === "video" ? "video" : "image";
    let appliedCount = 0;
    updateEditor((current) => {
      current.pages = current.pages.map((targetPage) => {
        if (targetPage.id === selectedPageIdRef.current) {
          return targetPage;
        }
        if (targetPageId !== "__all__" && targetPage.id !== targetPageId) {
          return targetPage;
        }
        const targetImageIndex = targetPage.elements.findIndex((element) => element.type === sourceLayer.type);
        if (targetImageIndex < 0) {
          return targetPage;
        }
        const nextElements = [...targetPage.elements];
        const targetLayer = nextElements[targetImageIndex];
        if (targetLayer.type !== sourceLayer.type) {
          return targetPage;
        }
        nextElements[targetImageIndex] =
          targetLayer.type === "image"
            ? {
                ...targetLayer,
                imageUrl,
                mediaType: "image"
              }
            : {
                ...targetLayer,
                imageUrl,
                mediaType: sourceMediaType
              };
        appliedCount += 1;
        return {
          ...targetPage,
          elements: nextElements
        };
      });
      return current;
    });
    if (appliedCount <= 0) {
      setError("선택한 대상 페이지에 이미지 레이어가 없어 적용되지 않았습니다.");
      return;
    }
    setSuccess(targetPageId === "__all__" ? "현재 이미지를 다른 페이지에도 적용했습니다." : "선택한 페이지에 이미지를 적용했습니다.");
  }

  function setImageBoxFillMode(layerId: string, enabled: boolean): void {
    updateLayerById(layerId, (layer) =>
      layer.type === "image" || layer.type === "video"
        ? {
            ...layer,
            fit: enabled ? "cover" : "contain"
          }
        : layer
    );
    setSuccess(enabled ? "미디어 박스 꽉 채우기 모드를 적용했습니다." : "미디어 박스 원본 비율 모드로 전환했습니다.");
  }

  async function applyNewsImageToLayer(layerId: string): Promise<void> {
    if (!isNewsMode) {
      setError("템플릿 모드를 뉴스로 바꾸면 뉴스 이미지 적용 버튼을 사용할 수 있습니다.");
      return;
    }
    if (!selectedNewsItem) {
      setError("뉴스 항목을 먼저 선택해 주세요. (Data Binding > 뉴스 데이터)");
      return;
    }

    const prompt = collapseWhitespace(selectedNewsItem.imagePrompt || NEWS_IMAGE_PROMPT_FALLBACK);
    if (!prompt) {
      setError("선택한 뉴스에 이미지 프롬프트가 없습니다.");
      return;
    }
    const page = editorRef.current.pages.find((item) => item.id === selectedPageIdRef.current);
    const currentImageLayer = page?.elements.find((item) => item.id === layerId);
    const orientation =
      currentImageLayer && currentImageLayer.type === "image"
        ? resolveAiImageOrientation(currentImageLayer.aiImageOrientation)
        : "vertical";

    updateLayerById(layerId, (layer) =>
      layer.type === "image"
        ? {
            ...layer,
            aiGenerateEnabled: true,
            aiPrompt: prompt,
            aiModel: resolveAiImageModel(layer.aiModel),
            aiStylePreset: layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE,
            aiImageOrientation: orientation,
            fit: "cover",
            cropX: 50,
            cropY: 50,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            borderRadius: 0
          }
        : layer
    );
    const imageUrl = await generateAiLayerImage(layerId, { prompt, orientation });
    if (imageUrl) {
      const pageNumber = String(Math.max(1, editorRef.current.pages.findIndex((item) => item.id === selectedPageIdRef.current) + 1));
      const generatedImageUrls: Record<string, string> = { [pageNumber]: imageUrl };
      applyNewsSampleData(selectedNewsItem, {
        generatedImageUrl: imageUrl,
        generatedImageUrls
      });
      setSuccess("뉴스 이미지 프롬프트로 AI 이미지를 생성해 적용했습니다.");
    }
  }

  function applyBindingRowSampleData(rowValues: Record<string, string>): Record<string, string> {
    const shouldApplySentenceReading = isSentenceReadingMode || hasSentenceReadingRowData(rowValues);
    const sentenceReadingRowValues = shouldApplySentenceReading
      ? {
          ...rowValues,
          title: normalizeSentenceReadingCardTitle(rowValues.title || rowValues.Subject || rowValues.shortTitle || "")
        }
      : rowValues;
    const nextSampleData = shouldApplySentenceReading
      ? sentenceReadingRowValues
      : isNewsMode
        ? { ...sampleData, ...rowValues }
        : sanitizeGeneralSampleData(sampleData, rowValues);

    setSampleData(nextSampleData);

    if (shouldApplySentenceReading) {
      const cardSet = normalizeSentenceReadingCardSetShared(nextSampleData);
      const pages = buildSentenceReadingPagesShared(cardSet);
      const uploadInfo = buildSentenceReadingUploadInfo(cardSet);
      sentencePageBodyFontBaselineRef.current = {};
      setSentencePageFontDeltas({});
      updateEditor(
        (prev) => ({
          ...prev,
          mode: "sentence_reading",
          sourceTitle: cardSet.postTitle,
          sourceTopic: cardSet.title,
          hashtags: normalizeTemplateHashtags(uploadInfo.hashtags.split(/\s+/)),
          pageCount: pages.length,
          pages
        }),
        { keepSuccess: true }
      );
      setSelectedPageId(pages[0]?.id || "");
      setSelectedElementId(undefined);
      setSelectedElementIds([]);
      setObjectToolbarVisible(false);
    }

    return nextSampleData;
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
      setBindingFields(isNewsMode ? mergeNewsBindingFields(headers) : uniqueValues(headers));
      const nextRowOptions = createBindingRowOptions(rows);
      setBindingRowOptions(nextRowOptions);
      if (nextRowOptions.length > 0) {
        const feedSourceRowKey = feedEditSourceRowKeyRef.current;
        const feedPreferredKey = feedSourceRowKey
          ? nextRowOptions.find((item) => readBindingRowValue(item.values, "id").toLowerCase() === feedSourceRowKey.toLowerCase())?.key
          : "";
        const preferredKey =
          feedPreferredKey ||
          nextRowOptions.find((item) => item.key === bindingSelectedRowKey)?.key ||
          nextRowOptions[0].key;
        const selectedRow = nextRowOptions.find((item) => item.key === preferredKey) || nextRowOptions[0];
        setBindingSelectedRowKey(preferredKey);
        applyBindingRowSampleData(selectedRow.values);
      } else {
        setBindingSelectedRowKey("");
      }
      if (data.sheetName) {
        setSheetName(data.sheetName);
        saveInstagramLastSheetName(data.sheetName);
      } else if (effectiveSheetName) {
        saveInstagramLastSheetName(effectiveSheetName);
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

  function updateBindingSheetName(value: string): void {
    setSheetName(value);
    saveInstagramLastSheetName(value);
  }

  function resetBindingSheetNameToSettings(): string {
    const nextSheetName = saveInstagramLastSheetName(settingsSheetName);
    setSheetName(nextSheetName);
    return nextSheetName;
  }

  async function applyBindingRowByKey(rowKey: string, options?: { showLoading?: boolean }): Promise<void> {
    if (!rowKey) {
      setError("적용할 row가 없습니다. 먼저 시트 row를 불러와 주세요.");
      return;
    }
    const selectedRow = bindingRowOptions.find((item) => item.key === rowKey);
    if (!selectedRow) {
      setError("선택한 row를 찾지 못했습니다. 시트 row를 다시 불러와 주세요.");
      return;
    }
    const appliedLabel =
      readBindingRowValue(selectedRow.values, "id") ||
      readBindingRowValue(selectedRow.values, "Subject") ||
      selectedRow.label;

    setBindingSelectedRowKey(rowKey);
    setError(undefined);
    setSuccess(undefined);
    setBindingApplyMessage(`적용 중: ${appliedLabel}`);
    if (options?.showLoading !== false) {
      setBindingApplyLoading(true);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    try {
      applyBindingRowSampleData(selectedRow.values);
      const message = isSentenceReadingMode || hasSentenceReadingRowData(selectedRow.values)
        ? `적용 완료: ${appliedLabel} row로 문장 읽기 카드 세트를 다시 구성했습니다.`
        : `적용 완료: ${appliedLabel} row 값을 샘플 미리보기에 반영했습니다.`;
      setBindingApplyMessage(message);
      setSuccess(message);
    } finally {
      if (options?.showLoading !== false) {
        window.setTimeout(() => setBindingApplyLoading(false), 180);
      }
    }
  }

  function onSelectBindingRow(rowKey: string): void {
    void applyBindingRowByKey(rowKey);
  }

  function applySelectedBindingRow(): void {
    const rowKey = bindingSelectedRowKey || bindingRowOptions[0]?.key || "";
    void applyBindingRowByKey(rowKey);
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
        const payload = await replaceTemplateDataUrlMedia(deepCloneTemplate(template));
        payload.id = uid();
        payload.updatedAt = new Date().toISOString();
        payload.pageCount = payload.pages.length;
        const response = await fetch("/api/instagram/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: payload })
        });
        const data = await readJsonOrThrow<TemplateResponse>(response, "템플릿 저장 중 오류가 발생했습니다.");
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

  function openTemplateJsonModal(mode: "import" | "export"): void {
    setTemplateJsonModalMode(mode);
    setTemplateJsonModalOpen(true);
    setTemplateMenuOpen(undefined);
    if (mode === "export") {
      setImportJson(JSON.stringify(editor, null, 2));
    }
  }

  function openOutputRenderModal(mode: "png" | "mp4" = "png"): void {
    setOutputRenderModalMode(mode);
    setOutputRenderModalOpen(true);
    setTemplateMenuOpen(undefined);
  }

  function downloadCurrentTemplateJson(): void {
    const blob = new Blob([JSON.stringify(editor, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeDownloadName(editor.templateName || "instagram-template")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSuccess("현재 템플릿 JSON 다운로드를 시작했습니다.");
  }

  function applySentenceReadingCardSet(): void {
    const cardSet = normalizeSentenceReadingCardSetShared(sampleData);
    const pages = buildSentenceReadingPagesShared(cardSet);
    const uploadInfo = buildSentenceReadingUploadInfo(cardSet);
    const nextHashtags = normalizeTemplateHashtags(cardSet.hashtags.split(/\s+/));
    updateEditor(
      (current) => ({
        ...current,
        mode: "sentence_reading",
        templateName: current.templateName?.trim() ? current.templateName : "문장 읽기 카드",
        sourceTitle: cardSet.title,
        sourceTopic: cardSet.postTitle,
        canvasPreset: "instagram_feed_portrait",
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        pageDurationSec: 4,
        pageCount: pages.length,
        pages,
        hashtags: nextHashtags,
        captionSourceFields: ["Caption", "Subject"]
      }),
      { keepSuccess: true }
    );
    setSampleData((current) => ({
      ...current,
      title: cardSet.title,
      postTitle: cardSet.postTitle,
      Subject: cardSet.title,
      Caption: uploadInfo.caption,
      instagramTitle: uploadInfo.instagramTitle,
      instagramDescription: uploadInfo.description,
      audioScript: cardSet.audioScript,
      hashtags: cardSet.hashtags
    }));
    setSelectedPageId(pages[0]?.id || "");
    setSelectedElementId(pages[0]?.elements[0]?.id);
    setSuccess(`문장 읽기 카드 ${pages.length}장을 생성했습니다.`);
  }

  function adjustSentenceReadingPageFont(pageId: string, delta: number): void {
    changeSentenceReadingPageBodyFont(pageId, delta > 0 ? 1 : -1);
  }

  function resetSentenceReadingPageFont(pageId: string): void {
    resetSentenceReadingPageBodyFont(pageId);
  }

  async function downloadSentenceReadingPagePng(page: InstagramFeedPage, index: number): Promise<void> {
    setRenderingOutput(true);
    setError(undefined);
    try {
      const dataUrl = await renderPageToPngDataUrl({
        page,
        sampleData,
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT
      });
      const blob = await dataUrlToBlob(dataUrl);
      downloadBlob(blob, sentenceReadingPngFileName(page, index));
      setSuccess(`${page.name} PNG 다운로드를 시작했습니다.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "카드 PNG 다운로드에 실패했습니다.");
    } finally {
      setRenderingOutput(false);
    }
  }

  async function downloadSentenceReadingZip(): Promise<void> {
    if (editor.pages.length === 0) {
      setError("다운로드할 카드가 없습니다.");
      return;
    }
    setRenderingOutput(true);
    setError(undefined);
    try {
      const zip = new JSZip();
      for (let index = 0; index < editor.pages.length; index += 1) {
        const page = editor.pages[index];
        const dataUrl = await renderPageToPngDataUrl({
          page,
          sampleData,
          canvasWidth: DEFAULT_CANVAS_WIDTH,
          canvasHeight: DEFAULT_CANVAS_HEIGHT
        });
        zip.file(sentenceReadingPngFileName(page, index), await dataUrlToBlob(dataUrl));
      }
      zip.file("audio-script.txt", sentenceReadingCardSet.audioScript);
      zip.file("instagram-caption.txt", buildSentenceReadingUploadInfo(sentenceReadingCardSet).caption);
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${sanitizeDownloadName(sentenceReadingCardSet.postTitle || "sentence-reading-cards")}.zip`);
      setSuccess(`문장 읽기 카드 ${editor.pages.length}장을 ZIP으로 다운로드합니다.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "전체 ZIP 다운로드에 실패했습니다.");
    } finally {
      setRenderingOutput(false);
    }
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
    if (
      selectedPage.audioEnabled &&
      !String(selectedPage.audioUrl || "").trim() &&
      !String(selectedPage.audioPrompt || "").trim()
    ) {
      setError("오디오 사용이 켜져 있습니다. 오디오 파일을 첨부하거나 오디오 스크립트를 입력해 주세요.");
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
          audioUrl: String(selectedPage.audioUrl || "").trim() || undefined,
          audioPrompt: String(selectedPage.audioPrompt || "").trim() || undefined,
          bgmEnabled: Boolean(editor.bgmEnabled && String(editor.bgmUrl || "").trim()),
          bgmUrl: String(editor.bgmUrl || "").trim() || undefined,
          bgmVolume: clamp(Number(editor.bgmVolume), 0, 1, 0.18),
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
      const uploadedAudioUrl = String(selectedPage.audioUrl || "").trim();
      if (uploadedAudioUrl) {
        pendingAudioPreviewPlayRef.current = true;
        setAudioPreviewUrl((prev) => {
          if (prev && prev.startsWith("blob:")) {
            URL.revokeObjectURL(prev);
          }
          return toInstagramMediaPreviewUrl(uploadedAudioUrl);
        });
        return;
      }
      const resolvedText = resolveLayerTokenText(String(selectedPage.audioPrompt || ""), sampleData, "variable").trim();
      if (!resolvedText) {
        throw new Error("오디오 파일을 첨부하거나 오디오 스크립트를 입력해 주세요. ({{변수}} 치환 후 기준)");
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

  async function onPageAudioUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSupportedAudioFile(file)) {
      event.target.value = "";
      setError("페이지 오디오는 mp3, m4a, wav, ogg 등 오디오 파일만 첨부할 수 있습니다.");
      return;
    }
    setPageAudioUploading(true);
    setPageAudioUploadProgress(1);
    setError(undefined);
    setSuccess(undefined);
    try {
      const audioUrl = await uploadTemplateMediaFile(file, (percent) => {
        setPageAudioUploadProgress(Math.max(1, Math.min(100, Math.round(percent))));
      });
      updateSelectedPage((page) => ({
        ...page,
        audioEnabled: true,
        audioUrl,
        audioPrompt: String(page.audioPrompt || "")
      }));
      setAudioPreviewUrl(undefined);
      setSuccess("페이지 오디오 파일을 첨부했습니다.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "페이지 오디오 업로드에 실패했습니다.");
    } finally {
      setPageAudioUploading(false);
      window.setTimeout(() => setPageAudioUploadProgress(undefined), 1200);
      event.target.value = "";
    }
  }

  async function onTemplateBgmUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSupportedAudioFile(file)) {
      event.target.value = "";
      setError("BGM은 mp3, m4a, wav, ogg 등 오디오 파일만 첨부할 수 있습니다.");
      return;
    }
    setTemplateBgmUploading(true);
    setTemplateBgmUploadProgress(1);
    setError(undefined);
    setSuccess(undefined);
    try {
      const bgmUrl = await uploadTemplateMediaFile(file, (percent) => {
        setTemplateBgmUploadProgress(Math.max(1, Math.min(100, Math.round(percent))));
      });
      updateEditor((current) => ({
        ...current,
        bgmEnabled: true,
        bgmUrl,
        bgmVolume: clamp(Number(current.bgmVolume), 0, 1, 0.18)
      }));
      setSuccess("템플릿 BGM 파일을 첨부했습니다.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "BGM 업로드에 실패했습니다.");
    } finally {
      setTemplateBgmUploading(false);
      window.setTimeout(() => setTemplateBgmUploadProgress(undefined), 1200);
      event.target.value = "";
    }
  }

  async function searchPixabaySoundEffects(): Promise<void> {
    const query = pixabayQuery.trim();
    if (query.length < 2) {
      setPixabayError("검색어를 2자 이상 입력해 주세요.");
      return;
    }
    setPixabaySearching(true);
    setPixabayError(undefined);
    try {
      const response = await fetch(`/api/instagram/pixabay-sound-effects/search?q=${encodeURIComponent(query)}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as PixabaySoundEffectSearchResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Pixabay Sound Effects 검색에 실패했습니다.");
      }
      setPixabayResults(data.results || []);
      if (!(data.results || []).length) {
        setPixabayError("검색 결과가 없습니다.");
      }
    } catch (searchError) {
      setPixabayError(searchError instanceof Error ? searchError.message : "Pixabay Sound Effects 검색에 실패했습니다.");
      setPixabayResults([]);
    } finally {
      setPixabaySearching(false);
    }
  }

  async function applyPixabaySoundEffect(result: PixabaySoundEffectResult): Promise<void> {
    setPixabayApplyingId(result.id);
    setPixabayError(undefined);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/pixabay-sound-effects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: result.audioUrl,
          title: result.title
        })
      });
      const data = (await response.json()) as PixabaySoundEffectImportResponse;
      if (!response.ok || !data.publicUrl) {
        throw new Error(data.error || "Pixabay Sound Effect 적용에 실패했습니다.");
      }
      updateEditor((current) => ({
        ...current,
        bgmEnabled: true,
        bgmUrl: data.publicUrl || "",
        bgmVolume: clamp(Number(current.bgmVolume), 0, 1, 0.18)
      }));
      setSuccess(`Pixabay Sound Effect를 BGM으로 적용했습니다: ${result.title}`);
    } catch (applyError) {
      setPixabayError(applyError instanceof Error ? applyError.message : "Pixabay Sound Effect 적용에 실패했습니다.");
    } finally {
      setPixabayApplyingId(undefined);
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

  async function uploadCustomFontFile(file: File): Promise<InstagramCustomFont> {
    const formData = new FormData();
    formData.append("file", file);
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
    return uploadedFont;
  }

  async function uploadCustomFontFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    setCustomFontUploading(true);
    setCustomFontMessage(undefined);
    setError(undefined);
    const uploadedFonts: InstagramCustomFont[] = [];
    const failed: string[] = [];
    try {
      for (const file of files) {
        try {
          const uploadedFont = await uploadCustomFontFile(file);
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
          uploadedFonts.push(uploadedFont);
        } catch (fontError) {
          const message = fontError instanceof Error ? fontError.message : "커스텀 폰트 업로드에 실패했습니다.";
          failed.push(`${file.name || "font"}: ${message}`);
        }
      }

      if (uploadedFonts.length > 0) {
        const names = uploadedFonts.map((font) => font.family);
        const title =
          uploadedFonts.length === 1
            ? `커스텀 폰트 업로드 완료: ${names[0]}`
            : `커스텀 폰트 ${uploadedFonts.length}개 업로드 완료`;
        setSuccess(title);
        setCustomFontMessage(
          uploadedFonts.length === 1
            ? `업로드 완료: ${names[0]}`
            : `업로드 완료 ${uploadedFonts.length}개 (${names.slice(0, 3).join(", ")}${
                uploadedFonts.length > 3 ? " ..." : ""
              })`
        );
        if (selectedLayer?.type === "text") {
          await applySelectedTextFont(names[names.length - 1]);
        }
      }

      if (failed.length > 0) {
        const failedMessage =
          failed.length === 1
            ? failed[0]
            : `실패 ${failed.length}개: ${failed.slice(0, 2).join(" / ")}${failed.length > 2 ? " ..." : ""}`;
        setError(failedMessage);
        setCustomFontMessage((prev) => (prev ? `${prev} · ${failedMessage}` : failedMessage));
      }
    } finally {
      setCustomFontUploading(false);
    }
  }

  async function handleCustomFontFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) {
      return;
    }
    await uploadCustomFontFiles(files);
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

  async function downloadSelectedLayerImage(layerId: string): Promise<void> {
    const page = selectedPage;
    const layer = page?.elements.find((item) => item.id === layerId);
    if (!page || !layer || (layer.type !== "image" && layer.type !== "video")) {
      setError("이미지 또는 비디오 오브젝트를 선택해 주세요.");
      return;
    }
    const mediaUrl = String(layer.imageUrl || "").trim();
    if (!mediaUrl) {
      setError("다운로드할 AI 이미지가 없습니다. 먼저 AI 이미지 생성 또는 가져오기를 해주세요.");
      return;
    }
    if (layer.mediaType === "video" || inferMediaTypeFromSource(mediaUrl) === "video") {
      setError("현재 선택된 미디어는 비디오입니다. AI 이미지가 들어있는 오브젝트를 선택해 주세요.");
      return;
    }
    setError(undefined);
    try {
      await downloadMediaBlob(mediaUrl, `${editor.templateName || "instagram-template"}-${page.name || "page"}-${layer.id}`);
      setSuccess("AI 이미지 다운로드를 시작했습니다.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "AI 이미지 다운로드에 실패했습니다.");
    }
  }

  const canvasLayers = useMemo(() => [...sortedLayers].sort((a, b) => a.zIndex - b.zIndex), [sortedLayers]);
  const selectedPageIndex = useMemo(
    () => editor.pages.findIndex((page) => page.id === selectedPageId),
    [editor.pages, selectedPageId]
  );
  const selectedPagePreviewVisible = selectedPage ? (pagePreviewVisible[selectedPage.id] ?? true) : true;
  const isMobileViewport = viewportWidth <= 768;
  const isCompactMobileViewport = viewportWidth <= 768;
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
  const objectToolbarViewportWidth =
    typeof window === "undefined" ? 1280 : window.innerWidth;
  const objectToolbarViewportHeight =
    typeof window === "undefined" ? 900 : window.innerHeight;
  const objectToolbarRenderedWidth = Math.min(
    objectToolbarClampedWidth,
    Math.max(minObjectToolbarWidth, objectToolbarViewportWidth - 24)
  );
  const objectToolbarBaseLeft = (() => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect) {
      return isMobileViewport ? 8 : canvasRect.left + 12;
    }
    return isMobileViewport ? 8 : 96;
  })();
  const objectToolbarBaseTop = isMobileViewport ? 64 : 72;
  const objectToolbarLeft = clamp(
    objectToolbarBaseLeft + objectToolbarOffset.x,
    8,
    Math.max(8, objectToolbarViewportWidth - objectToolbarRenderedWidth - 8),
    objectToolbarBaseLeft
  );
  const objectToolbarTop = clamp(
    objectToolbarBaseTop + objectToolbarOffset.y,
    56,
    Math.max(56, objectToolbarViewportHeight - 132),
    objectToolbarBaseTop
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

  function renderPageMiniature(page: InstagramTemplate["pages"][number]): React.ReactNode {
    const layers = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    return (
      <div
        className="relative h-full w-full overflow-hidden rounded-md border bg-zinc-100 shadow-inner"
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}`, containerType: "inline-size" }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: normalizeHex(page.backgroundColor || "#FFFFFF", "#FFFFFF") }}
        />
        {page.backgroundImageUrl ? (
          inferMediaTypeFromSource(page.backgroundImageUrl) === "video" ? (
            <video
              src={toInstagramMediaPreviewUrl(page.backgroundImageUrl)}
              className={`absolute inset-0 h-full w-full ${page.backgroundFit === "contain" ? "object-contain" : "object-cover"}`}
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={toInstagramMediaPreviewUrl(page.backgroundImageUrl)}
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
            overflow: "hidden"
          };

          if (layer.type === "text") {
            const text = resolveTextLayerContent(layer, sampleData) || "(텍스트)";
            return (
              <div
                key={`mini-${page.id}-${layer.id}`}
                style={{
                  ...sharedStyle,
                  color: normalizeHex(layer.color, "#111111"),
                  fontFamily: buildFontFamilyStack(layer.fontFamily),
                  fontWeight: layer.bold ? 700 : 400,
                  fontStyle: layer.italic ? "italic" : "normal",
                  textAlign: layer.textAlign,
                  fontSize: toCanvasWidthUnit(Math.max(10, layer.fontSize), canvasWidth),
                  lineHeight: String(
                    clamp(layer.lineHeight, 0.8, 3, 1.2) +
                      (textHasRuby(text) ? normalizeRubyGap(layer.rubyGap) / Math.max(10, layer.fontSize) : 0)
                  ),
                  backgroundColor:
                    layer.padding > 0 ||
                    normalizeHex(layer.backgroundColor, "#FFFFFF") !== "#FFFFFF" ||
                    clamp(Number(layer.backgroundOpacity), 0, 1, 1) < 1
                      ? withAlpha(layer.backgroundColor, clamp(Number(layer.backgroundOpacity), 0, 1, 1))
                      : "transparent",
                  padding: toCanvasWidthUnit(Math.max(0, layer.padding), canvasWidth),
                  whiteSpace: layer.autoWrap === false ? "pre" : "pre-wrap",
                  overflowWrap: layer.autoWrap === false ? "normal" : "anywhere",
                  wordBreak: layer.autoWrap === false ? "normal" : "normal",
                  lineBreak: "strict",
                  rubyPosition: "over",
                  textDecorationLine: getTextDecorationLine(layer),
                  textShadow: getTextShadowStyle(layer)
                }}
              >
                <div style={{ transform: `translateY(${toCanvasWidthUnit(normalizeTextOffsetY(layer.textOffsetY), canvasWidth)})` }}>
                  {renderRubyPreviewNodes(text, toCanvasWidthUnit(normalizeRubyGap(layer.rubyGap), canvasWidth))}
                </div>
              </div>
            );
          }

          if (layer.type === "shape") {
            const shapeType = normalizeShapeType(layer.shape);
            const isLineShape = shapeType === "line";
            return (
              <div
                key={`mini-${page.id}-${layer.id}`}
                style={{
                  ...sharedStyle,
                  borderRadius:
                    shapeType === "circle"
                      ? "9999px"
                      : shapeType === "roundedRectangle" || shapeType === "rectangle"
                        ? `${clamp(layer.cornerRadius, 0, 200, 24) * 0.5}px`
                        : "0px",
                  clipPath: isLineShape ? undefined : getShapeClipPath(shapeType),
                  backgroundColor:
                    isLineShape || layer.fillEnabled === false
                      ? "transparent"
                      : withAlpha(normalizeHex(layer.fillColor, "#F4F1EA"), clamp(Number(layer.fillOpacity), 0, 1, 1)),
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
              key={`mini-${page.id}-${layer.id}`}
              style={{
                ...sharedStyle,
                borderRadius: `${clamp(layer.borderRadius, 0, 220, 16) * 0.5}px`
              }}
            >
              {layer.imageUrl ? (
                layer.mediaType === "video" || inferMediaTypeFromSource(layer.imageUrl) === "video" ? (
                  <video
                    src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                    style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                    alt="layer"
                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                    style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
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
    );
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

  const selectedSentencePageFontDelta = selectedPage ? (sentencePageFontDeltas[selectedPage.id] ?? 0) : 0;
  const selectedSentenceBodyLayerCount = selectedPage
    ? selectedPage.elements.filter(isSentenceReadingBodyTextLayer).length
    : 0;
  const selectedSentenceFontDeltaLabel =
    selectedSentencePageFontDelta > 0 ? `+${selectedSentencePageFontDelta}px` : `${selectedSentencePageFontDelta}px`;

  return (
    <section className="space-y-4" onPointerDownCapture={handleBackgroundPointerDownCapture}>
      <div className="sticky top-0 z-40 -mx-2 border-b border-white/10 bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-bold sm:text-xl">Instagram 템플릿</h1>
              {activeTemplateId === selectedTemplateId && selectedTemplateId !== "__new__" ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                  자동화 기본
                </span>
              ) : null}
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {editor.templateName || "새 템플릿"} · {canvasWidth}x{canvasHeight}
            </p>
          </div>
          <div className="relative" data-keep-selection="true">
            <Button
              type="button"
              variant={templateMenuOpen === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setTemplateMenuOpen((current) => (current === "file" ? undefined : "file"))}
            >
              파일
              <ChevronDown className="h-4 w-4" />
            </Button>
            {templateMenuOpen === "file" ? (
              <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    setTemplateMenuOpen(undefined);
                    void persistTemplate("new");
                  }}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" />
                  다른 이름으로 저장
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => {
                    setTemplateMenuOpen(undefined);
                    void duplicateTemplate();
                  }}
                  disabled={busy}
                >
                  <Copy className="h-4 w-4" />
                  복제
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => {
                    setTemplateMenuOpen(undefined);
                    void persistTemplate("update");
                  }}
                  disabled={busy || selectedTemplateId === "__new__"}
                >
                  <Save className="h-4 w-4" />
                  저장
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  onClick={() => {
                    setTemplateMenuOpen(undefined);
                    void removeTemplate(selectedTemplateId);
                  }}
                  disabled={busy || selectedTemplateId === "__new__"}
                >
                  <Trash2 className="h-4 w-4" />
                  삭제
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative" data-keep-selection="true">
            <Button
              type="button"
              variant={templateMenuOpen === "features" ? "default" : "outline"}
              size="sm"
              onClick={() => setTemplateMenuOpen((current) => (current === "features" ? undefined : "features"))}
            >
              기능
              <ChevronDown className="h-4 w-4" />
            </Button>
            {templateMenuOpen === "features" ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-xl sm:left-0 sm:right-auto">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => {
                    setTemplateMenuOpen(undefined);
                    void setActive(selectedTemplateId);
                  }}
                  disabled={busy || selectedTemplateId === "__new__"}
                >
                  <Check className="h-4 w-4" />
                  자동화 기본 지정
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => openTemplateJsonModal("import")}
                >
                  <Upload className="h-4 w-4" />
                  템플릿 가져오기
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => openTemplateJsonModal("export")}
                >
                  <Download className="h-4 w-4" />
                  템플릿 내보내기
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent"
                  onClick={() => openOutputRenderModal("png")}
                >
                  <FileImage className="h-4 w-4" />
                  PNG/MP4 렌더
                </button>
              </div>
            ) : null}
          </div>
          <Button type="button" size="sm" onClick={pushCurrentTemplateToFeed} disabled={busy}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">피드로 내보내기</span>
            <span className="sm:hidden">피드</span>
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          레이어를 직접 드래그/리사이즈하고, 이미지 업로드/배경 설정/시트 컬럼 바인딩으로 즉시 결과물을 확인합니다.
        </p>
      </header>

      <div className="rounded-xl border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_auto]">
          <div className="space-y-1">
            <Label>저장된 템플릿</Label>
            <div className="flex gap-2">
              <Select value={selectedTemplateId} onValueChange={selectTemplate}>
                <SelectTrigger className="min-w-0 bg-card dark:bg-zinc-900">
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
          </div>
          <div className="group relative self-end">
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
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(140px,0.7fr)_minmax(150px,0.7fr)_minmax(210px,1fr)_96px_96px]">
          <div className="space-y-1">
            <Label>템플릿 이름</Label>
            <Input
              value={editor.templateName}
              onChange={(event) => updateEditor((current) => ({ ...current, templateName: event.target.value }))}
              placeholder="Template name"
            />
          </div>
          <div className="space-y-1">
            <Label>모드</Label>
            <Select
              value={resolveTemplateMode(editor.mode)}
              onValueChange={(value) => {
                const nextMode = resolveTemplateMode(value);
                if (nextMode === "sentence_reading") {
                  applySentenceReadingCardSet();
                  return;
                }
                updateEditor((current) => ({
                  ...current,
                  mode: nextMode
                }));
              }}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">일반</SelectItem>
                <SelectItem value="news">뉴스 전용</SelectItem>
                <SelectItem value="sentence_reading">문장 읽기</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="group relative inline-flex items-center gap-1">
              <Label>기본 페이지 길이(초)</Label>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground">
                ?
              </span>
              <span className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1 w-64 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover:visible group-hover:opacity-100">
                피드로 내보내거나 MP4 렌더링할 때 페이지 하나가 화면에 유지되는 기본 시간입니다.
              </span>
            </div>
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
        <div className="mt-3 rounded-xl border bg-muted/10 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">템플릿 BGM</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                페이지 오디오/TTS는 그대로 두고, 전체 페이지 MP4에 배경음악을 낮은 볼륨으로 추가합니다.
              </p>
            </div>
            <label className="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={Boolean(editor.bgmEnabled)}
                onChange={(event) =>
                  updateEditor((current) => ({
                    ...current,
                    bgmEnabled: event.target.checked,
                    bgmVolume: clamp(Number(current.bgmVolume), 0, 1, 0.18)
                  }))
                }
              />
              BGM 사용
            </label>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(240px,1fr)_minmax(220px,0.8fr)]">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => templateBgmInputRef.current?.click()}
                  disabled={templateBgmUploading}
                >
                  <Upload className="h-4 w-4" />
                  {templateBgmUploading ? "BGM 업로드 중..." : "BGM 첨부"}
                </Button>
                {editor.bgmUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateEditor((current) => ({
                        ...current,
                        bgmEnabled: false,
                        bgmUrl: ""
                      }))
                    }
                  >
                    제거
                  </Button>
                ) : null}
                <input
                  ref={templateBgmInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac"
                  className="hidden"
                  onChange={(event) => void onTemplateBgmUpload(event)}
                />
              </div>
              <div className="rounded-lg border bg-card p-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={pixabayQuery}
                    onChange={(event) => setPixabayQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchPixabaySoundEffects();
                      }
                    }}
                    placeholder="Pixabay Sound Effects 검색 예: forest"
                    aria-label="Pixabay Sound Effects 검색어"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="sm:h-10"
                    onClick={() => void searchPixabaySoundEffects()}
                    disabled={pixabaySearching}
                  >
                    <Search className="h-4 w-4" />
                    {pixabaySearching ? "검색 중..." : "검색"}
                  </Button>
                </div>
                {pixabayError ? <p className="mt-2 text-xs text-destructive">{pixabayError}</p> : null}
                {pixabayResults.length > 0 ? (
                  <div className="app-panel-scrollbar mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {pixabayResults.map((item) => (
                      <div key={item.id} className="rounded-md border p-2">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {[item.user, item.duration ? `${Math.round(item.duration)}초` : undefined]
                                .filter(Boolean)
                                .join(" · ") || "Pixabay"}
                            </p>
                            {item.tags ? <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{item.tags}</p> : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void applyPixabaySoundEffect(item)}
                            disabled={Boolean(pixabayApplyingId)}
                          >
                            {pixabayApplyingId === item.id ? "적용 중..." : "적용"}
                          </Button>
                        </div>
                        <audio src={item.audioUrl} controls className="mt-2 h-9 w-full" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {typeof templateBgmUploadProgress === "number" ? (
                <div className="rounded-lg border bg-card p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span>{templateBgmUploading ? "BGM 업로드" : "업로드 완료"}</span>
                    <span>{templateBgmUploadProgress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${templateBgmUploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {editor.bgmUrl ? (
                <audio
                  src={toInstagramMediaPreviewUrl(editor.bgmUrl)}
                  controls
                  className="mt-1 h-10 w-full"
                />
              ) : (
                <p className="text-xs text-muted-foreground">BGM 파일을 첨부하면 피드 렌더링 시 자동으로 섞입니다.</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>BGM 볼륨</Label>
                <span className="text-sm font-semibold">{Math.round(clamp(Number(editor.bgmVolume), 0, 1, 0.18) * 100)}%</span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={1}
                value={String(Math.round(clamp(Number(editor.bgmVolume), 0, 1, 0.18) * 100))}
                onChange={(event) =>
                  updateEditor((current) => ({
                    ...current,
                    bgmVolume: clamp(Number(event.target.value) / 100, 0, 1, 0.18)
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                권장값은 10~25%입니다. 말소리가 있는 페이지에서는 BGM을 낮게 유지하세요.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border bg-muted/10 p-3">
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">피드 캡션 필드</p>
                <span className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground">
                  ?
                  <span className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1 w-72 rounded-md border bg-popover px-2 py-1 text-xs font-normal text-popover-foreground opacity-0 shadow transition-opacity group-hover:visible group-hover:opacity-100">
                    피드로 내보낼 때 선택한 시트 row의 어떤 필드를 인스타그램 캡션 본문에 넣을지 정합니다.
                  </span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                피드로 내보낼 때 선택한 row 필드 값을 위에서 아래 순서로 캡션 본문에 넣고, 마지막에 해시태그를 붙입니다.
              </p>
            </div>
            <button
              type="button"
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent"
              onClick={() => setCaptionFieldsCollapsed((current) => !current)}
            >
              {captionFieldsCollapsed ? "펼치기" : "접기"}
            </button>
          </div>
          {!captionFieldsCollapsed ? (
            <>
              <div className="mb-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateEditor((current) => ({
                      ...current,
                      captionSourceFields: ["Caption", "Subject"]
                    }))
                  }
                >
                  Caption + Subject
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mergeBindingFieldsWithDefaults([
                  ...bindingFields,
                  ...Object.keys(sampleData || {}),
                  "Caption",
                  "Subject"
                ]).map((field) => {
                  const selected = (editor.captionSourceFields || []).includes(field);
                  return (
                    <button
                      key={`caption-source-field-${field}`}
                      type="button"
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        selected ? "border-emerald-500 bg-emerald-500/15 text-emerald-200" : "hover:bg-accent"
                      }`}
                      onClick={() =>
                        updateEditor((current) => {
                          const currentFields = current.captionSourceFields || [];
                          return {
                            ...current,
                            captionSourceFields: currentFields.includes(field)
                              ? currentFields.filter((item) => item !== field)
                              : [...currentFields, field].slice(0, 12)
                          };
                        })
                      }
                      title={selected ? "캡션에서 제거" : "캡션에 추가"}
                    >
                      {selected ? `${(editor.captionSourceFields || []).indexOf(field) + 1}. ${field}` : field}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          {(editor.captionSourceFields || []).length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              현재 순서: {(editor.captionSourceFields || []).join(" + ")} + 해시태그
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-500">
              선택된 캡션 필드가 없으면 caption/subject/description 순서로 자동 fallback 됩니다.
            </p>
          )}
        </div>
        {isSentenceReadingMode ? (
          <div className="mt-3 rounded-xl border bg-muted/10 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">문장 읽기 카드 세트</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  선택한 row의 일기/ruby/뜻/한자 데이터를 1080x1350 카드 세트로 변환합니다. 데이터가 비어 있으면 샘플 구조로 생성됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={applySentenceReadingCardSet}>
                  <Sparkles className="h-4 w-4" />
                  카드 세트 생성
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void downloadSentenceReadingZip()}
                  disabled={renderingOutput || editor.pages.length === 0}
                >
                  <Download className="h-4 w-4" />
                  전체 PNG ZIP
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1">
                <Label>오디오용 대본</Label>
                <Textarea
                  value={sentenceReadingCardSet.audioScript}
                  readOnly
                  rows={7}
                  className="font-serif text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label>인스타 제목/설명/해시태그</Label>
                <Textarea
                  value={buildSentenceReadingUploadInfo(sentenceReadingCardSet).caption}
                  readOnly
                  rows={7}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="mt-3 app-table-scrollbar flex gap-2 overflow-x-auto pb-1">
              {editor.pages.map((page, index) => (
                <div key={`sentence-card-tools-${page.id}`} className="min-w-[220px] rounded-lg border bg-card p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{`${index + 1}. ${page.name}`}</p>
                      <p className="text-[11px] text-muted-foreground">1080x1350 · 4:5</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => setSelectedPageId(page.id)}
                    >
                      편집
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => adjustSentenceReadingPageFont(page.id, -2)}>
                      A-
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => adjustSentenceReadingPageFont(page.id, 2)}>
                      A+
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => resetSentenceReadingPageFont(page.id)}>
                      초기화
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => void downloadSentenceReadingPagePng(page, index)}
                      disabled={renderingOutput}
                    >
                      PNG
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
          <Button
            type="button"
            variant="outline"
            onClick={copySelectedElementsForCrossPage}
            disabled={!selectedLayer && selectedElementIds.length === 0}
            title="선택한 오브젝트를 복사합니다. 단축키: Ctrl/Cmd+C"
          >
            <Copy className="h-4 w-4" />
            오브젝트 복사
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={pasteCopiedElementsToSelectedPage}
            disabled={!elementClipboard || elementClipboard.elements.length === 0 || !selectedPage}
            title="복사한 오브젝트를 현재 페이지에 붙여넣습니다. 단축키: Ctrl/Cmd+V"
          >
            붙여넣기
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
        {isNewsMode ? (
          <p className="mt-1 text-xs text-emerald-500">
            뉴스 전용 모드: Data Binding 패널에서 뉴스 변수/프롬프트를 불러와 이미지 오브젝트에 바로 적용할 수 있습니다.
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

      {templateJsonModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          data-keep-selection="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setTemplateJsonModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-3xl rounded-2xl border bg-card p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">템플릿 가져오기/내보내기</h2>
                <p className="text-xs text-muted-foreground">
                  JSON 파일 또는 텍스트로 템플릿을 옮길 수 있습니다.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTemplateJsonModalOpen(false)}>
                닫기
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  templateJsonModalMode === "import" ? "border-primary bg-primary/10" : "bg-muted/20"
                }`}
                onClick={() => setTemplateJsonModalMode("import")}
              >
                <Upload className="mb-3 h-8 w-8" />
                <p className="font-semibold">가져오기</p>
                <p className="mt-1 text-xs text-muted-foreground">JSON 파일 또는 텍스트를 새 템플릿으로 추가합니다.</p>
              </button>
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  templateJsonModalMode === "export" ? "border-primary bg-primary/10" : "bg-muted/20"
                }`}
                onClick={() => {
                  setTemplateJsonModalMode("export");
                  setImportJson(JSON.stringify(editor, null, 2));
                }}
              >
                <Download className="mb-3 h-8 w-8" />
                <p className="font-semibold">내보내기</p>
                <p className="mt-1 text-xs text-muted-foreground">현재 템플릿 JSON을 확인하고 다운로드합니다.</p>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Textarea
                value={templateJsonModalMode === "export" ? importJson || JSON.stringify(editor, null, 2) : importJson}
                onChange={(event) => setImportJson(event.target.value)}
                rows={12}
                className="max-h-[42vh] min-h-[220px] font-mono text-xs"
                placeholder="템플릿 JSON 텍스트"
              />
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onTemplateJsonFileChange}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {templateJsonModalMode === "import" ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => jsonFileInputRef.current?.click()}>
                      JSON 파일
                    </Button>
                    <Button type="button" onClick={() => void importTemplateFromJsonText()} disabled={busy}>
                      가져오기
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={loadCurrentTemplateJsonToTextarea}>
                      JSON 텍스트
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void copyCurrentTemplateJson()}>
                      JSON 복사
                    </Button>
                    <Button type="button" onClick={downloadCurrentTemplateJson}>
                      다운로드
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {outputRenderModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          data-keep-selection="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOutputRenderModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-3xl rounded-2xl border bg-card p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">PNG/MP4 렌더</h2>
                <p className="text-xs text-muted-foreground">
                  현재 선택된 페이지를 {canvasWidth}x{canvasHeight} 기준으로 렌더링합니다.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOutputRenderModalOpen(false)}>
                닫기
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  outputRenderModalMode === "png" ? "border-primary bg-primary/10" : "bg-muted/20"
                }`}
                onClick={() => setOutputRenderModalMode("png")}
              >
                <FileImage className="mb-3 h-8 w-8" />
                <p className="font-semibold">PNG 렌더</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  현재 캔버스 레이어를 그대로 PNG 이미지로 출력합니다.
                </p>
              </button>
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  outputRenderModalMode === "mp4" ? "border-primary bg-primary/10" : "bg-muted/20"
                }`}
                onClick={() => setOutputRenderModalMode("mp4")}
              >
                <Video className="mb-3 h-8 w-8" />
                <p className="font-semibold">MP4 렌더</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  페이지 오디오 설정과 기본 길이를 반영해 MP4로 출력합니다.
                </p>
              </button>
            </div>
            <div className="mt-4 space-y-3 rounded-xl border bg-muted/15 p-3">
              {outputRenderModalMode === "png" ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" onClick={() => void renderOutputPreview()} disabled={renderingOutput}>
                      {renderingOutput ? "PNG 렌더링 중..." : "현재 페이지 PNG 렌더"}
                    </Button>
                    <Button type="button" variant="outline" onClick={downloadOutputPreview} disabled={!outputPreviewUrl}>
                      <Download className="h-4 w-4" />
                      PNG 다운로드
                    </Button>
                  </div>
                  {outputPreviewUrl ? (
                    <div className="app-panel-scrollbar max-h-[46vh] overflow-auto rounded-md border p-2">
                      <img src={outputPreviewUrl} alt="output preview" className="mx-auto w-full max-w-md rounded border" />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      PNG 렌더를 실행하면 결과 미리보기가 여기에 표시됩니다.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" onClick={() => void renderOutputVideo()} disabled={renderingOutputVideo}>
                      {renderingOutputVideo ? "MP4 렌더링 중..." : "현재 페이지 MP4 렌더"}
                    </Button>
                    <Button type="button" variant="outline" onClick={downloadOutputVideo} disabled={!outputVideoUrl}>
                      <Download className="h-4 w-4" />
                      MP4 다운로드
                    </Button>
                  </div>
                  {outputVideoUrl ? (
                    <div className="space-y-2 rounded-md border p-2">
                      <video src={outputVideoUrl} controls className="max-h-[46vh] w-full rounded border bg-black" />
                      <a
                        href={outputVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-400 underline"
                      >
                        MP4 결과 새 창에서 열기
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      MP4 렌더를 실행하면 영상 미리보기가 여기에 표시됩니다.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-0 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">페이지 캔버스 목록</p>
                <p className="text-[11px] text-muted-foreground">순서와 페이지명을 확인하고 클릭해서 편집 페이지를 전환합니다.</p>
              </div>
              <span className="shrink-0 rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
                {editor.pages.length}개
              </span>
            </div>
            <div className="app-table-scrollbar overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {editor.pages.map((page, index) => {
                  const isCurrent = page.id === selectedPageId;
                  return (
                    <button
                      key={`page-strip-${page.id}`}
                      type="button"
                      className={`w-[156px] shrink-0 rounded-lg border p-2 text-left transition sm:w-[188px] lg:w-[216px] ${
                        isCurrent
                          ? "border-primary bg-primary/10 shadow"
                          : "border-border bg-background hover:border-primary/60"
                      }`}
                      onClick={() => {
                        setObjectToolbarVisible(false);
                        setSelectedPageId(page.id);
                        setSelectedElementId(page.elements[0]?.id);
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-semibold">
                          {index + 1}. {page.name}
                        </span>
                      </div>
                      <div
                        className="relative flex w-full items-center justify-center overflow-hidden rounded-md border bg-black"
                        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
                      >
                        {pageThumbnailUrls[page.id] ? (
                          <img
                            src={pageThumbnailUrls[page.id]}
                            alt={`${index + 1}. ${page.name} preview`}
                            className="block h-full w-full object-contain object-center"
                            style={{ objectPosition: "center center" }}
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">{renderPageMiniature(page)}</div>
                        )}
                      </div>
                      <div className="mt-1 h-4">
                        {isCurrent ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            편집 중인 페이지
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">클릭해서 편집</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

      <div ref={editorLayoutRef} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 self-start">
          <div
            ref={editorFollowRef}
            className="h-fit space-y-3 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
            style={{
              transform: editorFollowOffset > 0 ? `translateY(${editorFollowOffset}px)` : undefined
            }}
          >
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-medium">{selectedPage ? `${selectedPageIndex + 1}. ${selectedPage.name}` : "현재 편집 페이지"}</p>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {isSentenceReadingMode && selectedPage ? (
                  <div
                    className="flex shrink-0 items-center gap-1 rounded-full border bg-background/90 p-1 text-xs shadow-sm"
                    data-keep-selection="true"
                    title="문장 읽기 본문 텍스트를 페이지 단위로 2px씩 조절합니다."
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2 text-xs"
                      onClick={() => changeSentenceReadingPageBodyFont(selectedPage.id, -1)}
                      disabled={
                        selectedSentenceBodyLayerCount === 0 ||
                        selectedSentencePageFontDelta <= SENTENCE_READING_PAGE_FONT_MIN_DELTA
                      }
                      title="본문 폰트 크기 줄이기"
                    >
                      A-
                    </Button>
                    <span className="min-w-10 text-center text-[11px] font-medium text-muted-foreground">
                      {selectedSentenceFontDeltaLabel}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2 text-xs"
                      onClick={() => changeSentenceReadingPageBodyFont(selectedPage.id, 1)}
                      disabled={
                        selectedSentenceBodyLayerCount === 0 ||
                        selectedSentencePageFontDelta >= SENTENCE_READING_PAGE_FONT_MAX_DELTA
                      }
                      title="본문 폰트 크기 늘리기"
                    >
                      A+
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2 text-xs"
                      onClick={() => resetSentenceReadingPageBodyFont(selectedPage.id)}
                      disabled={selectedSentenceBodyLayerCount === 0 || selectedSentencePageFontDelta === 0}
                      title="본문 폰트 크기 초기화"
                    >
                      초기화
                    </Button>
                  </div>
                ) : null}
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
                {isCompactMobileViewport ? (
                  <div
                    ref={(node) => {
                      mobileObjectToolbarHostRef.current = node;
                      if (node && !objectToolbarHostReady) {
                        setObjectToolbarHostReady(true);
                      }
                    }}
                    className="mb-3"
                    data-keep-selection="true"
                  />
                ) : null}
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
                  <div className="relative group/tool-video">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 border-white/25 bg-black/40 p-0 hover:bg-black/60"
                      onClick={() => {
                        setShapeToolOpen(false);
                        setPanelToolOpen(false);
                        addLayer("video");
                      }}
                      aria-label="Video"
                      title="Video"
                    >
                      <Video className="h-4 w-4" />
                    </Button>
                    <span className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover/tool-video:visible group-hover/tool-video:opacity-100 lg:left-full lg:top-1/2 lg:ml-2 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                      Video
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

              {objectToolbarVisible &&
              selectedLayer &&
              !templateJsonModalOpen &&
              !outputRenderModalOpen &&
              typeof document !== "undefined" &&
              (!isCompactMobileViewport || objectToolbarHostReady) ? createPortal(
                (
                <div
                  ref={objectToolbarRef}
                  className={`instagram-object-toolbar app-panel-scrollbar z-[120] overflow-auto border border-white/25 bg-black/75 p-2 text-white shadow-xl backdrop-blur ${
                    isCompactMobileViewport
                      ? "relative max-h-[42vh] w-full rounded-xl"
                      : "fixed max-h-[calc(100vh-88px)] min-w-[260px] resize rounded-xl"
                  }`}
                  style={{
                    left: isCompactMobileViewport ? undefined : `${objectToolbarLeft}px`,
                    top: isCompactMobileViewport ? undefined : `${objectToolbarTop}px`,
                    width: isCompactMobileViewport ? "100%" : `${objectToolbarRenderedWidth}px`,
                    maxWidth: isCompactMobileViewport ? "100%" : "calc(100vw - 16px)",
                    transform: "none"
                  }}
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
                    className={`mb-2 flex items-center gap-2 ${isCompactMobileViewport ? "" : "cursor-grab active:cursor-grabbing"}`}
                    onPointerDown={(event) => {
                      if (isCompactMobileViewport) {
                        return;
                      }
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
                      className={`h-6 w-8 border-white/25 bg-black/30 p-0 ${
                        isCompactMobileViewport ? "cursor-default opacity-60" : "cursor-grab active:cursor-grabbing"
                      }`}
                      onPointerDown={beginObjectToolbarDrag}
                      title="오브젝트 툴바 이동"
                      disabled={isCompactMobileViewport}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-200">{resolveElementName(selectedLayer)}</span>
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
                    {isCompactMobileViewport ? null : (
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
                    <div className="app-table-scrollbar mb-2 flex items-center gap-1 overflow-x-auto rounded-md border border-white/15 bg-black/25 px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:py-2">
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
                  <div className="app-table-scrollbar mb-2 flex items-center gap-1 overflow-x-auto rounded-md border border-white/15 bg-black/25 px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:py-2">
                    <span className="mr-1 shrink-0 text-[11px] text-zinc-200">
                      순서 {selectedLayerOrder.index >= 0 ? `${selectedLayerOrder.index + 1}/${selectedLayerOrder.total}` : ""}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "back"))}
                      disabled={!selectedLayerOrder.canMoveBack}
                      title="맨 뒤로"
                    >
                      맨 뒤로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "down"))}
                      disabled={!selectedLayerOrder.canMoveDown}
                      title="뒤로"
                    >
                      뒤로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "up"))}
                      disabled={!selectedLayerOrder.canMoveUp}
                      title="앞으로"
                    >
                      앞으로
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => updateSelectedPage((page) => setLayerOrder(page, selectedLayer.id, "front"))}
                      disabled={!selectedLayerOrder.canMoveFront}
                      title="맨 앞으로"
                    >
                      맨 앞으로
                    </Button>
                  </div>
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
                        className="min-h-[40px] w-full resize border-white/20 bg-black/30 text-xs text-white placeholder:text-zinc-300 sm:min-h-[50px]"
                        placeholder={selectedLayer.textMode === "plain" ? "일반 텍스트 입력" : "변수 텍스트 입력 (예: {{subject}})"}
                      />
                      <div className="grid gap-1.5 sm:grid-cols-[minmax(150px,220px)_minmax(180px,1fr)]">
                        <select
                          value={selectedLayer.textMode}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "text"
                                ? {
                                    ...layer,
                                    textMode: event.target.value === "plain" ? "plain" : "variable",
                                    bindingKey:
                                      event.target.value === "plain"
                                        ? sanitizeTextBindingKey(layer.bindingKey)
                                        : getUniqueBindingKeyForLayer(String(layer.bindingKey || ""), layer.id)
                                  }
                                : layer
                            )
                          }
                          className="h-8 min-w-0 rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                          title="텍스트 오브젝트 타입"
                        >
                          <option value="variable">변수 텍스트 오브젝트</option>
                          <option value="plain">일반 텍스트 오브젝트</option>
                        </select>
                        <Input
                          value={String(selectedLayer.bindingKey || "")}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "text"
                                ? { ...layer, bindingKey: sanitizeTextBindingKey(event.target.value) }
                                : layer
                            )
                          }
                          onBlur={() =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "text"
                                ? { ...layer, bindingKey: getUniqueBindingKeyForLayer(String(layer.bindingKey || ""), layer.id) }
                                : layer
                            )
                          }
                          className="h-8 min-w-0 border-white/20 bg-black/30 text-xs text-white"
                          placeholder="오브젝트 변수명 (예: newsBody)"
                          title="텍스트 오브젝트 변수명: 중복 시 자동으로 _2, _3이 붙습니다."
                        />
                      </div>
                      <div className="app-table-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-md border border-white/10 bg-white/[0.03] p-1 sm:flex-wrap sm:gap-1.5 sm:overflow-visible">
                      <div
                        className="relative min-w-[132px] flex-[0_0_150px] sm:min-w-[180px] sm:flex-[1_1_200px]"
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
                        className="h-8 w-8 shrink-0 px-0"
                        onClick={() => toggleFavoriteFont(selectedLayer.fontFamily)}
                        title="폰트 즐겨찾기"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 px-2 text-xs"
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
                        className="h-8 shrink-0 px-2 text-xs"
                        onClick={() => customFontInputRef.current?.click()}
                        disabled={customFontUploading}
                        title="커스텀 폰트 파일 업로드(복수 선택 가능)"
                      >
                        <Upload className="mr-1 h-3.5 w-3.5" />
                        {customFontUploading ? "업로드 중..." : "폰트 업로드"}
                      </Button>
                      <input
                        ref={customFontInputRef}
                        type="file"
                        accept={CUSTOM_FONT_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(event) => void handleCustomFontFileChange(event)}
                      />
                      <select
                        value={String(normalizeTextFontSize(selectedLayer.fontSize, MIN_TEXT_FONT_SIZE))}
                        onChange={(event) =>
                          updateSelectedTextLayersFontSize(Number(event.target.value))
                        }
                        className="h-8 min-w-[76px] shrink-0 rounded-md border border-white/20 bg-black/30 px-2 text-xs text-white"
                        title="폰트 크기(2단위)"
                      >
                        {buildTextFontSizeOptions(selectedLayer.fontSize).map((size) => (
                          <option key={size} value={size}>
                            {size}px
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={MIN_TEXT_FONT_SIZE}
                        max={MAX_TEXT_FONT_SIZE}
                        step={1}
                        value={String(normalizeTextFontSize(selectedLayer.fontSize, MIN_TEXT_FONT_SIZE))}
                        onChange={(event) =>
                          updateSelectedTextLayersFontSize(Number(event.target.value))
                        }
                        className="h-8 w-16 shrink-0 border-white/20 bg-black/30 text-xs text-white sm:w-20"
                        title="폰트 크기 직접 입력"
                      />
                      <Label className="shrink-0 text-[11px] text-zinc-200">루비 간격</Label>
                      <Input
                        type="range"
                        min={0}
                        max={32}
                        step={1}
                        value={String(normalizeRubyGap(selectedLayer.rubyGap))}
                        onChange={(event) => updateSelectedTextLayersRubyGap(Number(event.target.value))}
                        className="h-8 w-20 shrink-0 flex-none sm:w-28"
                        title="루비와 한자 사이 간격"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={32}
                        step={1}
                        value={String(normalizeRubyGap(selectedLayer.rubyGap))}
                        onChange={(event) => updateSelectedTextLayersRubyGap(Number(event.target.value))}
                        className="h-8 w-14 shrink-0 border-white/20 bg-black/30 text-xs text-white sm:w-16"
                        title="루비와 한자 사이 간격(px)"
                      />
                      <Label className="shrink-0 text-[11px] text-zinc-200">상자 안 Y</Label>
                      <Input
                        type="range"
                        min={MIN_TEXT_OFFSET_Y}
                        max={MAX_TEXT_OFFSET_Y}
                        step={1}
                        value={String(normalizeTextOffsetY(selectedLayer.textOffsetY))}
                        onChange={(event) => updateSelectedTextLayersOffsetY(Number(event.target.value))}
                        className="h-8 w-20 shrink-0 flex-none sm:w-28"
                        title="텍스트 상자 안에서 내용 위치를 위아래로 조정"
                      />
                      <Input
                        type="number"
                        min={MIN_TEXT_OFFSET_Y}
                        max={MAX_TEXT_OFFSET_Y}
                        step={1}
                        value={String(normalizeTextOffsetY(selectedLayer.textOffsetY))}
                        onChange={(event) => updateSelectedTextLayersOffsetY(Number(event.target.value))}
                        className="h-8 w-14 shrink-0 border-white/20 bg-black/30 text-xs text-white sm:w-16"
                        title="텍스트 상자 안 Y 위치(px)"
                      />
                      <Button
                        type="button"
                        variant={selectedLayer.bold ? "default" : "outline"}
                        size="sm"
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 w-11 shrink-0 rounded border border-white/20 bg-black/30 p-1 sm:w-14"
                        title="텍스트 색상"
                      />
                      <input
                        type="color"
                        value={normalizeHex(selectedLayer.backgroundColor, "#FFFFFF")}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text" ? { ...layer, backgroundColor: event.target.value } : layer
                          )
                        }
                        className="h-8 w-11 shrink-0 rounded border border-white/20 bg-black/30 p-1 sm:w-14"
                        title="텍스트 배경색"
                      />
                      <Label className="shrink-0 text-[11px] text-zinc-200">배경</Label>
                      <Input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={String(clamp(Number(selectedLayer.backgroundOpacity), 0, 1, 1))}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text"
                              ? {
                                  ...layer,
                                  backgroundOpacity: clamp(Number(event.target.value), 0, 1, layer.backgroundOpacity)
                                }
                              : layer
                          )
                        }
                        className="h-8 w-20 shrink-0 flex-none sm:w-28"
                        title="텍스트 배경 투명도"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={String(clamp(Number(selectedLayer.backgroundOpacity), 0, 1, 1))}
                        onChange={(event) =>
                          updateLayerById(selectedLayer.id, (layer) =>
                            layer.type === "text"
                              ? {
                                  ...layer,
                                  backgroundOpacity: clamp(Number(event.target.value), 0, 1, layer.backgroundOpacity)
                                }
                              : layer
                          )
                        }
                        className="h-8 w-14 shrink-0 border-white/20 bg-black/30 text-xs text-white sm:w-16"
                        title="텍스트 배경 투명도(숫자)"
                      />
                      <Button
                        type="button"
                        variant={selectedLayer.shadowEnabled ? "default" : "outline"}
                        size="sm"
                        className="h-8 shrink-0 px-2"
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
                        className="h-8 w-11 shrink-0 rounded border border-white/20 bg-black/30 p-1 sm:w-14"
                        title="그림자 색상"
                        disabled={!selectedLayer.shadowEnabled}
                      />
                      </div>
                      {localFontMessage ? <p className="text-[10px] text-zinc-300">{localFontMessage}</p> : null}
                      {customFontMessage ? <p className="text-[10px] text-zinc-300">{customFontMessage}</p> : null}
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
                          배경색
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
                        <Label className="ml-1 text-[11px] text-zinc-200">배경 투명도</Label>
                        <Input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={String(clamp(Number(selectedLayer.fillOpacity), 0, 1, 1))}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? { ...layer, fillOpacity: clamp(Number(event.target.value), 0, 1, layer.fillOpacity) }
                                : layer
                            )
                          }
                          className="h-8 w-24 flex-none sm:w-28"
                          disabled={!selectedLayer.fillEnabled}
                        />
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={String(clamp(Number(selectedLayer.fillOpacity), 0, 1, 1))}
                          onChange={(event) =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "shape"
                                ? { ...layer, fillOpacity: clamp(Number(event.target.value), 0, 1, layer.fillOpacity) }
                                : layer
                            )
                          }
                          className="h-8 w-16 border-white/20 bg-black/30 text-xs text-white"
                          disabled={!selectedLayer.fillEnabled}
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
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
                          <Label className="shrink-0 text-xs text-zinc-200">
                            {selectedLayer.type === "video" ? "비디오 맞춤" : "이미지 맞춤"}
                          </Label>
                          <select
                            value={selectedLayer.fit}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) =>
                                layer.type === "image" || layer.type === "video"
                                  ? { ...layer, fit: event.target.value === "contain" ? "contain" : "cover" }
                                  : layer
                              )
                            }
                            className="h-8 min-w-[112px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                          >
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                          </select>
                          <Button
                            type="button"
                            variant={selectedLayer.fit === "cover" ? "default" : "outline"}
                            size="sm"
                            className={`h-8 whitespace-nowrap ${
                              selectedLayer.fit === "cover" ? "!bg-zinc-100 !text-zinc-950 hover:!bg-white" : ""
                            }`}
                            onClick={() => setImageBoxFillMode(selectedLayer.id, selectedLayer.fit !== "cover")}
                          >
                            {selectedLayer.fit === "cover" ? "박스 채우기 ON" : "박스 채우기 OFF"}
                          </Button>
                          <label className="inline-flex h-8 items-center gap-1 rounded-md border border-white/20 px-2 text-xs text-zinc-100">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLayer.aiGenerateEnabled)}
                            onChange={(event) =>
                              updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "image" || layer.type === "video"
                                  ? {
                                      ...layer,
                                      aiGenerateEnabled: event.target.checked,
                                      aiModel: resolveAiImageModel(layer.aiModel),
                                      aiStylePreset: layer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE
                                    }
                                  : layer
                              )
                            }
                          />
                          AI 생성 사용
                        </label>
                        </div>
                        <div className="grid gap-2 rounded-md border border-white/15 bg-black/20 p-2">
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_3.25rem] items-center gap-2">
                            <span className="text-[11px] text-zinc-200">자르기 X</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={String(clamp(Number(selectedLayer.cropX), 0, 100, 50))}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
                                    ? { ...layer, cropX: clamp(Number(event.target.value), 0, 100, 50) }
                                    : layer
                                )
                              }
                              className="h-7 min-w-0 accent-emerald-400"
                              title="이미지 자르기 가로 위치"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={String(Math.round(clamp(Number(selectedLayer.cropX), 0, 100, 50)))}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
                                    ? { ...layer, cropX: clamp(Number(event.target.value), 0, 100, 50) }
                                    : layer
                                )
                              }
                              className="h-7 min-w-0 border-white/20 bg-black/30 px-2 text-xs text-white"
                              title="이미지 자르기 가로 위치(%)"
                            />
                          </div>
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_3.25rem] items-center gap-2">
                            <span className="text-[11px] text-zinc-200">자르기 Y</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={String(clamp(Number(selectedLayer.cropY), 0, 100, 50))}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
                                    ? { ...layer, cropY: clamp(Number(event.target.value), 0, 100, 50) }
                                    : layer
                                )
                              }
                              className="h-7 min-w-0 accent-emerald-400"
                              title="이미지 자르기 세로 위치"
                            />
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={String(Math.round(clamp(Number(selectedLayer.cropY), 0, 100, 50)))}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
                                    ? { ...layer, cropY: clamp(Number(event.target.value), 0, 100, 50) }
                                    : layer
                                )
                              }
                              className="h-7 min-w-0 border-white/20 bg-black/30 px-2 text-xs text-white"
                              title="이미지 자르기 세로 위치(%)"
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video" ? { ...layer, cropX: 50, cropY: 50 } : layer
                                )
                              }
                              title="이미지 자르기 위치를 가운데로 초기화"
                            >
                              중앙
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
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
                          onClick={() => void downloadSelectedLayerImage(selectedLayer.id)}
                          disabled={
                            !selectedLayer.imageUrl ||
                            selectedLayer.mediaType === "video" ||
                            inferMediaTypeFromSource(selectedLayer.imageUrl) === "video"
                          }
                        >
                          <Download className="mr-1 h-4 w-4" />
                          이미지 다운로드
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            updateLayerById(selectedLayer.id, (layer) =>
                              layer.type === "image" || layer.type === "video" ? { ...layer, imageUrl: "" } : layer
                            )
                          }
                        >
                          제거
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => fillImageLayerToCanvas(selectedLayer.id)}
                        >
                          화면 꽉 채우기
                        </Button>
                        <select
                          value={imageApplyTargetPageId}
                          onChange={(event) => setImageApplyTargetPageId(event.target.value)}
                          className="h-8 min-w-[170px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                          title="동일 이미지를 적용할 대상 페이지"
                        >
                          <option value="__all__">다른 모든 페이지</option>
                          {editor.pages
                            .filter((page) => page.id !== selectedPageId)
                            .map((page, index) => (
                              <option key={`apply-image-target-${page.id}`} value={page.id}>
                                {`${index + 1}. ${page.name}`}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => applySelectedImageToAllPages(selectedLayer.id, imageApplyTargetPageId)}
                          disabled={editor.pages.filter((page) => page.id !== selectedPageId).length === 0}
                        >
                          선택 대상에 동일 적용
                        </Button>
                        {isNewsMode ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => void applyNewsImageToLayer(selectedLayer.id)}
                            disabled={aiImageGeneratingLayerId === selectedLayer.id || newsLoading || !selectedNewsItem}
                          >
                            {aiImageGeneratingLayerId === selectedLayer.id ? "생성 중..." : "뉴스 만들기 이미지 적용"}
                          </Button>
                        ) : null}
                        </div>
                      </div>
                      {selectedLayer.aiGenerateEnabled ? (
                        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-zinc-200">AI 이미지 프롬프트</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => void suggestAiPromptForLayer(selectedLayer.id, "magic")}
                                disabled={aiPromptGeneratingLayerId === selectedLayer.id}
                                title="주제/변수 기반 프롬프트 자동 완성"
                              >
                                <Sparkles className="mr-1 h-3.5 w-3.5" />
                                {aiPromptGeneratingLayerId === selectedLayer.id ? "완성 중..." : "매직"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => void suggestAiPromptForLayer(selectedLayer.id, "check")}
                                disabled={aiPromptGeneratingLayerId === selectedLayer.id}
                                title="변수명 값만으로 프롬프트 완성"
                              >
                                <Sparkles className="mr-1 h-3.5 w-3.5" />
                                {aiPromptGeneratingLayerId === selectedLayer.id ? "처리 중..." : "변수명으로"}
                              </Button>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-zinc-300">변수명</Label>
                              <Input
                                value={String(selectedLayer.aiPromptVariableKey || "")}
                                onChange={(event) =>
                                  updateLayerById(selectedLayer.id, (layer) =>
                                    layer.type === "image" || layer.type === "video"
                                      ? {
                                          ...layer,
                                          aiPromptVariableKey: sanitizeAiPromptVariableKey(String(event.target.value || ""))
                                        }
                                      : layer
                                  )
                                }
                                placeholder="예: example_1_title"
                                className="h-8 text-xs"
                              />
                            </div>
                            <Textarea
                              rows={2}
                              value={String(selectedLayer.aiPrompt || "")}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video" ? { ...layer, aiPrompt: event.target.value } : layer
                                )
                              }
                              placeholder="예: 일본 전통 거리의 현실감 있는 사진, 자연광, 고해상도"
                              className="min-h-[58px] text-xs"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={resolveAiImageModel(selectedLayer.aiModel)}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video" ? { ...layer, aiModel: resolveAiImageModel(event.target.value) } : layer
                                )
                              }
                              className="h-8 min-w-[220px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                            >
                              {INSTAGRAM_AI_MODEL_OPTIONS.map((option) => (
                                <option key={`ig-ai-model-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={resolveAiImageOrientation(selectedLayer.aiImageOrientation)}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
                                    ? { ...layer, aiImageOrientation: resolveAiImageOrientation(event.target.value) }
                                    : layer
                                )
                              }
                              className="h-8 min-w-[140px] rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                            >
                              <option value="vertical">세로 9:16</option>
                              <option value="horizontal">가로 16:9</option>
                            </select>
                            <select
                              value={selectedLayer.aiStylePreset || DEFAULT_INSTAGRAM_AI_IMAGE_STYLE}
                              onChange={(event) =>
                                updateLayerById(selectedLayer.id, (layer) =>
                                  layer.type === "image" || layer.type === "video"
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
                              className="h-8 !bg-zinc-100 !text-zinc-950 hover:!bg-white disabled:!bg-zinc-700 disabled:!text-zinc-300"
                              onClick={() => void generateAiLayerImage(selectedLayer.id)}
                              disabled={aiImageGeneratingLayerId === selectedLayer.id}
                            >
                              {aiImageGeneratingLayerId === selectedLayer.id ? "생성 중..." : "AI 이미지 생성"}
                            </Button>
                          </div>
                          <p className="text-[10px] text-zinc-300">
                            가로/세로 비율 선택 후 생성하면 해당 화면비를 우선 반영합니다. 카드 배경용은 `화면 꽉 채우기 + Cover`를 권장합니다.
                          </p>
                          {selectedLayer.type === "video" ? (
                          <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
                            <label className="flex items-center gap-2 text-xs text-zinc-100">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedLayer.aiVideoEnabled)}
                                onChange={(event) =>
                                  updateLayerById(selectedLayer.id, (layer) =>
                                    layer.type === "video"
                                      ? {
                                          ...layer,
                                          aiVideoEnabled: event.target.checked,
                                          aiVideoProvider: layer.aiVideoProvider === "openai" ? "openai" : "gemini",
                                          aiVideoPrompt:
                                            String(layer.aiVideoPrompt || "").trim() ||
                                            "no music, no camera movement, no subtitles",
                                          aiVideoDurationSec: Number(layer.aiVideoDurationSec) || 6,
                                          aiVideoResolution: layer.aiVideoResolution === "1080p" ? "1080p" : "720p"
                                        }
                                      : layer
                                  )
                                }
                              />
                              AI 영상화 사용
                            </label>
                            {selectedLayer.aiVideoEnabled ? (
                              <>
                                <Textarea
                                  rows={2}
                                  value={String(selectedLayer.aiVideoPrompt || "no music, no camera movement, no subtitles")}
                                  onChange={(event) =>
                                    updateLayerById(selectedLayer.id, (layer) =>
                                      layer.type === "video" ? { ...layer, aiVideoPrompt: event.target.value } : layer
                                    )
                                  }
                                  className="min-h-[52px] text-xs"
                                />
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-zinc-300">제공자</Label>
                                    <select
                                      value={selectedLayer.aiVideoProvider || "gemini"}
                                      onChange={(event) =>
                                        updateLayerById(selectedLayer.id, (layer) =>
                                          layer.type === "video"
                                            ? {
                                                ...layer,
                                                aiVideoProvider:
                                                  event.target.value === "openai" ? "openai" : "gemini"
                                              }
                                            : layer
                                        )
                                      }
                                      className="h-8 w-full rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                                    >
                                      <option value="gemini">Gemini · Veo 3.1 Lite</option>
                                      <option value="openai">OpenAI · Sora 2</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-zinc-300">길이</Label>
                                    <select
                                      value={String(selectedLayer.aiVideoDurationSec || 6)}
                                      onChange={(event) =>
                                        updateLayerById(selectedLayer.id, (layer) =>
                                          layer.type === "video"
                                            ? { ...layer, aiVideoDurationSec: Number(event.target.value) || 6 }
                                            : layer
                                        )
                                      }
                                      className="h-8 w-full rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                                    >
                                      <option value="4">
                                        {selectedLayer.aiVideoProvider === "openai" ? "4초 ($0.40)" : "4초 ($0.20)"}
                                      </option>
                                      <option value="6">
                                        {selectedLayer.aiVideoProvider === "openai" ? "6초 선택 -> 8초 ($0.80)" : "6초 ($0.30)"}
                                      </option>
                                      <option value="8">
                                        {selectedLayer.aiVideoProvider === "openai" ? "8초 ($0.80)" : "8초 ($0.40)"}
                                      </option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-zinc-300">해상도</Label>
                                    <select
                                      value={selectedLayer.aiVideoResolution || "720p"}
                                      onChange={(event) =>
                                        updateLayerById(selectedLayer.id, (layer) =>
                                          layer.type === "video"
                                            ? {
                                                ...layer,
                                                aiVideoResolution:
                                                  event.target.value === "1080p" ? "1080p" : "720p"
                                              }
                                            : layer
                                        )
                                      }
                                      className="h-8 w-full rounded-md border border-white/20 bg-black/30 px-2 text-xs"
                                    >
                                      <option value="720p">720p</option>
                                      <option value="1080p">1080p</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-zinc-300">예상 비용</Label>
                                    <div className="flex h-8 items-center rounded-md border border-white/20 px-2 text-xs">
                                      {`약 $${estimateAiVideoCostUsd(selectedLayer).toFixed(2)}`}
                                    </div>
                                  </div>
                                </div>
                                <p className="text-[10px] text-zinc-400">
                                  Gemini는 Veo 3.1 Lite, OpenAI는 Sora 2로 native audio/lip-sync를 시도합니다. 대사는 위 변수명 값에서 가져옵니다.
                                </p>
                                <div className="space-y-1 rounded-md border border-white/10 bg-black/30 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-[11px] text-zinc-300">최종 프롬프트 미리보기</Label>
                                    <span className="text-[10px] text-zinc-500">
                                      {selectedLayer.aiPromptVariableKey
                                        ? `대사: {{${selectedLayer.aiPromptVariableKey}}}`
                                        : "대사 변수명 필요"}
                                    </span>
                                  </div>
                                  <p className="app-panel-scrollbar max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px] leading-relaxed text-zinc-200">
                                    {buildAiVideoFinalPromptPreview(selectedLayer, sampleData)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => void generateAiLayerVideo(selectedLayer.id)}
                                    disabled={
                                      aiVideoGeneratingLayerId === selectedLayer.id ||
                                      aiImageGeneratingLayerId === selectedLayer.id
                                    }
                                  >
                                    {aiVideoGeneratingLayerId === selectedLayer.id ? "영상 생성 중..." : "AI 영상 생성"}
                                  </Button>
                                  <p className="text-[10px] text-zinc-400">
                                    생성 후 이 레이어가 영상 오브젝트로 바뀌며 캔버스에서 바로 재생됩니다.
                                  </p>
                                </div>
                                {aiVideoGenerationProgress?.layerId === selectedLayer.id ? (
                                  <div
                                    className={`space-y-2 rounded-md border p-2 text-xs ${
                                      aiVideoGenerationProgress.status === "error"
                                        ? "border-red-500/40 bg-red-950/20 text-red-100"
                                        : aiVideoGenerationProgress.status === "success"
                                          ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-100"
                                          : "border-sky-500/40 bg-sky-950/20 text-sky-100"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-medium">
                                        {aiVideoGenerationProgress.status === "running"
                                          ? "AI 영상 생성 진행 중"
                                          : aiVideoGenerationProgress.status === "success"
                                            ? "AI 영상 생성 완료"
                                            : "AI 영상 생성 실패"}
                                      </span>
                                      <span className="text-[11px] opacity-80">
                                        {aiVideoGenerationProgress.provider === "openai" ? "OpenAI Sora 2" : "Gemini Veo 3.1 Lite"} ·
                                        {` 예상 $${aiVideoGenerationProgress.estimatedCostUsd.toFixed(2)}`} ·
                                        {` 경과 ${formatElapsedSeconds(
                                          aiVideoGenerationProgress.startedAt,
                                          Date.now() + aiVideoProgressTick * 0
                                        )}`}
                                      </span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-black/40">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          aiVideoGenerationProgress.status === "error"
                                            ? "bg-red-400"
                                            : aiVideoGenerationProgress.status === "success"
                                              ? "bg-emerald-400"
                                              : "bg-sky-400"
                                        }`}
                                        style={{
                                          width:
                                            aiVideoGenerationProgress.status === "running"
                                              ? `${Math.min(
                                                  92,
                                                  10 +
                                                    Math.floor(
                                                      (Date.now() +
                                                        aiVideoProgressTick * 0 -
                                                        aiVideoGenerationProgress.startedAt) /
                                                        1000
                                                    )
                                                )}%`
                                              : "100%"
                                        }}
                                      />
                                    </div>
                                    <p className="whitespace-pre-wrap break-words text-[11px] opacity-90">
                                      {aiVideoGenerationProgress.message}
                                    </p>
                                    {aiVideoGenerationProgress.status === "running" ? (
                                      <p className="text-[10px] opacity-70">
                                        요청은 이미 전송되었습니다. 같은 레이어에서 버튼을 반복 클릭하지 마세요.
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="text-[10px] text-zinc-300">PNG/WebP 투명 배경 이미지를 그대로 지원합니다.</p>
                    </div>
                  )}
                </div>
                ),
                isCompactMobileViewport && mobileObjectToolbarHostRef.current
                  ? mobileObjectToolbarHostRef.current
                  : document.body
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
                        lineHeight: String(
                          clamp(layer.lineHeight, 0.8, 3, 1.2) +
                            (textHasRuby(text) ? normalizeRubyGap(layer.rubyGap) / Math.max(10, layer.fontSize) : 0)
                        ),
                        letterSpacing: toCanvasWidthUnit(layer.letterSpacing, canvasWidth),
                        backgroundColor:
                          layer.padding > 0 ||
                          normalizeHex(layer.backgroundColor, "#FFFFFF") !== "#FFFFFF" ||
                          clamp(Number(layer.backgroundOpacity), 0, 1, 1) < 1
                            ? withAlpha(layer.backgroundColor, clamp(Number(layer.backgroundOpacity), 0, 1, 1))
                            : "transparent",
                        padding: toCanvasWidthUnit(Math.max(0, layer.padding), canvasWidth),
                        overflow: "hidden",
                        whiteSpace: layer.autoWrap === false ? "pre" : "pre-wrap",
                        overflowWrap: layer.autoWrap === false ? "normal" : "anywhere",
                        wordBreak: layer.autoWrap === false ? "normal" : "normal",
                        lineBreak: "strict",
                        rubyPosition: "over",
                        textDecorationLine: getTextDecorationLine(layer),
                        textShadow: getTextShadowStyle(layer)
                      }}
                      className="cursor-move"
                      onPointerDown={(event) => beginLayerInteraction(selectedPageId, "move", layer.id, event)}
                    >
                      <div
                        className="h-full w-full"
                        style={{ transform: `translateY(${toCanvasWidthUnit(normalizeTextOffsetY(layer.textOffsetY), canvasWidth)})` }}
                      >
                        {renderRubyPreviewNodes(text, toCanvasWidthUnit(normalizeRubyGap(layer.rubyGap), canvasWidth))}
                      </div>
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
                          isLineShape || layer.fillEnabled === false
                            ? "transparent"
                            : withAlpha(
                                normalizeHex(layer.fillColor, "#F4F1EA"),
                                clamp(Number(layer.fillOpacity), 0, 1, 1)
                              ),
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

                const uploadProgress = layerMediaUploadProgress[layer.id];
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
                          src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                          className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                          style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
                          autoPlay
                          muted
                          loop
                          playsInline
                          controls
                        />
                      ) : (
                        <img
                          src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                          alt="layer"
                          className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                          style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
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
                    {uploadProgress ? (
                      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-3 text-white backdrop-blur-[1px]">
                        <div className="w-full max-w-[92%] rounded-md border border-white/20 bg-black/65 p-2 shadow-lg">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate font-semibold">
                              {uploadProgress.status === "error"
                                ? "업로드 실패"
                                : uploadProgress.status === "success"
                                  ? "업로드 완료"
                                  : "업로드 중"}
                            </span>
                            <span>{Math.round(uploadProgress.percent)}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/20">
                            <div
                              className={`h-full rounded-full transition-all ${
                                uploadProgress.status === "error"
                                  ? "bg-red-400"
                                  : uploadProgress.status === "success"
                                    ? "bg-emerald-400"
                                    : "bg-sky-400"
                              }`}
                              style={{ width: `${Math.max(1, Math.min(100, uploadProgress.percent))}%` }}
                            />
                          </div>
                          <p className="app-panel-scrollbar mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/80">
                            {uploadProgress.message}
                          </p>
                        </div>
                      </div>
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

          <div className="hidden">
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
                                  lineHeight: String(
                                    clamp(layer.lineHeight, 0.8, 3, 1.2) +
                                      (textHasRuby(text) ? normalizeRubyGap(layer.rubyGap) / Math.max(10, layer.fontSize) : 0)
                                  ),
                                  letterSpacing: toCanvasWidthUnit(layer.letterSpacing, canvasWidth),
                                  backgroundColor:
                                    layer.padding > 0 ||
                                    normalizeHex(layer.backgroundColor, "#FFFFFF") !== "#FFFFFF" ||
                                    clamp(Number(layer.backgroundOpacity), 0, 1, 1) < 1
                                      ? withAlpha(layer.backgroundColor, clamp(Number(layer.backgroundOpacity), 0, 1, 1))
                                      : "transparent",
                                  padding: toCanvasWidthUnit(Math.max(0, layer.padding), canvasWidth),
                                  overflow: "hidden",
                                  whiteSpace: layer.autoWrap === false ? "pre" : "pre-wrap",
                                  overflowWrap: layer.autoWrap === false ? "normal" : "anywhere",
                                  wordBreak: layer.autoWrap === false ? "normal" : "break-word",
                                  textDecorationLine: getTextDecorationLine(layer),
                                  textShadow: getTextShadowStyle(layer),
                                  rubyPosition: "over"
                                }}
                              >
                                <div
                                  className="h-full w-full"
                                  style={{ transform: `translateY(${toCanvasWidthUnit(normalizeTextOffsetY(layer.textOffsetY), canvasWidth)})` }}
                                >
                                  {renderRubyPreviewNodes(text, toCanvasWidthUnit(normalizeRubyGap(layer.rubyGap), canvasWidth))}
                                </div>
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
                                    isLineShape || layer.fillEnabled === false
                                      ? "transparent"
                                      : withAlpha(
                                          normalizeHex(layer.fillColor, "#F4F1EA"),
                                          clamp(Number(layer.fillOpacity), 0, 1, 1)
                                        ),
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
                                    src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                                    style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    controls
                                  />
                                ) : (
                                  <img
                                    src={toInstagramMediaPreviewUrl(layer.imageUrl)}
                                    alt="layer"
                                    className={`h-full w-full ${layer.fit === "contain" ? "object-contain" : "object-cover"}`}
                                    style={{ objectPosition: `${clamp(Number(layer.cropX), 0, 100, 50)}% ${clamp(Number(layer.cropY), 0, 100, 50)}%` }}
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">드래그로 앞/뒤 순서를 변경</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={undoEditor}
                      disabled={!canUndo}
                      aria-label="Undo"
                      title="Undo (Ctrl/Cmd+Z)"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={redoEditor}
                      disabled={!canRedo}
                      aria-label="Redo"
                      title="Redo (Ctrl/Cmd+Shift+Z)"
                    >
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="app-panel-scrollbar max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {[...sortedLayers]
                    .sort((a, b) => b.zIndex - a.zIndex)
                    .map((layer) => (
                      <button
                        key={layer.id}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", layer.id);
                          setLayerDragId(layer.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setLayerDragOverId(layer.id);
                        }}
                        onDragLeave={() => {
                          setLayerDragOverId((current) => (current === layer.id ? undefined : current));
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const draggedId = layerDragId || event.dataTransfer.getData("text/plain");
                          moveLayerInList(draggedId, layer.id);
                          setLayerDragId(undefined);
                          setLayerDragOverId(undefined);
                        }}
                        onDragEnd={() => {
                          setLayerDragId(undefined);
                          setLayerDragOverId(undefined);
                        }}
                        onClick={() => {
                          setObjectToolbarVisible(false);
                          setSelectedElementId(layer.id);
                          setSelectedElementIds([layer.id]);
                        }}
                        className={`flex w-full cursor-grab items-center justify-between rounded px-2 py-1 text-left text-xs active:cursor-grabbing ${
                          selectedElementIds.includes(layer.id) ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        } ${
                          layerDragOverId === layer.id && layerDragId !== layer.id ? "ring-1 ring-primary" : ""
                        } ${
                          layerDragId === layer.id ? "opacity-55" : ""
                        }`}
                      >
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{resolveElementName(layer)}</span>
                        </span>
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
                    <p
                      className="text-xs font-semibold text-muted-foreground"
                      title="현재 편집 중인 페이지의 이름, 표시 시간, 배경, 오디오 설정을 관리합니다."
                    >
                      현재 페이지
                    </p>
                    <Label title="피드/릴스 카드 목록과 업로드 확인 화면에 표시되는 현재 페이지 이름입니다.">
                      페이지 이름
                    </Label>
                    <Input
                      value={selectedPage.name}
                      onChange={(event) => updateSelectedPage((page) => ({ ...page, name: event.target.value }))}
                      placeholder="Page name"
                    />
                    <Label title="이 페이지가 MP4로 렌더링될 때 유지되는 시간입니다. 예: 4는 이 페이지를 4초 동안 보여줍니다.">
                      페이지 길이(초)
                    </Label>
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
                      title="페이지 뒤쪽 기본 배경색입니다. 배경 이미지가 없거나 투명 영역이 있을 때 보입니다."
                      value={selectedPage.backgroundColor}
                      onChange={(value) => updateSelectedPage((page) => ({ ...page, backgroundColor: value }))}
                    />
                    <div className="space-y-1">
                      <Label title="현재 페이지 전체 배경으로 사용할 이미지를 업로드하거나 제거합니다.">
                        배경 이미지
                      </Label>
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
                        <SelectTrigger
                          className="bg-card dark:bg-zinc-900"
                          title="Cover는 영역을 꽉 채우고 일부가 잘릴 수 있습니다. Contain은 전체 이미지를 보이게 하며 여백이 생길 수 있습니다."
                        >
                          <SelectValue placeholder="배경 맞춤" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cover">Cover</SelectItem>
                          <SelectItem value="contain">Contain</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label title="체크된 페이지에만 AI 음성(TTS)을 생성해서 MP4에 합성합니다.">
                        페이지 오디오
                      </Label>
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
                        오디오 사용 (파일 첨부 또는 AI 오디오 합성)
                      </label>
                      <div className="space-y-2 rounded-md border border-border bg-card/40 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => pageAudioInputRef.current?.click()}
                            disabled={pageAudioUploading}
                          >
                            <Upload className="h-4 w-4" />
                            {pageAudioUploading ? "오디오 업로드 중..." : "MP3/오디오 첨부"}
                          </Button>
                          {selectedPage.audioUrl ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  updateSelectedPage((page) => ({ ...page, audioUrl: "" }));
                                  setAudioPreviewUrl(undefined);
                                  setSuccess("첨부된 페이지 오디오를 제거했습니다.");
                                }}
                              >
                                제거
                              </Button>
                              <audio
                                src={toInstagramMediaPreviewUrl(selectedPage.audioUrl)}
                                controls
                                className="h-9 min-w-[220px] flex-1"
                              />
                            </>
                          ) : null}
                        </div>
                        {selectedPage.audioUrl ? (
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <select
                              value={audioApplyTargetPageId}
                              onChange={(event) => setAudioApplyTargetPageId(event.target.value)}
                              className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-xs"
                              title="현재 페이지에 첨부된 오디오를 적용할 대상 페이지"
                            >
                              <option value="__all__">다른 모든 페이지</option>
                              {editor.pages
                                .filter((page) => page.id !== selectedPageId)
                                .map((page, index) => (
                                  <option key={`apply-audio-target-${page.id}`} value={page.id}>
                                    {`${index + 1}. ${page.name}`}
                                  </option>
                                ))}
                            </select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 whitespace-nowrap"
                              onClick={() => applySelectedPageAudioToPages(audioApplyTargetPageId)}
                              disabled={editor.pages.filter((page) => page.id !== selectedPageId).length === 0}
                            >
                              다른 페이지에 적용
                            </Button>
                          </div>
                        ) : null}
                        <input
                          ref={pageAudioInputRef}
                          type="file"
                          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac"
                          className="hidden"
                          onChange={(event) => void onPageAudioUpload(event)}
                        />
                        {typeof pageAudioUploadProgress === "number" ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{pageAudioUploading ? "오디오 업로드" : "업로드 완료"}</span>
                              <span>{pageAudioUploadProgress}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-emerald-400 transition-all"
                                style={{ width: `${pageAudioUploadProgress}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">
                          파일을 첨부하면 AI TTS 대신 첨부한 오디오가 우선 사용됩니다.
                        </p>
                      </div>
                      {selectedPage.audioEnabled ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="space-y-1">
                            <Label title="이 페이지의 음성을 생성할 AI TTS 제공자입니다. 설정 따름은 설정 화면의 기본 TTS 제공자를 사용합니다.">
                              TTS 제공자
                            </Label>
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
                              disabled={Boolean(selectedPage.audioUrl)}
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
                            <Label title="AI 음성 합성에 사용할 목소리입니다. 선택한 TTS 제공자에 따라 옵션이 달라집니다.">
                              AI 목소리
                            </Label>
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
                              disabled={Boolean(selectedPage.audioUrl)}
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
                            <Label title="AI 음성 재생 속도입니다. 1.0x가 기본 속도이고, 낮으면 느리게 높으면 빠르게 읽습니다.">
                              배속
                            </Label>
                            <Select
                              value={String(clamp(Number(selectedPage.audioSpeed), 0.5, 2, 1))}
                              onValueChange={(value) =>
                                updateSelectedPage((page) => ({
                                  ...page,
                                  audioSpeed: clamp(Number(value), 0.5, 2, 1)
                                }))
                              }
                              disabled={Boolean(selectedPage.audioUrl)}
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
                        disabled={!selectedPage.audioEnabled || Boolean(selectedPage.audioUrl)}
                        rows={3}
                        title="AI 음성으로 읽을 문장입니다. {{example_1_title}} 같은 변수는 선택된 row 값으로 치환됩니다."
                        placeholder={
                          selectedPage.audioUrl
                            ? "첨부한 오디오 파일이 우선 사용됩니다. AI TTS 스크립트는 비워도 됩니다."
                            : "오디오 사용 시 이 텍스트를 AI 음성(TTS)으로 생성해 MP4에 합성합니다."
                        }
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
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    value={sheetName}
                    onChange={(event) => updateBindingSheetName(event.target.value)}
                    placeholder="인스타 Sheet Name (비우면 Settings 기본값)"
                  />
                  <Button type="button" variant="outline" onClick={() => void loadSheetBindings()} disabled={bindingLoading}>
                    {bindingLoading ? "가져오는 중..." : "컬럼 가져오기"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadSheetBindings(resetBindingSheetNameToSettings())}
                    disabled={bindingLoading}
                    title="Settings에 저장된 인스타그램 시트명으로 되돌려 다시 불러옵니다."
                  >
                    설정값
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
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select value={bindingSelectedRowKey || bindingRowOptions[0].key} onValueChange={onSelectBindingRow}>
                          <SelectTrigger className="min-w-0 flex-1 bg-card dark:bg-zinc-900">
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
                        <Button
                          type="button"
                          variant="outline"
                          onClick={applySelectedBindingRow}
                          disabled={bindingApplyLoading || bindingLoading}
                        >
                          {bindingApplyLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {bindingApplyLoading ? "적용 중..." : "선택 row 적용"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        총 {bindingRowOptions.length}개 row 중 선택한 row 값을 샘플 미리보기에 반영합니다. row가 1개일 때는 적용 버튼을 눌러 다시 반영할 수 있습니다.
                      </p>
                      {bindingApplyMessage ? (
                        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-300">
                          {bindingApplyMessage}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">시트 row를 불러오면 여기서 예시 row를 선택할 수 있습니다.</p>
                  )}
                </div>
                {isNewsMode ? (
                  <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[150px] flex-1 space-y-1">
                        <Label className="text-xs">뉴스 국가</Label>
                        <Select value={newsCountry} onValueChange={setNewsCountry}>
                          <SelectTrigger className="bg-card dark:bg-zinc-900">
                            <SelectValue placeholder="국가 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {NEWS_COUNTRY_OPTIONS.map((option) => (
                              <SelectItem key={`ig-template-news-country-${option.value}`} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-[108px] space-y-1">
                        <Label className="text-xs">개수</Label>
                        <Select value={newsCount} onValueChange={setNewsCount}>
                          <SelectTrigger className="bg-card dark:bg-zinc-900">
                            <SelectValue placeholder="개수" />
                          </SelectTrigger>
                          <SelectContent>
                            {NEWS_COUNT_OPTIONS.map((option) => (
                              <SelectItem key={`ig-template-news-count-${option}`} value={option}>
                                {option}개
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-[130px] flex-1 space-y-1">
                        <Label className="text-xs">주제 (선택)</Label>
                        <Select value={newsTopic} onValueChange={setNewsTopic}>
                          <SelectTrigger className="bg-card dark:bg-zinc-900">
                            <SelectValue placeholder="주제" />
                          </SelectTrigger>
                          <SelectContent>
                            {NEWS_TOPIC_OPTIONS.map((option) => (
                              <SelectItem key={`ig-template-news-topic-${option.value}`} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-[200px] flex-[1.5] space-y-1">
                        <Label className="text-xs">검색어 (선택)</Label>
                        <Input
                          value={newsKeyword}
                          onChange={(event) => setNewsKeyword(event.target.value)}
                          placeholder="예: 이란 휴전, 반도체, AI 정책"
                          className="h-9"
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={() => void loadNewsBindings()} disabled={newsLoading}>
                        {newsLoading ? "불러오는 중..." : "뉴스 자료 불러오기"}
                      </Button>
                    </div>
                    {newsItems.length > 0 ? (
                      <div className="space-y-1">
                        <Label className="text-xs">뉴스 선택</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-[220px] flex-1">
                            <Select
                              value={selectedNewsItemKey || buildNewsItemKey(newsItems[0], 0)}
                              onValueChange={(value) => {
                                setSelectedNewsItemKey(value);
                                const item = newsItems.find((candidate, index) => buildNewsItemKey(candidate, index) === value);
                                if (item) {
                                  setNewsError(undefined);
                                  setError(undefined);
                                  applyNewsSampleData(item);
                                  setSuccess("선택한 뉴스로 변수 샘플값을 반영했습니다. 이미지는 수동 리프레시로 생성해 주세요.");
                                }
                              }}
                            >
                              <SelectTrigger className="bg-card dark:bg-zinc-900">
                                <SelectValue placeholder="뉴스 항목 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {newsItems.map((item, index) => {
                                  const key = buildNewsItemKey(item, index);
                                  const label = item.title || item.summaryKo || item.summaryOriginal || `뉴스 ${index + 1}`;
                                  return (
                                    <SelectItem key={`ig-template-news-item-${key}`} value={key}>
                                      {`${index + 1}. ${truncateText(label, 70)}`}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => void refreshNewsImagesForSelection()}
                            disabled={newsLoading || newsImageRefreshing || !selectedNewsItem}
                          >
                            <RefreshCw className={`h-4 w-4 ${newsImageRefreshing ? "animate-spin" : ""}`} />
                            {newsImageRefreshing ? "이미지 생성 중..." : "이미지 일괄 리프레시"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedNewsItem
                            ? `${selectedNewsItem.source || "Google News"} · ${formatNewsDateTime(selectedNewsItem.publishedAt)}`
                            : "뉴스를 선택하면 변수 샘플값과 이미지 프롬프트가 업데이트됩니다."}
                          {selectedNewsTopicQuery ? ` · 주제: ${selectedNewsTopic.label}` : " · 주제: 전체"}
                          {newsKeyword.trim() ? ` · 검색어: ${newsKeyword.trim()}` : ""}
                          {newsFetchedAt ? ` · 조회: ${formatNewsDateTime(newsFetchedAt)}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          화면 전환/뉴스 선택 시 이미지 자동 생성은 비활성화되어 있습니다. 필요할 때만 일괄 리프레시를 눌러 생성하세요.
                        </p>
                        {selectedNewsItem ? (
                          <div className="space-y-2 rounded-md border border-border/60 bg-card/50 p-2">
                            <p className="text-xs text-muted-foreground">
                              추천 변수: <code>{"{{newsTitle}}"}</code> / <code>{"{{newsTitle_KR}}"}</code> /{" "}
                              <code>{"{{newsBody}}"}</code> / <code>{"{{sourceArticleOriginal}}"}</code> /{" "}
                              <code>{"{{newsImagePage1}}"}</code> / <code>{"{{newsImagePage2}}"}</code>
                            </p>
                            <p className="text-xs font-medium leading-relaxed">
                              {selectedNewsItem.summaryKo || selectedNewsItem.detailKo || selectedNewsItem.summaryOriginal || selectedNewsItem.title}
                            </p>
                            <pre className="app-panel-scrollbar max-h-32 overflow-auto rounded bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-100">
                              <code>{selectedNewsItem.imagePrompt || NEWS_IMAGE_PROMPT_FALLBACK}</code>
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        뉴스 자료를 불러오면 `{"{{newsTitle}}"}`, `{"{{newsTitle_KR}}"}`, `{"{{newsBody}}"}`,{" "}
                        `{"{{sourceArticleOriginal}}"}`, `{"{{newsImagePage1}}"}`, `{"{{newsImagePage2}}"}`,{" "}
                        `{"{{imagePrompt}}"}` 같은 뉴스 전용 변수를 바로 사용할 수 있습니다.
                      </p>
                    )}
                    {newsError ? <p className="text-xs text-destructive">{newsError}</p> : null}
                  </div>
                ) : null}
                <div className="app-panel-scrollbar flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border p-2">
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
                  {visibleBindingFields.map((field) => (
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
              <div className="app-panel-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
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
