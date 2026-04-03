import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  InstagramFeedPage,
  InstagramPageElement,
  InstagramTemplate,
  InstagramTemplateCatalog
} from "@/lib/instagram-types";
import { scopedUserId } from "@/lib/user-storage-namespace";

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveTemplateFile(): string {
  const explicit = (process.env.INSTAGRAM_TEMPLATE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(
      process.cwd(),
      "data",
      `instagram-template.${sanitizeNamespace(namespace)}.json`
    );
  }

  return path.join(process.cwd(), "data", "instagram-template.json");
}

function resolveInstagramStorageUserId(userId?: string): string | undefined {
  const scoped = scopedUserId(userId, "automation");
  if (!scoped) {
    return undefined;
  }
  return `${scoped}::instagram-template`;
}

async function ensureTemplateFile(): Promise<void> {
  const file = resolveTemplateFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    const initial: InstagramTemplateCatalog = { templates: [] };
    await fs.writeFile(file, JSON.stringify(initial, null, 2), "utf8");
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(value: string | undefined, fallback: string): string {
  const normalized = String(value || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return fallback;
}

function createDefaultPage(index: number): InstagramFeedPage {
  return {
    id: randomUUID(),
    name: `페이지 ${index + 1}`,
    backgroundColor: "#FFFFFF",
    backgroundImageUrl: "",
    backgroundFit: "cover",
    durationSec: 4,
    audioEnabled: false,
    audioProvider: "auto",
    audioVoice: "alloy",
    audioSpeed: 1,
    elements: []
  };
}

function normalizeElement(element: Partial<InstagramPageElement>, index = 0): InstagramPageElement | undefined {
  const base = {
    id: String(element.id || randomUUID()),
    x: clamp(Number(element.x), 0, 100, 50),
    y: clamp(Number(element.y), 0, 100, 50),
    width: clamp(Number(element.width), 1, 100, 40),
    height: clamp(Number(element.height), 1, 100, 20),
    rotation: clamp(Number(element.rotation), -180, 180, 0),
    opacity: clamp(Number(element.opacity), 0.05, 1, 1),
    zIndex: clamp(Number(element.zIndex), 0, 999, index)
  };

  if (element.type === "shape") {
    const rawShape = String(element.shape || "rectangle");
    const shape =
      rawShape === "roundedRectangle" ||
      rawShape === "circle" ||
      rawShape === "triangle" ||
      rawShape === "diamond" ||
      rawShape === "pentagon" ||
      rawShape === "hexagon" ||
      rawShape === "star" ||
      rawShape === "arrowRight" ||
      rawShape === "arrowLeft" ||
      rawShape === "line"
        ? rawShape
        : "rectangle";
    return {
      ...base,
      type: "shape",
      shape,
      fillEnabled: element.fillEnabled !== false,
      fillColor: normalizeHex(element.fillColor, "#EEEEEE"),
      strokeColor: normalizeHex(element.strokeColor, "#111111"),
      strokeWidth: clamp(Number(element.strokeWidth), 0, 24, 0),
      cornerRadius: clamp(Number(element.cornerRadius), 0, 200, 0)
    };
  }

  if (element.type === "image") {
    return {
      ...base,
      type: "image",
      imageUrl: String(element.imageUrl || ""),
      fit: element.fit === "contain" ? "contain" : "cover",
      borderRadius: clamp(Number(element.borderRadius), 0, 200, 0),
      overlayColor: normalizeHex(element.overlayColor, "#000000"),
      overlayOpacity: clamp(Number(element.overlayOpacity), 0, 1, 0),
      aiGenerateEnabled: Boolean(element.aiGenerateEnabled),
      aiPrompt: String(element.aiPrompt || ""),
      aiStylePreset: String(element.aiStylePreset || "Cinematic photo-real")
    };
  }

  if (element.type === "text") {
    const rawTextMode = String((element as { textMode?: string }).textMode || "variable");
    const textMode = rawTextMode === "plain" ? "plain" : "variable";
    return {
      ...base,
      type: "text",
      textMode,
      text: String(element.text || ""),
      autoWrap: element.autoWrap !== false,
      color: normalizeHex(element.color, "#111111"),
      fontFamily: String(element.fontFamily || "Noto Sans KR"),
      fontSize: clamp(Number(element.fontSize), 8, 240, 36),
      lineHeight: clamp(Number(element.lineHeight), 0.8, 3, 1.2),
      letterSpacing: clamp(Number(element.letterSpacing), -2, 20, 0),
      textAlign:
        element.textAlign === "left" || element.textAlign === "right" ? element.textAlign : "center",
      bold: Boolean(element.bold),
      italic: Boolean(element.italic),
      underline: Boolean(element.underline),
      strikeThrough: Boolean((element as { strikeThrough?: boolean }).strikeThrough),
      shadowEnabled: Boolean((element as { shadowEnabled?: boolean }).shadowEnabled),
      shadowColor: normalizeHex((element as { shadowColor?: string }).shadowColor, "#000000"),
      shadowBlur: clamp(Number((element as { shadowBlur?: number }).shadowBlur), 0, 40, 0),
      shadowX: clamp(Number((element as { shadowX?: number }).shadowX), -40, 40, 0),
      shadowY: clamp(Number((element as { shadowY?: number }).shadowY), -40, 40, 0),
      backgroundColor: normalizeHex(element.backgroundColor, "#FFFFFF"),
      padding: clamp(Number(element.padding), 0, 60, 0)
    };
  }

  return undefined;
}

function normalizePage(page: Partial<InstagramFeedPage>, index: number): InstagramFeedPage {
  const elements = Array.isArray(page.elements)
    ? page.elements
        .map((item, itemIndex) => normalizeElement(item as Partial<InstagramPageElement>, itemIndex))
        .filter((item): item is InstagramPageElement => Boolean(item))
        .sort((a, b) => a.zIndex - b.zIndex)
    : [];

  return {
    id: String(page.id || randomUUID()),
    name: String(page.name || `페이지 ${index + 1}`),
    backgroundColor: normalizeHex(page.backgroundColor, "#FFFFFF"),
    backgroundImageUrl: String(page.backgroundImageUrl || "").trim() || undefined,
    backgroundFit: page.backgroundFit === "contain" ? "contain" : "cover",
    durationSec: clamp(Number(page.durationSec), 1, 60, 4),
    audioEnabled:
      typeof page.audioEnabled === "boolean"
        ? page.audioEnabled
        : Boolean(String(page.audioPrompt || "").trim() || String(page.audioUrl || "").trim()),
    audioProvider:
      page.audioProvider === "openai" || page.audioProvider === "gemini" ? page.audioProvider : "auto",
    audioVoice: String(page.audioVoice || "alloy").trim().toLowerCase() || "alloy",
    audioSpeed: clamp(Number(page.audioSpeed), 0.5, 2, 1),
    audioUrl: String(page.audioUrl || "").trim() || undefined,
    audioPrompt: String(page.audioPrompt || "").trim() || undefined,
    elements
  };
}

function normalizeTemplate(template: Partial<InstagramTemplate>): InstagramTemplate | undefined {
  const templateName = String(template.templateName || "").trim();
  if (!templateName) {
    return undefined;
  }
  const canvasWidth = clamp(Number(template.canvasWidth), 320, 4000, 1080);
  const canvasHeight = clamp(Number(template.canvasHeight), 320, 4000, 1350);
  const canvasPreset = String(template.canvasPreset || "").trim() || "instagram_feed_portrait";
  const pages = Array.isArray(template.pages)
    ? template.pages.map((page, index) => normalizePage(page, index))
    : [];
  const normalizedPages = pages.length > 0 ? pages : [createDefaultPage(0)];
  const pageDurationSec = clamp(Number(template.pageDurationSec), 1, 60, 4);
  const pageCount = clamp(Number(template.pageCount), 1, 30, normalizedPages.length);
  return {
    id: String(template.id || randomUUID()),
    templateName,
    sourceTitle: String(template.sourceTitle || "{{subject}}"),
    sourceTopic: String(template.sourceTopic || "{{description}}"),
    canvasPreset,
    canvasWidth,
    canvasHeight,
    pageDurationSec,
    pageCount,
    pages: normalizedPages.slice(0, pageCount),
    updatedAt:
      typeof template.updatedAt === "string" && template.updatedAt.trim()
        ? template.updatedAt
        : new Date().toISOString()
  };
}

function normalizeCatalog(parsed: unknown): InstagramTemplateCatalog {
  if (!parsed || typeof parsed !== "object") {
    return { templates: [] };
  }
  const record = parsed as Partial<InstagramTemplateCatalog>;
  const templates = Array.isArray(record.templates)
    ? record.templates
        .map((item) => normalizeTemplate(item as Partial<InstagramTemplate>))
        .filter((item): item is InstagramTemplate => Boolean(item))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const activeTemplateId =
    typeof record.activeTemplateId === "string" &&
    templates.some((item) => item.id === record.activeTemplateId)
      ? record.activeTemplateId
      : templates[0]?.id;
  return {
    activeTemplateId,
    templates
  };
}

async function readCatalog(userId?: string): Promise<InstagramTemplateCatalog> {
  const storageUserId = resolveInstagramStorageUserId(userId);
  if (storageUserId && prisma) {
    const row = await prisma.userAutomationTemplateCatalog.findUnique({
      where: { userId: storageUserId }
    });
    if (row?.data) {
      return normalizeCatalog(row.data);
    }
  }

  await ensureTemplateFile();
  const raw = await fs.readFile(resolveTemplateFile(), "utf8");
  try {
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return { templates: [] };
  }
}

async function writeCatalog(catalog: InstagramTemplateCatalog, userId?: string): Promise<void> {
  const normalized = normalizeCatalog(catalog);
  const storageUserId = resolveInstagramStorageUserId(userId);
  if (storageUserId && prisma) {
    await prisma.userAutomationTemplateCatalog.upsert({
      where: { userId: storageUserId },
      update: { data: normalized as unknown as Prisma.InputJsonValue },
      create: { userId: storageUserId, data: normalized as unknown as Prisma.InputJsonValue }
    });
    return;
  }

  await ensureTemplateFile();
  await fs.writeFile(resolveTemplateFile(), JSON.stringify(normalized, null, 2), "utf8");
}

export async function listInstagramTemplates(userId?: string): Promise<InstagramTemplateCatalog> {
  return readCatalog(userId);
}

export async function saveInstagramTemplate(args: {
  template: InstagramTemplate;
  userId?: string;
}): Promise<InstagramTemplateCatalog> {
  const catalog = await readCatalog(args.userId);
  const normalized = normalizeTemplate(args.template);
  if (!normalized) {
    throw new Error("유효한 템플릿 데이터가 아닙니다.");
  }
  const existingIndex = catalog.templates.findIndex((item) => item.id === normalized.id);
  const nextTemplate: InstagramTemplate = {
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  const templates = [...catalog.templates];
  if (existingIndex >= 0) {
    templates[existingIndex] = nextTemplate;
  } else {
    templates.unshift(nextTemplate);
  }
  const nextCatalog: InstagramTemplateCatalog = {
    activeTemplateId: nextTemplate.id,
    templates
  };
  await writeCatalog(nextCatalog, args.userId);
  return readCatalog(args.userId);
}

export async function setActiveInstagramTemplate(
  templateId: string,
  userId?: string
): Promise<InstagramTemplateCatalog> {
  const catalog = await readCatalog(userId);
  if (!catalog.templates.some((item) => item.id === templateId)) {
    throw new Error("선택한 인스타그램 템플릿을 찾을 수 없습니다.");
  }
  const nextCatalog: InstagramTemplateCatalog = {
    activeTemplateId: templateId,
    templates: catalog.templates
  };
  await writeCatalog(nextCatalog, userId);
  return readCatalog(userId);
}

export async function deleteInstagramTemplate(
  templateId: string,
  userId?: string
): Promise<InstagramTemplateCatalog> {
  const catalog = await readCatalog(userId);
  const templates = catalog.templates.filter((item) => item.id !== templateId);
  const nextCatalog: InstagramTemplateCatalog = {
    activeTemplateId:
      catalog.activeTemplateId === templateId ? templates[0]?.id : catalog.activeTemplateId,
    templates
  };
  await writeCatalog(nextCatalog, userId);
  return readCatalog(userId);
}
