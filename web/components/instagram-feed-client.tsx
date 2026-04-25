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
import { renderInstagramPageToPngDataUrl } from "@/lib/instagram-page-renderer";
import { ensureInstagramCustomFontsLoaded } from "@/lib/instagram-font-runtime";
import {
  INSTAGRAM_FEED_DRAFT_KEY,
  INSTAGRAM_FEED_MAX_ROWS_KEY,
  INSTAGRAM_FEED_STORAGE_KEY,
  INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY,
  type InstagramFeedDraft,
  type InstagramTemplateEditDraft
} from "@/lib/instagram-feed-storage";
import type { AppSettings } from "@/lib/types";
import type { InstagramFeedPage, InstagramGeneratedFeedItem, InstagramTemplate } from "@/lib/instagram-types";

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
  const heroImageLayer = selectPrimaryEditableImageElement(page);
  if (heroImageLayer && heroImageLayer.type === "image" && isRenderableMediaUrl(heroImageLayer.imageUrl)) {
    return String(heroImageLayer.imageUrl || "");
  }
  const anyImageLayerWithUrl = page.elements.find(
    (element) => element.type === "image" && isRenderableMediaUrl(String(element.imageUrl || ""))
  );
  if (anyImageLayerWithUrl && anyImageLayerWithUrl.type === "image") {
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
  // Feed mode currently renders video only when page audio is explicitly enabled.
  // This keeps output predictable: static card image pages remain image.
  return Boolean(page.audioEnabled) ? "video" : "image";
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const imageElements = page.elements.filter((element) => element.type === "image");
  if (imageElements.length === 0) {
    return undefined;
  }
  const sorted = [...imageElements].sort((left, right) => layerCoverageScore(right) - layerCoverageScore(left));
  const candidate = sorted.find((element) => layerCoverageScore(element) >= 120);
  return candidate || undefined;
}

function buildDefaultPageImagePrompt(page: InstagramFeedPage, item?: InstagramGeneratedFeedItem): string {
  const primaryImageLayer = selectPrimaryEditableImageElement(page);
  const promptFromLayer =
    primaryImageLayer && primaryImageLayer.type === "image" && collapseWhitespace(primaryImageLayer.aiPrompt).length > 0
      ? primaryImageLayer
      : page.elements.find((element) => element.type === "image" && collapseWhitespace(element.aiPrompt).length > 0);
  if (promptFromLayer && promptFromLayer.type === "image") {
    return collapseWhitespace(promptFromLayer.aiPrompt);
  }
  const subject = collapseWhitespace(item?.subject || "");
  const keyword = collapseWhitespace(item?.keyword || "");
  const pageName = collapseWhitespace(page.name || "Page");
  return collapseWhitespace(`${subject} ${keyword} ${pageName} 인스타그램 카드뉴스용 사실적 이미지`);
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
  const primaryImageLayerId = primaryImageLayer && primaryImageLayer.type === "image" ? primaryImageLayer.id : undefined;
  let imageLayerUpdated = false;
  const elements = args.page.elements.map((element) => {
    if (element.type !== "image" || imageLayerUpdated) {
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
      element.type === "image"
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
  return {
    ...snapshot,
    ...(matchedRow?.raw || {}),
    id: String(matchedRow?.id || item.rowId || ""),
    status: String(matchedRow?.status || "준비"),
    keyword: String(matchedRow?.keyword || item.keyword || snapshot.keyword || ""),
    subject: String(matchedRow?.subject || item.subject || snapshot.subject || ""),
    description: String(matchedRow?.description || snapshot.description || ""),
    narration: String(matchedRow?.narration || snapshot.narration || "")
  };
}

export function InstagramFeedClient(): React.JSX.Element {
  const router = useRouter();
  const [items, setItems] = useState<InstagramGeneratedFeedItem[]>([]);
  const [templates, setTemplates] = useState<InstagramTemplate[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetRowsResponse["rows"]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState("3");
  const [loadingContext, setLoadingContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sourceSheetName, setSourceSheetName] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [orderedPageIdsByItem, setOrderedPageIdsByItem] = useState<Record<string, string[]>>({});
  const [caption, setCaption] = useState("");
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
  const [mediaDialogBusy, setMediaDialogBusy] = useState(false);
  const [mediaDialogError, setMediaDialogError] = useState<string>();
  const [mediaDialogPreviewIndex, setMediaDialogPreviewIndex] = useState(0);
  const [mediaDialogPreviewBroken, setMediaDialogPreviewBroken] = useState(false);
  const [brokenThumbnailIds, setBrokenThumbnailIds] = useState<Record<string, boolean>>({});
  const [mediaWorkspacePageId, setMediaWorkspacePageId] = useState<string>();
  const [incomingDraft, setIncomingDraft] = useState<InstagramFeedDraft | null>(null);
  const [feedItemsHydrated, setFeedItemsHydrated] = useState(false);

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
      const parsed = JSON.parse(raw) as InstagramGeneratedFeedItem[];
      setItems(parsed);
      if (parsed.length > 0) {
        setSelectedItemId((prev) => (prev && parsed.some((item) => item.id === prev) ? prev : parsed[0].id));
      }
    } catch {
      setItems([]);
    } finally {
      setFeedItemsHydrated(true);
    }
  }, []);

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
      setCaption(draftCaption);
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
    setCaption((prev) =>
      prev.trim()
        ? prev
        : `${selected.subject}\n#${selected.keyword}`
    );
  }, [items, selectedItemId]);

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
        const requiresAudioPrompt = Boolean(page.audioEnabled) && !resolvedAudioPrompt;
        const hasUnresolvedAudioToken = Boolean(page.audioEnabled && /\{\{[^}]+\}\}/.test(resolvedAudioPrompt));
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

  function clearAll(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(INSTAGRAM_FEED_STORAGE_KEY);
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

  function saveFeedItems(nextItems: InstagramGeneratedFeedItem[]): void {
    setItems(nextItems);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTAGRAM_FEED_STORAGE_KEY, JSON.stringify(nextItems));
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
    try {
      const max = Math.max(1, Math.min(10, Number.parseInt(maxRows, 10) || 3));
      const pickedRows = (sheetRows || []).slice(0, max);
      const templateMap = new Map(templates.map((item) => [item.id, item]));
      const generated: InstagramGeneratedFeedItem[] = [];

      for (const row of pickedRows) {
        const payload = {
          id: row.id,
          status: row.status,
          keyword: row.keyword,
          subject: row.subject,
          description: row.description,
          narration: row.narration,
          ...(row.raw || {})
        };

        for (const templateId of selectedTemplateIds) {
          const template = templateMap.get(templateId);
          if (!template) continue;
          const pages = template.pages.map((page) => ({
            ...page,
            backgroundImageUrl: materialize(String(page.backgroundImageUrl || ""), payload),
            audioPrompt: materialize(String(page.audioPrompt || ""), payload),
            elements: page.elements.map((element) =>
              element.type === "text"
                ? { ...element, text: materialize(element.text, payload) }
                : element.type === "image"
                  ? {
                      ...element,
                      imageUrl: materialize(String(element.imageUrl || ""), payload),
                      aiPrompt: materialize(String(element.aiPrompt || ""), payload)
                    }
                  : element
            )
          }));
          generated.push({
            id: uid(),
            templateId: template.id,
            templateName: template.templateName,
            rowId: row.id,
            subject: row.subject,
            keyword: row.keyword,
            generatedAt: new Date().toISOString(),
            sampleData: payload,
            pages
          });
        }
      }

      saveFeedItems(generated);
      setSelectedItemId(generated[0]?.id);
      setSuccess(`컨테이너 ${generated.length}개를 생성했습니다.`);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "컨테이너 생성에 실패했습니다.");
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
      const parsed = JSON.parse(raw) as InstagramGeneratedFeedItem[];
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
      sampleData: buildSampleDataFromFeedItem(selectedItem, sheetRows)
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTAGRAM_TEMPLATE_EDIT_DRAFT_KEY, JSON.stringify(draftPayload));
    }
    router.push("/instagram/templates");
  }

  function applyMediaToSelectedPage(mediaUrl: string, prompt: string): boolean {
    if (!selectedItem || !mediaDialogPageId) {
      return false;
    }
    const resolvedMediaUrl = String(mediaUrl || "").trim();
    if (!resolvedMediaUrl) {
      return false;
    }
    const nextItems = items.map((item) => {
      if (item.id !== selectedItem.id) {
        return item;
      }
      return {
        ...item,
        pages: item.pages.map((page) =>
          page.id === mediaDialogPageId
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

  async function previewPageAudio(page: InstagramFeedPage): Promise<void> {
    const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), selectedSampleData).trim();
    setAudioPreviewError(undefined);
    setError(undefined);

    if (!page.audioEnabled) {
      setAudioPreviewError("오디오가 켜진 비디오 페이지에서만 미리듣기할 수 있습니다.");
      return;
    }
    if (!resolvedAudioPrompt) {
      setAudioPreviewError(`${page.name} 오디오 스크립트가 비어 있습니다.`);
      return;
    }
    if (/\{\{[^}]+\}\}/.test(resolvedAudioPrompt)) {
      setAudioPreviewError(`${page.name} 오디오 스크립트에 치환되지 않은 변수가 남아 있습니다: ${resolvedAudioPrompt}`);
      return;
    }

    setAudioPreviewLoadingPageId(page.id);
    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
          speed: clamp(Number(page.audioSpeed), 0.5, 2, 1),
          provider: page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
          text: resolvedAudioPrompt.slice(0, 320)
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "음성 미리듣기에 실패했습니다.");
      }
      const blob = await response.blob();
      const playableBlob = blob.type && blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: "audio/wav" });
      const nextUrl = URL.createObjectURL(playableBlob);
      if (audioPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(audioPreviewObjectUrlRef.current);
      }
      audioPreviewObjectUrlRef.current = nextUrl;
      setAudioPreviewPageId(page.id);
      setAudioPreviewUrl(nextUrl);
    } catch (previewError) {
      setAudioPreviewError(previewError instanceof Error ? previewError.message : "음성 미리듣기에 실패했습니다.");
    } finally {
      setAudioPreviewLoadingPageId(undefined);
    }
  }

  async function buildRenderedMediaAssets(): Promise<
    Array<{
      pageId: string;
      pageName: string;
      index: number;
      mediaKind: "image" | "video";
      mediaUrl: string;
    }>
  > {
    if (!selectedItem) {
      return [];
    }
    const matchedTemplate = templates.find((template) => template.id === selectedItem.templateId);
    const canvasWidth = normalizeCanvasWidth(Number(matchedTemplate?.canvasWidth || 1080));
    const canvasHeight = normalizeCanvasHeight(Number(matchedTemplate?.canvasHeight || 1350));

    const sampleData = buildSampleDataFromFeedItem(selectedItem, sheetRows);
    await ensureInstagramCustomFontsLoaded(matchedTemplate?.customFonts || []);

    const renderedAssets: Array<{
      pageId: string;
      pageName: string;
      index: number;
      mediaKind: "image" | "video";
      mediaUrl: string;
    }> = [];

    for (let index = 0; index < orderedPages.length; index += 1) {
      const page = orderedPages[index];
      const pageName = sanitizeDownloadName(page.name || `page-${index + 1}`);
      const previewPage = toFeedPreviewPage(page);
      const imageDataUrl = await renderInstagramPageToPngDataUrl({
        page: previewPage,
        sampleData,
        canvasWidth,
        canvasHeight
      });

      if (pageOutputKind(page) === "video") {
        const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), sampleData).trim();
        const response = await fetch("/api/instagram/render-page-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateName: selectedItem.templateName,
            pageName: page.name,
            imageDataUrl,
            useAudio: Boolean(page.audioEnabled && resolvedAudioPrompt),
            audioPrompt: resolvedAudioPrompt || undefined,
            ttsProvider:
              page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
            sampleData,
            audioVoice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
            audioSpeed: clamp(Number(page.audioSpeed), 0.5, 2, 1),
            durationSec: Math.max(1, Number(page.durationSec) || 4),
            outputWidth: canvasWidth,
            outputHeight: canvasHeight
          })
        });
        const data = (await response.json()) as { outputUrl?: string; error?: string };
        if (!response.ok || !data.outputUrl) {
          throw new Error(data.error || `${page.name} MP4 렌더링에 실패했습니다.`);
        }
        renderedAssets.push({
          pageId: page.id,
          pageName,
          index,
          mediaKind: "video",
          mediaUrl: data.outputUrl
        });
        continue;
      }

      renderedAssets.push({
        pageId: page.id,
        pageName,
        index,
        mediaKind: "image",
        mediaUrl: imageDataUrl
      });
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
      const renderedAssets = await buildRenderedMediaAssets();
      if (renderedAssets.length === 0) {
        throw new Error("업로드에 사용할 렌더 결과가 없습니다.");
      }
      setUploadStageMessage(`Meta 업로드 요청 중... (${renderedAssets.length}개 페이지)`);
      const response = await fetch("/api/instagram/meta/upload-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim(),
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
      const renderedAssets = await buildRenderedMediaAssets();
      const prepared = renderedAssets.map((asset) => {
        const ext = guessExtensionFromUrl(asset.mediaUrl, asset.mediaKind);
        return {
          url: asset.mediaUrl,
          fileName: `${String(asset.index + 1).padStart(2, "0")}-${asset.pageName}.${ext}`
        };
      });

      for (const asset of prepared) {
        const link = document.createElement("a");
        link.href = asset.url;
        link.download = asset.fileName;
        link.rel = "noreferrer";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      const captionBlob = new Blob([caption || ""], { type: "text/plain;charset=utf-8" });
      const captionUrl = URL.createObjectURL(captionBlob);
      const captionLink = document.createElement("a");
      captionLink.href = captionUrl;
      captionLink.download = `${sanitizeDownloadName(selectedItem.subject || selectedItem.rowId || "feed")}-caption.txt`;
      document.body.appendChild(captionLink);
      captionLink.click();
      document.body.removeChild(captionLink);
      URL.revokeObjectURL(captionUrl);

      setSuccess(`다운로드 시작: 최종 렌더 미디어 ${prepared.length}개 + caption.txt`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "다운로드에 실패했습니다.");
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
                    <div className="max-h-40 space-y-1 overflow-auto pr-1">
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
            </p>
            <div className="max-h-[56vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
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
                      <td className="px-3 py-4 text-muted-foreground" colSpan={sheetHeaders.length}>
                        필터 조건에 맞는 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredSheetRows.map((row, rowIndex) => (
                      <tr key={`ig-feed-row-${rowIndex}`} className="border-t align-top">
                        {sheetHeaders.map((header) => (
                          <td
                            key={`ig-feed-cell-${rowIndex}-${header}`}
                            className={`px-3 py-2 ${wrapSheetCells ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}
                          >
                            {row[header] || ""}
                          </td>
                        ))}
                      </tr>
                    ))
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
            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1 md:max-h-[70vh]">
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
                  <p className="text-xs text-muted-foreground">#{item.keyword} · row {item.rowId}</p>
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
                      <p className="text-xs text-muted-foreground">#{selectedItem.keyword} · row {selectedItem.rowId}</p>
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
                        {downloading ? "다운로드 중..." : "다운로드"}
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
                    <Label>캡션</Label>
                    <Input
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="업로드 캡션 입력"
                    />
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
                  <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
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
                        <p className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-sm">
                          {caption.trim() || "(빈 캡션)"}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          업로드 페이지 ({mediaPlan.length}개)
                        </p>
                        <div className="max-h-52 space-y-1 overflow-auto text-sm">
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
                                  <p className="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
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
                                      {audioPreviewLoadingPageId === item.pageId ? "생성 중..." : "음성 미리듣기"}
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
                        className="w-full sm:w-auto"
                        onClick={() => void uploadFeed()}
                        disabled={uploading || orderedPages.length === 0}
                      >
                        {uploading ? "업로드 중..." : "확인 후 업로드"}
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
                        <Label>AI 이미지 프롬프트</Label>
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
                  <div className="overflow-x-auto">
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
