import { randomUUID } from "crypto";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import { uploadInstagramFeedToMeta } from "@/lib/instagram-meta-upload-service";
import { renderInstagramPageToPngDataUrlNode } from "@/lib/instagram-page-renderer-node";
import { renderInstagramPageVideo } from "@/lib/instagram-render-page-video-service";
import { listInstagramTemplates } from "@/lib/instagram-template-store";
import type { InstagramFeedPage, InstagramGeneratedFeedItem, InstagramTemplate } from "@/lib/instagram-types";

type InstagramSheetRow = {
  id: string;
  status: string;
  keyword: string;
  subject: string;
  description: string;
  narration: string;
  raw: Record<string, string>;
};

export type InstagramScheduledUploadResult = {
  attempted: number;
  uploaded: number;
  failed: number;
  sheetName?: string;
  templateId?: string;
  templateName?: string;
  logs: string[];
};

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function buildNormalizedRow(source: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    normalized[normalizeKey(key)] = String(value || "").trim();
  });
  return normalized;
}

function pickFirst(source: Record<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    const value = source[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildFallbackRowId(args: {
  row: Record<string, string>;
  index: number;
}): string {
  const base = pickFirst(args.row, ["subject", "type", "keyword", "jlpt"]) || "insta";
  const normalizedBase = base
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();
  return `${normalizedBase || "insta"}-${String(args.index + 1).padStart(3, "0")}`;
}

function normalizeExpression(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function rowExpressionKey(row: InstagramSheetRow): string {
  const primary = String(row.subject || "").trim();
  if (primary) return normalizeExpression(primary);
  return normalizeExpression(
    pickFirst(buildNormalizedRow(row.raw || {}), ["subject", "kr_intonation", "example_1_title"])
  );
}

function materialize(text: string, row: Record<string, string>): string {
  let out = String(text || "");
  for (const [key, value] of Object.entries(row || {})) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value || ""));
  }
  return out;
}

function normalizeHashTag(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "");
}

function firstNonEmpty(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(record).find(
      (item) =>
        item.trim().toLowerCase().replace(/[\s_-]+/g, "") === key.trim().toLowerCase().replace(/[\s_-]+/g, "")
    );
    if (!found) continue;
    const value = String(record[found] || "").trim();
    if (value) return value;
  }
  return "";
}

function buildSampleDataFromRow(row: InstagramSheetRow): Record<string, string> {
  return {
    ...(row.raw || {}),
    id: String(row.id || ""),
    status: String(row.status || "준비"),
    keyword: String(row.keyword || ""),
    subject: String(row.subject || ""),
    description: String(row.description || ""),
    narration: String(row.narration || "")
  };
}

function buildCaptionForUpload(item: InstagramGeneratedFeedItem, row: InstagramSheetRow): string {
  const sampleData = buildSampleDataFromRow(row);
  const captionFromSheet = materialize(firstNonEmpty(sampleData, ["caption", "Caption"]), sampleData).trim();
  if (captionFromSheet) {
    return captionFromSheet;
  }
  const keyword = normalizeHashTag(row.keyword || item.keyword);
  const hashLine = keyword ? `#${keyword}` : "";
  return [String(row.subject || item.subject || "").trim(), hashLine].filter(Boolean).join("\n");
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
  return Boolean(page.audioEnabled) ? "video" : "image";
}

async function loadReadyRows(
  userId: string,
  sheetName?: string
): Promise<{ rows: InstagramSheetRow[]; sheetName?: string }> {
  const table = await loadIdeasSheetTable(sheetName, userId);
  const rows = (table.rows || [])
    .map((rawRow, index) => {
      const normalizedRow = buildNormalizedRow(rawRow);
      const status = pickFirst(normalizedRow, ["status"]);
      const id = pickFirst(normalizedRow, ["id", "rowid"]) || buildFallbackRowId({ row: normalizedRow, index });
      const subject = pickFirst(normalizedRow, ["subject"]);
      const keyword = pickFirst(normalizedRow, ["keyword", "type", "jlpt", "subject"]);
      const description = pickFirst(normalizedRow, ["description", "caption", "type"]);
      const narration = pickFirst(normalizedRow, ["narration", "example_1_title", "example1title", "subject"]);

      const normalizedRaw: Record<string, string> = {};
      Object.entries(rawRow || {}).forEach(([key, value]) => {
        normalizedRaw[key] = String(value || "");
      });
      Object.entries(normalizedRow).forEach(([key, value]) => {
        if (normalizedRaw[key] === undefined) {
          normalizedRaw[key] = String(value || "");
        }
      });

      const mapped: InstagramSheetRow = {
        id,
        status,
        keyword,
        subject,
        description,
        narration,
        raw: normalizedRaw
      };
      return mapped;
    })
    .filter((row) => row.status === "준비" && row.subject);

  return {
    rows,
    sheetName: table.sheetName
  };
}

function materializeTemplate(args: {
  template: InstagramTemplate;
  row: InstagramSheetRow;
}): InstagramGeneratedFeedItem {
  const payload = {
    id: args.row.id,
    status: args.row.status,
    keyword: args.row.keyword,
    subject: args.row.subject,
    description: args.row.description,
    narration: args.row.narration,
    ...(args.row.raw || {})
  };
  const pages = args.template.pages.map((page) => ({
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
  return {
    id: randomUUID(),
    templateId: args.template.id,
    templateName: args.template.templateName,
    rowId: args.row.id,
    subject: args.row.subject,
    keyword: args.row.keyword,
    generatedAt: new Date().toISOString(),
    pages
  };
}

async function renderMediaUrlsForItem(args: {
  userId: string;
  item: InstagramGeneratedFeedItem;
  template: InstagramTemplate;
  row: InstagramSheetRow;
}): Promise<string[]> {
  const sampleData = buildSampleDataFromRow(args.row);
  const canvasWidth = normalizeCanvasWidth(Number(args.template.canvasWidth || 1080));
  const canvasHeight = normalizeCanvasHeight(Number(args.template.canvasHeight || 1350));
  const mediaUrls: string[] = [];

  for (const page of args.item.pages) {
    const imageDataUrl = await renderInstagramPageToPngDataUrlNode({
      page,
      sampleData,
      canvasWidth,
      canvasHeight
    });

    if (pageOutputKind(page) === "video") {
      const resolvedAudioPrompt = materialize(String(page.audioPrompt || ""), sampleData).trim();
      const rendered = await renderInstagramPageVideo({
        userId: args.userId,
        templateName: args.item.templateName,
        pageName: page.name,
        imageDataUrl,
        useAudio: Boolean(page.audioEnabled && resolvedAudioPrompt),
        audioPrompt: resolvedAudioPrompt || undefined,
        ttsProvider:
          page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
        sampleData,
        audioVoice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
        audioSpeed: Number(page.audioSpeed),
        durationSec: Math.max(1, Number(page.durationSec) || 4),
        outputWidth: canvasWidth,
        outputHeight: canvasHeight
      });
      mediaUrls.push(rendered.outputUrl);
    } else {
      mediaUrls.push(imageDataUrl);
    }
  }
  return mediaUrls;
}

export async function runInstagramScheduledMetaUpload(args: {
  userId: string;
  itemsPerRun: number;
  sheetName?: string;
}): Promise<InstagramScheduledUploadResult> {
  const logs: string[] = [];
  const itemLimit = Math.max(1, Math.min(10, Number(args.itemsPerRun) || 1));
  const catalog = await listInstagramTemplates(args.userId);
  const template =
    catalog.templates.find((item) => item.id === catalog.activeTemplateId) || catalog.templates[0];
  if (!template) {
    throw new Error("인스타 업로드용 템플릿이 없습니다.");
  }

  const rowContext = await loadReadyRows(args.userId, args.sheetName);
  const expressionSeen = new Set<string>();
  const dedupedRows = rowContext.rows.filter((row) => {
    const key = rowExpressionKey(row);
    if (!key) return false;
    if (expressionSeen.has(key)) return false;
    expressionSeen.add(key);
    return true;
  });
  const pickedRows = dedupedRows.slice(0, itemLimit);
  if (pickedRows.length === 0) {
    return {
      attempted: 0,
      uploaded: 0,
      failed: 0,
      sheetName: rowContext.sheetName,
      templateId: template.id,
      templateName: template.templateName,
      logs: ["업로드할 준비 row가 없습니다."]
    };
  }

  let uploaded = 0;
  let failed = 0;
  for (const row of pickedRows) {
    const item = materializeTemplate({
      template,
      row
    });
    try {
      logs.push(`[업로드 시작] ${item.subject}`);
      const mediaUrls = await renderMediaUrlsForItem({
        userId: args.userId,
        item,
        template,
        row
      });
      const caption = buildCaptionForUpload(item, row);
      const uploadedResult = await uploadInstagramFeedToMeta({
        userId: args.userId,
        caption,
        mediaUrls,
        rowId: row.id,
        sheetName: rowContext.sheetName || args.sheetName
      });
      uploaded += 1;
      logs.push(
        `[업로드 완료] ${item.subject} · mediaId=${uploadedResult.mediaId || "-"}${
          uploadedResult.permalink ? ` · ${uploadedResult.permalink}` : ""
        }`
      );
    } catch (error) {
      failed += 1;
      logs.push(`[업로드 실패] ${item.subject} · ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    attempted: pickedRows.length,
    uploaded,
    failed,
    sheetName: rowContext.sheetName,
    templateId: template.id,
    templateName: template.templateName,
    logs
  };
}
