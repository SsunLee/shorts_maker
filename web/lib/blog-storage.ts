export const BLOG_TEMPLATE_STORAGE_KEY = "shorts-maker:blog-templates:v1";
export const BLOG_ACTIVE_TEMPLATE_KEY = "shorts-maker:blog-active-template-id:v1";
export const BLOG_WRITE_DRAFT_KEY = "shorts-maker:blog-write-draft:v1";
export const BLOG_IDEAS_STORAGE_KEY = "shorts-maker:blog-ideas:v1";
export const BLOG_STOCK_QUEUE_STORAGE_KEY = "shorts-maker:blog-stock-queue:v1";
export const BLOG_STOCK_QUEUE_SELECTED_KEY = "shorts-maker:blog-stock-queue-selected-id:v1";
export const BLOG_IDEA_FONT_STORAGE_KEY = "shorts-maker:blog-idea-font:v1";
export const BLOG_TISTORY_WRITE_URL_KEY = "shorts-maker:blog-tistory-write-url:v1";
export const BLOG_TISTORY_AUTOMATION_MODE_KEY = "shorts-maker:blog-tistory-automation-mode:v1";
export const LEGACY_BLOG_TEMPLATE_NOTICE = "이것은 템플릿 모드입니다.";

export type BlogTemplate = {
  id: string;
  name: string;
  category: string;
  titleTemplate: string;
  bodyTemplate: string;
  updatedAt: string;
};

export type BlogWriteSource = {
  title: string;
  summary: string;
  detail: string;
  source: string;
  link: string;
  publishedAt: string;
};

export type BlogWriteDraft = {
  templateId?: string;
  source?: BlogWriteSource;
  title: string;
  body: string;
  tags?: string;
  createdAt: string;
};

export type BlogIdeaKind = "keyword" | "stock";

export type BlogIdeaStatus = "generated" | "sent_to_write" | "done" | "skipped";

export type BlogStockMarket = "KOSPI" | "KOSDAQ" | "OTHER";

export type BlogStockQueueStatus = "queued" | "idea_generated" | "sent_to_write" | "done" | "skipped";
export type BlogTistoryAutomationMode = "prepare" | "save-draft" | "publish";

export type BlogStockQueueItem = {
  id: string;
  market: BlogStockMarket;
  rank?: number;
  code?: string;
  name: string;
  keyword?: string;
  status: BlogStockQueueStatus;
  lastIdeaId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BlogIdea = {
  id: string;
  kind: BlogIdeaKind;
  status: BlogIdeaStatus;
  title: string;
  topic: string;
  summary: string;
  markdown: string;
  fontFamily?: string;
  imagePrompt?: string;
  hashtags: string[];
  sourceLabel?: string;
  stock?: {
    code?: string;
    market?: BlogStockMarket;
    name?: string;
    rank?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type BlogIdeaStorageWriteResult = {
  compacted: boolean;
  ok: boolean;
  pruned: boolean;
};

export const DEFAULT_BLOG_TEMPLATES: BlogTemplate[] = [
  {
    id: "default-news",
    name: "뉴스",
    category: "뉴스",
    titleTemplate: "{{title}}",
    bodyTemplate:
      "{{title}}\n\n{{summary}}\n\n핵심 내용\n{{detail}}\n\n출처: {{source}}\n원문: {{link}}",
    updatedAt: "default"
  },
  {
    id: "default-daily",
    name: "일상",
    category: "일상",
    titleTemplate: "{{title}}",
    bodyTemplate:
      "{{title}}\n\n오늘의 기록\n{{summary}}\n\n생각 정리\n{{detail}}",
    updatedAt: "default"
  }
];

export function createBlogId(prefix = "blog"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function materializeBlogTemplateText(
  templateText: string,
  source: BlogWriteSource | undefined
): string {
  const values: Record<string, string> = {
    title: source?.title || "",
    summary: source?.summary || "",
    detail: source?.detail || "",
    source: source?.source || "",
    link: source?.link || "",
    date: source?.publishedAt || "",
    publishedAt: source?.publishedAt || ""
  };
  return String(templateText || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}

export function stripLegacyBlogTemplateNotice(value: string): string {
  return String(value || "")
    .replace(/^\s*이것은 템플릿 모드입니다\.\s*/u, "")
    .replace(/^\n+/, "");
}

function compactFinishedBlogIdea(idea: BlogIdea): BlogIdea {
  if (idea.status !== "done" && idea.status !== "skipped") {
    return idea;
  }
  return {
    ...idea,
    imagePrompt: idea.imagePrompt ? idea.imagePrompt.slice(0, 800) : idea.imagePrompt,
    markdown: "",
    summary: idea.summary ? idea.summary.slice(0, 500) : idea.summary
  };
}

function tryWriteLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function writeBlogIdeasToStorage(items: BlogIdea[]): BlogIdeaStorageWriteResult {
  if (tryWriteLocalStorage(BLOG_IDEAS_STORAGE_KEY, JSON.stringify(items))) {
    return { compacted: false, ok: true, pruned: false };
  }

  const compacted = items.map(compactFinishedBlogIdea);
  if (tryWriteLocalStorage(BLOG_IDEAS_STORAGE_KEY, JSON.stringify(compacted))) {
    return { compacted: true, ok: true, pruned: false };
  }

  let archivedCount = 0;
  const pruned = compacted.filter((idea) => {
    if (idea.status !== "done" && idea.status !== "skipped") {
      return true;
    }
    archivedCount += 1;
    return archivedCount <= 80;
  });
  if (tryWriteLocalStorage(BLOG_IDEAS_STORAGE_KEY, JSON.stringify(pruned))) {
    return { compacted: true, ok: true, pruned: true };
  }

  return { compacted: true, ok: false, pruned: true };
}

export function isPreferredStockName(value: string | undefined): boolean {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!normalized) {
    return false;
  }
  return /우선주$/.test(normalized) || /(?:\d+)?우[BC]?$/.test(normalized);
}

export function isPreferredStockQueueItem(item: Pick<BlogStockQueueItem, "keyword" | "name">): boolean {
  return isPreferredStockName(item.name) || isPreferredStockName(item.keyword);
}
