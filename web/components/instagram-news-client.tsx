"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  INSTAGRAM_FEED_DRAFT_KEY,
  INSTAGRAM_FEED_STORAGE_KEY,
  type InstagramFeedDraft
} from "@/lib/instagram-feed-storage";
import type {
  InstagramFeedPage,
  InstagramGeneratedFeedItem,
  InstagramTemplate,
  InstagramTextElement
} from "@/lib/instagram-types";

type GoogleNewsItem = {
  title: string;
  titleKo: string;
  description: string;
  summaryOriginal: string;
  summaryKo: string;
  detailOriginal: string;
  detailKo: string;
  imagePrompt: string;
  imageUrl?: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  link: string;
};

type NewsResponse = {
  country?: string;
  count?: number;
  topic?: string;
  keyword?: string;
  query?: string;
  fetchedAt?: string;
  items?: GoogleNewsItem[];
  error?: string;
};

type TemplateResponse = {
  templates?: InstagramTemplate[];
  activeTemplateId?: string;
  error?: string;
};

type GenerateImageResponse = {
  imageUrl?: string;
  stylePreset?: string;
  usedPrompt?: string;
  error?: string;
};

const FALLBACK_IMAGE_PROMPT =
  "긴급 뉴스 상황을 설명하는 사실적인 에디토리얼 사진, documentary photography, 9:16 vertical, no text, no watermark";
const FEED_CAPTION_MAX_LENGTH = 1800;
const NEWS_BODY_PART_MAX_CHARS = 300;
const NEWS_BODY_MAX_PARTS = 12;
const NEWS_BODY_BINDING_KEYS = [
  "newsBody",
  "news_body",
  "sourceArticleOriginal",
  "source_article_original",
  "sourceArticleKo",
  "source_article_ko",
  "articlePart1",
  "articlePart2",
  "article_part_1",
  "article_part_2",
  "summaryKo",
  "summary_ko",
  "detailKo",
  "detail_ko"
] as const;
const PAGE_NUMBER_BINDING_KEYS = [
  "pagenum",
  "pageNum",
  "page_num",
  "pageNumber",
  "page_number"
] as const;
const AUTO_TEXT_BINDING_KEY_PREFIX = "auto_txt_";
const REPORT_ONLY_SENTENCES = ["전합니다", "전했습니다", "전해졌습니다", "전해집니다", "밝혔습니다", "말했습니다"];

const countryOptions: Array<{ value: string; label: string }> = [
  { value: "KR", label: "대한민국 (KR)" },
  { value: "US", label: "미국 (US)" },
  { value: "JP", label: "일본 (JP)" },
  { value: "GB", label: "영국 (GB)" },
  { value: "CA", label: "캐나다 (CA)" },
  { value: "AU", label: "호주 (AU)" },
  { value: "IN", label: "인도 (IN)" },
  { value: "SG", label: "싱가포르 (SG)" },
  { value: "DE", label: "독일 (DE)" },
  { value: "FR", label: "프랑스 (FR)" }
];

const countOptions = ["5", "10", "20", "30", "50"];
const topicOptions: Array<{ value: string; label: string }> = [
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

const TOPIC_QUERY_BY_COUNTRY: Record<string, Record<string, string>> = {
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

function resolveTopicQuery(topicValue: string, country: string): string {
  if (!topicValue || topicValue === "all") {
    return "";
  }
  const byCountry = TOPIC_QUERY_BY_COUNTRY[String(country || "").toUpperCase()] || TOPIC_QUERY_BY_COUNTRY.DEFAULT;
  return byCountry[topicValue] || TOPIC_QUERY_BY_COUNTRY.DEFAULT[topicValue] || "";
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ig_news_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function removeConsecutiveDuplicateSentences(value: string): string {
  const segments = collapseWhitespace(value).match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  const output: string[] = [];
  for (const segment of segments) {
    const normalized = collapseWhitespace(segment);
    if (!normalized) {
      continue;
    }
    const comparable = normalized
      .replace(/[.!?。！？]+$/u, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const previous = output[output.length - 1] || "";
    const previousComparable = previous
      .replace(/[.!?。！？]+$/u, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (comparable && comparable === previousComparable) {
      continue;
    }
    output.push(normalized);
  }
  return collapseWhitespace(output.join(" "));
}

function removeReportOnlySentences(value: string): string {
  const segments = collapseWhitespace(value).match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  const output = segments.filter((segment) => {
    const comparable = normalizeReportOnlyComparable(segment);
    return !isReportOnlyComparable(comparable);
  });
  return collapseWhitespace(output.join(" "));
}

function normalizeReportOnlyComparable(value: string): string {
  return collapseWhitespace(value)
    .replace(/[.!?。！？]+$/u, "")
    .replace(/[^가-힣a-z0-9]/gi, "");
}

function isReportOnlyComparable(value: string): boolean {
  if (!value) {
    return false;
  }
  if (REPORT_ONLY_SENTENCES.includes(value)) {
    return true;
  }
  return REPORT_ONLY_SENTENCES.some((phrase) => value.length > phrase.length && value.split(phrase).join("") === "");
}

function isReportOnlyText(value: string): boolean {
  return isReportOnlyComparable(normalizeReportOnlyComparable(value));
}

function cleanNewsBodyText(value: string): string {
  return removeReportOnlySentences(
    removeConsecutiveDuplicateSentences(collapseWhitespace(value).replace(/(전합니다[.!?。！？]?\s*){2,}/g, "전합니다. "))
  );
}

function truncateText(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function trimWithoutEllipsis(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const cut = normalized.lastIndexOf(" ", maxLength);
  const index = cut >= Math.floor(maxLength * 0.6) ? cut : maxLength;
  return normalized.slice(0, Math.max(1, index)).trim();
}

function normalizeShortTitleSource(value: string): string {
  return collapseWhitespace(value)
    .replace(/[…⋯]+/g, " ")
    .replace(/\.{3,}/g, " ")
    .replace(/\s*[-–|·]\s*[^\-–|·]+$/, "")
    .trim();
}

function buildShortKoreanTitle(titleKo: string, summaryKo: string): string {
  const fullTitle = normalizeShortTitleSource(titleKo || summaryKo);
  if (!fullTitle) {
    return "";
  }
  const sentence = fullTitle
    .split(/[!?]/)
    .map((segment) => collapseWhitespace(segment))
    .find(Boolean) || fullTitle;
  const clauses = sentence
    .split(/[,:;·]/)
    .map((segment) => collapseWhitespace(segment))
    .filter(Boolean);
  const bestClause =
    clauses.find((segment) => segment.length >= 12 && segment.length <= 72) ||
    clauses[0] ||
    sentence;
  const trimmed = trimWithoutEllipsis(bestClause, 72);
  return trimmed.replace(/[.。!?！？]+$/u, "").trim();
}

function findBalancedTextCut(text: string, targetIndex: number): number {
  const minIndex = Math.max(1, Math.floor(targetIndex * 0.72));
  const maxIndex = Math.min(text.length - 1, Math.ceil(targetIndex * 1.28));
  const window = text.slice(minIndex, maxIndex + 1);
  const punctuationMatches = Array.from(window.matchAll(/[.!?。！？]\s*/g));
  const punctuationCut = punctuationMatches.at(-1);
  if (punctuationCut?.index !== undefined) {
    return minIndex + punctuationCut.index + punctuationCut[0].length;
  }
  const spaceCut = text.lastIndexOf(" ", maxIndex);
  if (spaceCut >= minIndex) {
    return spaceCut;
  }
  return targetIndex;
}

function splitTextForPages(value: string, maxCharsPerPage: number, maxPages: number): string[] {
  const normalized = cleanNewsBodyText(value);
  if (!normalized) {
    return [];
  }

  const targetPartCount = Math.min(maxPages, Math.max(1, Math.ceil(normalized.length / maxCharsPerPage)));
  if (targetPartCount === 1) {
    return [normalized];
  }

  const output: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0 && output.length < targetPartCount) {
    const remainingSlots = targetPartCount - output.length;
    if (remainingSlots <= 1) {
      output.push(remaining);
      break;
    }

    const targetIndex = Math.ceil(remaining.length / remainingSlots);
    const cut = findBalancedTextCut(remaining, targetIndex);
    output.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  return output;
}

function splitTextIntoBalancedPartCount(value: string, partCount: number): string[] {
  const normalized = cleanNewsBodyText(value);
  const count = Math.max(1, Math.floor(partCount));
  if (!normalized) {
    return [];
  }
  if (count <= 1) {
    return [normalized];
  }

  const output: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0 && output.length < count) {
    const remainingSlots = count - output.length;
    if (remainingSlots <= 1) {
      output.push(remaining);
      break;
    }
    const targetIndex = Math.ceil(remaining.length / remainingSlots);
    const cut = findBalancedTextCut(remaining, targetIndex);
    output.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return output.filter(Boolean);
}

function normalizeKeyword(value: string): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "");
  return normalized.slice(0, 20) || "news";
}

function resolveAiImageOrientation(value: unknown): "vertical" | "horizontal" {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function applyOrientationToPrompt(prompt: string, orientation: "vertical" | "horizontal"): string {
  const trimmed = collapseWhitespace(prompt);
  if (!trimmed) return trimmed;
  const ratioHint = orientation === "horizontal" ? "16:9 horizontal" : "9:16 vertical";
  const cleaned = trimmed
    .replace(/\b(16:9|9:16)\s*(horizontal|vertical|가로|세로|가로형|세로형)?/gi, "")
    .replace(/최종\s*화면비\s*우선\s*:\s*[^\n]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `${cleaned}\nASPECT_RATIO_REQUIRED: ${ratioHint}`;
}

type TemplateImageTarget = {
  pageIndex: number;
  orientation: "vertical" | "horizontal";
  aiModel: string;
};

function layerCoverageScore(layer: { width?: number; height?: number }): number {
  const normalize = (value: number | undefined): number => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }
    return numeric <= 1 ? numeric * 100 : numeric;
  };
  return normalize(layer.width) * normalize(layer.height);
}

function selectPrimaryTemplateImageElement(
  page: InstagramTemplate["pages"][number]
): InstagramTemplate["pages"][number]["elements"][number] | undefined {
  const imageElements = (page.elements || []).filter((element) => element.type === "image");
  if (imageElements.length === 0) {
    return undefined;
  }
  const sorted = [...imageElements].sort((left, right) => {
    const leftAi = left.aiGenerateEnabled ? 1 : 0;
    const rightAi = right.aiGenerateEnabled ? 1 : 0;
    if (leftAi !== rightAi) {
      return rightAi - leftAi;
    }
    return layerCoverageScore(right) - layerCoverageScore(left);
  });
  const candidate = sorted[0];
  if (!candidate) {
    return undefined;
  }
  const coverage = layerCoverageScore(candidate);
  if (coverage < 120) {
    return undefined;
  }
  return candidate;
}

function collectTemplateImageTargets(template: InstagramTemplate, maxTargets = 2): TemplateImageTarget[] {
  const targets: TemplateImageTarget[] = [];
  const fallbackOrientation: "vertical" | "horizontal" =
    (template.canvasWidth || 1080) >= (template.canvasHeight || 1350) ? "horizontal" : "vertical";
  for (const [pageIndex, page] of (template.pages || []).entries()) {
    const imageLayer = selectPrimaryTemplateImageElement(page);
    targets.push({
      pageIndex,
      orientation:
        imageLayer && imageLayer.type === "image"
          ? resolveAiImageOrientation(imageLayer.aiImageOrientation)
          : fallbackOrientation,
      aiModel: imageLayer && imageLayer.type === "image" ? String(imageLayer.aiModel || "auto").trim() || "auto" : "auto"
    });
    if (targets.length >= Math.max(1, maxTargets)) {
      break;
    }
  }
  return targets;
}

function buildNewsVariantPrompt(args: {
  item: GoogleNewsItem;
  pageIndex: number;
  totalTargets: number;
}): string {
  const basePrompt = collapseWhitespace(args.item.imagePrompt || FALLBACK_IMAGE_PROMPT);
  const titleKo = collapseWhitespace(args.item.titleKo || args.item.summaryKo || args.item.title);
  const detailKo = collapseWhitespace(args.item.detailKo || args.item.summaryKo || args.item.summaryOriginal || args.item.title);
  const pageNumber = args.pageIndex + 1;
  const roleHint =
    args.pageIndex === 0
      ? "첫 장 메인 컷: 뉴스 핵심을 대표하는 장면."
      : args.pageIndex === 1
        ? "둘째 장 보조 컷: 첫 장과 다른 시점/구도의 장면."
        : `${pageNumber}번째 장면: 앞선 장면과 다른 포인트를 보여주는 장면.`;
  return [
    basePrompt,
    `뉴스 제목(한국어): ${titleKo}`,
    `핵심 내용: ${truncateText(detailKo, 220)}`,
    `장면 역할: ${roleHint}`,
    `중요: 총 ${args.totalTargets}장 중 ${pageNumber}번째 컷. 다른 페이지와 동일한 구도/배경 반복 금지.`
  ]
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)
    .join("\n");
}

function buildFallbackNewsImageDataUrl(title: string, orientation: "vertical" | "horizontal"): string {
  const width = orientation === "horizontal" ? 1600 : 1080;
  const height = orientation === "horizontal" ? 900 : 1350;
  const headline = truncateText(collapseWhitespace(title || "NEWS"), 64);
  const headlineY = orientation === "horizontal" ? 520 : 780;
  const subtitleY = orientation === "horizontal" ? 600 : 870;
  const safeHeadline = headline
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1220" />
      <stop offset="55%" stop-color="#1F3A5F" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.1)}" width="${Math.round(width * 0.84)}" height="${Math.round(
    height * 0.8
  )}" rx="${Math.round(width * 0.02)}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.28)" />
  <text x="50%" y="${Math.round(headlineY)}" font-family="Pretendard, Noto Sans KR, sans-serif" font-size="${
    orientation === "horizontal" ? 62 : 54
  }" font-weight="700" text-anchor="middle" fill="#F8FAFC">${safeHeadline}</text>
  <text x="50%" y="${Math.round(subtitleY)}" font-family="Pretendard, Noto Sans KR, sans-serif" font-size="${
    orientation === "horizontal" ? 30 : 28
  }" text-anchor="middle" fill="#BFDBFE">NEWS IMAGE PLACEHOLDER</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function materializeTemplateText(text: string, row: Record<string, string>): string {
  let output = String(text || "");
  for (const [key, value] of Object.entries(row || {})) {
    output = output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value || ""));
  }
  return output;
}

function hasBindingToken(text: string, key: string): boolean {
  return new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "i").test(String(text || ""));
}

function normalizeBindingKeyForMatch(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "");
}

function isUserDefinedBindingKey(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !normalized.startsWith(AUTO_TEXT_BINDING_KEY_PREFIX);
}

function textBindingKeyMatchesAny(value: string, keys: readonly string[]): boolean {
  const normalized = normalizeBindingKeyForMatch(value);
  if (!normalized) {
    return false;
  }
  return keys.some((key) => normalizeBindingKeyForMatch(key) === normalized);
}

function isPageNumberBindingKey(value: string): boolean {
  const normalized = normalizeBindingKeyForMatch(value);
  if (!normalized) {
    return false;
  }
  if (PAGE_NUMBER_BINDING_KEYS.some((key) => normalizeBindingKeyForMatch(key) === normalized)) {
    return true;
  }
  return /^pagenum\d*$/.test(normalized) || /^pagenumber\d*$/.test(normalized);
}

function formatPageNumber(pageNumber: number): string {
  return String(Math.max(1, pageNumber)).padStart(2, "0");
}

function buildPageNumberPayload(pageNumber: number, maxPageCount: number): Record<string, string> {
  const formatted = formatPageNumber(pageNumber);
  const payload: Record<string, string> = {
    pagenum: formatted,
    pageNum: formatted,
    page_num: formatted,
    pageNumber: formatted,
    page_number: formatted
  };
  for (let index = 1; index <= Math.max(1, maxPageCount); index += 1) {
    const value = formatPageNumber(index);
    payload[`pagenum_${index}`] = value;
    payload[`pagenum${index}`] = value;
    payload[`pageNum_${index}`] = value;
    payload[`page_num_${index}`] = value;
    payload[`pageNumber_${index}`] = value;
    payload[`page_number_${index}`] = value;
  }
  return payload;
}

function isTitleBindingKey(value: string): boolean {
  const normalized = normalizeBindingKeyForMatch(value);
  if (!normalized) {
    return false;
  }
  if (["newstitle", "newstitlekr", "newstitleshortkr", "title", "subject", "headline"].includes(normalized)) {
    return true;
  }
  return normalized.includes("title") || normalized.includes("headline");
}

function isBodyBindingKey(value: string): boolean {
  const normalized = normalizeBindingKeyForMatch(value);
  if (!normalized) {
    return false;
  }
  if (
    [
      "newsbody",
      "sourcearticleoriginal",
      "sourcearticleko",
      "summaryko",
      "detailko",
      "description",
      "narration",
      "articlepart1",
      "articlepart2",
      "articlebodyko",
      "body"
    ].includes(normalized)
  ) {
    return true;
  }
  return (
    normalized.includes("body") ||
    normalized.includes("summary") ||
    normalized.includes("detail") ||
    normalized.includes("article") ||
    normalized.includes("narration")
  );
}

function hasUserDefinedTextBinding(page: InstagramFeedPage): boolean {
  return page.elements.some(
    (element) => element.type === "text" && isUserDefinedBindingKey(String(element.bindingKey || ""))
  );
}

function pageHasTextBindingToken(page: InstagramTemplate["pages"][number], keys: readonly string[]): boolean {
  return (page.elements || []).some(
    (element) =>
      element.type === "text" &&
      (keys.some((key) => hasBindingToken(String(element.text || ""), key)) ||
        (isUserDefinedBindingKey(String(element.bindingKey || "")) &&
          textBindingKeyMatchesAny(String(element.bindingKey || ""), keys)))
  );
}

function parseStoredFeedItems(raw: string | null): InstagramGeneratedFeedItem[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as InstagramGeneratedFeedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isTextElement(element: InstagramFeedPage["elements"][number]): element is InstagramTextElement {
  return element.type === "text";
}

function selectTitleTextElementId(
  page: InstagramFeedPage,
  options?: { allowHeuristicFallback?: boolean }
): string | undefined {
  const textElements = page.elements.filter(isTextElement);
  if (textElements.length === 0) {
    return undefined;
  }
  const explicit = textElements.filter((element) =>
    isUserDefinedBindingKey(String(element.bindingKey || "")) && isTitleBindingKey(String(element.bindingKey || ""))
  );
  const candidates = explicit.length > 0 ? explicit : options?.allowHeuristicFallback === false ? [] : textElements;
  if (candidates.length === 0) {
    return undefined;
  }
  const scored = [...textElements].sort((left, right) => {
    const leftTopBand = Number(left.y || 0) <= 42 ? 1 : 0;
    const rightTopBand = Number(right.y || 0) <= 42 ? 1 : 0;
    if (leftTopBand !== rightTopBand) {
      return rightTopBand - leftTopBand;
    }
    const leftWidth = Number(left.width || 0);
    const rightWidth = Number(right.width || 0);
    if (leftWidth !== rightWidth) {
      return rightWidth - leftWidth;
    }
    const leftArea = Number(left.width || 0) * Number(left.height || 0);
    const rightArea = Number(right.width || 0) * Number(right.height || 0);
    if (leftArea !== rightArea) {
      return rightArea - leftArea;
    }
    return Number(left.y || 0) - Number(right.y || 0);
  });
  const scoped = scored.filter((element) => candidates.some((candidate) => candidate.id === element.id));
  return (scoped[0] || scored[0])?.id;
}

function selectBodyTextElementId(
  page: InstagramFeedPage,
  excludeIds?: string[],
  options?: { allowHeuristicFallback?: boolean }
): string | undefined {
  const excluded = new Set((excludeIds || []).filter(Boolean));
  const textElements = page.elements.filter(
    (element): element is InstagramTextElement => isTextElement(element) && !excluded.has(element.id)
  );
  if (textElements.length === 0) {
    return undefined;
  }
  const explicit = textElements.filter((element) =>
    isUserDefinedBindingKey(String(element.bindingKey || "")) && isBodyBindingKey(String(element.bindingKey || ""))
  );
  const candidates = explicit.length > 0 ? explicit : options?.allowHeuristicFallback === false ? [] : textElements;
  if (candidates.length === 0) {
    return undefined;
  }
  const sorted = [...candidates].sort(
    (a, b) => Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0)
  );
  return sorted[0]?.id;
}

function setTextElementById(page: InstagramFeedPage, elementId: string | undefined, nextText: string): InstagramFeedPage {
  if (!elementId || !nextText.trim()) {
    return page;
  }
  return {
    ...page,
    elements: page.elements.map((element) =>
      element.type === "text" && element.id === elementId
        ? { ...element, text: nextText }
        : element
    )
  };
}

function incrementNumericTextToken(text: string, step: number): string {
  const raw = String(text || "").trim();
  if (!/^\d{1,4}$/.test(raw)) {
    return text;
  }
  const width = raw.length;
  const next = Math.max(0, Number.parseInt(raw, 10) + Math.max(1, step));
  return String(next).padStart(width, "0");
}

function cloneContinuationPage(page: InstagramFeedPage, continuationStep = 1): InstagramFeedPage {
  return {
    ...page,
    id: uid(),
    name: `${page.name} (계속)`,
    elements: page.elements.map((element) =>
      element.type === "text"
        ? { ...element, id: uid(), text: incrementNumericTextToken(element.text, continuationStep) }
        : { ...element, id: uid() }
    )
  };
}

function applyNewsTextStrategy(args: {
  pages: InstagramFeedPage[];
  titleKo: string;
  summaryKo: string;
  articleBodyParts: string[];
  pageHasBodyBinding?: boolean[];
}): InstagramFeedPage[] {
  if (args.pages.length === 0) {
    return args.pages;
  }

  const titleText = collapseWhitespace(args.titleKo);
  const summaryText = collapseWhitespace(args.summaryKo);
  const normalizedBodyParts = args.articleBodyParts.map((part) => collapseWhitespace(part)).filter(Boolean);

  let nextPages = [...args.pages];
  const bodyBindingFlags = [...(args.pageHasBodyBinding || [])];
  const requiredPageCount = Math.max(1, 1 + normalizedBodyParts.length);
  if (requiredPageCount > nextPages.length) {
    const seedIndex = Math.min(1, Math.max(0, nextPages.length - 1));
    const seed = nextPages[seedIndex];
    if (seed) {
      let continuationStep = Math.max(1, nextPages.length - seedIndex);
      while (nextPages.length < requiredPageCount) {
        nextPages = [...nextPages, cloneContinuationPage(seed, continuationStep)];
        bodyBindingFlags.push(false);
        continuationStep += 1;
      }
    }
  }

  nextPages = nextPages.map((page, index) => {
    if (index === 0) {
      let nextPage = page;
      let titleElementId: string | undefined;
      const hasUserDefinedBinding = hasUserDefinedTextBinding(nextPage);
      const hasBodyBinding = Boolean(bodyBindingFlags[index]);
      const textElementCount = nextPage.elements.filter((element) => element.type === "text").length;
      const canInjectShortTitle = Boolean(titleText) && (textElementCount >= 2 || !hasBodyBinding);

      if (canInjectShortTitle) {
        titleElementId = selectTitleTextElementId(nextPage, {
          allowHeuristicFallback: !hasUserDefinedBinding
        });
        nextPage = setTextElementById(nextPage, titleElementId, titleText);
      }

      return nextPage;
    }

    const part = normalizedBodyParts[index - 1];
    const hasBodyBinding = Boolean(bodyBindingFlags[index]);
    if (part && !hasBodyBinding) {
      const bodyElementId = selectBodyTextElementId(page, undefined, {
        allowHeuristicFallback: !hasUserDefinedTextBinding(page)
      });
      return setTextElementById(page, bodyElementId, part);
    }

    return page;
  });

  return nextPages;
}

function buildCaptionFromNews(item: GoogleNewsItem): string {
  const detailText = item.detailKo || item.summaryKo || item.detailOriginal || item.summaryOriginal || item.title;
  const normalizedDetail = truncateText(detailText, FEED_CAPTION_MAX_LENGTH);
  return `${normalizedDetail}\n\n원문 링크: ${item.link}`;
}

function buildNewsPayload(args: {
  item: GoogleNewsItem;
  country: string;
  generatedImageUrl: string;
  generatedImageUrls?: Record<string, string>;
}): { payload: Record<string, string>; keyword: string; bodyParts: string[] } {
  const item = args.item;
  const title = collapseWhitespace(item.title || item.summaryOriginal || item.description);
  const titleKo = collapseWhitespace(item.titleKo || item.summaryKo || title);
  const shortTitleKo = buildShortKoreanTitle(titleKo, item.summaryKo || titleKo);
  const summaryKo = collapseWhitespace(item.summaryKo || item.summaryOriginal || item.title);
  const detailKo = collapseWhitespace(item.detailKo || item.summaryKo || item.description || item.title);
  const detailOriginal = collapseWhitespace(item.detailOriginal || item.summaryOriginal || item.description || item.title);
  const articleForBody = cleanNewsBodyText(detailKo || summaryKo || detailOriginal || item.title);
  const bodyParts = splitTextForPages(articleForBody, NEWS_BODY_PART_MAX_CHARS, NEWS_BODY_MAX_PARTS)
    .map((part) => cleanNewsBodyText(part))
    .filter((part) => part && !isReportOnlyText(part));
  const keyword = normalizeKeyword(item.source || "news");
  const publishedAt = formatDateTime(item.publishedAt);
  const rowId = `news-${String(args.country || "kr").toLowerCase()}-${Date.now()}`;
  const page1ImageUrl = String(args.generatedImageUrls?.["1"] || args.generatedImageUrl || "").trim();
  const page2ImageUrl = String(args.generatedImageUrls?.["2"] || "").trim();
  const primaryImageUrl = String(page1ImageUrl || args.generatedImageUrl || page2ImageUrl).trim();

  const payload: Record<string, string> = {
    id: rowId,
    status: "준비",
    keyword,
    subject: shortTitleKo || summaryKo || title,
    title,
    newsTitle: title,
    newsTitleKR: titleKo,
    newsTitle_KR: titleKo,
    newsTitleShortKR: shortTitleKo,
    newsTitleShort_KR: shortTitleKo,
    news_title_short_kr: shortTitleKo,
    news_title_kr: titleKo,
    news_title: title,
    newsBody: bodyParts[0] || articleForBody || detailKo,
    news_body: bodyParts[0] || articleForBody || detailKo,
    sourceArticleOriginal: detailOriginal,
    source_article_original: detailOriginal,
    sourceArticleKo: articleForBody,
    source_article_ko: articleForBody,
    description: bodyParts[0] || articleForBody || detailKo,
    narration: bodyParts.join("\n\n") || articleForBody || detailKo,
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
    summaryOriginal: item.summaryOriginal,
    summary_original: item.summaryOriginal,
    detailKo: articleForBody,
    detail_ko: articleForBody,
    detailOriginal,
    detail_original: detailOriginal,
    articleBodyKo: articleForBody,
    article_body_ko: articleForBody,
    articlePart1: bodyParts[0] || "",
    articlePart2: bodyParts[1] || "",
    article_part_1: bodyParts[0] || "",
    article_part_2: bodyParts[1] || "",
    imagePrompt: item.imagePrompt || FALLBACK_IMAGE_PROMPT,
    image_prompt: item.imagePrompt || FALLBACK_IMAGE_PROMPT,
    newsImagePage1: page1ImageUrl,
    news_image_page1: page1ImageUrl,
    newsImagePage2: page2ImageUrl,
    news_image_page2: page2ImageUrl,
    newsImagePrimary: primaryImageUrl,
    news_image_primary: primaryImageUrl,
    imageUrl: primaryImageUrl,
    image_url: primaryImageUrl
  };
  bodyParts.forEach((rawPart, index) => {
    const part = cleanNewsBodyText(rawPart);
    if (!part || isReportOnlyText(part)) {
      return;
    }
    const key = index + 1;
    payload[`articlePart${key}`] = part;
    payload[`article_part_${key}`] = part;
    payload[`newsBody${key}`] = part;
    payload[`news_body_${key}`] = part;
    payload[`newsbody_${key}`] = part;
  });

  return {
    payload,
    keyword,
    bodyParts
  };
}

function materializeTemplatePages(args: {
  template: InstagramTemplate;
  payload: Record<string, string>;
  generatedImageUrl: string;
  generatedImageUrls?: Record<string, string>;
  generatedImagePrompts?: Record<string, string>;
  articleBodyParts?: string[];
}): InstagramFeedPage[] {
  const pageHasBodyBinding = (args.template.pages || []).map((page) =>
    pageHasTextBindingToken(page, NEWS_BODY_BINDING_KEYS)
  );

  const initialBodyParts = (args.articleBodyParts && args.articleBodyParts.length > 0
    ? args.articleBodyParts
    : [args.payload.articlePart1 || args.payload.article_part_1 || "", args.payload.articlePart2 || args.payload.article_part_2 || ""]
  )
    .map((part) => cleanNewsBodyText(part))
    .filter(Boolean);
  const articleBodySource = cleanNewsBodyText(
    args.payload.articleBodyKo ||
      args.payload.article_body_ko ||
      args.payload.detailKo ||
      args.payload.detail_ko ||
      args.payload.narration ||
      initialBodyParts.join(" ")
  );
  const bodySlotCount = Math.max(1, args.template.pages.length - 1);
  const targetBodyPartCount = Math.min(
    bodySlotCount,
    NEWS_BODY_MAX_PARTS,
    Math.max(1, Math.ceil(articleBodySource.length / NEWS_BODY_PART_MAX_CHARS))
  );
  const bodyParts = articleBodySource
    ? splitTextIntoBalancedPartCount(articleBodySource, targetBodyPartCount)
    : initialBodyParts;
  const cleanedBodyParts = bodyParts
    .map((part) => cleanNewsBodyText(part))
    .filter((part) => part && !isReportOnlyText(part));
  const expectedPageCount = Math.max(args.template.pages.length, 1 + cleanedBodyParts.length);

  const pages = args.template.pages.map((page, pageIndex) => {
    const pageIndexKey = String(args.template.pages.findIndex((candidate) => candidate.id === page.id) + 1);
    const pageGeneratedImage = String(args.generatedImageUrls?.[pageIndexKey] || args.generatedImageUrl || "").trim();
    const pageGeneratedPrompt = String(args.generatedImagePrompts?.[pageIndexKey] || args.payload.imagePrompt || "").trim();
    const heroImageElement = selectPrimaryTemplateImageElement(page);
    const primaryImageElementId = heroImageElement && heroImageElement.type === "image" ? heroImageElement.id : undefined;
    const pageNumberText = formatPageNumber(pageIndex + 1);
    const pageBodyText = pageIndex > 0 ? cleanedBodyParts[pageIndex - 1] || "" : "";
    const pagePayload = {
      ...args.payload,
      ...buildPageNumberPayload(pageIndex + 1, expectedPageCount),
      ...(pageBodyText
        ? {
            newsBody: pageBodyText,
            news_body: pageBodyText,
            description: pageBodyText
          }
        : {})
    };
    const materializedElements = page.elements.map((element) => {
      if (element.type === "text") {
        const bindingKey = String(element.bindingKey || "");
        let nextText = materializeTemplateText(element.text, pagePayload);
        if (isPageNumberBindingKey(bindingKey)) {
          nextText = pageNumberText;
        } else if (pageIndex === 0 && isTitleBindingKey(bindingKey)) {
          nextText =
            args.payload.newsTitleShort_KR ||
            args.payload.newsTitleShortKR ||
            args.payload.news_title_short_kr ||
            args.payload.newsTitle_KR ||
            args.payload.newsTitleKR ||
            args.payload.newsTitle ||
            nextText;
        } else if (pageIndex > 0 && isBodyBindingKey(bindingKey)) {
          nextText = pageBodyText;
        }
        return {
          ...element,
          text: nextText
        };
      }
      if (element.type === "image") {
        const resolvedImageUrl = materializeTemplateText(String(element.imageUrl || ""), pagePayload).trim();
        const shouldInjectGeneratedImage = Boolean(pageGeneratedImage) && element.id === primaryImageElementId;
        const nextImageUrl = shouldInjectGeneratedImage ? pageGeneratedImage : resolvedImageUrl || "";
        return {
          ...element,
          imageUrl: nextImageUrl,
          fit: shouldInjectGeneratedImage ? "cover" : element.fit,
          aiPrompt: shouldInjectGeneratedImage
            ? pageGeneratedPrompt || materializeTemplateText(String(element.aiPrompt || ""), pagePayload)
            : materializeTemplateText(String(element.aiPrompt || ""), pagePayload)
        };
      }
      return element;
    });

    const backgroundImageUrl = materializeTemplateText(String(page.backgroundImageUrl || ""), pagePayload).trim();
    const heroImageLayer = primaryImageElementId
      ? materializedElements.find((element) => element.type === "image" && element.id === primaryImageElementId)
      : undefined;
    const hasHeroImage = Boolean(
      heroImageLayer && heroImageLayer.type === "image" && String(heroImageLayer.imageUrl || "").trim().length > 0
    );

    return {
      ...page,
      backgroundImageUrl:
        backgroundImageUrl || (!hasHeroImage && pageGeneratedImage ? pageGeneratedImage : "") || undefined,
      elements: materializedElements
    };
  });

  const pagesForContent = pages.slice(0, Math.max(1, 1 + cleanedBodyParts.length));
  const summaryKo = args.payload.summaryKo || args.payload.summary_ko || args.payload.subject || "";
  return applyNewsTextStrategy({
    pages: pagesForContent,
    titleKo:
      args.payload.newsTitleShort_KR ||
      args.payload.newsTitleShortKR ||
      args.payload.news_title_short_kr ||
      args.payload.newsTitle_KR ||
      args.payload.newsTitleKR ||
      args.payload.newsTitle ||
      args.payload.title ||
      "",
    summaryKo,
    articleBodyParts: cleanedBodyParts,
    pageHasBodyBinding
  });
}

async function tryGenerateNewsImage(args: {
  prompt: string;
  aiModel?: string;
  imageAspectRatio?: "16:9" | "9:16";
  canvasWidth?: number;
  canvasHeight?: number;
}): Promise<string> {
  const prompt = collapseWhitespace(args.prompt || FALLBACK_IMAGE_PROMPT);
  if (!prompt) {
    return "";
  }
  try {
    const response = await fetch("/api/instagram/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aiModel: args.aiModel,
        imageAspectRatio: args.imageAspectRatio,
        canvasWidth: args.canvasWidth,
        canvasHeight: args.canvasHeight
      })
    });
    const data = (await response.json()) as GenerateImageResponse;
    if (!response.ok) {
      return "";
    }
    return String(data.imageUrl || "").trim();
  } catch {
    return "";
  }
}

function formatDateTime(value: string): string {
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

export function InstagramNewsClient(): React.JSX.Element {
  const router = useRouter();
  const [country, setCountry] = useState("KR");
  const [count, setCount] = useState("10");
  const [topic, setTopic] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [items, setItems] = useState<GoogleNewsItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string>();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState<string>();
  const [templates, setTemplates] = useState<InstagramTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedNewsItem, setSelectedNewsItem] = useState<GoogleNewsItem>();

  const selectedCountryLabel = useMemo(
    () => countryOptions.find((item) => item.value === country)?.label || country,
    [country]
  );
  const selectedTopic = useMemo(
    () => topicOptions.find((item) => item.value === topic) || topicOptions[0],
    [topic]
  );
  const selectedTopicQuery = useMemo(() => resolveTopicQuery(topic, country), [country, topic]);

  const loadNews = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("count", count);
      if (selectedTopicQuery) {
        params.set("topic", selectedTopicQuery);
      }
      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword) {
        params.set("keyword", trimmedKeyword);
      }
      const response = await fetch(`/api/instagram/news?${params.toString()}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as NewsResponse;
      if (!response.ok) {
        throw new Error(data.error || "뉴스 조회에 실패했습니다.");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setFetchedAt(data.fetchedAt || new Date().toISOString());
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "뉴스 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [country, count, keyword, selectedTopicQuery]);

  const loadTemplates = useCallback(async (): Promise<void> => {
    setTemplateLoading(true);
    setTemplateError(undefined);
    try {
      const response = await fetch("/api/instagram/templates", { cache: "no-store" });
      const data = (await response.json()) as TemplateResponse;
      if (!response.ok) {
        throw new Error(data.error || "템플릿 목록을 불러오지 못했습니다.");
      }
      const templateList = Array.isArray(data.templates) ? data.templates : [];
      setTemplates(templateList);
      setSelectedTemplateId((prev) => {
        if (prev && templateList.some((template) => template.id === prev)) {
          return prev;
        }
        if (data.activeTemplateId && templateList.some((template) => template.id === data.activeTemplateId)) {
          return data.activeTemplateId;
        }
        return templateList[0]?.id || "";
      });
    } catch (loadTemplateError) {
      setTemplateError(
        loadTemplateError instanceof Error
          ? loadTemplateError.message
          : "템플릿 목록을 불러오지 못했습니다."
      );
      setTemplates([]);
      setSelectedTemplateId("");
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  const openTemplateDialogForItem = useCallback(
    async (item: GoogleNewsItem): Promise<void> => {
      setSelectedNewsItem(item);
      setTemplateDialogOpen(true);
      await loadTemplates();
    },
    [loadTemplates]
  );

  const createFeedFromNews = useCallback(async (): Promise<void> => {
    if (!selectedNewsItem) {
      setTemplateError("대상 뉴스를 먼저 선택해 주세요.");
      return;
    }
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    if (!selectedTemplate) {
      setTemplateError("피드 템플릿을 선택해 주세요.");
      return;
    }

    setTemplateBusy(true);
    setTemplateError(undefined);
    try {
      const imageTargets = collectTemplateImageTargets(selectedTemplate, 2);
      const generatedImageUrls: Record<string, string> = {};
      const generatedImagePrompts: Record<string, string> = {};
      const fallbackNewsImageUrl = collapseWhitespace(selectedNewsItem.imageUrl || "");
      const defaultOrientation: "vertical" | "horizontal" =
        (selectedTemplate.canvasWidth || 1080) >= (selectedTemplate.canvasHeight || 1350) ? "horizontal" : "vertical";
      const defaultAspectRatio = defaultOrientation === "horizontal" ? "16:9" : "9:16";
      for (const target of imageTargets) {
        const variantPrompt = buildNewsVariantPrompt({
          item: selectedNewsItem,
          pageIndex: target.pageIndex,
          totalTargets: imageTargets.length
        });
        const pageKey = String(target.pageIndex + 1);
        generatedImagePrompts[pageKey] = applyOrientationToPrompt(variantPrompt, target.orientation);
        const imageUrl = await tryGenerateNewsImage({
          prompt: generatedImagePrompts[pageKey],
          aiModel: target.aiModel,
          imageAspectRatio: target.orientation === "horizontal" ? "16:9" : "9:16",
          canvasWidth: selectedTemplate.canvasWidth || 1080,
          canvasHeight: selectedTemplate.canvasHeight || 1350
        });
        if (imageUrl) {
          generatedImageUrls[pageKey] = imageUrl;
        }
      }
      if (Object.keys(generatedImageUrls).length === 0 && fallbackNewsImageUrl) {
        generatedImageUrls["1"] = fallbackNewsImageUrl;
      }
      if (Object.keys(generatedImageUrls).length === 0) {
        const backupPrompt = applyOrientationToPrompt(
          collapseWhitespace(selectedNewsItem.imagePrompt || FALLBACK_IMAGE_PROMPT),
          defaultOrientation
        );
        generatedImagePrompts["1"] = backupPrompt;
        const backupGeneratedImage = await tryGenerateNewsImage({
          prompt: backupPrompt,
          aiModel: imageTargets[0]?.aiModel || "auto",
          imageAspectRatio: defaultAspectRatio,
          canvasWidth: selectedTemplate.canvasWidth || 1080,
          canvasHeight: selectedTemplate.canvasHeight || 1350
        });
        if (backupGeneratedImage) {
          generatedImageUrls["1"] = backupGeneratedImage;
        }
      }
      if (Object.keys(generatedImageUrls).length === 0) {
        generatedImagePrompts["1"] = applyOrientationToPrompt(
          collapseWhitespace(selectedNewsItem.imagePrompt || FALLBACK_IMAGE_PROMPT),
          defaultOrientation
        );
        generatedImageUrls["1"] = buildFallbackNewsImageDataUrl(
          selectedNewsItem.titleKo || selectedNewsItem.summaryKo || selectedNewsItem.title || "NEWS",
          defaultOrientation
        );
      }

      const primaryGeneratedImage = String(generatedImageUrls["1"] || Object.values(generatedImageUrls)[0] || "").trim();
      if (primaryGeneratedImage) {
        for (const target of imageTargets) {
          const pageKey = String(target.pageIndex + 1);
          if (!String(generatedImageUrls[pageKey] || "").trim()) {
            generatedImageUrls[pageKey] = primaryGeneratedImage;
          }
          if (!String(generatedImagePrompts[pageKey] || "").trim()) {
            generatedImagePrompts[pageKey] = generatedImagePrompts["1"] || collapseWhitespace(selectedNewsItem.imagePrompt || FALLBACK_IMAGE_PROMPT);
          }
        }
      }
      const generatedImageUrl = String(
        generatedImageUrls["1"] || Object.values(generatedImageUrls)[0] || fallbackNewsImageUrl || ""
      ).trim();

      const { payload, keyword, bodyParts } = buildNewsPayload({
        item: selectedNewsItem,
        country,
        generatedImageUrl,
        generatedImageUrls
      });
      const pages = materializeTemplatePages({
        template: selectedTemplate,
        payload,
        generatedImageUrl,
        generatedImageUrls,
        generatedImagePrompts,
        articleBodyParts: bodyParts
      });
      const generatedItem: InstagramGeneratedFeedItem = {
        id: uid(),
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.templateName,
        rowId: payload.id || `news-${Date.now()}`,
        subject:
          payload.newsTitleShort_KR ||
          payload.newsTitleShortKR ||
          payload.news_title_short_kr ||
          payload.newsTitle_KR ||
          payload.newsTitleKR ||
          selectedNewsItem.titleKo ||
          selectedNewsItem.title,
        keyword,
        generatedAt: new Date().toISOString(),
        pages
      };

      if (typeof window !== "undefined") {
        const storedItems = parseStoredFeedItems(window.localStorage.getItem(INSTAGRAM_FEED_STORAGE_KEY));
        const nextItems = [generatedItem, ...storedItems];
        window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(nextItems));
        const draft: InstagramFeedDraft = {
          selectedItemId: generatedItem.id,
          caption: buildCaptionFromNews(selectedNewsItem),
          source: "instagram-news"
        };
        window.localStorage.setItem(INSTAGRAM_FEED_DRAFT_KEY, JSON.stringify(draft));
      }

      setTemplateDialogOpen(false);
      router.push("/instagram/feed");
    } catch (createError) {
      setTemplateError(createError instanceof Error ? createError.message : "카드 뉴스 생성에 실패했습니다.");
    } finally {
      setTemplateBusy(false);
    }
  }, [country, router, selectedNewsItem, selectedTemplateId, templates]);

  useEffect(() => {
    void loadNews();
    // 최초 진입 1회 자동 조회만 수행합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Google News 조회</CardTitle>
          <CardDescription>
            국가/주제/검색어를 선택해 뉴스를 조회합니다. 본문은 핵심 요약으로 제공되며, 상세 원문은 출처 전문 변수로 활용할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1.5">
              <Label>국가</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="국가 선택" />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((option) => (
                    <SelectItem key={`ig-news-country-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>가져올 개수</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger>
                  <SelectValue placeholder="개수 선택" />
                </SelectTrigger>
                <SelectContent>
                  {countOptions.map((option) => (
                    <SelectItem key={`ig-news-count-${option}`} value={option}>
                      {option}개
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>주제 (선택)</Label>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger>
                  <SelectValue placeholder="주제 선택" />
                </SelectTrigger>
                <SelectContent>
                  {topicOptions.map((option) => (
                    <SelectItem key={`ig-news-topic-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>검색어 (선택)</Label>
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="예: 이란 휴전, 반도체, AI 정책"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={() => void loadNews()} disabled={loading} className="w-full">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "조회 중..." : "최신 뉴스 가져오기"}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            선택 국가: {selectedCountryLabel}
            {selectedTopicQuery ? ` · 주제: ${selectedTopic.label}` : " · 주제: 전체"}
            {keyword.trim() ? ` · 검색어: ${keyword.trim()}` : ""}
            {fetchedAt ? ` · 마지막 조회: ${formatDateTime(fetchedAt)}` : ""}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.length === 0 && !loading ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              표시할 뉴스가 없습니다.
            </CardContent>
          </Card>
        ) : null}
        {items.map((item, index) => (
          <Card key={`${item.link}:${index}`}>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base leading-snug">
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-2 hover:underline"
                  >
                    <span>{item.title}</span>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                  </a>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void openTemplateDialogForItem(item)}
                >
                  <Sparkles className="mr-1 h-4 w-4" />
                  카드 뉴스 만들기
                </Button>
              </div>
              <CardDescription>
                {item.source || "Google News"} · {formatDateTime(item.publishedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <section className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground">원래 언어 (요약)</p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {item.summaryOriginal || item.detailOriginal || item.description || "원문 요약 정보가 없습니다."}
                  </p>
                </section>
                <section className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground">한국어 (요약)</p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {item.summaryKo || item.detailKo || item.summaryOriginal || item.description || "한국어 요약이 없습니다."}
                  </p>
                </section>
              </div>
              <section className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">이미지 프롬프트</p>
                <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100">
                  <code>{item.imagePrompt || "해당 뉴스를 설명하는 사실적인 에디토리얼 장면, 9:16 vertical."}</code>
                </pre>
              </section>
              <section className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">뉴스 변수 가이드</p>
                <p className="text-xs text-foreground">
                  제목: <code>{"{{newsTitle}}"}</code> / 제목(한국어): <code>{"{{newsTitle_KR}}"}</code> / 본문(한국어 요약):{" "}
                  <code>{"{{newsBody}}"}</code> / 출처 전문(원문): <code>{"{{sourceArticleOriginal}}"}</code> /{" "}
                  짧은 제목(한국어): <code>{"{{newsTitleShort_KR}}"}</code> / 페이지 이미지: <code>{"{{newsImagePage1}}"}</code>,{" "}
                  <code>{"{{newsImagePage2}}"}</code>
                </p>
              </section>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) {
            setTemplateError(undefined);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>카드 뉴스 만들기</DialogTitle>
            <DialogDescription>
              피드 템플릿을 선택하면 뉴스 내용을 채운 컨테이너를 생성하고 [피드] 화면으로 이동합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>선택한 뉴스</Label>
              <p className="rounded-md border border-border/60 bg-muted/20 p-2 text-sm leading-relaxed">
                {selectedNewsItem?.title || "뉴스를 먼저 선택해 주세요."}
              </p>
            </div>

            <div className="space-y-1">
              <Label>피드 템플릿</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId} disabled={templateLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={templateLoading ? "불러오는 중..." : "템플릿 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={`ig-news-template-${template.id}`} value={template.id}>
                      {template.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!templateLoading && templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  사용할 템플릿이 없습니다. [인스타그램 템플릿]에서 먼저 피드 템플릿을 만들어 주세요.
                </p>
              ) : null}
            </div>

            <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">인스타 본문(캡션) 미리보기</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {selectedNewsItem ? buildCaptionFromNews(selectedNewsItem) : "-"}
              </p>
            </div>

            {templateError ? <p className="text-sm text-destructive">{templateError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              취소
            </Button>
            <Button
              type="button"
              onClick={() => void createFeedFromNews()}
              disabled={templateLoading || templateBusy || !selectedTemplateId || !selectedNewsItem}
            >
              {templateBusy ? "생성 중..." : "피드로 보내기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
