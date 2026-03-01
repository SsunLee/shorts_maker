import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { RenderOptions } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveAutomationTemplateFile(): string {
  const explicit = (process.env.AUTOMATION_TEMPLATE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }

  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(
      process.cwd(),
      "data",
      `automation-template.${sanitizeNamespace(namespace)}.json`
    );
  }

  return path.join(process.cwd(), "data", "automation-template.json");
}

export interface AutomationTemplateSnapshot {
  renderOptions: RenderOptions;
  imageStyle?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  templateName?: string;
  voice?: string;
  voiceSpeed?: number;
  updatedAt: string;
}

export interface AutomationTemplateEntry extends AutomationTemplateSnapshot {
  id: string;
}

interface AutomationTemplateCatalog {
  activeTemplateId?: string;
  templates: AutomationTemplateEntry[];
}

async function ensureAutomationTemplateFile(): Promise<void> {
  const automationTemplateFile = resolveAutomationTemplateFile();
  await fs.mkdir(path.dirname(automationTemplateFile), { recursive: true });
  try {
    await fs.access(automationTemplateFile);
  } catch {
    await fs.writeFile(
      automationTemplateFile,
      JSON.stringify({ templates: [] } satisfies AutomationTemplateCatalog, null, 2),
      "utf8"
    );
  }
}

function normalizeSnapshot(parsed: Partial<AutomationTemplateSnapshot>): AutomationTemplateSnapshot | undefined {
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }
  if (!parsed.renderOptions || typeof parsed.renderOptions !== "object") {
    return undefined;
  }
  const rawVoice = typeof parsed.voice === "string" ? parsed.voice.trim().toLowerCase() : "";
  const rawVoiceSpeed = Number(parsed.voiceSpeed);
  return {
    renderOptions: parsed.renderOptions as RenderOptions,
    imageStyle: typeof parsed.imageStyle === "string" ? parsed.imageStyle : undefined,
    sourceTitle: typeof parsed.sourceTitle === "string" ? parsed.sourceTitle : undefined,
    sourceTopic: typeof parsed.sourceTopic === "string" ? parsed.sourceTopic : undefined,
    templateName: typeof parsed.templateName === "string" ? parsed.templateName : undefined,
    voice: rawVoice || undefined,
    voiceSpeed: Number.isFinite(rawVoiceSpeed)
      ? Math.max(0.5, Math.min(2, rawVoiceSpeed))
      : undefined,
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : new Date().toISOString()
  };
}

function sortByUpdatedAtDesc(items: AutomationTemplateEntry[]): AutomationTemplateEntry[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeCatalog(
  parsed: Partial<AutomationTemplateCatalog> | Partial<AutomationTemplateSnapshot> | undefined
): AutomationTemplateCatalog {
  try {
    if (!parsed || typeof parsed !== "object") {
      return { templates: [] };
    }

    // New schema: catalog with templates[] + activeTemplateId
    if (Array.isArray((parsed as Partial<AutomationTemplateCatalog>).templates)) {
      const templates = (parsed as Partial<AutomationTemplateCatalog>).templates || [];
      const normalized = templates
        .map((item) => {
          if (!item || typeof item !== "object") {
            return undefined;
          }
          const snapshot = normalizeSnapshot(item as Partial<AutomationTemplateSnapshot>);
          if (!snapshot) {
            return undefined;
          }
          const id =
            typeof (item as { id?: unknown }).id === "string" &&
            String((item as { id?: unknown }).id).trim()
              ? String((item as { id?: unknown }).id).trim()
              : randomUUID();
          return {
            id,
            ...snapshot
          } satisfies AutomationTemplateEntry;
        })
        .filter((item): item is AutomationTemplateEntry => Boolean(item));
      const sorted = sortByUpdatedAtDesc(normalized);
      const activeTemplateIdRaw = (parsed as Partial<AutomationTemplateCatalog>).activeTemplateId;
      const activeTemplateId =
        typeof activeTemplateIdRaw === "string" && sorted.some((item) => item.id === activeTemplateIdRaw)
          ? activeTemplateIdRaw
          : sorted[0]?.id;
      return {
        activeTemplateId,
        templates: sorted
      };
    }

    // Legacy schema: single snapshot object
    const legacy = normalizeSnapshot(parsed as Partial<AutomationTemplateSnapshot>);
    if (!legacy) {
      return { templates: [] };
    }
    const entry: AutomationTemplateEntry = {
      id: randomUUID(),
      ...legacy
    };
    return {
      activeTemplateId: entry.id,
      templates: [entry]
    };
  } catch {
    return { templates: [] };
  }
}

async function readCatalogFromFile(): Promise<AutomationTemplateCatalog> {
  const automationTemplateFile = resolveAutomationTemplateFile();
  await ensureAutomationTemplateFile();
  const raw = await fs.readFile(automationTemplateFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as
      | Partial<AutomationTemplateCatalog>
      | Partial<AutomationTemplateSnapshot>;
    return normalizeCatalog(parsed);
  } catch {
    return { templates: [] };
  }
}

async function readCatalog(userId?: string): Promise<AutomationTemplateCatalog> {
  if (userId && prisma) {
    const row = await prisma.userAutomationTemplateCatalog.findUnique({
      where: { userId }
    });
    const parsed = row?.data as
      | Partial<AutomationTemplateCatalog>
      | Partial<AutomationTemplateSnapshot>
      | undefined;
    const normalized = normalizeCatalog(parsed);
    if (normalized.templates.length > 0) {
      return normalized;
    }
    // First-login fallback: surface existing local template file until user saves to DB.
    return readCatalogFromFile();
  }

  return readCatalogFromFile();
}

async function writeCatalog(catalog: AutomationTemplateCatalog, userId?: string): Promise<void> {
  const automationTemplateFile = resolveAutomationTemplateFile();
  const templates = sortByUpdatedAtDesc(catalog.templates);
  const activeTemplateId =
    catalog.activeTemplateId && templates.some((item) => item.id === catalog.activeTemplateId)
      ? catalog.activeTemplateId
      : templates[0]?.id;

  if (userId && prisma) {
    const data = {
      activeTemplateId,
      templates
    } satisfies AutomationTemplateCatalog;
    await prisma.userAutomationTemplateCatalog.upsert({
      where: { userId },
      update: { data: data as unknown as Prisma.InputJsonValue },
      create: { userId, data: data as unknown as Prisma.InputJsonValue }
    });
    return;
  }

  await ensureAutomationTemplateFile();
  await fs.writeFile(
    automationTemplateFile,
    JSON.stringify(
      {
        activeTemplateId,
        templates
      } satisfies AutomationTemplateCatalog,
      null,
      2
    ),
    "utf8"
  );
}

export async function listAutomationTemplates(userId?: string): Promise<{
  activeTemplateId?: string;
  templates: AutomationTemplateEntry[];
}> {
  const catalog = await readCatalog(userId);
  return {
    activeTemplateId: catalog.activeTemplateId,
    templates: catalog.templates
  };
}

export async function getAutomationTemplateEntryById(
  templateId: string,
  userId?: string
): Promise<AutomationTemplateEntry | undefined> {
  const catalog = await readCatalog(userId);
  return catalog.templates.find((item) => item.id === templateId);
}

export async function setActiveAutomationTemplate(
  templateId: string,
  userId?: string
): Promise<AutomationTemplateSnapshot | undefined> {
  const catalog = await readCatalog(userId);
  if (!catalog.templates.some((item) => item.id === templateId)) {
    throw new Error("Selected template was not found.");
  }
  await writeCatalog({
    ...catalog,
    activeTemplateId: templateId
  }, userId);
  const selected = catalog.templates.find((item) => item.id === templateId);
  if (!selected) {
    return undefined;
  }
  return {
    renderOptions: selected.renderOptions,
    imageStyle: selected.imageStyle,
    sourceTitle: selected.sourceTitle,
    sourceTopic: selected.sourceTopic,
    templateName: selected.templateName,
    voice: selected.voice,
    voiceSpeed: selected.voiceSpeed,
    updatedAt: selected.updatedAt
  };
}

export async function deleteAutomationTemplate(templateId: string, userId?: string): Promise<{
  activeTemplateId?: string;
  templates: AutomationTemplateEntry[];
}> {
  const catalog = await readCatalog(userId);
  const next = catalog.templates.filter((item) => item.id !== templateId);
  await writeCatalog({
    activeTemplateId: catalog.activeTemplateId,
    templates: next
  }, userId);
  return listAutomationTemplates(userId);
}

export async function updateAutomationTemplate(args: {
  templateId: string;
  renderOptions: RenderOptions;
  imageStyle?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  templateName?: string;
  voice?: string;
  voiceSpeed?: number;
  userId?: string;
}): Promise<AutomationTemplateSnapshot> {
  const catalog = await readCatalog(args.userId);
  const index = catalog.templates.findIndex((item) => item.id === args.templateId);
  if (index < 0) {
    throw new Error("Selected template was not found.");
  }

  const prev = catalog.templates[index];
  const updated: AutomationTemplateEntry = {
    id: prev.id,
    renderOptions: args.renderOptions,
    imageStyle: args.imageStyle?.trim() || prev.imageStyle,
    sourceTitle: args.sourceTitle,
    sourceTopic: args.sourceTopic,
    templateName: args.templateName || prev.templateName,
    voice: args.voice?.trim().toLowerCase() || prev.voice,
    voiceSpeed:
      Number.isFinite(Number(args.voiceSpeed))
        ? Math.max(0.5, Math.min(2, Number(args.voiceSpeed)))
        : prev.voiceSpeed,
    updatedAt: new Date().toISOString()
  };

  const nextTemplates = [...catalog.templates];
  nextTemplates[index] = updated;
  await writeCatalog({
    activeTemplateId: catalog.activeTemplateId || updated.id,
    templates: nextTemplates
  }, args.userId);

  return {
    renderOptions: updated.renderOptions,
    imageStyle: updated.imageStyle,
    sourceTitle: updated.sourceTitle,
    sourceTopic: updated.sourceTopic,
    templateName: updated.templateName,
    voice: updated.voice,
    voiceSpeed: updated.voiceSpeed,
    updatedAt: updated.updatedAt
  };
}

export async function getAutomationTemplateSnapshot(
  userId?: string
): Promise<AutomationTemplateSnapshot | undefined> {
  const catalog = await readCatalog(userId);
  if (catalog.templates.length === 0) {
    return undefined;
  }
  const active =
    catalog.templates.find((item) => item.id === catalog.activeTemplateId) ||
    catalog.templates[0];
  if (!active) {
    return undefined;
  }
  return {
    renderOptions: active.renderOptions,
    imageStyle: active.imageStyle,
    sourceTitle: active.sourceTitle,
    sourceTopic: active.sourceTopic,
    templateName: active.templateName,
    voice: active.voice,
    voiceSpeed: active.voiceSpeed,
    updatedAt: active.updatedAt
  };
}

export async function saveAutomationTemplateSnapshot(
  value: Omit<AutomationTemplateSnapshot, "updatedAt"> & {
    updatedAt?: string;
    userId?: string;
  }
): Promise<AutomationTemplateSnapshot> {
  const catalog = await readCatalog(value.userId);
  const entry: AutomationTemplateEntry = {
    id: randomUUID(),
    renderOptions: value.renderOptions,
    imageStyle: value.imageStyle?.trim() || undefined,
    sourceTitle: value.sourceTitle,
    sourceTopic: value.sourceTopic,
    templateName: value.templateName,
    voice: value.voice?.trim().toLowerCase() || undefined,
    voiceSpeed:
      Number.isFinite(Number(value.voiceSpeed))
        ? Math.max(0.5, Math.min(2, Number(value.voiceSpeed)))
        : undefined,
    updatedAt: value.updatedAt || new Date().toISOString()
  };
  const nextTemplates = sortByUpdatedAtDesc([entry, ...catalog.templates]).slice(0, 100);
  await writeCatalog({
    activeTemplateId: entry.id,
    templates: nextTemplates
  }, value.userId);

  const snapshot: AutomationTemplateSnapshot = {
    renderOptions: entry.renderOptions,
    imageStyle: entry.imageStyle,
    sourceTitle: entry.sourceTitle,
    sourceTopic: entry.sourceTopic,
    templateName: entry.templateName,
    voice: entry.voice,
    voiceSpeed: entry.voiceSpeed,
    updatedAt: entry.updatedAt
  };
  return snapshot;
}
