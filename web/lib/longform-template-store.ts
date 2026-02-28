import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "node:crypto";

export interface LongformTemplateTrack {
  type: "video" | "audio" | "text" | "effect";
  start: number;
  duration: number;
  label?: string;
  text?: string;
  animation?: "none" | "fade" | "slide" | "scale" | "bounce";
  style?: {
    fontSize?: number;
    color?: string;
    x?: number;
    y?: number;
    rotation?: number;
    scale?: number;
  };
}

export interface LongformTemplatePayload {
  tracks: LongformTemplateTrack[];
}

export interface LongformTemplateEntry {
  id: string;
  name: string;
  category: string;
  previewLabel?: string;
  payload: LongformTemplatePayload;
  createdAt: string;
  updatedAt: string;
}

interface CatalogShape {
  templates: LongformTemplateEntry[];
}

function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function resolveLongformTemplateFile(): string {
  const explicit = (process.env.LONGFORM_TEMPLATE_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }
  const namespace = (process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || "").trim();
  if (namespace) {
    return path.join(process.cwd(), "data", `longform-templates.${sanitizeNamespace(namespace)}.json`);
  }
  return path.join(process.cwd(), "data", "longform-templates.json");
}

function defaultTemplates(): LongformTemplateEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: "market-news-flash",
      name: "뉴스 플래시",
      category: "정보형",
      previewLabel: "빠른 정보 전달",
      createdAt: now,
      updatedAt: now,
      payload: {
        tracks: [
          {
            type: "text",
            start: 0,
            duration: 3,
            text: "{{title}}",
            animation: "slide",
            style: { fontSize: 60, color: "#FFFFFF", x: 50, y: 16, scale: 1, rotation: 0 }
          },
          {
            type: "text",
            start: 3,
            duration: 4,
            text: "{{topic}}",
            animation: "fade",
            style: { fontSize: 40, color: "#FFF200", x: 50, y: 30, scale: 1, rotation: 0 }
          }
        ]
      }
    },
    {
      id: "market-story-hook",
      name: "스토리 훅",
      category: "스토리형",
      previewLabel: "강한 도입 문구",
      createdAt: now,
      updatedAt: now,
      payload: {
        tracks: [
          {
            type: "text",
            start: 0,
            duration: 2.5,
            text: "잠깐, 이거 알고 있었나요?",
            animation: "bounce",
            style: { fontSize: 52, color: "#FFFFFF", x: 50, y: 18, scale: 1.05, rotation: 0 }
          },
          {
            type: "text",
            start: 2.5,
            duration: 4.5,
            text: "{{title}}",
            animation: "scale",
            style: { fontSize: 58, color: "#FFF200", x: 50, y: 27, scale: 1, rotation: 0 }
          }
        ]
      }
    },
    {
      id: "market-clean-education",
      name: "클린 교육형",
      category: "교육형",
      previewLabel: "자막 강조형",
      createdAt: now,
      updatedAt: now,
      payload: {
        tracks: [
          {
            type: "text",
            start: 0,
            duration: 3.2,
            text: "{{title}}",
            animation: "fade",
            style: { fontSize: 54, color: "#FFFFFF", x: 50, y: 14, scale: 1, rotation: 0 }
          },
          {
            type: "effect",
            start: 0,
            duration: 6,
            label: "Glow Overlay",
            animation: "none",
            style: { scale: 1, rotation: 0, x: 50, y: 50 }
          }
        ]
      }
    }
  ];
}

async function ensureFile(): Promise<void> {
  const file = resolveLongformTemplateFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    const shape: CatalogShape = {
      templates: defaultTemplates()
    };
    await fs.writeFile(file, JSON.stringify(shape, null, 2), "utf8");
  }
}

async function readCatalog(): Promise<CatalogShape> {
  const file = resolveLongformTemplateFile();
  await ensureFile();
  const raw = await fs.readFile(file, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogShape>;
    if (!parsed || !Array.isArray(parsed.templates)) {
      return { templates: defaultTemplates() };
    }
    return {
      templates: parsed.templates
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          ...item,
          id: String(item.id || randomUUID()),
          name: String(item.name || "Untitled Template"),
          category: String(item.category || "기타"),
          payload:
            item.payload && Array.isArray(item.payload.tracks)
              ? item.payload
              : {
                  tracks: []
                },
          createdAt: String(item.createdAt || new Date().toISOString()),
          updatedAt: String(item.updatedAt || new Date().toISOString())
        }))
    };
  } catch {
    return { templates: defaultTemplates() };
  }
}

async function writeCatalog(catalog: CatalogShape): Promise<void> {
  const file = resolveLongformTemplateFile();
  await ensureFile();
  const sorted = [...catalog.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await fs.writeFile(file, JSON.stringify({ templates: sorted } satisfies CatalogShape, null, 2), "utf8");
}

export async function listLongformTemplates(): Promise<LongformTemplateEntry[]> {
  const catalog = await readCatalog();
  return [...catalog.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveLongformTemplate(args: {
  name: string;
  category: string;
  previewLabel?: string;
  payload: LongformTemplatePayload;
}): Promise<LongformTemplateEntry> {
  const catalog = await readCatalog();
  const now = new Date().toISOString();
  const entry: LongformTemplateEntry = {
    id: randomUUID(),
    name: args.name.trim() || `Template ${new Date().toLocaleString()}`,
    category: args.category.trim() || "기타",
    previewLabel: args.previewLabel?.trim() || undefined,
    payload: args.payload,
    createdAt: now,
    updatedAt: now
  };
  await writeCatalog({
    templates: [entry, ...catalog.templates].slice(0, 200)
  });
  return entry;
}

export async function updateLongformTemplate(args: {
  id: string;
  name?: string;
  category?: string;
  previewLabel?: string;
  payload: LongformTemplatePayload;
}): Promise<LongformTemplateEntry> {
  const catalog = await readCatalog();
  const index = catalog.templates.findIndex((item) => item.id === args.id);
  if (index < 0) {
    throw new Error("Template not found.");
  }
  const prev = catalog.templates[index];
  const updated: LongformTemplateEntry = {
    ...prev,
    name: args.name?.trim() || prev.name,
    category: args.category?.trim() || prev.category,
    previewLabel: args.previewLabel?.trim() || prev.previewLabel,
    payload: args.payload,
    updatedAt: new Date().toISOString()
  };
  const next = [...catalog.templates];
  next[index] = updated;
  await writeCatalog({ templates: next });
  return updated;
}

export async function deleteLongformTemplate(id: string): Promise<void> {
  const catalog = await readCatalog();
  await writeCatalog({
    templates: catalog.templates.filter((item) => item.id !== id)
  });
}

