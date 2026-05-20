"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Upload,
  Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { renderInstagramPageToPngDataUrl, renderInstagramPageToVideoBlob } from "@/lib/instagram-page-renderer";
import { ensureInstagramCustomFontsLoaded } from "@/lib/instagram-font-runtime";
import {
  INSTAGRAM_FEED_DRAFT_KEY,
  INSTAGRAM_FEED_MAX_ROWS_KEY,
  INSTAGRAM_FEED_PAGE_ORDER_KEY,
  INSTAGRAM_FEED_SELECTED_ITEM_KEY,
  INSTAGRAM_FEED_STORAGE_KEY,
  INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY,
  type InstagramFeedDraft,
  type InstagramTemplateEditDraft
} from "@/lib/instagram-feed-storage";
import type { AppSettings } from "@/lib/types";
import type {
  InstagramFeedPage,
  InstagramGeneratedFeedItem,
  InstagramImageElement,
  InstagramPageElement,
  InstagramTemplate,
  InstagramVideoElement
} from "@/lib/instagram-types";

type MetaHealthResponse = {
  ok?: boolean;
  ready?: boolean;
  message?: string;
  missing?: string[];
  account?: {
    id?: string;
    username?: string;
    accountType?: string;
  };
};

type UploadResponse = {
  ok?: boolean;
  mediaId?: string;
  permalink?: string;
  sheetUpdate?: {
    updated?: boolean;
    reason?: string;
    sheetName?: string;
  };
  error?: string;
};

type TemplateResponse = {
  templates?: InstagramTemplate[];
  activeTemplateId?: string;
  error?: string;
};

type SheetRowsResponse = {
  rows?: Array<{
    id: string;
    status: string;
    keyword: string;
    subject: string;
    description: string;
    narration: string;
    raw: Record<string, string>;
  }>;
  count?: number;
  readyOnly?: boolean;
  sheetName?: string;
  error?: string;
};

type FeedSheetRow = NonNullable<SheetRowsResponse["rows"]>[number];

type SheetTableResponse = {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
};

type GenerateImageResponse = {
  imageUrl?: string;
  usedPrompt?: string;
  stylePreset?: string;
  error?: string;
};

type GenerateImageVideoResponse = {
  videoUrl?: string;
  provider?: "gemini" | "openai";
  model?: string;
  durationSec?: number;
  resolution?: "720p" | "1080p";
  estimatedCostUsd?: number;
  usedPrompt?: string;
  error?: string;
};

function resolveAiImageOrientation(value: string | undefined): "vertical" | "horizontal" {
  return value === "horizontal" ? "horizontal" : "vertical";
}

type RenderPageVideoResponse = {
  outputUrl?: string;
  audioUrl?: string;
  error?: string;
};

type MuxPageVideoResponse = {
  outputUrl?: string;
  error?: string;
};

type ComposePageVideoResponse = {
  outputUrl?: string;
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

const INSTAGRAM_FEED_HASHTAG_TEMPLATE_KEY = "instagram-feed-caption-hashtag-template";
const DEFAULT_INSTAGRAM_FEED_HASHTAG_TEMPLATE = `#일본어문법 #JLPTN{num} #일본어공부 #일본어회화 #실전일본어 #쑨에듀
#日本語 #日本語学習 #日本語会話 #旅行日本語 #JLPT #毎日日本語
#애니메이션 #일본 #일본애니메이션 #アニメーション #日本 #日本アニメ`;

type RenderedFeedAsset = {
  pageId: string;
  pageName: string;
  index: number;
  mediaKind: "image" | "video";
  mediaUrl: string;
  audioUrl?: string;
  blob?: Blob;
  mimeType?: string;
};

type FeedLogEntry = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

const INSTAGRAM_MEDIA_PROXY_PATH = "/api/instagram/media-proxy";

function isRenderableMediaUrl(url: string): boolean {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return true;
  if (raw.startsWith("data:image/") || raw.startsWith("data:video/")) return true;
  if (raw.startsWith("/")) return true;
  return false;
}

function toInstagramMediaPreviewUrl(source: string): string {
  const value = String(source || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }
  if (value.startsWith(`${INSTAGRAM_MEDIA_PROXY_PATH}?`)) {
    return value;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) {
    return `${INSTAGRAM_MEDIA_PROXY_PATH}?source=${encodeURIComponent(value)}`;
  }
  return value;
}

function pagePrimaryMediaUrl(page: InstagramGeneratedFeedItem["pages"][number]): string {
  const bg = String(page.backgroundImageUrl || "").trim();
  if (isRenderableMediaUrl(bg)) {
    return bg;
  }
  const heroMediaLayer = selectPrimaryEditableImageElement(page);
  if (
    heroMediaLayer &&
    (heroMediaLayer.type === "image" || heroMediaLayer.type === "video") &&
    isRenderableMediaUrl(heroMediaLayer.imageUrl)
  ) {
    return String(heroMediaLayer.imageUrl || "");
  }
  const anyImageLayerWithUrl = page.elements.find(
    (element) =>
      (element.type === "image" || element.type === "video") &&
      isRenderableMediaUrl(String(element.imageUrl || ""))
  );
  if (anyImageLayerWithUrl && (anyImageLayerWithUrl.type === "image" || anyImageLayerWithUrl.type === "video")) {
    return String(anyImageLayerWithUrl.imageUrl || "");
  }
  return "";
}

function inferMediaKind(url: string): "image" | "video" {
  const normalized = String(url || "").trim().toLowerCase().split("?")[0].split("#")[0];
  if (normalized.startsWith("data:video/")) {
    return "video";
  }
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(normalized) ? "video" : "image";
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ig_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function normalizeTemplateKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function materialize(text: string, row: Record<string, string>): string {
  const source = String(text || "");
  const keys = Object.keys(row || {});
  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (fullToken, tokenRaw) => {
    const token = String(tokenRaw || "").trim();
    if (!token) return fullToken;
    if (Object.prototype.hasOwnProperty.call(row, token)) {
      return String(row[token] ?? "");
    }
    const lower = token.toLowerCase();
    const caseMatched = keys.find((key) => key.toLowerCase() === lower);
    if (caseMatched) {
      return String(row[caseMatched] ?? "");
    }
    const normalized = normalizeTemplateKey(token);
    const normalizedMatched = keys.find((key) => normalizeTemplateKey(key) === normalized);
    return normalizedMatched ? String(row[normalizedMatched] ?? "") : fullToken;
  });
}

function getColumnValue(row: Record<string, string>, column: string): string {
  const target = column.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const foundKey = Object.keys(row).find(
    (key) => key.trim().toLowerCase().replace(/[\s_-]+/g, "") === target
  );
  return foundKey ? String(row[foundKey] || "").trim() : "";
}

function getSheetTableRowId(row: Record<string, string>): string {
  return getColumnValue(row, "id") || getColumnValue(row, "ID");
}

function sheetTableRowToFeedRow(row: Record<string, string>): FeedSheetRow {
  const id = getSheetTableRowId(row);
  const keyword = getColumnValue(row, "keyword") || getColumnValue(row, "type") || getColumnValue(row, "jlpt");
  const subject =
    getColumnValue(row, "subject") ||
    getColumnValue(row, "Subject") ||
    getColumnValue(row, "example_1_title") ||
    getColumnValue(row, "Caption") ||
    id;
  return {
    id,
    status: getColumnValue(row, "status") || getColumnValue(row, "Status"),
    keyword,
    subject,
    description: getColumnValue(row, "description") || getColumnValue(row, "Caption"),
    narration: getColumnValue(row, "narration"),
    raw: row
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function normalizeHex(value: string | undefined, fallback: string): string {
  const normalized = String(value || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return fallback;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex, "#000000");
  const safeAlpha = clamp(alpha, 0, 1, 1);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function getShapeClipPath(shape: string): string | undefined {
  switch (shape) {
    case "triangle":
      return "polygon(50% 0%, 100% 100%, 0% 100%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "pentagon":
      return "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    case "star":
      return "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";
    case "arrowRight":
      return "polygon(0% 26%,68% 26%,68% 0%,100% 50%,68% 100%,68% 74%,0% 74%)";
    case "arrowLeft":
      return "polygon(100% 26%,32% 26%,32% 0%,0% 50%,32% 100%,32% 74%,100% 74%)";
    default:
      return undefined;
  }
}

function getTextShadowStyle(layer: {
  shadowEnabled?: boolean;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  shadowColor?: string;
}): string | undefined {
  if (!layer.shadowEnabled) {
    return undefined;
  }
  return `${clamp(Number(layer.shadowX), -40, 40, 0)}px ${clamp(Number(layer.shadowY), -40, 40, 0)}px ${clamp(Number(layer.shadowBlur), 0, 40, 0)}px ${normalizeHex(layer.shadowColor, "#000000")}`;
}

function getTextDecorationLine(layer: { underline?: boolean; strikeThrough?: boolean }): string | undefined {
  const values: string[] = [];
  if (layer.underline) values.push("underline");
  if (layer.strikeThrough) values.push("line-through");
  return values.length > 0 ? values.join(" ") : undefined;
}

function sanitizeDownloadName(value: string): string {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");
  return normalized || "file";
}

function getMediaDownloadExtension(contentType: string | null, source: string, fallback: string): string {
  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("png")) return "png";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return "jpg";
  if (normalizedType.includes("webp")) return "webp";
  if (normalizedType.includes("gif")) return "gif";
  if (normalizedType.includes("mp4")) return "mp4";
  const match = String(source || "")
    .split("?")[0]
    .split("#")[0]
    .match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : fallback;
}

function downloadBlobFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = sanitizeDownloadName(fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function downloadRemoteFile(source: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = String(source || "").trim();
  link.download = sanitizeDownloadName(fileName);
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32LE(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function toDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

async function createStoredZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const fileParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  const now = toDosDateTime(new Date());

  for (const file of files) {
    const safeName = sanitizeDownloadName(file.name);
    const nameBytes = encoder.encode(safeName);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const checksum = crc32(data);
    const localHeader: number[] = [];
    writeUint32LE(localHeader, 0x04034b50);
    writeUint16LE(localHeader, 20);
    writeUint16LE(localHeader, 0);
    writeUint16LE(localHeader, 0);
    writeUint16LE(localHeader, now.time);
    writeUint16LE(localHeader, now.date);
    writeUint32LE(localHeader, checksum);
    writeUint32LE(localHeader, data.length);
    writeUint32LE(localHeader, data.length);
    writeUint16LE(localHeader, nameBytes.length);
    writeUint16LE(localHeader, 0);
    fileParts.push(new Uint8Array(localHeader), nameBytes, data);

    const centralHeader: number[] = [];
    writeUint32LE(centralHeader, 0x02014b50);
    writeUint16LE(centralHeader, 20);
    writeUint16LE(centralHeader, 20);
    writeUint16LE(centralHeader, 0);
    writeUint16LE(centralHeader, 0);
    writeUint16LE(centralHeader, now.time);
    writeUint16LE(centralHeader, now.date);
    writeUint32LE(centralHeader, checksum);
    writeUint32LE(centralHeader, data.length);
    writeUint32LE(centralHeader, data.length);
    writeUint16LE(centralHeader, nameBytes.length);
    writeUint16LE(centralHeader, 0);
    writeUint16LE(centralHeader, 0);
    writeUint16LE(centralHeader, 0);
    writeUint16LE(centralHeader, 0);
    writeUint32LE(centralHeader, 0);
    writeUint32LE(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => {
    if (part instanceof Uint8Array) return sum + part.length;
    if (typeof part === "string") return sum + new TextEncoder().encode(part).length;
    return sum + (part as Blob).size;
  }, 0);
  const endHeader: number[] = [];
  writeUint32LE(endHeader, 0x06054b50);
  writeUint16LE(endHeader, 0);
  writeUint16LE(endHeader, 0);
  writeUint16LE(endHeader, files.length);
  writeUint16LE(endHeader, files.length);
  writeUint32LE(endHeader, centralSize);
  writeUint32LE(endHeader, offset);
  writeUint16LE(endHeader, 0);

  return new Blob([...fileParts, ...centralParts, new Uint8Array(endHeader)], {
    type: "application/zip"
  });
}

async function downloadMediaFile(source: string, fileName: string, fallbackExtension = "png"): Promise<void> {
  const raw = String(source || "").trim();
  if (!raw) {
    throw new Error("다운로드할 미디어가 없습니다.");
  }
  const response = await fetch(toInstagramMediaPreviewUrl(raw), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`미디어 다운로드 요청 실패 (${response.status})`);
  }
  const blob = await response.blob();
  const extension = getMediaDownloadExtension(response.headers.get("content-type") || blob.type, raw, fallbackExtension);
  const safeName = sanitizeDownloadName(fileName);
  downloadBlobFile(blob, /\.[a-z0-9]{2,5}$/i.test(safeName) ? safeName : `${safeName}.${extension}`);
}

async function downloadMediaBlob(source: string, fileNameBase: string, fallbackExtension = "png"): Promise<void> {
  await downloadMediaFile(source, fileNameBase, fallbackExtension);
}

function normalizeHashtags(raw: unknown): string[] {
  const blocked = new Set(["#한겨레"]);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tag) => String(tag || "").trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .filter((tag) => !blocked.has(tag))
    .slice(0, 20);
}

function sanitizeCaptionText(raw: string): string {
  const blocked = new Set(["#한겨레"]);
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => {
          const normalized = token.replace(/^#+/, "");
          if (!normalized) return true;
          if (!token.startsWith("#")) return true;
          return !blocked.has(`#${normalized}`);
        })
        .join(" ")
        .trim()
    )
    .filter(Boolean);
  return lines.join("\n").trim();
}

function extractJlptNumber(item?: InstagramGeneratedFeedItem): string {
  if (!item) return "";
  const sample = item.sampleData || {};
  const candidates = [
    sample.jlpt,
    sample.JLPT,
    sample.level,
    item.keyword,
    item.subject,
    item.rowId,
    item.templateName
  ];
  for (const candidate of candidates) {
    const match = String(candidate || "").match(/(?:JLPT\s*)?N\s*([1-5])/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "";
}

function materializeCaptionHashtagTemplate(template: string, item?: InstagramGeneratedFeedItem): string {
  const jlptNum = extractJlptNumber(item);
  const sample = item?.sampleData || {};
  return sanitizeCaptionText(
    String(template || "")
      .replace(/\{num\}/g, jlptNum)
      .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => String(sample[String(key).trim()] || ""))
  );
}

function removeHashtagOnlyLines(value: string): string {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.split(/\s+/).every((token) => token.startsWith("#")))
    .join("\n")
    .trim();
}

function buildFeedCaptionWithStoredHashtags(args: {
  baseCaption: string;
  hashtagTemplate: string;
  item?: InstagramGeneratedFeedItem;
}): string {
  const base = removeHashtagOnlyLines(args.baseCaption);
  const hashtags = materializeCaptionHashtagTemplate(args.hashtagTemplate, args.item);
  return sanitizeCaptionText([base, hashtags].filter(Boolean).join("\n"));
}

function getPayloadValueByField(payload: Record<string, string>, field: string): string {
  const normalizedField = String(field || "").trim();
  if (!normalizedField) return "";
  const exact = payload[normalizedField];
  if (typeof exact === "string" && exact.trim()) {
    return exact.trim();
  }
  const matchedKey = Object.keys(payload || {}).find((key) => key.toLowerCase() === normalizedField.toLowerCase());
  return matchedKey ? String(payload[matchedKey] || "").trim() : "";
}

function buildTemplateCaptionFromPayload(args: {
  template: InstagramTemplate;
  payload: Record<string, string>;
  fallbackSubject: string;
  hashtags: string[];
}): string {
  const captionFields = (args.template.captionSourceFields || [])
    .map((field) => String(field || "").trim())
    .filter(Boolean);
  const baseLines =
    captionFields.length > 0
      ? captionFields.map((field) => getPayloadValueByField(args.payload, field)).filter(Boolean)
      : [
          getPayloadValueByField(args.payload, "Caption") ||
            getPayloadValueByField(args.payload, "caption") ||
            getPayloadValueByField(args.payload, "Subject") ||
            getPayloadValueByField(args.payload, "subject") ||
            args.fallbackSubject
        ].filter(Boolean);
  const baseCaption = Array.from(new Set(baseLines)).join("\n").trim();
  const hashtagLine = normalizeHashtags(args.hashtags).join(" ");
  return sanitizeCaptionText([baseCaption, hashtagLine].filter(Boolean).join("\n"));
}

function normalizeFeedItemTopic(item: InstagramGeneratedFeedItem): string {
  const sample = item.sampleData || {};
  return String(sample.type || sample.jlpt || item.keyword || item.subject || "").trim();
}

function normalizeFeedItem(item: InstagramGeneratedFeedItem): InstagramGeneratedFeedItem {
  return {
    ...item,
    caption: sanitizeCaptionText(String(item.caption || "")),
    keyword: normalizeFeedItemTopic(item),
    hashtags: normalizeHashtags(item.hashtags)
  };
}

function guessExtensionFromUrl(url: string, kind: "image" | "video"): string {
  const source = String(url || "").trim().toLowerCase();
  if (source.startsWith("data:image/png")) return "png";
  if (source.startsWith("data:image/jpeg")) return "jpg";
  if (source.startsWith("data:image/webp")) return "webp";
  if (source.startsWith("data:image/gif")) return "gif";
  if (source.startsWith("data:video/mp4")) return "mp4";
  if (source.startsWith("data:video/webm")) return "webm";
  const match = source.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1];
  return kind === "video" ? "mp4" : "png";
}

function guessVideoExtensionFromMime(mimeType: string): string {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogv";
  return "mp4";
}

async function readJsonOrUploadError<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (!response.ok) {
      throw new Error(text.trim() || fallback);
    }
    throw new Error(fallback);
  }
}

function uploadWithPresignedPost(args: {
  postUrl: string;
  fields: Record<string, string>;
  file: File;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframeName = `ig-feed-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("S3 form 업로드 완료 신호를 제한 시간 내에 받지 못했습니다."));
    }, 10 * 60 * 1000);
    let submitted = false;

    function cleanup(): void {
      window.clearTimeout(timeout);
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
    submitted = true;
    form.submit();
  });
}

async function uploadRenderedFeedBlob(blob: Blob, fileName: string): Promise<string> {
  const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const metadataResponse = await fetch("/api/instagram/template-media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      contentLength: file.size
    })
  });
  const metadata = await readJsonOrUploadError<TemplateMediaUploadUrlResponse>(
    metadataResponse,
    "피드 렌더 미디어 업로드 URL을 생성하지 못했습니다."
  );
  if (!metadataResponse.ok || !metadata.publicUrl) {
    throw new Error(metadata.error || "피드 렌더 미디어 업로드 URL을 생성하지 못했습니다.");
  }

  if (metadata.uploadMethod === "post" || metadata.postUrl || metadata.fields) {
    if (!metadata.postUrl || !metadata.fields) {
      throw new Error("S3 form 업로드 정보가 불완전합니다.");
    }
    await uploadWithPresignedPost({
      postUrl: metadata.postUrl,
      fields: metadata.fields,
      file
    });
    return metadata.publicUrl;
  }

  if (!metadata.uploadUrl) {
    throw new Error(metadata.error || "피드 렌더 미디어 업로드 URL을 생성하지 못했습니다.");
  }
  const uploadResponse = await fetch(metadata.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });
  if (!uploadResponse.ok) {
    throw new Error(`피드 렌더 미디어 S3 업로드 실패 (${uploadResponse.status})`);
  }
  return metadata.publicUrl;
}

function normalizeCanvasWidth(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1080;
  return Math.max(320, Math.min(4000, Math.round(numeric)));
}

function normalizeCanvasHeight(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1350;
  return Math.max(320, Math.min(4000, Math.round(numeric)));
}

function pageOutputKind(page: InstagramFeedPage): "image" | "video" {
  if (
    page.elements.some(
      (element) =>
        (element.type === "image" || element.type === "video") &&
        (element.type === "video" || inferMediaKind(String(element.imageUrl || "")) === "video")
    )
  ) {
    return "video";
  }
  return Boolean(page.audioEnabled) ? "video" : "image";
}

function pageHasMovingVideoLayer(page: InstagramFeedPage): boolean {
  if (inferMediaKind(String(page.backgroundImageUrl || "")) === "video") {
    return true;
  }
  return page.elements.some(
    (element) =>
      (element.type === "image" || element.type === "video") &&
      (element.type === "video" || inferMediaKind(String(element.imageUrl || "")) === "video")
  );
}

function firstMovingVideoLayerUrl(page: InstagramFeedPage): string {
  const backgroundUrl = String(page.backgroundImageUrl || "").trim();
  if (inferMediaKind(backgroundUrl) === "video") {
    return backgroundUrl;
  }
  const videoElement = page.elements.find(
    (element) =>
      (element.type === "image" || element.type === "video") &&
      (element.type === "video" || inferMediaKind(String(element.imageUrl || "")) === "video") &&
      String(element.imageUrl || "").trim()
  );
  return videoElement && (videoElement.type === "image" || videoElement.type === "video")
    ? String(videoElement.imageUrl || "").trim()
    : "";
}

function primaryMovingVideoLayer(page: InstagramFeedPage): InstagramImageElement | InstagramVideoElement | undefined {
  return page.elements
    .filter(
      (element): element is InstagramImageElement | InstagramVideoElement =>
        (element.type === "image" || element.type === "video") &&
        (element.type === "video" || inferMediaKind(String(element.imageUrl || "")) === "video") &&
        String(element.imageUrl || "").trim().length > 0
    )
    .sort((a, b) => a.zIndex - b.zIndex)[0];
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",", 2);
  if (!header || !payload) {
    throw new Error("PNG 렌더 결과를 Blob으로 변환하지 못했습니다.");
  }
  const mimeMatch = header.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] || "image/png";
  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function buildCompleteOrderedPages(
  selectedItem: InstagramGeneratedFeedItem,
  orderedPages: InstagramFeedPage[]
): InstagramFeedPage[] {
  const selectedPageIds = new Set(selectedItem.pages.map((page) => page.id));
  const result: InstagramFeedPage[] = [];
  const seen = new Set<string>();

  for (const page of orderedPages) {
    if (!selectedPageIds.has(page.id) || seen.has(page.id)) {
      continue;
    }
    result.push(page);
    seen.add(page.id);
  }

  for (const page of selectedItem.pages) {
    if (seen.has(page.id)) {
      continue;
    }
    result.push(page);
    seen.add(page.id);
  }

  return result;
}

function assertSafeFinalFeedRender(pages: InstagramFeedPage[]): void {
  void pages;
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeAiPromptVariableKey(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const tokenMatch = normalized.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return tokenMatch ? String(tokenMatch[1] || "").trim() : normalized;
}

function firstTemplateVariableKey(value: string): string {
  const match = String(value || "").match(/\{\{\s*([^}]+?)\s*\}\}/);
  return sanitizeAiPromptVariableKey(String(match?.[1] || ""));
}

function getPayloadValueByKey(payload: Record<string, string>, key: string): string {
  const normalizedKey = normalizeTemplateKey(sanitizeAiPromptVariableKey(key));
  if (!normalizedKey) {
    return "";
  }
  const matchedKey = Object.keys(payload).find((candidate) => normalizeTemplateKey(candidate) === normalizedKey);
  return matchedKey ? String(payload[matchedKey] ?? "") : "";
}

function inferPageVariableKey(page: InstagramFeedPage, payload: Record<string, string>): string {
  const pageName = String(page.name || "");
  const pageIndexMatch = pageName.match(/(?:문제|example|예문)\s*([1-9]\d*)/i);
  const pageIndex = pageIndexMatch?.[1] || "";
  const candidates = [
    firstTemplateVariableKey(String(page.audioPrompt || "")),
    pageIndex ? `example_${pageIndex}_title` : "",
    pageIndex ? `example_${pageIndex}_kanji` : "",
    pageIndex ? `example_${pageIndex}_mean` : "",
    "example_1_title",
    "example_2_title"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (collapseWhitespace(getPayloadValueByKey(payload, candidate))) {
      return candidate;
    }
  }
  return "";
}

function buildFeedPromptFromPayload(args: {
  page: InstagramFeedPage;
  payload: Record<string, string>;
  rowId: string;
  rowSubject: string;
  rowKeyword: string;
  variableValue?: string;
  stylePreset?: string;
  orientation?: "vertical" | "horizontal";
}): string {
  return buildPromptFallbackFromCurrentItem({
    page: args.page,
    item: {
      id: "",
      templateId: "",
      templateName: "",
      rowId: args.rowId,
      subject: args.rowSubject,
      keyword: args.rowKeyword,
      generatedAt: "",
      sampleData: args.payload,
      pages: []
    },
    variableValue: args.variableValue,
    stylePreset: args.stylePreset,
    orientation: args.orientation
  });
}

function resolveFeedTextForPayload(args: {
  page: InstagramFeedPage;
  element: InstagramPageElement;
  payload: Record<string, string>;
}): string {
  const element = args.element;
  if (element.type !== "text") {
    return "";
  }

  const rawText = String(element.text || "");
  const tokenized = materialize(rawText, args.payload);
  // Feed generation must only replace explicit {{column}} tokens.
  // Position/content guessing can corrupt fixed labels such as logos or guide text.
  return tokenized;
}

function resolveFeedPageAudioPrompt(page: InstagramFeedPage, payload: Record<string, string>): string {
  const rawPrompt = String(page.audioPrompt || "");
  // Audio follows the same rule as text: only explicit tokens are replaced.
  return materialize(rawPrompt, payload);
}

function normalizeLayerDimensionPercent(value: number | undefined): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

function layerCoverageScore(layer: { width?: number; height?: number }): number {
  return normalizeLayerDimensionPercent(layer.width) * normalizeLayerDimensionPercent(layer.height);
}

function selectPrimaryEditableImageElement(page: InstagramFeedPage): InstagramFeedPage["elements"][number] | undefined {
  const imageElements = page.elements.filter((element) => element.type === "image" || element.type === "video");
  if (imageElements.length === 0) {
    return undefined;
  }
  const sorted = [...imageElements].sort((left, right) => layerCoverageScore(right) - layerCoverageScore(left));
  const candidate = sorted.find((element) => layerCoverageScore(element) >= 120);
  return candidate || undefined;
}

function inferFeedPromptSubject(args: {
  page: InstagramFeedPage;
  item?: InstagramGeneratedFeedItem;
  variableValue?: string;
}): string {
  const direct = collapseWhitespace(args.variableValue || "");
  if (direct) {
    return direct;
  }

  const sampleData = args.item?.sampleData || {};
  const audioPrompt = String(args.page.audioPrompt || "");
  const materializedAudioPrompt = collapseWhitespace(materialize(audioPrompt, sampleData));
  if (materializedAudioPrompt && !/\{\{\s*[^}]+?\s*\}\}/.test(materializedAudioPrompt)) {
    return materializedAudioPrompt;
  }

  const pageName = String(args.page.name || "");
  const pageIndexMatch = pageName.match(/(?:문제|example|예문)\s*([1-9]\d*)/i);
  const pageIndex = pageIndexMatch?.[1] || "";
  const preferredKeys = [
    pageIndex ? `example_${pageIndex}_title` : "",
    pageIndex ? `example_${pageIndex}_kanji` : "",
    pageIndex ? `example_${pageIndex}_mean` : "",
    "example_1_title",
    "example_2_title",
    "Subject",
    "subject",
    "Caption",
    "caption"
  ].filter(Boolean);

  for (const key of preferredKeys) {
    const value = collapseWhitespace(getPayloadValueByKey(sampleData, key));
    if (value) {
      return value;
    }
  }

  return collapseWhitespace(args.item?.subject || args.item?.keyword || "");
}

function buildPromptFallbackFromCurrentItem(args: {
  page: InstagramFeedPage;
  item?: InstagramGeneratedFeedItem;
  variableValue?: string;
  stylePreset?: string;
  orientation?: "vertical" | "horizontal";
}): string {
  const subject = inferFeedPromptSubject({
    page: args.page,
    item: args.item,
    variableValue: args.variableValue
  });
  const keyword = collapseWhitespace(args.item?.keyword || args.item?.sampleData?.type || args.item?.sampleData?.jlpt || "");
  const pageName = collapseWhitespace(args.page.name || "Page");
  const style = collapseWhitespace(args.stylePreset || "Anime cel-shaded");
  const framing = args.orientation === "horizontal" ? "16:9 horizontal framing" : "9:16 vertical portrait framing";
  return collapseWhitespace(
    `${style} style, present-day Japanese learning scene illustrating "${subject}". ` +
      `${keyword ? `Context: ${keyword}. ` : ""}` +
      `Page role: ${pageName}. East Asian Japanese people/context when people appear, natural real-world props and environment, ${framing}. ` +
      "Strictly avoid holograms, futuristic HUD/UI overlays, transparent projection screens, AR/VR goggles, neon cyberpunk effects, sci-fi control panels, robots/androids, floating digital graphics, and fantasy magic effects. Keep scenes grounded in present-day real-world context with plausible props, attire, and environments."
  );
}

function buildDefaultPageImagePrompt(page: InstagramFeedPage, item?: InstagramGeneratedFeedItem): string {
  const primaryImageLayer = selectPrimaryEditableImageElement(page);
  const promptLayer =
    primaryImageLayer && (primaryImageLayer.type === "image" || primaryImageLayer.type === "video")
      ? primaryImageLayer
      : page.elements.find((element) => element.type === "image" || element.type === "video");
  const sampleData = item?.sampleData || {};
  if (promptLayer && (promptLayer.type === "image" || promptLayer.type === "video") && item) {
    const variableKey =
      sanitizeAiPromptVariableKey(String(promptLayer.aiPromptVariableKey || "")) ||
      firstTemplateVariableKey(String(promptLayer.aiPrompt || "")) ||
      firstTemplateVariableKey(String(promptLayer.imageUrl || ""));
    const variableValue = collapseWhitespace(getPayloadValueByKey(sampleData, variableKey));
    if (variableValue) {
      return buildPromptFallbackFromCurrentItem({
        page,
        item,
        variableValue,
        stylePreset: promptLayer.aiStylePreset,
        orientation: resolveAiImageOrientation(promptLayer.aiImageOrientation)
      });
    }
    const materializedPrompt = collapseWhitespace(materialize(String(promptLayer.aiPrompt || ""), sampleData));
    if (materializedPrompt && materializedPrompt !== collapseWhitespace(String(promptLayer.aiPrompt || ""))) {
      return materializedPrompt;
    }
    return buildPromptFallbackFromCurrentItem({
      page,
      item,
      stylePreset: promptLayer.aiStylePreset,
      orientation: resolveAiImageOrientation(promptLayer.aiImageOrientation)
    });
  }
  const promptFromLayer =
    primaryImageLayer &&
    (primaryImageLayer.type === "image" || primaryImageLayer.type === "video") &&
    collapseWhitespace(primaryImageLayer.aiPrompt).length > 0
      ? primaryImageLayer
      : page.elements.find(
          (element) =>
            (element.type === "image" || element.type === "video") &&
            collapseWhitespace(element.aiPrompt).length > 0
        );
  if (promptFromLayer && (promptFromLayer.type === "image" || promptFromLayer.type === "video")) {
    return collapseWhitespace(promptFromLayer.aiPrompt);
  }
  return buildPromptFallbackFromCurrentItem({ page, item });
}

function applyImageToFeedPage(args: {
  page: InstagramFeedPage;
  mediaUrl: string;
  prompt?: string;
}): InstagramFeedPage {
  const mediaUrl = String(args.mediaUrl || "").trim();
  const prompt = collapseWhitespace(String(args.prompt || ""));
  if (!mediaUrl) {
    return args.page;
  }

  const primaryImageLayer = selectPrimaryEditableImageElement(args.page);
  const primaryImageLayerId =
    primaryImageLayer && (primaryImageLayer.type === "image" || primaryImageLayer.type === "video")
      ? primaryImageLayer.id
      : undefined;
  let imageLayerUpdated = false;
  const elements = args.page.elements.map((element) => {
    if ((element.type !== "image" && element.type !== "video") || imageLayerUpdated) {
      return element;
    }
    if (!primaryImageLayerId || element.id !== primaryImageLayerId) {
      return element;
    }
    imageLayerUpdated = true;
    return {
      ...element,
      imageUrl: mediaUrl,
      aiPrompt: prompt || element.aiPrompt
    };
  });

  return {
    ...args.page,
    backgroundImageUrl: imageLayerUpdated ? args.page.backgroundImageUrl : mediaUrl,
    elements
  };
}

function toFeedPreviewPage(page: InstagramFeedPage): InstagramFeedPage {
  return {
    ...page,
    backgroundImageUrl: toInstagramMediaPreviewUrl(String(page.backgroundImageUrl || "")),
    elements: page.elements.map((element) =>
      element.type === "image" || element.type === "video"
        ? {
            ...element,
            imageUrl: toInstagramMediaPreviewUrl(String(element.imageUrl || ""))
          }
        : element
    )
  };
}

function buildSampleDataFromFeedItem(
  item: InstagramGeneratedFeedItem,
  rows: SheetRowsResponse["rows"]
): Record<string, string> {
  const matchedRow = rows?.find((row) => String(row.id) === String(item.rowId));
  const snapshot = item.sampleData || {};
  const normalizedTopic = String(
    matchedRow?.raw?.type || matchedRow?.raw?.jlpt || item.keyword || snapshot.keyword || ""
  ).trim();
  return {
    ...snapshot,
    ...(matchedRow?.raw || {}),
    id: String(matchedRow?.id || item.rowId || ""),
    status: String(matchedRow?.status || "준비"),
    keyword: normalizedTopic,
    subject: String(matchedRow?.subject || item.subject || snapshot.subject || ""),
    description: String(matchedRow?.description || snapshot.description || ""),
    narration: String(matchedRow?.narration || snapshot.narration || "")
  };
}

export function InstagramFeedClient(): React.JSX.Element {
  const RENDER_PIPELINE_VERSION = "2026-05-04-direct-video-layer-compose";
  const router = useRouter();
  const [items, setItems] = useState<InstagramGeneratedFeedItem[]>([]);
  const [templates, setTemplates] = useState<InstagramTemplate[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetRowsResponse["rows"]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedSheetRowIds, setSelectedSheetRowIds] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState("3");
  const [loadingContext, setLoadingContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sourceSheetName, setSourceSheetName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [orderedPageIdsByItem, setOrderedPageIdsByItem] = useState<Record<string, string[]>>({});
  const [caption, setCaption] = useState("");
  const [captionHashtagTemplate, setCaptionHashtagTemplate] = useState(DEFAULT_INSTAGRAM_FEED_HASHTAG_TEMPLATE);
  const [metaHealth, setMetaHealth] = useState<MetaHealthResponse>();
  const [checkingMeta, setCheckingMeta] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadStageMessage, setUploadStageMessage] = useState<string>();
  const [uploadResult, setUploadResult] = useState<UploadResponse>();
  const [audioPreviewPageId, setAudioPreviewPageId] = useState<string>();
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>();
  const [audioPreviewLoadingPageId, setAudioPreviewLoadingPageId] = useState<string>();
  const [audioPreviewError, setAudioPreviewError] = useState<string>();
  const audioPreviewObjectUrlRef = useRef<string | undefined>(undefined);
  const [renderedVideoCache, setRenderedVideoCache] = useState<
    Record<string, { fingerprint: string; asset: RenderedFeedAsset }>
  >({});
  const [draggingPageId, setDraggingPageId] = useState<string>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetTableRows, setSheetTableRows] = useState<Record<string, string>[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [statusFilter, setStatusFilter] = useState("준비");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [wrapSheetCells, setWrapSheetCells] = useState(false);
  const [thumbnailPreviews, setThumbnailPreviews] = useState<Record<string, string>>({});
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaDialogPageId, setMediaDialogPageId] = useState<string>();
  const [mediaDialogUrl, setMediaDialogUrl] = useState("");
  const [mediaDialogPrompt, setMediaDialogPrompt] = useState("");
  const [mediaDialogApplyMode, setMediaDialogApplyMode] = useState<"current" | "selected" | "all">("current");
  const [mediaDialogApplyPageIds, setMediaDialogApplyPageIds] = useState<string[]>([]);
  const [mediaDialogSourcePageId, setMediaDialogSourcePageId] = useState("");
  const [mediaDialogBusy, setMediaDialogBusy] = useState(false);
  const [mediaDialogError, setMediaDialogError] = useState<string>();
  const [mediaDialogPreviewIndex, setMediaDialogPreviewIndex] = useState(0);
  const [mediaDialogPreviewBroken, setMediaDialogPreviewBroken] = useState(false);
  const [brokenThumbnailIds, setBrokenThumbnailIds] = useState<Record<string, boolean>>({});
  const [mediaWorkspacePageId, setMediaWorkspacePageId] = useState<string>();
  const [incomingDraft, setIncomingDraft] = useState<InstagramFeedDraft | null>(null);
  const [feedItemsHydrated, setFeedItemsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(INSTAGRAM_FEED_HASHTAG_TEMPLATE_KEY);
      if (saved && saved.trim()) {
        setCaptionHashtagTemplate(saved);
      }
    } catch {
      // Ignore localStorage access failures.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(INSTAGRAM_FEED_HASHTAG_TEMPLATE_KEY, captionHashtagTemplate);
    } catch {
      // Ignore localStorage access failures.
    }
  }, [captionHashtagTemplate]);
  const [feedLogs, setFeedLogs] = useState<FeedLogEntry[]>([]);

  function pushFeedLog(level: FeedLogEntry["level"], message: string): void {
    const entry: FeedLogEntry = {
      id: uid(),
      at: new Date().toISOString(),
      level,
      message
    };
    setFeedLogs((prev) => [...prev, entry].slice(-120));
  }

  function formatElapsed(startedAt: number): string {
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (elapsedMs < 1000) {
      return `${elapsedMs}ms`;
    }
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }

  const sheetShortcutUrl = useMemo(() => {
    const id = spreadsheetId.trim();
    if (!id) {
      return "";
    }
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }, [spreadsheetId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setFeedItemsHydrated(false);
    const raw = window.localStorage.getItem(INSTAGRAM_FEED_STORAGE_KEY);
    if (!raw) {
      setFeedItemsHydrated(true);
      return;
    }
    try {
      const parsed = (JSON.parse(raw) as InstagramGeneratedFeedItem[]).map(normalizeFeedItem);
      setItems(parsed);
      const savedSelectedItemId = String(window.localStorage.getItem(INSTAGRAM_FEED_SELECTED_ITEM_KEY) || "").trim();
      if (parsed.length > 0) {
        setSelectedItemId((prev) => {
          if (prev && parsed.some((item) => item.id === prev)) return prev;
          if (savedSelectedItemId && parsed.some((item) => item.id === savedSelectedItemId)) return savedSelectedItemId;
          return parsed[0].id;
        });
      }
      const savedOrder = window.localStorage.getItem(INSTAGRAM_FEED_PAGE_ORDER_KEY);
      if (savedOrder) {
        const parsedOrder = JSON.parse(savedOrder) as Record<string, string[]>;
        if (parsedOrder && typeof parsedOrder === "object") {
          setOrderedPageIdsByItem(parsedOrder);
        }
      }
    } catch {
      setItems([]);
    } finally {
      setFeedItemsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !feedItemsHydrated) {
      return;
    }
    try {
      if (items.length > 0) {
        window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(items.map(normalizeFeedItem)));
      }
    } catch {
      // Ignore persistence quota errors; explicit saveFeedItems still surfaces generation errors.
    }
  }, [feedItemsHydrated, items]);

  useEffect(() => {
    if (typeof window === "undefined" || !feedItemsHydrated) {
      return;
    }
    try {
      if (selectedItemId) {
        window.localStorage.setItem(INSTAGRAM_FEED_SELECTED_ITEM_KEY, selectedItemId);
      } else {
        window.localStorage.removeItem(INSTAGRAM_FEED_SELECTED_ITEM_KEY);
      }
    } catch {
      // noop
    }
  }, [feedItemsHydrated, selectedItemId]);

  useEffect(() => {
    if (typeof window === "undefined" || !feedItemsHydrated) {
      return;
    }
    try {
      window.localStorage.setItem(INSTAGRAM_FEED_PAGE_ORDER_KEY, JSON.stringify(orderedPageIdsByItem));
    } catch {
      // noop
    }
  }, [feedItemsHydrated, orderedPageIdsByItem]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(INSTAGRAM_FEED_DRAFT_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as InstagramFeedDraft;
      if (parsed && typeof parsed === "object") {
        setIncomingDraft(parsed);
      }
    } catch {
      // Ignore malformed draft payload.
    } finally {
      window.localStorage.removeItem(INSTAGRAM_FEED_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!incomingDraft || !feedItemsHydrated) {
      return;
    }

    const draftCaption = String(incomingDraft.caption || "").trim();
    const draftSelectedItemId = String(incomingDraft.selectedItemId || "").trim();

    if (draftCaption) {
      setCaption(sanitizeCaptionText(draftCaption));
    }
    if (draftSelectedItemId && items.some((item) => item.id === draftSelectedItemId)) {
      setSelectedItemId(draftSelectedItemId);
    }
    setIncomingDraft(null);
  }, [incomingDraft, items, feedItemsHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem(INSTAGRAM_FEED_MAX_ROWS_KEY);
    if (!saved) {
      return;
    }
    if (!/^(?:[1-9]|10)$/.test(saved)) {
      return;
    }
    setMaxRows(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const normalized = String(maxRows || "3").trim();
    if (!/^(?:[1-9]|10)$/.test(normalized)) {
      return;
    }
    window.localStorage.setItem(INSTAGRAM_FEED_MAX_ROWS_KEY, normalized);
  }, [maxRows]);

  useEffect(() => {
    void loadBuildContext();
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    const selected = items.find((item) => item.id === selectedItemId);
    if (!selected) return;
    setOrderedPageIdsByItem((prev) => {
      const existing = prev[selected.id];
      if (existing && existing.length > 0) return prev;
      return { ...prev, [selected.id]: selected.pages.map((page) => page.id) };
    });
    const defaultHashtagSource = captionHashtagTemplate.trim()
      ? captionHashtagTemplate
      : normalizeHashtags(selected.hashtags).join(" ");
    const defaultCaption = selected.caption
      ? sanitizeCaptionText(selected.caption)
      : buildFeedCaptionWithStoredHashtags({
          baseCaption: selected.subject,
          hashtagTemplate: defaultHashtagSource,
          item: selected
        });
    setCaption(sanitizeCaptionText(defaultCaption));
  }, [captionHashtagTemplate, items, selectedItemId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId),
    [items, selectedItemId]
  );
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedItem?.templateId),
    [templates, selectedItem?.templateId]
  );

  const orderedPages = useMemo(() => {
    if (!selectedItem) return [];
    const order = orderedPageIdsByItem[selectedItem.id] || selectedItem.pages.map((page) => page.id);
    const pageMap = new Map(selectedItem.pages.map((page) => [page.id, page]));
    const ordered = order.map((id) => pageMap.get(id)).filter(Boolean) as typeof selectedItem.pages;
    const missing = selectedItem.pages.filter((page) => !order.includes(page.id));
    return [...ordered, ...missing];
  }, [orderedPageIdsByItem, selectedItem]);
  const selectedSampleData = useMemo(
    () => (selectedItem ? buildSampleDataFromFeedItem(selectedItem, sheetRows) : {}),
    [selectedItem, sheetRows]
  );
  const selectedMediaDialogPage = useMemo(
    () => orderedPages.find((page) => page.id === mediaDialogPageId),
    [orderedPages, mediaDialogPageId]
  );
  const mediaDialogPreviewCandidates = useMemo(() => {
    const raw = String(mediaDialogUrl || "").trim();
    if (!raw || !isRenderableMediaUrl(raw) || inferMediaKind(raw) !== "image") {
      return [] as string[];
    }
    const candidates = [raw, toInstagramMediaPreviewUrl(raw)].filter(Boolean);
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (seen.has(candidate)) {
        return false;
      }
      seen.add(candidate);
      return true;
    });
  }, [mediaDialogUrl]);
  const mediaDialogPreviewUrl = mediaDialogPreviewCandidates[mediaDialogPreviewIndex] || "";
  const mediaDialogSourcePageOptions = useMemo(
    () =>
      orderedPages
        .filter((page) => page.id !== mediaDialogPageId && isRenderableMediaUrl(pagePrimaryMediaUrl(page)))
        .map((page, index) => ({
          id: page.id,
          label: `${index + 1}. ${page.name}`,
          mediaUrl: pagePrimaryMediaUrl(page),
          prompt: buildDefaultPageImagePrompt(page, selectedItem)
        })),
    [mediaDialogPageId, orderedPages, selectedItem]
  );

  useEffect(() => {
    if (mediaDialogOpen && mediaDialogPageId && !selectedMediaDialogPage) {
      setMediaDialogOpen(false);
    }
  }, [mediaDialogOpen, mediaDialogPageId, selectedMediaDialogPage]);

  useEffect(() => {
    setMediaDialogPreviewIndex(0);
    setMediaDialogPreviewBroken(false);
  }, [mediaDialogUrl, mediaDialogPageId, mediaDialogOpen]);

  useEffect(() => {
    if (orderedPages.length === 0) {
      setMediaWorkspacePageId(undefined);
      return;
    }
    if (mediaWorkspacePageId && orderedPages.some((page) => page.id === mediaWorkspacePageId)) {
      return;
    }
    setMediaWorkspacePageId(orderedPages[0]?.id);
  }, [mediaWorkspacePageId, orderedPages]);

  const mediaPlan = useMemo(
    () =>
      orderedPages.map((page, index) => {
        const mediaUrl = pagePrimaryMediaUrl(page);
        const kind = pageOutputKind(page);
        const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), selectedSampleData).trim();
        const hasAttachedAudio = Boolean(String(page.audioUrl || "").trim());
        const requiresAudioPrompt = Boolean(page.audioEnabled) && !hasAttachedAudio && !resolvedAudioPrompt;
        const hasUnresolvedAudioToken = Boolean(
          page.audioEnabled && !hasAttachedAudio && /\{\{[^}]+\}\}/.test(resolvedAudioPrompt)
        );
        return {
          pageId: page.id,
          index,
          mediaUrl,
          mediaKind: kind,
          resolvedAudioPrompt,
          hasUnresolvedAudioToken,
          ready: !requiresAudioPrompt && !hasUnresolvedAudioToken
        };
      }),
    [orderedPages, selectedSampleData]
  );

  useEffect(
    () => () => {
      if (audioPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const buildThumbnails = async (): Promise<void> => {
      if (!selectedItem || orderedPages.length === 0) {
        setThumbnailPreviews({});
        setBrokenThumbnailIds({});
        return;
      }
      const matchedTemplate = templates.find((template) => template.id === selectedItem.templateId);
      const canvasWidth = normalizeCanvasWidth(Number(matchedTemplate?.canvasWidth || 1080));
      const canvasHeight = normalizeCanvasHeight(Number(matchedTemplate?.canvasHeight || 1350));
      const sampleData = buildSampleDataFromFeedItem(selectedItem, sheetRows);
      await ensureInstagramCustomFontsLoaded(matchedTemplate?.customFonts || []);
      const next: Record<string, string> = {};
      for (const page of orderedPages) {
        try {
          const previewPage = toFeedPreviewPage(page);
          next[page.id] = await renderInstagramPageToPngDataUrl({
            page: previewPage,
            sampleData,
            canvasWidth,
            canvasHeight
          });
        } catch {
          // Keep page fallback empty on render failure.
        }
      }
      if (!cancelled) {
        setThumbnailPreviews(next);
        setBrokenThumbnailIds({});
      }
    };
    void buildThumbnails();
    return () => {
      cancelled = true;
    };
  }, [orderedPages, selectedItem, sheetRows, templates]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];

    const pushStatus = (value: string): void => {
      const normalized = value.trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      values.push(normalized);
    };

    pushStatus("준비");
    if (statusFilter !== "all") {
      pushStatus(statusFilter);
    }

    sheetTableRows.forEach((row) => {
      const statusValue = getColumnValue(row, "status");
      pushStatus(statusValue);
    });
    return values;
  }, [sheetTableRows, statusFilter]);

  const keywordOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];
    sheetTableRows.forEach((row) => {
      const keywordValue = getColumnValue(row, "keyword");
      if (!keywordValue) {
        return;
      }
      const key = keywordValue.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      values.push(keywordValue);
    });
    return values;
  }, [sheetTableRows]);

  const filteredSheetRows = useMemo(() => {
    return sheetTableRows.filter((row) => {
      const statusValue = getColumnValue(row, "status");
      const keywordValue = getColumnValue(row, "keyword");
      const statusMatches =
        statusFilter === "all" || statusValue.toLowerCase() === statusFilter.toLowerCase();
      const keywordMatches =
        selectedKeywords.length === 0 ||
        selectedKeywords.some((item) => item.toLowerCase() === keywordValue.toLowerCase());
      return statusMatches && keywordMatches;
    });
  }, [sheetTableRows, statusFilter, selectedKeywords]);
  const filteredSheetRowIds = useMemo(
    () => filteredSheetRows.map(getSheetTableRowId).filter(Boolean),
    [filteredSheetRows]
  );
  const selectedVisibleSheetRowCount = useMemo(() => {
    const visible = new Set(filteredSheetRowIds);
    return selectedSheetRowIds.filter((id) => visible.has(id)).length;
  }, [filteredSheetRowIds, selectedSheetRowIds]);

  useEffect(() => {
    if (selectedKeywords.length === 0) {
      return;
    }
    const available = new Set(keywordOptions.map((value) => value.toLowerCase()));
    const next = selectedKeywords.filter((value) => available.has(value.toLowerCase()));
    if (next.length !== selectedKeywords.length) {
      setSelectedKeywords(next);
    }
  }, [keywordOptions, selectedKeywords]);

  useEffect(() => {
    if (selectedSheetRowIds.length === 0) {
      return;
    }
    const availableIds = new Set(sheetTableRows.map(getSheetTableRowId).filter(Boolean));
    const next = selectedSheetRowIds.filter((id) => availableIds.has(id));
    if (next.length !== selectedSheetRowIds.length) {
      setSelectedSheetRowIds(next);
    }
  }, [selectedSheetRowIds, sheetTableRows]);

  function clearAll(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(INSTAGRAM_FEED_STORAGE_KEY);
      window.localStorage.removeItem(INSTAGRAM_FEED_SELECTED_ITEM_KEY);
      window.localStorage.removeItem(INSTAGRAM_FEED_PAGE_ORDER_KEY);
    }
    setItems([]);
    setSelectedItemId(undefined);
    setOrderedPageIdsByItem({});
    setCaption("");
    setMetaHealth(undefined);
    setUploadResult(undefined);
    setError(undefined);
    setSuccess(undefined);
  }

  async function loadBuildContext(): Promise<void> {
    setLoadingContext(true);
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settings = (await settingsRes.json()) as AppSettings;
      const instagramSheetName = String(settings.gsheetInstagramSheetName || "").trim();
      setSpreadsheetId(String(settings.gsheetSpreadsheetId || ""));

      const [templateRes, rowRes] = await Promise.all([
        fetch("/api/instagram/templates", { cache: "no-store" }),
        fetch(
          instagramSheetName
            ? `/api/instagram/sheet-rows?sheetName=${encodeURIComponent(instagramSheetName)}`
            : "/api/instagram/sheet-rows",
          { cache: "no-store" }
        )
      ]);

      const templateData = (await templateRes.json()) as TemplateResponse;
      const rowData = (await rowRes.json()) as SheetRowsResponse;
      const templateList = templateData.templates || [];
      setTemplates(templateList);
      setSheetRows(rowData.rows || []);
      setSourceSheetName(String(rowData.sheetName || instagramSheetName || "").trim());
      setSelectedTemplateIds((prev) =>
        prev.length > 0
          ? prev.filter((id) => templateList.some((item) => item.id === id))
          : templateList.slice(0, 1).map((item) => item.id)
      );

      try {
        const search = new URLSearchParams();
        search.set("mode", "instagram");
        if (instagramSheetName) {
          search.set("sheetName", instagramSheetName);
        }
        const tableRes = await fetch(`/api/ideas/sheet?${search.toString()}`, { cache: "no-store" });
        const tableData = (await tableRes.json()) as SheetTableResponse;
        if (tableRes.ok) {
          setSheetHeaders(tableData.headers || []);
          setSheetTableRows(tableData.rows || []);
          if (!rowData.sheetName) {
            setSourceSheetName(String(tableData.sheetName || instagramSheetName || "").trim());
          }
        }
      } catch {
        // keep feed context available even if table view fails
      }
    } catch (contextError) {
      setError(contextError instanceof Error ? contextError.message : "컨테이너 생성 준비를 불러오지 못했습니다.");
    } finally {
      setLoadingContext(false);
    }
  }

  function toggleKeyword(keyword: string): void {
    setSelectedKeywords((prev) => {
      const exists = prev.some((item) => item.toLowerCase() === keyword.toLowerCase());
      if (exists) {
        return prev.filter((item) => item.toLowerCase() !== keyword.toLowerCase());
      }
      return [...prev, keyword];
    });
  }

  function toggleTemplate(templateId: string): void {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  }

  function toggleSheetRowSelection(rowId: string): void {
    const normalized = String(rowId || "").trim();
    if (!normalized) return;
    setSelectedSheetRowIds((prev) =>
      prev.includes(normalized) ? prev.filter((id) => id !== normalized) : [...prev, normalized]
    );
  }

  function setVisibleSheetRowSelection(checked: boolean): void {
    const visibleIds = filteredSheetRowIds;
    if (visibleIds.length === 0) return;
    setSelectedSheetRowIds((prev) => {
      if (!checked) {
        const visible = new Set(visibleIds);
        return prev.filter((id) => !visible.has(id));
      }
      return [...prev, ...visibleIds.filter((id) => !prev.includes(id))];
    });
  }

  function saveFeedItems(nextItems: InstagramGeneratedFeedItem[]): void {
    const normalizedItems = nextItems.map(normalizeFeedItem);
    setItems(normalizedItems);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(normalizedItems));
    }
  }

  async function generateContainersInFeed(): Promise<void> {
    setError(undefined);
    setSuccess(undefined);
    if (selectedTemplateIds.length === 0) {
      setError("템플릿을 1개 이상 선택해 주세요.");
      return;
    }
    if (!sheetRows || sheetRows.length === 0) {
      setError("시트 row가 없습니다. 먼저 인스타 아이디어 생성 후 다시 시도해 주세요.");
      return;
    }

    setGenerating(true);
    const runStartedAt = performance.now();
    try {
      const max = Math.max(1, Math.min(10, Number.parseInt(maxRows, 10) || 3));
      const selectedIds = selectedSheetRowIds.map((id) => String(id || "").trim()).filter(Boolean);
      const sheetRowById = new Map<string, FeedSheetRow>(
        (sheetRows || []).map((row) => [String(row.id || "").trim(), row])
      );
      const tableRowById = new Map<string, Record<string, string>>();
      sheetTableRows.forEach((row) => {
        const rowId = getSheetTableRowId(row);
        if (rowId) {
          tableRowById.set(rowId, row);
        }
      });
      const pickedRows =
        selectedIds.length > 0
          ? selectedIds
              .map((id) => sheetRowById.get(id) || (tableRowById.get(id) ? sheetTableRowToFeedRow(tableRowById.get(id) as Record<string, string>) : undefined))
              .filter((row): row is FeedSheetRow => Boolean(row && row.id))
          : (sheetRows || []).slice(0, max);
      if (selectedIds.length > 0 && pickedRows.length === 0) {
        setError("선택한 row를 생성 가능한 소스에서 찾지 못했습니다. 소스 새로고침 후 다시 선택해 주세요.");
        return;
      }
      const templateMap = new Map(templates.map((item) => [item.id, item]));
      const generated: InstagramGeneratedFeedItem[] = [];
      const imageGenerationErrors: string[] = [];
      const selectedTemplates = selectedTemplateIds
        .map((templateId) => templateMap.get(templateId))
        .filter(Boolean) as InstagramTemplate[];
      const estimatedPages = pickedRows.length * selectedTemplates.reduce((sum, template) => sum + template.pages.length, 0);
      const estimatedAiImageLayers = pickedRows.length * selectedTemplates.reduce(
        (sum, template) =>
          sum +
          template.pages.reduce(
            (pageSum, page) =>
              pageSum +
                page.elements.filter(
                  (element) => (element.type === "image" || element.type === "video") && element.aiGenerateEnabled
                ).length,
            0
          ),
        0
      );
      pushFeedLog(
        "info",
        `컨테이너 생성 시작 · ${selectedIds.length > 0 ? `선택 row ${pickedRows.length}개` : `row ${pickedRows.length}개`} · 템플릿 ${selectedTemplates.length}개 · 페이지 ${estimatedPages}개 · AI 이미지 대상 ${estimatedAiImageLayers}개`
      );

      for (const row of pickedRows) {
        const rowStartedAt = performance.now();
        const rowTopic = String(row.raw?.type || row.raw?.jlpt || row.subject || "").trim();
        pushFeedLog("info", `[${row.id}] row 처리 시작 · ${rowTopic || row.subject || "제목 없음"}`);
        const payload: Record<string, string> = {
          id: row.id,
          status: row.status,
          keyword: rowTopic,
          subject: row.subject,
          description: row.description,
          narration: row.narration,
          ...(row.raw || {})
        };

        for (const templateId of selectedTemplateIds) {
          const template = templateMap.get(templateId);
          if (!template) continue;
          const templateStartedAt = performance.now();
          pushFeedLog(
            "info",
            `[${row.id}/${template.templateName}] 템플릿 적용 시작 · 페이지 ${template.pages.length}개`
          );
          const pages: InstagramFeedPage[] = [];
          for (const page of template.pages) {
            const pageStartedAt = performance.now();
            const nextElements = [];
            const aiImageLayerCount = page.elements.filter(
              (element) => (element.type === "image" || element.type === "video") && element.aiGenerateEnabled
            ).length;
            pushFeedLog(
              "info",
              `[${row.id}/${template.templateName}/${page.name}] 페이지 구성 시작 · AI 이미지 ${aiImageLayerCount}개`
            );
            for (const element of page.elements) {
              if (element.type === "text") {
                nextElements.push({
                  ...element,
                  text: resolveFeedTextForPayload({ page, element, payload })
                });
                continue;
              }
              if (element.type === "image" || element.type === "video") {
                const nextImageElement: InstagramImageElement | InstagramVideoElement = {
                  ...element,
                  imageUrl: materialize(String(element.imageUrl || ""), payload),
                  aiPrompt: materialize(String(element.aiPrompt || ""), payload)
                };
                const variableKey =
                  sanitizeAiPromptVariableKey(String(nextImageElement.aiPromptVariableKey || "")) ||
                  firstTemplateVariableKey(String(element.aiPrompt || "")) ||
                  firstTemplateVariableKey(String(nextImageElement.imageUrl || ""));
                let aiVideoDialogue = "";
                if (nextImageElement.aiGenerateEnabled && variableKey) {
                  const variableValueRaw = getPayloadValueByKey(payload, variableKey);
                  const variableValue = collapseWhitespace(variableValueRaw);
                  aiVideoDialogue = variableValue;
                  if (variableValue) {
                    nextImageElement.aiPromptVariableKey = variableKey;
                    try {
                      const promptStartedAt = performance.now();
                      pushFeedLog(
                        "info",
                        `[${row.id}/${template.templateName}/${page.name}] 변수 프롬프트 생성 시작 · ${variableKey}`
                      );
                      const promptResponse = await fetch("/api/instagram/generate-image-prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          mode: "instagram",
                          subject: String(payload.subject || row.subject || "").trim(),
                          topic: String(payload.keyword || row.keyword || "").trim(),
                          description: "",
                          stylePreset: String(nextImageElement.aiStylePreset || "Cinematic photo-real"),
                          variableKey,
                          variableValue,
                          strictVariableOnly: true
                        })
                      });
                      const promptData = (await promptResponse.json()) as { prompt?: string; error?: string };
                      if (!promptResponse.ok) {
                        throw new Error(promptData.error || "변수명 기반 프롬프트 생성 실패");
                      }
                      const variablePrompt = collapseWhitespace(String(promptData.prompt || ""));
                      if (variablePrompt) {
                        nextImageElement.aiPrompt = variablePrompt;
                      } else {
                        nextImageElement.aiPrompt = buildFeedPromptFromPayload({
                          page,
                          payload,
                          rowId: row.id,
                          rowSubject: row.subject,
                          rowKeyword: rowTopic,
                          variableValue,
                          stylePreset: nextImageElement.aiStylePreset,
                          orientation: resolveAiImageOrientation(nextImageElement.aiImageOrientation)
                        });
                      }
                      pushFeedLog(
                        "info",
                        `[${row.id}/${template.templateName}/${page.name}] 변수 프롬프트 생성 완료 · ${variableKey}="${variableValue.slice(0, 40)}" · ${formatElapsed(promptStartedAt)}`
                      );
                    } catch (promptError) {
                      const message = promptError instanceof Error ? promptError.message : "생성 실패";
                      nextImageElement.aiPrompt = buildFeedPromptFromPayload({
                        page,
                        payload,
                        rowId: row.id,
                        rowSubject: row.subject,
                        rowKeyword: rowTopic,
                        variableValue,
                        stylePreset: nextImageElement.aiStylePreset,
                        orientation: resolveAiImageOrientation(nextImageElement.aiImageOrientation)
                      });
                      imageGenerationErrors.push(
                        `[${row.id}/${template.templateName}/${page.name}] 변수명 프롬프트 실패(${variableKey}): ${message}`
                      );
                      pushFeedLog(
                        "error",
                        `[${row.id}/${template.templateName}/${page.name}] 변수 프롬프트 실패 · ${variableKey} · 현재 row fallback 사용 · ${message}`
                      );
                    }
                  } else {
                    nextImageElement.aiPrompt = buildFeedPromptFromPayload({
                      page,
                      payload,
                      rowId: row.id,
                      rowSubject: row.subject,
                      rowKeyword: rowTopic,
                      stylePreset: nextImageElement.aiStylePreset,
                      orientation: resolveAiImageOrientation(nextImageElement.aiImageOrientation)
                    });
                    pushFeedLog(
                      "warn",
                      `[${row.id}/${template.templateName}/${page.name}] 변수값 없음 · ${variableKey} · 현재 row fallback 사용 · 사용 가능: ${Object.keys(payload).slice(0, 12).join(", ")}`
                    );
                  }
                } else if (nextImageElement.aiGenerateEnabled) {
                  nextImageElement.aiPrompt = buildFeedPromptFromPayload({
                    page,
                    payload,
                    rowId: row.id,
                    rowSubject: row.subject,
                    rowKeyword: rowTopic,
                    stylePreset: nextImageElement.aiStylePreset,
                    orientation: resolveAiImageOrientation(nextImageElement.aiImageOrientation)
                  });
                  pushFeedLog(
                    "warn",
                    `[${row.id}/${template.templateName}/${page.name}] 변수명 없음 · 저장된 프롬프트 대신 현재 row fallback 사용`
                  );
                }
                if (nextImageElement.aiGenerateEnabled && collapseWhitespace(nextImageElement.aiPrompt)) {
                  try {
                    const imageStartedAt = performance.now();
                    const orientation = resolveAiImageOrientation(nextImageElement.aiImageOrientation);
                    const imageAspectRatio = orientation === "horizontal" ? "16:9" : "9:16";
                    pushFeedLog(
                      "info",
                      `[${row.id}/${template.templateName}/${page.name}] AI 이미지 생성 시작 · ${String(nextImageElement.aiModel || "auto")} · ${imageAspectRatio}`
                    );
                    const response = await fetch("/api/instagram/generate-image", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        prompt: nextImageElement.aiPrompt,
                        aiModel: String(nextImageElement.aiModel || "auto"),
                        imageAspectRatio,
                        stylePreset: String(nextImageElement.aiStylePreset || "Cinematic photo-real"),
                        canvasWidth: normalizeCanvasWidth(Number(template.canvasWidth || 1080)),
                        canvasHeight: normalizeCanvasHeight(Number(template.canvasHeight || 1350))
                      })
                    });
                    const data = (await response.json()) as GenerateImageResponse;
                    if (response.ok && data.imageUrl) {
                      nextImageElement.imageUrl = String(data.imageUrl || "");
                      nextImageElement.mediaType = "image";
                      pushFeedLog(
                        "info",
                        `[${row.id}/${template.templateName}/${page.name}] AI 이미지 생성 완료 · ${formatElapsed(imageStartedAt)}`
                      );
                    } else {
                      throw new Error(data.error || "AI 이미지 생성 실패");
                    }
                  } catch (generateError) {
                    const message = generateError instanceof Error ? generateError.message : "AI 이미지 생성 실패";
                    imageGenerationErrors.push(
                      `[${row.id}/${template.templateName}/${page.name}] ${message}`
                    );
                    pushFeedLog(
                      "error",
                      `[${row.id}/${template.templateName}/${page.name}] AI 이미지 생성 실패 · ${message}`
                    );
                  }
                }
                if (
                  nextImageElement.type === "video" &&
                  nextImageElement.aiGenerateEnabled &&
                  nextImageElement.aiVideoEnabled &&
                  isRenderableMediaUrl(String(nextImageElement.imageUrl || "")) &&
                  inferMediaKind(String(nextImageElement.imageUrl || "")) === "image"
                ) {
                  try {
                    const videoStartedAt = performance.now();
                    const provider = nextImageElement.aiVideoProvider === "openai" ? "openai" : "gemini";
                    const durationSec = Math.max(4, Math.min(8, Math.round(Number(nextImageElement.aiVideoDurationSec) || 6)));
                    const resolution = nextImageElement.aiVideoResolution === "1080p" ? "1080p" : "720p";
                    const estimatedDurationSec = provider === "openai" && durationSec > 4 ? 8 : durationSec;
                    const estimatedCostUsd =
                      estimatedDurationSec * (provider === "openai" ? 0.1 : resolution === "1080p" ? 0.08 : 0.05);
                    const orientation = resolveAiImageOrientation(nextImageElement.aiImageOrientation);
                    const aspectRatio = orientation === "horizontal" ? "16:9" : "9:16";
                    pushFeedLog(
                      "info",
                      `[${row.id}/${template.templateName}/${page.name}] AI 영상화 시작 · ${provider === "openai" ? "OpenAI Sora 2" : "Veo 3.1 Lite"} · ${estimatedDurationSec}s · 720p · 예상 $${estimatedCostUsd.toFixed(2)}`
                    );
                    const response = await fetch("/api/instagram/generate-image-video", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        imageUrl: nextImageElement.imageUrl,
                        provider,
                        prompt: String(nextImageElement.aiVideoPrompt || "no music, no camera movement, no subtitles"),
                        dialogue: aiVideoDialogue,
                        durationSec,
                        resolution,
                        aspectRatio
                      })
                    });
                    const data = (await response.json()) as GenerateImageVideoResponse;
                    if (response.ok && data.videoUrl) {
                      nextImageElement.imageUrl = String(data.videoUrl || "");
                      nextImageElement.mediaType = "video";
                      pushFeedLog(
                        "info",
                        `[${row.id}/${template.templateName}/${page.name}] AI 영상화 완료 · ${formatElapsed(videoStartedAt)} · 비용예상 $${Number(data.estimatedCostUsd || estimatedCostUsd).toFixed(2)}`
                      );
                    } else {
                      throw new Error(data.error || "AI 영상화 실패");
                    }
                  } catch (videoError) {
                    const message = videoError instanceof Error ? videoError.message : "AI 영상화 실패";
                    imageGenerationErrors.push(
                      `[${row.id}/${template.templateName}/${page.name}] AI 영상화 실패: ${message}`
                    );
                    pushFeedLog(
                      "error",
                      `[${row.id}/${template.templateName}/${page.name}] AI 영상화 실패 · ${message}`
                    );
                  }
                }
                nextElements.push(nextImageElement);
                continue;
              }
              nextElements.push(element);
            }
            pages.push({
              ...page,
              backgroundImageUrl: materialize(String(page.backgroundImageUrl || ""), payload),
              audioPrompt: resolveFeedPageAudioPrompt(page, payload),
              elements: nextElements
            });
            pushFeedLog(
              "info",
              `[${row.id}/${template.templateName}/${page.name}] 페이지 구성 완료 · ${formatElapsed(pageStartedAt)}`
            );
          }
          const feedHashtags = normalizeHashtags((template as { hashtags?: unknown }).hashtags);
          const feedCaption = buildTemplateCaptionFromPayload({
            template,
            payload,
            fallbackSubject: row.subject,
            hashtags: feedHashtags
          });
          generated.push({
            id: uid(),
            templateId: template.id,
            templateName: template.templateName,
            rowId: row.id,
            subject: row.subject,
            keyword: rowTopic,
            caption: feedCaption,
            hashtags: feedHashtags,
            generatedAt: new Date().toISOString(),
            sampleData: payload,
            pages
          });
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(generated.map(normalizeFeedItem)));
              window.localStorage.setItem(INSTAGRAM_FEED_SELECTED_ITEM_KEY, generated[0]?.id || "");
            } catch {
              // Final saveFeedItems will surface persistence/generation issues if they matter.
            }
          }
          pushFeedLog(
            "info",
            `[${row.id}/${template.templateName}] 컨테이너 생성 완료 · ${formatElapsed(templateStartedAt)}`
          );
        }
        pushFeedLog("info", `[${row.id}] row 처리 완료 · ${formatElapsed(rowStartedAt)}`);
      }

      saveFeedItems(generated);
      setSelectedItemId(generated[0]?.id);
      if (imageGenerationErrors.length > 0) {
        pushFeedLog(
          "warn",
          `컨테이너 생성 종료 · 결과 ${generated.length}개 · 이미지 오류 ${imageGenerationErrors.length}건 · ${formatElapsed(runStartedAt)}`
        );
        setError(`컨테이너는 생성했지만 일부 이미지 자동 생성 실패 (${imageGenerationErrors.length}건)`);
        setSuccess(`컨테이너 ${generated.length}개를 생성했습니다. (AI 이미지 자동 생성 일부 실패)`);
      } else {
        pushFeedLog("info", `컨테이너 생성 종료 · 결과 ${generated.length}개 · ${formatElapsed(runStartedAt)}`);
        setSuccess(`컨테이너 ${generated.length}개를 생성했습니다.`);
      }
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : "컨테이너 생성에 실패했습니다.";
      pushFeedLog("error", `컨테이너 생성 실패 · ${message} · ${formatElapsed(runStartedAt)}`);
      setError(message);
    } finally {
      setGenerating(false);
    }
  }

  function refreshResults(): void {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(INSTAGRAM_FEED_STORAGE_KEY);
    if (!raw) {
      setItems([]);
      setSelectedItemId(undefined);
      return;
    }
    try {
      const parsed = (JSON.parse(raw) as InstagramGeneratedFeedItem[]).map(normalizeFeedItem);
      setItems(parsed);
      if (parsed.length > 0) {
        setSelectedItemId((prev) => (prev && parsed.some((item) => item.id === prev) ? prev : parsed[0].id));
      } else {
        setSelectedItemId(undefined);
      }
    } catch {
      setItems([]);
      setSelectedItemId(undefined);
    }
  }

  function reorderSelectedItemPages(nextPageIds: string[]): void {
    if (!selectedItem) return;
    setOrderedPageIdsByItem((prev) => ({
      ...prev,
      [selectedItem.id]: nextPageIds
    }));
  }

  function movePage(pageId: string, direction: -1 | 1): void {
    if (!selectedItem) return;
    const current = orderedPages.map((page) => page.id);
    const index = current.indexOf(pageId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    reorderSelectedItemPages(next);
  }

  function movePageToIndex(pageId: string, targetIndex: number): void {
    const current = orderedPages.map((page) => page.id);
    const index = current.indexOf(pageId);
    if (index < 0) return;
    const next = [...current];
    const [moved] = next.splice(index, 1);
    const bounded = Math.max(0, Math.min(targetIndex, next.length));
    next.splice(bounded, 0, moved);
    reorderSelectedItemPages(next);
  }

  function openMediaDialogForPage(page: InstagramFeedPage): void {
    setMediaDialogPageId(page.id);
    setMediaWorkspacePageId(page.id);
    setMediaDialogUrl(pagePrimaryMediaUrl(page));
    setMediaDialogPrompt(buildDefaultPageImagePrompt(page, selectedItem));
    setMediaDialogApplyMode("current");
    setMediaDialogApplyPageIds([page.id]);
    setMediaDialogSourcePageId("");
    setMediaDialogError(undefined);
    setMediaDialogPreviewBroken(false);
    setMediaDialogOpen(true);
  }

  function openMediaWorkspaceEditor(args?: { preferMissing?: boolean; pageId?: string }): void {
    if (orderedPages.length === 0) {
      return;
    }
    const explicitPage = args?.pageId ? orderedPages.find((page) => page.id === args.pageId) : undefined;
    const missingPage = orderedPages.find((page) => !pagePrimaryMediaUrl(page));
    const fallbackPage = orderedPages[0];
    const targetPage = explicitPage || (args?.preferMissing ? missingPage : undefined) || missingPage || fallbackPage;
    if (!targetPage) {
      return;
    }
    openMediaDialogForPage(targetPage);
  }

  function refreshMediaDialogPrompt(): void {
    if (!selectedMediaDialogPage) {
      return;
    }
    setMediaDialogPrompt(buildDefaultPageImagePrompt(selectedMediaDialogPage, selectedItem));
  }

  function openDetailedTemplateEditor(): void {
    if (!selectedItem) {
      setError("선택된 결과가 없습니다.");
      return;
    }
    const canvasWidth = normalizeCanvasWidth(Number(selectedTemplate?.canvasWidth || 1080));
    const canvasHeight = normalizeCanvasHeight(Number(selectedTemplate?.canvasHeight || 1350));
    const nowIso = new Date().toISOString();
    const clonedPages = orderedPages.map((page) => ({
      ...page,
      id: uid(),
      elements: page.elements.map((element) => ({ ...element, id: uid() }))
    }));
    const draftTemplate: InstagramTemplate = {
      id: uid(),
      templateName: `${selectedItem.templateName} (피드 편집본)`,
      mode: selectedTemplate?.mode || "news",
      sourceTitle: selectedItem.subject,
      sourceTopic: selectedItem.keyword,
      canvasPreset: selectedTemplate?.canvasPreset,
      canvasWidth,
      canvasHeight,
      pageDurationSec: Math.max(1, Number(selectedTemplate?.pageDurationSec || 4)),
      pageCount: clonedPages.length,
      pages: clonedPages,
      customFonts: selectedTemplate?.customFonts || [],
      updatedAt: nowIso
    };
    const draftPayload: InstagramTemplateEditDraft = {
      createdAt: nowIso,
      source: "instagram-feed",
      focusPageId: clonedPages[0]?.id,
      template: draftTemplate,
      sampleData: buildSampleDataFromFeedItem(selectedItem, sheetRows),
      sourceFeedItem: selectedItem
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY, JSON.stringify(draftPayload));
    }
    router.push("/instagram/templates");
  }

  function resolveMediaDialogTargetPageIds(): string[] {
    if (!mediaDialogPageId) {
      return [];
    }
    if (mediaDialogApplyMode === "all") {
      return orderedPages.map((page) => page.id);
    }
    if (mediaDialogApplyMode === "selected") {
      const validIds = new Set(orderedPages.map((page) => page.id));
      const selectedIds = mediaDialogApplyPageIds.filter((pageId) => validIds.has(pageId));
      return selectedIds.length > 0 ? selectedIds : [mediaDialogPageId];
    }
    return [mediaDialogPageId];
  }

  function applyMediaToSelectedPage(mediaUrl: string, prompt: string): boolean {
    if (!selectedItem || !mediaDialogPageId) {
      return false;
    }
    const resolvedMediaUrl = String(mediaUrl || "").trim();
    if (!resolvedMediaUrl) {
      return false;
    }
    const targetPageIds = resolveMediaDialogTargetPageIds();
    if (targetPageIds.length === 0) {
      return false;
    }
    const targetPageIdSet = new Set(targetPageIds);
    const nextItems = items.map((item) => {
      if (item.id !== selectedItem.id) {
        return item;
      }
      return {
        ...item,
        pages: item.pages.map((page) =>
          targetPageIdSet.has(page.id)
            ? applyImageToFeedPage({
                page,
                mediaUrl: resolvedMediaUrl,
                prompt
              })
            : page
        )
      };
    });
    saveFeedItems(nextItems);
    return true;
  }

  function applyMediaFromSourcePage(sourcePageId: string): void {
    const source = orderedPages.find((page) => page.id === sourcePageId);
    if (!source) {
      return;
    }
    const sourceUrl = pagePrimaryMediaUrl(source);
    setMediaDialogSourcePageId(sourcePageId);
    setMediaDialogUrl(sourceUrl);
    setMediaDialogPrompt(buildDefaultPageImagePrompt(source, selectedItem));
    setMediaDialogPreviewBroken(false);
  }

  function toggleMediaDialogApplyPage(pageId: string): void {
    setMediaDialogApplyPageIds((prev) => {
      if (prev.includes(pageId)) {
        return prev.filter((id) => id !== pageId);
      }
      return [...prev, pageId];
    });
  }

  async function applyMediaUrlFromDialog(): Promise<void> {
    setMediaDialogError(undefined);
    const resolvedUrl = String(mediaDialogUrl || "").trim();
    if (!resolvedUrl) {
      setMediaDialogError("이미지 URL을 입력해 주세요.");
      return;
    }
    if (!isRenderableMediaUrl(resolvedUrl)) {
      setMediaDialogError("http(s), data URL 또는 /경로 형태의 이미지 URL을 입력해 주세요.");
      return;
    }
    const updated = applyMediaToSelectedPage(resolvedUrl, mediaDialogPrompt);
    if (!updated) {
      setMediaDialogError("선택한 페이지를 찾지 못했습니다.");
      return;
    }
    setSuccess("페이지 이미지를 적용했습니다.");
    setMediaDialogOpen(false);
  }

  async function generateMediaForSelectedPage(): Promise<void> {
    if (!selectedMediaDialogPage) {
      setMediaDialogError("선택한 페이지를 찾지 못했습니다.");
      return;
    }
    const prompt = collapseWhitespace(
      mediaDialogPrompt || buildDefaultPageImagePrompt(selectedMediaDialogPage, selectedItem)
    );
    if (!prompt) {
      setMediaDialogError("이미지 프롬프트를 입력해 주세요.");
      return;
    }

    setMediaDialogBusy(true);
    setMediaDialogError(undefined);
    try {
      const response = await fetch("/api/instagram/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          canvasWidth: normalizeCanvasWidth(Number(selectedTemplate?.canvasWidth || 1080)),
          canvasHeight: normalizeCanvasHeight(Number(selectedTemplate?.canvasHeight || 1350))
        })
      });
      const data = (await response.json()) as GenerateImageResponse;
      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || "이미지 생성에 실패했습니다.");
      }
      setMediaDialogUrl(String(data.imageUrl || ""));
      setMediaDialogPreviewBroken(false);
      const updated = applyMediaToSelectedPage(String(data.imageUrl || ""), prompt);
      if (!updated) {
        throw new Error("페이지 이미지 반영에 실패했습니다.");
      }
      setSuccess("AI 이미지 생성 후 페이지에 적용했습니다.");
      setMediaDialogOpen(false);
    } catch (mediaError) {
      setMediaDialogError(mediaError instanceof Error ? mediaError.message : "이미지 생성에 실패했습니다.");
    } finally {
      setMediaDialogBusy(false);
    }
  }

  async function checkMetaHealth(): Promise<void> {
    setCheckingMeta(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/meta/health", { cache: "no-store" });
      const data = (await response.json()) as MetaHealthResponse;
      setMetaHealth(data);
      if (data.ready) {
        setSuccess("Meta API 연결 확인이 완료되었습니다.");
      } else {
        setError(data.message || "Meta API 연결 검사를 통과하지 못했습니다.");
      }
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : "Meta API 연결 검사에 실패했습니다.");
    } finally {
      setCheckingMeta(false);
    }
  }

  function buildPageRenderFingerprint(page: InstagramFeedPage, index: number): string {
    const matchedTemplate = templates.find((template) => template.id === selectedItem?.templateId);
    const canvasWidth = normalizeCanvasWidth(Number(matchedTemplate?.canvasWidth || 1080));
    const canvasHeight = normalizeCanvasHeight(Number(matchedTemplate?.canvasHeight || 1350));
    return JSON.stringify({
      itemId: selectedItem?.id || "",
      templateId: selectedItem?.templateId || "",
      page,
      index,
      renderPipelineVersion: RENDER_PIPELINE_VERSION,
      sampleData: selectedSampleData,
      canvasWidth,
      canvasHeight
    });
  }

  async function renderPageVideoAsset(
    page: InstagramFeedPage,
    index: number,
    forceRerender = false,
    sampleDataOverride?: Record<string, string>,
    options?: { uploadBrowserRenderedVideo?: boolean }
  ): Promise<RenderedFeedAsset> {
    if (!selectedItem) {
      throw new Error("업로드할 피드를 선택해 주세요.");
    }

    const renderSampleData = sampleDataOverride || selectedSampleData;
    const uploadBrowserRenderedVideo = options?.uploadBrowserRenderedVideo !== false;
    const fingerprint = JSON.stringify({
      base: buildPageRenderFingerprint(page, index),
      renderSampleData,
      uploadBrowserRenderedVideo
    });
    const cached = renderedVideoCache[page.id];
    if (!forceRerender && cached?.fingerprint === fingerprint) {
      return cached.asset;
    }

    const matchedTemplate = templates.find((template) => template.id === selectedItem.templateId);
    const canvasWidth = normalizeCanvasWidth(Number(matchedTemplate?.canvasWidth || 1080));
    const canvasHeight = normalizeCanvasHeight(Number(matchedTemplate?.canvasHeight || 1350));
    const pageName = sanitizeDownloadName(page.name || `page-${index + 1}`);
    await ensureInstagramCustomFontsLoaded(matchedTemplate?.customFonts || []);

    const previewPage = toFeedPreviewPage(page);
    const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), renderSampleData).trim();
    const attachedAudioUrl = String(page.audioUrl || "").trim();
    const useAudio = Boolean(page.audioEnabled && (resolvedAudioPrompt || attachedAudioUrl));
    const safeDurationSec = Math.max(10, Math.min(55, Math.round(Number(page.durationSec) || 10)));
    const renderStaticPageVideo = async (): Promise<RenderPageVideoResponse> => {
      const imageDataUrl = await renderInstagramPageToPngDataUrl({
        page: previewPage,
        sampleData: renderSampleData,
        canvasWidth,
        canvasHeight
      });
      const response = await fetch("/api/instagram/render-page-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: selectedItem.templateName,
          pageName: page.name,
          imageDataUrl,
          useAudio,
          audioUrl: attachedAudioUrl || undefined,
          audioPrompt: resolvedAudioPrompt || undefined,
          ttsProvider:
            page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
          sampleData: renderSampleData,
          audioVoice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
          audioSpeed: clamp(Number(page.audioSpeed), 0.5, 2, 1),
          durationSec: safeDurationSec,
          outputWidth: canvasWidth,
          outputHeight: canvasHeight
        })
      });
      const data = (await response.json()) as RenderPageVideoResponse;
      if (!response.ok || !data.outputUrl) {
        throw new Error(data.error || `${page.name} MP4 렌더링에 실패했습니다.`);
      }
      return data;
    };

    let outputUrl = "";
    let audioUrl: string | undefined;
    if (pageHasMovingVideoLayer(previewPage)) {
      const sourceVideoLayer = primaryMovingVideoLayer(page);
      const previewVideoLayer = sourceVideoLayer
        ? (previewPage.elements.find((element) => element.id === sourceVideoLayer.id) as
            | InstagramImageElement
            | InstagramVideoElement
            | undefined)
        : undefined;
      if (!useAudio && sourceVideoLayer && previewVideoLayer) {
        const sourceVideoUrl = String(sourceVideoLayer.imageUrl || "").trim();
        if (!sourceVideoUrl) {
          throw new Error(`${page.name} 원본 비디오 URL을 찾지 못했습니다.`);
        }
        const videoWidth = Math.max(1, Math.round((Number(sourceVideoLayer.width) / 100) * canvasWidth));
        const videoHeight = Math.max(1, Math.round((Number(sourceVideoLayer.height) / 100) * canvasHeight));
        const videoX = Math.round((Number(sourceVideoLayer.x) / 100) * canvasWidth - videoWidth / 2);
        const videoY = Math.round((Number(sourceVideoLayer.y) / 100) * canvasHeight - videoHeight / 2);
        setUploadStageMessage(`${page.name} 템플릿 레이어 분리 렌더링 중...`);
        const underlayDataUrl = await renderInstagramPageToPngDataUrl({
          page: previewPage,
          sampleData: renderSampleData,
          canvasWidth,
          canvasHeight,
          includeBackground: true,
          layerFilter: (layer) => layer.id !== sourceVideoLayer.id && layer.zIndex < sourceVideoLayer.zIndex
        });
        const overlayDataUrl = await renderInstagramPageToPngDataUrl({
          page: previewPage,
          sampleData: renderSampleData,
          canvasWidth,
          canvasHeight,
          includeBackground: false,
          transparentBackground: true,
          layerFilter: (layer) => layer.id !== sourceVideoLayer.id && layer.zIndex >= sourceVideoLayer.zIndex
        });
        const underlayUrl = await uploadRenderedFeedBlob(
          dataUrlToBlob(underlayDataUrl),
          `${selectedItem.rowId || "row"}-${String(index + 1).padStart(2, "0")}-${pageName}-underlay.png`
        );
        const overlayUrl = await uploadRenderedFeedBlob(
          dataUrlToBlob(overlayDataUrl),
          `${selectedItem.rowId || "row"}-${String(index + 1).padStart(2, "0")}-${pageName}-overlay.png`
        );
        setUploadStageMessage(`${page.name} 원본 MP4 기반 최종 합성 중...`);
        const composeResponse = await fetch("/api/instagram/compose-page-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateName: selectedItem.templateName,
            pageName: page.name,
            videoUrl: sourceVideoUrl,
            underlayUrl,
            overlayUrl,
            x: videoX,
            y: videoY,
            width: videoWidth,
            height: videoHeight,
            outputWidth: canvasWidth,
            outputHeight: canvasHeight,
            fit: sourceVideoLayer.fit === "contain" ? "contain" : "cover",
            durationSec: safeDurationSec
          })
        });
        const composeData = (await composeResponse.json()) as ComposePageVideoResponse;
        if (!composeResponse.ok || !composeData.outputUrl) {
          throw new Error(composeData.error || `${page.name} 원본 MP4 기반 합성에 실패했습니다.`);
        }
        outputUrl = String(composeData.outputUrl || "");
        audioUrl = sourceVideoUrl;
        const asset: RenderedFeedAsset = {
          pageId: page.id,
          pageName,
          index,
          mediaKind: "video",
          mediaUrl: outputUrl,
          audioUrl,
          mimeType: "video/mp4"
        };
        setRenderedVideoCache((prev) => ({
          ...prev,
          [page.id]: { fingerprint, asset }
        }));
        return asset;
      }

      setUploadStageMessage(`${page.name} 비디오 레이어 화면 렌더링 중...`);
      const audioSeed = useAudio ? await renderStaticPageVideo() : undefined;
      audioUrl = audioSeed?.audioUrl || firstMovingVideoLayerUrl(page);
      if (!audioUrl) {
        throw new Error(`${page.name} 오디오 소스를 찾지 못했습니다.`);
      }
      const recorded = await renderInstagramPageToVideoBlob({
        page: previewPage,
        sampleData: renderSampleData,
        canvasWidth,
        canvasHeight,
        durationSec: safeDurationSec,
        fps: 15,
        audioUrl: undefined
      });
      const extension = guessVideoExtensionFromMime(recorded.mimeType);
      if (extension !== "mp4") {
        throw new Error(
          `${page.name} 합성 결과가 MP4가 아닙니다(${recorded.mimeType}). Instagram 업로드용 MP4 녹화를 지원하는 Chrome에서 다시 시도해 주세요.`
        );
      }
      setUploadStageMessage(`${page.name} 화면 MP4 임시 업로드 중...`);
      const visualVideoUrl = await uploadRenderedFeedBlob(
        recorded.blob,
        `${selectedItem.rowId || "row"}-${String(index + 1).padStart(2, "0")}-${pageName}-visual.${extension}`
      );
      setUploadStageMessage(`${page.name} FFmpeg 오디오 합성 중...`);
      const muxResponse = await fetch("/api/instagram/mux-page-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: selectedItem.templateName,
          pageName: page.name,
          videoUrl: visualVideoUrl,
          audioUrl,
          durationSec: safeDurationSec
        })
      });
      const muxData = (await muxResponse.json()) as MuxPageVideoResponse;
      if (!muxResponse.ok || !muxData.outputUrl) {
        throw new Error(muxData.error || `${page.name} 비디오/오디오 합성에 실패했습니다.`);
      }
      outputUrl = String(muxData.outputUrl || "");
      const asset: RenderedFeedAsset = {
        pageId: page.id,
        pageName,
        index,
        mediaKind: "video",
        mediaUrl: outputUrl,
        audioUrl,
        mimeType: "video/mp4"
      };
      setRenderedVideoCache((prev) => ({
        ...prev,
        [page.id]: { fingerprint, asset }
      }));
      return asset;
    } else {
      const data = await renderStaticPageVideo();
      outputUrl = String(data.outputUrl || "");
      audioUrl = data.audioUrl;
    }

    const asset: RenderedFeedAsset = {
      pageId: page.id,
      pageName,
      index,
      mediaKind: "video",
      mediaUrl: outputUrl,
      audioUrl
    };
    setRenderedVideoCache((prev) => ({
      ...prev,
      [page.id]: { fingerprint, asset }
    }));
    return asset;
  }

  async function previewPageAudio(page: InstagramFeedPage): Promise<void> {
    const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), selectedSampleData).trim();
    const attachedAudioUrl = String(page.audioUrl || "").trim();
    setAudioPreviewError(undefined);
    setError(undefined);

    if (!page.audioEnabled) {
      setAudioPreviewError("오디오가 켜진 비디오 페이지에서만 미리듣기할 수 있습니다.");
      return;
    }
    if (!attachedAudioUrl && !resolvedAudioPrompt) {
      setAudioPreviewError(`${page.name} 오디오 파일 또는 오디오 스크립트가 비어 있습니다.`);
      return;
    }
    if (!attachedAudioUrl && /\{\{[^}]+\}\}/.test(resolvedAudioPrompt)) {
      setAudioPreviewError(`${page.name} 오디오 스크립트에 치환되지 않은 변수가 남아 있습니다: ${resolvedAudioPrompt}`);
      return;
    }

    setAudioPreviewLoadingPageId(page.id);
    try {
      if (audioPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
        audioPreviewObjectUrlRef.current = undefined;
      }
      if (attachedAudioUrl) {
        setAudioPreviewPageId(page.id);
        setAudioPreviewUrl(toInstagramMediaPreviewUrl(attachedAudioUrl));
        return;
      }
      const index = orderedPages.findIndex((candidate) => candidate.id === page.id);
      const asset = await renderPageVideoAsset(page, Math.max(0, index));
      setAudioPreviewPageId(page.id);
      setAudioPreviewUrl(asset.audioUrl || asset.mediaUrl);
    } catch (previewError) {
      setAudioPreviewError(previewError instanceof Error ? previewError.message : "음성 미리듣기에 실패했습니다.");
    } finally {
      setAudioPreviewLoadingPageId(undefined);
    }
  }

  async function buildRenderedMediaAssets(
    forceVideoRerender = false,
    options?: { uploadBrowserRenderedVideo?: boolean }
  ): Promise<RenderedFeedAsset[]> {
    if (!selectedItem) {
      return [];
    }
    const matchedTemplate = templates.find((template) => template.id === selectedItem.templateId);
    const canvasWidth = normalizeCanvasWidth(Number(matchedTemplate?.canvasWidth || 1080));
    const canvasHeight = normalizeCanvasHeight(Number(matchedTemplate?.canvasHeight || 1350));

    const sampleData = buildSampleDataFromFeedItem(selectedItem, sheetRows);
    await ensureInstagramCustomFontsLoaded(matchedTemplate?.customFonts || []);

    const renderedAssets: RenderedFeedAsset[] = [];
    const pagesForRender = buildCompleteOrderedPages(selectedItem, orderedPages);
    const expectedPageCount = selectedItem.pages.length;

    if (pagesForRender.length !== expectedPageCount) {
      throw new Error(
        `렌더 페이지 수가 맞지 않습니다. 선택 피드 ${expectedPageCount}개, 렌더 대상 ${pagesForRender.length}개입니다. 새로고침 후 다시 생성해 주세요.`
      );
    }
    assertSafeFinalFeedRender(pagesForRender);

    for (let index = 0; index < pagesForRender.length; index += 1) {
      const page = pagesForRender[index];
      const pageName = sanitizeDownloadName(page.name || `page-${index + 1}`);

      if (pageOutputKind(page) === "video") {
        renderedAssets.push(await renderPageVideoAsset(page, index, forceVideoRerender, sampleData, options));
        continue;
      }

      const previewPage = toFeedPreviewPage(page);
      const imageDataUrl = await renderInstagramPageToPngDataUrl({
        page: previewPage,
        sampleData,
        canvasWidth,
        canvasHeight
      });
      renderedAssets.push({
        pageId: page.id,
        pageName,
        index,
        mediaKind: "image",
        mediaUrl: imageDataUrl
      });
    }

    if (renderedAssets.length !== expectedPageCount) {
      throw new Error(
        `최종 렌더 결과 수가 맞지 않습니다. 선택 피드 ${expectedPageCount}개, 렌더 결과 ${renderedAssets.length}개입니다. 업로드를 중단했습니다.`
      );
    }

    return renderedAssets;
  }

  async function uploadFeed(): Promise<void> {
    if (!selectedItem) {
      setError("업로드할 피드를 선택해 주세요.");
      return;
    }
    if (orderedPages.length === 0) {
      setError("업로드할 페이지가 없습니다.");
      return;
    }
    setUploading(true);
    setError(undefined);
    setSuccess(undefined);
    setUploadStageMessage("페이지 렌더링 준비 중...");
    setUploadResult(undefined);
    try {
      const blockedPlan = mediaPlan.filter((item) => !item.ready);
      if (blockedPlan.length > 0) {
        const names = blockedPlan
          .map((item) => orderedPages[item.index]?.name || `Page ${item.index + 1}`)
          .join(", ");
        throw new Error(`오디오 스크립트 확인이 필요한 페이지가 있습니다: ${names}`);
      }
      setUploadStageMessage("최종 업로드 파일 렌더링 중...");
      const renderedAssets = await buildRenderedMediaAssets(false);
      if (renderedAssets.length === 0) {
        throw new Error("업로드에 사용할 렌더 결과가 없습니다.");
      }
      if (renderedAssets.length !== selectedItem.pages.length) {
        throw new Error(
          `업로드 파일 수가 맞지 않습니다. 템플릿/피드 페이지 ${selectedItem.pages.length}개, 렌더 결과 ${renderedAssets.length}개입니다.`
        );
      }
      const missingMediaUrl = renderedAssets.find((asset) => !asset.mediaUrl);
      if (missingMediaUrl) {
        throw new Error(`${missingMediaUrl.pageName} 최종 업로드 URL이 없어 업로드를 중단했습니다.`);
      }
      setUploadStageMessage(`Meta 업로드 요청 중... (${renderedAssets.length}개 페이지)`);
      const response = await fetch("/api/instagram/meta/upload-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: sanitizeCaptionText(caption),
          mediaUrls: renderedAssets.map((asset) => asset.mediaUrl),
          rowId: selectedItem.rowId,
          sheetName: sourceSheetName || undefined
        })
      });
      const data = (await response.json()) as UploadResponse;
      if (!response.ok) {
        throw new Error(data.error || "Meta 업로드에 실패했습니다.");
      }
      setUploadResult(data);
      setUploadStageMessage("업로드 완료 처리 중...");
      const sheetMessage = data.sheetUpdate?.updated
        ? " · 시트 상태 업데이트 완료"
        : data.sheetUpdate?.reason
          ? ` · 시트 업데이트 생략(${data.sheetUpdate.reason})`
          : "";
      setSuccess(`Meta 업로드가 완료되었습니다. (${renderedAssets.length}개 페이지)${sheetMessage}`);
      await loadBuildContext();
      setUploadConfirmOpen(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Meta 업로드에 실패했습니다.");
      setUploadStageMessage("업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function downloadFeedAssets(): Promise<void> {
    if (!selectedItem) {
      setError("다운로드할 피드를 선택해 주세요.");
      return;
    }
    if (orderedPages.length === 0) {
      setError("다운로드할 페이지가 없습니다.");
      return;
    }
    setDownloading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const renderedAssets = await buildRenderedMediaAssets(true, { uploadBrowserRenderedVideo: false });
      const expectedMediaCount = selectedItem.pages.length;
      if (renderedAssets.length !== expectedMediaCount) {
        throw new Error(
          `검토 파일 수가 맞지 않습니다. 템플릿/피드 페이지 ${expectedMediaCount}개, 렌더 결과 ${renderedAssets.length}개입니다.`
        );
      }
      const prepared = renderedAssets.map((asset) => {
        const ext = asset.blob
          ? getMediaDownloadExtension(asset.mimeType || asset.blob.type, asset.mediaUrl, asset.mediaKind === "video" ? "mp4" : "png")
          : guessExtensionFromUrl(asset.mediaUrl, asset.mediaKind);
        return {
          blob: asset.blob,
          url: asset.mediaUrl,
          fileName: `${String(asset.index + 1).padStart(2, "0")}-${asset.pageName}.${ext}`
        };
      });

      let downloadedMediaCount = 0;
      for (const asset of prepared) {
        if (asset.blob) {
          downloadBlobFile(asset.blob, asset.fileName);
        } else {
          if (!asset.url) {
            throw new Error(`${asset.fileName} 다운로드 URL이 없습니다.`);
          }
          downloadRemoteFile(asset.url, asset.fileName);
        }
        downloadedMediaCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      const captionBlob = new Blob([caption || ""], { type: "text/plain;charset=utf-8" });
      downloadBlobFile(captionBlob, "caption.txt");

      setSuccess(
        `검토 파일 다운로드 시작: 최종 렌더 미디어 ${downloadedMediaCount}개 + caption.txt. 업로드는 현재 피드 상태를 다시 최종 렌더링해 진행합니다.`
      );
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPageAiImage(page: InstagramGeneratedFeedItem["pages"][number], index: number): Promise<void> {
    if (!selectedItem) {
      setError("다운로드할 피드를 선택해 주세요.");
      return;
    }
    const mediaUrl = pagePrimaryMediaUrl(page);
    if (!mediaUrl) {
      setError("다운로드할 AI 이미지가 없습니다. 먼저 이미지를 생성해 주세요.");
      return;
    }
    if (inferMediaKind(mediaUrl) === "video") {
      setError("선택한 페이지의 대표 미디어는 비디오입니다. AI 이미지가 있는 페이지를 선택해 주세요.");
      return;
    }
    setError(undefined);
    try {
      await downloadMediaBlob(
        mediaUrl,
        `${selectedItem.templateName || "instagram-feed"}-${selectedItem.rowId || "row"}-${String(index + 1).padStart(2, "0")}-${page.name || "page"}`
      );
      setSuccess("AI 이미지 다운로드를 시작했습니다.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "AI 이미지 다운로드에 실패했습니다.");
    }
  }

  async function downloadFeedAiImages(): Promise<void> {
    if (!selectedItem) {
      setError("다운로드할 피드를 선택해 주세요.");
      return;
    }
    const imageAssets = orderedPages
      .map((page, index) => ({ page, index, mediaUrl: pagePrimaryMediaUrl(page) }))
      .filter((asset) => asset.mediaUrl && inferMediaKind(asset.mediaUrl) === "image");
    if (imageAssets.length === 0) {
      setError("다운로드할 AI 이미지가 없습니다. 먼저 이미지를 생성해 주세요.");
      return;
    }
    setDownloading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      for (const asset of imageAssets) {
        await downloadMediaBlob(
          asset.mediaUrl,
          `${selectedItem.templateName || "instagram-feed"}-${selectedItem.rowId || "row"}-${String(asset.index + 1).padStart(2, "0")}-${asset.page.name || "page"}`
        );
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      setSuccess(`AI 이미지 다운로드를 시작했습니다. (${imageAssets.length}개)`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "AI 이미지 다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Instagram 피드</h1>
          <p className="text-sm text-muted-foreground">
            업로드 전 컨테이너 편집 모드입니다. 페이지 순서를 조정하고 Meta API 검사 후 업로드하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={refreshResults}>
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
          <Button type="button" variant="outline" onClick={clearAll} disabled={items.length === 0}>
            결과 비우기
          </Button>
        </div>
      </header>

      <div className="rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">피드 컨테이너 생성</p>
            <p className="text-xs text-muted-foreground">
              이 화면에서 템플릿 + 시트 row를 바로 조합해 업로드 전 컨테이너를 생성합니다.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button type="button" variant="outline" onClick={() => void loadBuildContext()} disabled={loadingContext}>
              {loadingContext ? "로딩 중..." : "소스 새로고침"}
            </Button>
            <Button type="button" onClick={() => void generateContainersInFeed()} disabled={loadingContext || generating}>
              {generating ? "생성 중..." : "컨테이너 생성"}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>처리할 row 수</Label>
            <Select value={maxRows} onValueChange={setMaxRows}>
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                  <SelectItem key={`feed-max-rows-${value}`} value={value}>
                    {value}개
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              소스 시트: {sourceSheetName || "settings의 기본 시트"} · 준비 row {sheetRows?.length || 0}개
            </p>
          </div>
          <div className="space-y-2">
            <Label>템플릿 선택(복수)</Label>
            <div className="flex flex-wrap gap-2 rounded-lg border p-2">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  size="sm"
                  variant={selectedTemplateIds.includes(template.id) ? "default" : "outline"}
                  onClick={() => toggleTemplate(template.id)}
                >
                  {template.templateName}
                </Button>
              ))}
              {templates.length === 0 ? <p className="text-xs text-muted-foreground">템플릿이 없습니다.</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">로그</p>
            <p className="text-xs text-muted-foreground">
              컨테이너 생성 중 row, 템플릿, 페이지, AI 이미지 호출 단계를 최근 순서로 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {generating ? (
              <span className="rounded-full border px-2 py-1 text-xs text-emerald-500">실행 중</span>
            ) : null}
            <span className="text-xs text-muted-foreground">최근 {feedLogs.length}건</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setFeedLogs([])}>
              비우기
            </Button>
          </div>
        </div>
        {feedLogs.length > 0 ? (
          <div className="app-panel-scrollbar max-h-56 overflow-auto rounded-lg border bg-background p-2 font-mono text-xs">
            {feedLogs.slice().reverse().map((log) => {
              const tone =
                log.level === "error"
                  ? "text-red-500"
                  : log.level === "warn"
                    ? "text-amber-500"
                    : "text-muted-foreground";
              return (
                <p key={log.id} className={`whitespace-pre-wrap break-words leading-relaxed ${tone}`}>
                  [{new Date(log.at).toLocaleTimeString("ko-KR")}] {log.message}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            표시할 피드 생성 로그가 없습니다.
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Google Sheet 테이블 뷰</p>
            <p className="text-xs text-muted-foreground">
              피드 생성 소스 row를 이 탭에서 바로 확인할 수 있습니다.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            asChild
            className={!sheetShortcutUrl ? "pointer-events-none opacity-50" : ""}
          >
            <a
              href={sheetShortcutUrl || "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!sheetShortcutUrl}
              tabIndex={sheetShortcutUrl ? 0 : -1}
            >
              <ExternalLink className="h-4 w-4" />
              시트 바로가기
            </a>
          </Button>
        </div>
        {sheetHeaders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            시트 헤더를 불러오지 못했습니다. 시트 연결 정보와 탭명을 확인해 주세요.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[180px,1fr,auto]">
              <div className="space-y-1">
                <Label>status 필터</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {statusOptions.map((value) => (
                      <SelectItem key={`ig-feed-status-option-${value}`} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>keyword 멀티 선택</Label>
                <details className="rounded-md border bg-background">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm text-foreground">
                    {selectedKeywords.length > 0 ? `${selectedKeywords.length}개 선택됨` : "전체 keyword"}
                  </summary>
                  <div className="space-y-2 border-t px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8"
                        onClick={() => setSelectedKeywords(keywordOptions)}
                      >
                        전체 선택
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8"
                        onClick={() => setSelectedKeywords([])}
                      >
                        선택 해제
                      </Button>
                    </div>
                    <div className="app-panel-scrollbar max-h-40 space-y-1 overflow-auto pr-1">
                      {keywordOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">keyword 데이터가 없습니다.</p>
                      ) : (
                        keywordOptions.map((value) => {
                          const checked = selectedKeywords.some(
                            (item) => item.toLowerCase() === value.toLowerCase()
                          );
                          return (
                            <label
                              key={`ig-feed-keyword-option-${value}`}
                              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleKeyword(value)}
                              />
                              <span>{value}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </details>
              </div>
              <div className="flex items-end md:justify-end">
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="text-xs text-muted-foreground">줄바꿈</span>
                  <Switch checked={wrapSheetCells} onCheckedChange={setWrapSheetCells} />
                  <span className="text-xs">{wrapSheetCells ? "있음" : "없음"}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              표시 행: {filteredSheetRows.length} / 전체 {sheetTableRows.length} · 준비 row: {sheetRows?.length || 0}
              {selectedSheetRowIds.length > 0 ? ` · 선택 row: ${selectedSheetRowIds.length}` : ""}
            </p>
            {selectedSheetRowIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                <span>체크된 row {selectedSheetRowIds.length}개가 컨테이너 생성 대상입니다.</span>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setSelectedSheetRowIds([])}>
                  선택 해제
                </Button>
              </div>
            ) : null}
            <div className="app-table-scrollbar max-h-[56vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="w-12 px-3 py-2 text-left font-medium">
                      <input
                        type="checkbox"
                        aria-label="표시된 row 전체 선택"
                        checked={filteredSheetRowIds.length > 0 && selectedVisibleSheetRowCount === filteredSheetRowIds.length}
                        ref={(node) => {
                          if (node) {
                            node.indeterminate =
                              selectedVisibleSheetRowCount > 0 && selectedVisibleSheetRowCount < filteredSheetRowIds.length;
                          }
                        }}
                        onChange={(event) => setVisibleSheetRowSelection(event.target.checked)}
                      />
                    </th>
                    {sheetHeaders.map((header) => (
                      <th key={`ig-feed-head-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSheetRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={sheetHeaders.length + 1}>
                        필터 조건에 맞는 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredSheetRows.map((row, rowIndex) => {
                      const rowId = getSheetTableRowId(row);
                      const checked = rowId ? selectedSheetRowIds.includes(rowId) : false;
                      return (
                        <tr key={`ig-feed-row-${rowIndex}`} className={`border-t align-top ${checked ? "bg-emerald-500/10" : ""}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`${rowId || rowIndex + 1} row 선택`}
                              checked={checked}
                              disabled={!rowId}
                              onChange={() => toggleSheetRowSelection(rowId)}
                            />
                          </td>
                          {sheetHeaders.map((header) => (
                            <td
                              key={`ig-feed-cell-${rowIndex}-${header}`}
                              className={`px-3 py-2 ${wrapSheetCells ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}
                            >
                              {row[header] || ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="order-2 rounded-xl border bg-card p-3 lg:order-1">
            <p className="mb-2 text-sm font-semibold">결과 선택</p>
            <div className="app-sidebar-scrollbar max-h-[42vh] space-y-2 overflow-y-auto pr-1 md:max-h-[70vh]">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setError(undefined);
                    setSuccess(undefined);
                    setUploadResult(undefined);
                  }}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    selectedItemId === item.id ? "border-primary bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <p className="text-xs text-muted-foreground">{item.templateName}</p>
                  <p className="line-clamp-2 text-sm font-medium">{item.subject}</p>
                  <p className="text-xs text-muted-foreground">주제: {item.keyword || "-"} · row {item.rowId}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">페이지 {item.pages.length}개</p>
                </button>
              ))}
            </div>
          </aside>

          <div className="order-1 space-y-4 lg:order-2">
            {selectedItem ? (
              <>
                <div className="rounded-xl border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{selectedItem.templateName}</p>
                      <h2 className="text-base font-semibold">{selectedItem.subject}</h2>
                      <p className="text-xs text-muted-foreground">주제: {selectedItem.keyword || "-"} · row {selectedItem.rowId}</p>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => void checkMetaHealth()}
                        disabled={checkingMeta}
                      >
                        {checkingMeta ? "검사 중..." : "Meta API 검사"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => openMediaWorkspaceEditor({ preferMissing: true })}
                        disabled={orderedPages.length === 0}
                      >
                        이미지 편집기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={openDetailedTemplateEditor}
                        disabled={orderedPages.length === 0}
                      >
                        템플릿 상세 편집
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => void downloadFeedAssets()}
                        disabled={downloading || orderedPages.length === 0}
                      >
                        <Download className="mr-1 h-4 w-4" />
                        {downloading ? "검토 파일 준비 중..." : "검토 파일 다운로드"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => void downloadFeedAiImages()}
                        disabled={downloading || orderedPages.length === 0}
                        title="생성된 AI 이미지 원본을 페이지별로 다운로드"
                      >
                        <Download className="mr-1 h-4 w-4" />
                        AI 이미지 다운로드
                      </Button>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setError(undefined);
                          setSuccess(undefined);
                          setUploadStageMessage(undefined);
                          setAudioPreviewError(undefined);
                          setUploadConfirmOpen(true);
                        }}
                        disabled={uploading || orderedPages.length === 0}
                      >
                        <Upload className="mr-1 h-4 w-4" />
                        {uploading ? "업로드 중..." : "업로드"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>캡션</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCaption(
                            buildFeedCaptionWithStoredHashtags({
                              baseCaption: caption || selectedItem.subject,
                              hashtagTemplate: captionHashtagTemplate,
                              item: selectedItem
                            })
                          )
                        }
                      >
                        저장 해시태그 적용
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      value={caption}
                      onChange={(event) => setCaption(sanitizeCaptionText(event.target.value))}
                      placeholder="업로드 캡션 입력"
                    />
                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs">저장 해시태그 템플릿</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setCaptionHashtagTemplate(DEFAULT_INSTAGRAM_FEED_HASHTAG_TEMPLATE)}
                        >
                          기본값 복원
                        </Button>
                      </div>
                      <Textarea
                        rows={4}
                        value={captionHashtagTemplate}
                        onChange={(event) => setCaptionHashtagTemplate(event.target.value)}
                        placeholder="#태그 입력"
                        className="text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {"{num}"}은 선택 row의 JLPT 레벨 숫자로 치환됩니다. 예: jlpt=N4 → #JLPTN4
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border p-2 text-xs">
                    <p className="font-medium">Meta 상태</p>
                    {metaHealth?.ready ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                        연결 통과 {metaHealth.account?.username ? `(@${metaHealth.account.username})` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 inline-flex items-center gap-1 text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                        {metaHealth?.message || "검사 전"}
                      </p>
                    )}
                  </div>

                  {uploadResult?.permalink ? (
                    <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs">
                      업로드 완료:{" "}
                      <a className="underline" href={uploadResult.permalink} target="_blank" rel="noreferrer">
                        {uploadResult.permalink}
                      </a>
                    </div>
                  ) : null}
                  {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
                  {success ? <p className="mt-2 text-sm text-emerald-500">{success}</p> : null}
                </div>

                <Dialog
                  open={uploadConfirmOpen}
                  onOpenChange={(open) => {
                    setUploadConfirmOpen(open);
                    if (!open && !uploading) {
                      setUploadStageMessage(undefined);
                    }
                  }}
                >
                  <DialogContent className="app-panel-scrollbar max-h-[90vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle>Instagram 업로드 확인</DialogTitle>
                      <DialogDescription>
                        업로드 직전에 캡션과 페이지 순서를 확인하세요. 확인 후 Meta API 업로드가 실행됩니다.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="rounded-lg border p-3 text-sm">
                        <p className="text-xs text-muted-foreground">선택 결과</p>
                        <p className="font-medium">{selectedItem.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          row: {selectedItem.rowId} · template: {selectedItem.templateName}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="mb-1 text-xs text-muted-foreground">업로드 캡션</p>
                        <p className="app-panel-scrollbar max-h-36 overflow-auto whitespace-pre-wrap break-words text-sm">
                          {caption.trim() || "(빈 캡션)"}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          업로드 페이지 ({mediaPlan.length}개)
                        </p>
                        <div className="app-panel-scrollbar max-h-52 space-y-1 overflow-auto text-sm">
                          {mediaPlan.map((item) => (
                            <div
                              key={`upload-plan-${item.pageId}`}
                              className="rounded border px-2 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {item.index + 1}. {orderedPages[item.index]?.name}
                                </span>
                                <span className={item.ready ? "text-emerald-500" : "text-amber-500"}>
                                  {item.ready ? `준비됨 (${item.mediaKind})` : "오디오 스크립트 확인 필요"}
                                </span>
                              </div>
                              {item.mediaKind === "video" ? (
                                <div className="mt-2 space-y-2">
                                  <p className="app-panel-scrollbar max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
                                    {item.resolvedAudioPrompt || "(치환 후 오디오 스크립트 없음)"}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const page = orderedPages[item.index];
                                        if (page) void previewPageAudio(page);
                                      }}
                                      disabled={audioPreviewLoadingPageId === item.pageId || !item.ready}
                                    >
                                      <Volume2 className="mr-1 h-3.5 w-3.5" />
                                      {audioPreviewLoadingPageId === item.pageId ? "렌더링 중..." : "실제 음성 듣기"}
                                    </Button>
                                    {audioPreviewPageId === item.pageId && audioPreviewUrl ? (
                                      <audio src={audioPreviewUrl} controls className="h-8 w-full max-w-sm" />
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {audioPreviewError ? <p className="mt-2 text-xs text-destructive">{audioPreviewError}</p> : null}
                      </div>
                      {uploadStageMessage ? (
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">업로드 진행 상태</p>
                          <p className={`text-sm ${error ? "text-destructive" : "text-foreground"}`}>
                            {uploadStageMessage}
                          </p>
                        </div>
                      ) : null}
                      {error ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                          <p className="text-xs text-muted-foreground">에러 메시지</p>
                          <p className="whitespace-pre-wrap break-words text-sm text-destructive">{error}</p>
                        </div>
                      ) : null}
                    </div>
                    <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setUploadConfirmOpen(false)}>
                        취소
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => void downloadFeedAssets()}
                        disabled={downloading || uploading || orderedPages.length === 0}
                      >
                        {downloading ? "검토 파일 준비 중..." : "검토 파일 다운로드"}
                      </Button>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() => void uploadFeed()}
                        disabled={uploading || orderedPages.length === 0}
                      >
                        {uploading ? "업로드 중..." : "업로드"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={mediaDialogOpen}
                  onOpenChange={(open) => {
                    if (!open && mediaDialogBusy) {
                      return;
                    }
                    setMediaDialogOpen(open);
                    if (!open) {
                      setMediaDialogError(undefined);
                    }
                  }}
                >
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>페이지 이미지 추가/변경</DialogTitle>
                      <DialogDescription>
                        {selectedMediaDialogPage
                          ? `${selectedMediaDialogPage.name} 페이지에 사용할 이미지를 설정합니다.`
                          : "이미지를 설정할 페이지를 선택해 주세요."}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>이미지 URL</Label>
                        <Input
                          value={mediaDialogUrl}
                          onChange={(event) => setMediaDialogUrl(event.target.value)}
                          placeholder="https://... 또는 /generated/... 또는 data:image/..."
                          disabled={mediaDialogBusy}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>다른 페이지 이미지 가져오기</Label>
                        <Select
                          value={mediaDialogSourcePageId || "__none__"}
                          onValueChange={(value) => {
                            if (value === "__none__") {
                              setMediaDialogSourcePageId("");
                              return;
                            }
                            applyMediaFromSourcePage(value);
                          }}
                          disabled={mediaDialogBusy || mediaDialogSourcePageOptions.length === 0}
                        >
                          <SelectTrigger className="bg-card dark:bg-zinc-900">
                            <SelectValue placeholder="이미지를 가져올 페이지 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안 함</SelectItem>
                            {mediaDialogSourcePageOptions.map((page) => (
                              <SelectItem key={`media-source-page-${page.id}`} value={page.id}>
                                {page.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 rounded-md border p-2">
                        <Label>같은 이미지 적용 대상</Label>
                        <Select
                          value={mediaDialogApplyMode}
                          onValueChange={(value) => {
                            const mode =
                              value === "selected" || value === "all" ? value : "current";
                            setMediaDialogApplyMode(mode);
                            if (mode === "current" && mediaDialogPageId) {
                              setMediaDialogApplyPageIds([mediaDialogPageId]);
                            } else if (mode === "all") {
                              setMediaDialogApplyPageIds(orderedPages.map((page) => page.id));
                            }
                          }}
                          disabled={mediaDialogBusy}
                        >
                          <SelectTrigger className="bg-card dark:bg-zinc-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="current">현재 페이지만</SelectItem>
                            <SelectItem value="selected">선택한 페이지</SelectItem>
                            <SelectItem value="all">모든 페이지</SelectItem>
                          </SelectContent>
                        </Select>
                        {mediaDialogApplyMode === "selected" ? (
                          <div className="max-h-32 space-y-1 overflow-auto rounded-md border bg-background p-2">
                            {orderedPages.map((page, index) => (
                              <label
                                key={`media-apply-page-${page.id}`}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={mediaDialogApplyPageIds.includes(page.id)}
                                  onChange={() => toggleMediaDialogApplyPage(page.id)}
                                  disabled={mediaDialogBusy}
                                />
                                <span>
                                  {index + 1}. {page.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <Label>AI 이미지 프롬프트</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={refreshMediaDialogPrompt}
                            disabled={mediaDialogBusy || !selectedMediaDialogPage}
                            title="현재 선택한 row/주제로 프롬프트를 다시 생성"
                          >
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            새로고침
                          </Button>
                        </div>
                        <Textarea
                          rows={4}
                          value={mediaDialogPrompt}
                          onChange={(event) => setMediaDialogPrompt(event.target.value)}
                          placeholder="예: 도심 야경에서 인터뷰하는 뉴스 리포터, 사실적인 다큐 사진"
                          disabled={mediaDialogBusy}
                        />
                      </div>
                      {mediaDialogUrl &&
                      isRenderableMediaUrl(mediaDialogUrl) &&
                      inferMediaKind(mediaDialogUrl) === "image" &&
                      !mediaDialogPreviewBroken &&
                      mediaDialogPreviewUrl ? (
                        <div className="overflow-hidden rounded-md border">
                          <img
                            src={mediaDialogPreviewUrl}
                            alt="page media preview"
                            className="h-40 w-full object-cover"
                            onError={() => {
                              setMediaDialogPreviewIndex((current) => {
                                const next = current + 1;
                                if (next < mediaDialogPreviewCandidates.length) {
                                  return next;
                                }
                                setMediaDialogPreviewBroken(true);
                                return current;
                              });
                            }}
                          />
                        </div>
                      ) : null}
                      {mediaDialogPreviewBroken ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-500">
                          이미지 미리보기를 불러오지 못했습니다. URL을 다시 확인하거나 AI 생성을 사용해 주세요.
                        </div>
                      ) : null}
                      {mediaDialogError ? <p className="text-sm text-destructive">{mediaDialogError}</p> : null}
                    </div>
                    <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setMediaDialogOpen(false)}
                        disabled={mediaDialogBusy}
                      >
                        닫기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void applyMediaUrlFromDialog()}
                        disabled={mediaDialogBusy}
                      >
                        URL 적용
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void generateMediaForSelectedPage()}
                        disabled={mediaDialogBusy || !selectedMediaDialogPage}
                      >
                        {mediaDialogBusy ? "AI 생성 중..." : "AI 생성 후 적용"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <div className="rounded-xl border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">컨테이너 순서 편집 (n8n 스타일 흐름)</p>
                    <p className="text-xs text-muted-foreground">
                      드래그 또는 ↑↓ 버튼으로 순서를 정한 뒤 업로드
                    </p>
                  </div>
                  <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
                    이미지 UX 가이드: 각 페이지 카드의 `이미지 추가/변경` 버튼에서 AI 생성 또는 URL 입력으로 바로 반영할 수 있습니다.
                  </div>
                  <div className="mb-3 rounded-md border border-border/60 bg-muted/20 p-2">
                    <p className="mb-2 text-xs font-medium text-foreground">이미지 편집 워크스페이스</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        value={mediaWorkspacePageId || orderedPages[0]?.id || ""}
                        onValueChange={setMediaWorkspacePageId}
                        disabled={orderedPages.length === 0}
                      >
                        <SelectTrigger className="h-8 w-full sm:max-w-xs">
                          <SelectValue placeholder="편집할 페이지 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {orderedPages.map((page, index) => (
                            <SelectItem key={`feed-media-workspace-${page.id}`} value={page.id}>
                              {index + 1}. {page.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => openMediaWorkspaceEditor({ pageId: mediaWorkspacePageId })}
                        disabled={orderedPages.length === 0}
                      >
                        선택 페이지 편집
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => openMediaWorkspaceEditor({ preferMissing: true })}
                        disabled={orderedPages.length === 0}
                      >
                        미디어 누락 페이지 편집
                      </Button>
                    </div>
                  </div>
                  <div className="app-table-scrollbar overflow-x-auto">
                    <div className="flex min-w-max items-center gap-3 pb-2">
                      {orderedPages.map((page, index) => {
                        const mediaUrl = pagePrimaryMediaUrl(page);
                        const kind = inferMediaKind(mediaUrl);
                        const isMediaMissing = !mediaUrl;
                        const previewBroken = Boolean(brokenThumbnailIds[page.id]);
                        return (
                          <div key={page.id} className="flex items-center gap-3">
                            <article
                              draggable
                              onDragStart={() => setDraggingPageId(page.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!draggingPageId) return;
                                const targetIndex = orderedPages.findIndex((item) => item.id === page.id);
                                movePageToIndex(draggingPageId, targetIndex);
                                setDraggingPageId(undefined);
                              }}
                              className="w-[170px] rounded-lg border bg-background p-2"
                            >
                              <div className="mb-1 flex items-center justify-between">
                                <p className="text-xs font-medium">{index + 1}. {page.name}</p>
                                <p className={`text-[10px] ${isMediaMissing ? "text-amber-500" : "text-muted-foreground"}`}>
                                  {isMediaMissing ? "image 필요" : kind}
                                </p>
                              </div>
                              <div
                                className="relative aspect-[4/5] overflow-hidden rounded border"
                                style={{ backgroundColor: page.backgroundColor || "#111111" }}
                              >
                                {thumbnailPreviews[page.id] && !previewBroken ? (
                                  <img
                                    src={thumbnailPreviews[page.id]}
                                    alt={`${page.name} preview`}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    draggable={false}
                                    onError={() =>
                                      setBrokenThumbnailIds((prev) => ({ ...prev, [page.id]: true }))
                                    }
                                  />
                                ) : null}
                                {(!thumbnailPreviews[page.id] || previewBroken) &&
                                !mediaUrl &&
                                !page.backgroundImageUrl ? (
                                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                                    미디어 없음
                                  </div>
                                ) : null}
                                {previewBroken ? (
                                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-amber-500">
                                    미리보기 로드 실패
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-2 flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => movePage(page.id, -1)}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => movePage(page.id, 1)}
                                  disabled={index === orderedPages.length - 1}
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isMediaMissing ? "default" : "outline"}
                                className="mt-1 h-7 w-full px-2 text-[11px]"
                                onClick={() => openMediaDialogForPage(page)}
                              >
                                {isMediaMissing ? "이미지 추가" : "이미지 변경"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-1 h-7 w-full px-2 text-[11px]"
                                onClick={() => void downloadPageAiImage(page, index)}
                                disabled={isMediaMissing || kind === "video"}
                              >
                                <Download className="mr-1 h-3.5 w-3.5" />
                                이미지 다운로드
                              </Button>
                            </article>
                            {index < orderedPages.length - 1 ? (
                              <div className="flex h-full items-center text-muted-foreground">
                                <ArrowRight className="h-5 w-5" />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-3">
                  <p className="text-sm font-semibold">업로드 컨테이너 구성 검수</p>
                  <p className="text-xs text-muted-foreground">
                    현재 순서 기준으로 최종 렌더(PNG/MP4) 및 업로드 가능 상태를 확인합니다.
                  </p>
                  <div className="mt-2 space-y-2">
                    {mediaPlan.map((item) => (
                      <div key={item.pageId} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                        <p>
                          {item.index + 1}. {orderedPages[item.index]?.name}
                        </p>
                        {item.ready ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            렌더 준비됨 ({item.mediaKind})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <AlertCircle className="h-3.5 w-3.5" />
                            오디오 스크립트 확인 필요
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                왼쪽에서 업로드할 피드 결과를 선택해 주세요.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">생성된 피드가 없습니다.</p>
      )}
    </section>
  );
}
