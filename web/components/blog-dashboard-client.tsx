"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bot, CalendarClock, FileText, ListChecks, Loader2, PenLine, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BLOG_ACTIVE_TEMPLATE_KEY,
  BLOG_IDEAS_STORAGE_KEY,
  BLOG_STOCK_QUEUE_STORAGE_KEY,
  BLOG_TEMPLATE_STORAGE_KEY,
  BLOG_TISTORY_AUTOMATION_MODE_KEY,
  BLOG_TISTORY_WRITE_URL_KEY,
  BLOG_WRITE_DRAFT_KEY,
  DEFAULT_BLOG_TEMPLATES,
  createBlogId,
  isPreferredStockQueueItem,
  materializeBlogTemplateText,
  stripLegacyBlogTemplateNotice,
  type BlogIdea,
  type BlogStockMarket,
  type BlogStockQueueItem,
  type BlogStockQueueStatus,
  type BlogTemplate,
  type BlogTistoryAutomationMode,
  type BlogWriteSource,
  type BlogWriteDraft
} from "@/lib/blog-storage";

type TistoryAutomationLog = {
  at: string;
  message: string;
};

type TistoryAutomationStatus = {
  logs?: TistoryAutomationLog[];
  message?: string;
  startedAt?: string;
  state?: "idle" | "running" | "success" | "error";
  step?: string;
  updatedAt?: string;
};

type GeneratedBlogIdeaResponse = {
  error?: string;
  hashtags?: unknown;
  markdown?: string;
  model?: string;
  provider?: string;
  summary?: string;
  title?: string;
};

type PendingTistoryBatch = {
  expectedCount: number;
  ids: string[];
  mode: BlogTistoryAutomationMode;
  startedAt: string;
};

type StockBatchMarketFilter = "all" | BlogStockMarket;
type StockBatchStatusFilter = "all" | BlogStockQueueStatus;

const BLOG_TISTORY_PENDING_BATCH_KEY = "shorts-maker:blog-tistory-pending-batch:v1";
const BLOG_TISTORY_FINALIZED_STATUS_KEY = "shorts-maker:blog-tistory-finalized-status:v1";
const STOCK_BATCH_RETRY_DELAYS_MS = [2500, 6000, 12000];
const STOCK_BATCH_STATUS_LABELS: Record<BlogStockQueueStatus, string> = {
  done: "완료",
  idea_generated: "초안 생성",
  queued: "대기",
  sent_to_write: "글작성",
  skipped: "제외"
};

function readArray<T>(key: string, fallback: T[] = []): T[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]") as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeArray<T>(key: string, items: T[]): void {
  window.localStorage.setItem(key, JSON.stringify(items));
}

function readPendingTistoryBatch(): PendingTistoryBatch | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOG_TISTORY_PENDING_BATCH_KEY) || "{}") as Partial<PendingTistoryBatch>;
    const mode = String(parsed.mode || "");
    return Array.isArray(parsed.ids) && parsed.ids.length > 0 && isTistoryMode(mode)
      ? {
          expectedCount: Math.max(1, Number(parsed.expectedCount) || parsed.ids.length),
          ids: parsed.ids.map(String),
          mode,
          startedAt: String(parsed.startedAt || "")
        }
      : undefined;
  } catch {
    return undefined;
  }
}

function writePendingTistoryBatch(batch: PendingTistoryBatch): void {
  window.localStorage.setItem(BLOG_TISTORY_PENDING_BATCH_KEY, JSON.stringify(batch));
}

function clearPendingTistoryBatch(): void {
  window.localStorage.removeItem(BLOG_TISTORY_PENDING_BATCH_KEY);
}

function getTistorySuccessFingerprint(status: TistoryAutomationStatus): string {
  return [status.startedAt || "", status.step || "", status.message || ""].join("|");
}

function readDraft(): Partial<BlogWriteDraft> | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOG_WRITE_DRAFT_KEY) || "{}") as Partial<BlogWriteDraft>;
    return parsed && typeof parsed === "object"
      ? { ...parsed, body: stripLegacyBlogTemplateNotice(String(parsed.body || "")) }
      : undefined;
  } catch {
    return undefined;
  }
}

function isTistoryMode(value: string | null): value is BlogTistoryAutomationMode {
  return value === "prepare" || value === "save-draft" || value === "publish";
}

function stockLabel(item: BlogStockQueueItem): string {
  return [
    item.market,
    typeof item.rank === "number" ? `${item.rank}위` : "",
    item.name,
    item.code ? `(${item.code})` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function sortStockQueue(items: BlogStockQueueItem[]): BlogStockQueueItem[] {
  const marketOrder: Record<BlogStockMarket, number> = {
    KOSPI: 0,
    KOSDAQ: 1,
    OTHER: 2
  };
  return [...items].sort((a, b) => {
    const market = (marketOrder[a.market] ?? 99) - (marketOrder[b.market] ?? 99);
    if (market !== 0) return market;
    const ar = typeof a.rank === "number" ? a.rank : Number.MAX_SAFE_INTEGER;
    const br = typeof b.rank === "number" ? b.rank : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name, "ko");
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function stringifyBlogIdeaError(payload: GeneratedBlogIdeaResponse, httpStatus: number, fallback: string): string {
  const raw = String(payload.error || fallback || "").trim();
  if (!raw) {
    return httpStatus ? `HTTP ${httpStatus} 응답으로 생성에 실패했습니다.` : "초안 생성에 실패했습니다.";
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        code?: number | string;
        message?: string;
        status?: string;
      };
    };
    if (parsed.error?.message) {
      const code = parsed.error.status || parsed.error.code || httpStatus || "";
      return code ? `[${code}] ${parsed.error.message}` : parsed.error.message;
    }
  } catch {
    // Not a JSON encoded provider error.
  }

  return raw;
}

function isTransientBlogIdeaError(httpStatus: number, message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    httpStatus === 408 ||
    httpStatus === 429 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504 ||
    normalized.includes("high demand") ||
    normalized.includes("try again later") ||
    normalized.includes("temporar") ||
    normalized.includes("unavailable") ||
    normalized.includes("overload") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout")
  );
}

function summarizeStockBatchFailures(failures: string[]): string {
  const visible = failures.slice(0, 3).join(" / ");
  return failures.length > 3 ? `${visible} 외 ${failures.length - 3}개` : visible;
}

function normalizeHashtags(value: unknown, fallback: string): string[] {
  const raw = Array.isArray(value)
    ? value.map(String)
    : String(value || fallback)
        .split(/[\s,]+/)
        .map(String);
  return Array.from(
    new Set(
      raw
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`))
        .map((item) => item.replace(/\s+/g, ""))
    )
  ).slice(0, 18);
}

function stripMarkdownForPrompt(value: string): string {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/[#>*_`|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRepresentativeImagePrompt(idea: BlogIdea): string {
  const content = stripMarkdownForPrompt([idea.title, idea.summary, idea.markdown].filter(Boolean).join("\n\n")).slice(0, 1800);
  return [
    "Financial blog cover image for Korean stock analysis, realistic editorial business mood, charts or office context allowed but no readable text.",
    `Article topic: ${idea.topic || idea.title}.`,
    content,
    "Make the scene specific to the article content. Avoid generic stock-photo feeling."
  ]
    .filter(Boolean)
    .join("\n");
}

function getActiveTemplate(templates: BlogTemplate[]): BlogTemplate {
  const activeId = window.localStorage.getItem(BLOG_ACTIVE_TEMPLATE_KEY);
  return templates.find((item) => item.id === activeId) || templates[0] || DEFAULT_BLOG_TEMPLATES[0];
}

function buildSourceFromIdea(idea: BlogIdea): BlogWriteSource {
  return {
    title: idea.title,
    summary: idea.summary || idea.topic,
    detail: idea.markdown,
    source: "블로그 종목 큐",
    link: "",
    publishedAt: new Date(idea.createdAt).toLocaleString("ko-KR")
  };
}

function buildDraftFromIdea(idea: BlogIdea, templates: BlogTemplate[]): BlogWriteDraft {
  const template = getActiveTemplate(templates);
  const source = buildSourceFromIdea(idea);
  const title = materializeBlogTemplateText(template.titleTemplate, source).trim() || idea.title;
  const body = stripLegacyBlogTemplateNotice(materializeBlogTemplateText(template.bodyTemplate, source)).trim() || idea.markdown;
  return {
    templateId: template.id,
    source,
    title,
    body,
    tags: idea.hashtags.join(" "),
    createdAt: new Date().toISOString()
  };
}

function extractCompletedTistoryCount(status: TistoryAutomationStatus): number | undefined {
  const text = [status.message || "", ...(status.logs || []).map((log) => log.message)].join("\n");
  const matched = text.match(/티스토리\s+자동화\s+(\d+)건\s+처리가\s+완료|(\d+)건\s+처리가\s+완료|(\d+)건\s+처리\s+완료/);
  const raw = matched?.[1] || matched?.[2] || matched?.[3];
  const count = Number.parseInt(raw || "", 10);
  return Number.isFinite(count) && count > 0 ? count : undefined;
}

export function BlogDashboardClient(): React.JSX.Element {
  const [templates, setTemplates] = useState<BlogTemplate[]>(DEFAULT_BLOG_TEMPLATES);
  const [ideas, setIdeas] = useState<BlogIdea[]>([]);
  const [queue, setQueue] = useState<BlogStockQueueItem[]>([]);
  const [draft, setDraft] = useState<Partial<BlogWriteDraft> | undefined>();
  const [tistoryUrl, setTistoryUrl] = useState("");
  const [tistoryMode, setTistoryMode] = useState<BlogTistoryAutomationMode>("prepare");
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationStatus, setAutomationStatus] = useState<TistoryAutomationStatus>({ state: "idle", message: "실행 이력이 없습니다." });
  const [stockBatchBusy, setStockBatchBusy] = useState(false);
  const [stockBatchCount, setStockBatchCount] = useState("1");
  const [stockBatchMessage, setStockBatchMessage] = useState("");
  const [stockBatchMarketFilter, setStockBatchMarketFilter] = useState<StockBatchMarketFilter>("all");
  const [stockBatchExcludePreferred, setStockBatchExcludePreferred] = useState(true);
  const [stockBatchRankFrom, setStockBatchRankFrom] = useState("");
  const [stockBatchRankTo, setStockBatchRankTo] = useState("");
  const [stockBatchSearch, setStockBatchSearch] = useState("");
  const [stockBatchSelectedIds, setStockBatchSelectedIds] = useState<string[]>([]);
  const [stockBatchStatusFilter, setStockBatchStatusFilter] = useState<StockBatchStatusFilter>("queued");
  const [stockBatchTone, setStockBatchTone] = useState("차분하고 신뢰감 있는 정보성 블로그 글");
  const [tistoryBatchCount, setTistoryBatchCount] = useState("1");
  const [tistoryBatchMessage, setTistoryBatchMessage] = useState("");
  const [tistoryBatchSelectedIds, setTistoryBatchSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setTemplates(readArray<BlogTemplate>(BLOG_TEMPLATE_STORAGE_KEY, DEFAULT_BLOG_TEMPLATES));
    setIdeas(readArray<BlogIdea>(BLOG_IDEAS_STORAGE_KEY, []));
    setQueue(readArray<BlogStockQueueItem>(BLOG_STOCK_QUEUE_STORAGE_KEY, []));
    setDraft(readDraft());
    setTistoryUrl(window.localStorage.getItem(BLOG_TISTORY_WRITE_URL_KEY) || "");
    const savedMode = window.localStorage.getItem(BLOG_TISTORY_AUTOMATION_MODE_KEY);
    setTistoryMode(isTistoryMode(savedMode) ? savedMode : "prepare");
    void refreshAutomationStatus();
  }, []);

  useEffect(() => {
    if (automationStatus.state !== "running") {
      return;
    }
    const interval = window.setInterval(() => void refreshAutomationStatus(), 1800);
    return () => window.clearInterval(interval);
  }, [automationStatus.state]);

  const stats = useMemo(() => {
    const queued = queue.filter((item) => item.status === "queued").length;
    const done = queue.filter((item) => item.status === "done").length;
    const generatedIdeas = ideas.filter((item) => item.status === "generated").length;
    const sentIdeas = ideas.filter((item) => item.status === "sent_to_write").length;
    return {
      done,
      generatedIdeas,
      queued,
      sentIdeas,
      totalIdeas: ideas.length,
      totalQueue: queue.length
    };
  }, [ideas, queue]);

  const stockBatchVisibleStocks = useMemo(() => {
    const query = stockBatchSearch.trim().toLowerCase();
    const rankFrom = Number.parseInt(stockBatchRankFrom, 10);
    const rankTo = Number.parseInt(stockBatchRankTo, 10);
    const hasRankFrom = Number.isFinite(rankFrom);
    const hasRankTo = Number.isFinite(rankTo);
    return sortStockQueue(
      queue.filter((item) => {
        if (stockBatchMarketFilter !== "all" && item.market !== stockBatchMarketFilter) {
          return false;
        }
        if (stockBatchStatusFilter !== "all" && item.status !== stockBatchStatusFilter) {
          return false;
        }
        if (stockBatchExcludePreferred && isPreferredStockQueueItem(item)) {
          return false;
        }
        if (hasRankFrom && (typeof item.rank !== "number" || item.rank < rankFrom)) {
          return false;
        }
        if (hasRankTo && (typeof item.rank !== "number" || item.rank > rankTo)) {
          return false;
        }
        if (query) {
          const haystack = [item.market, item.rank, item.code, item.name, item.keyword, STOCK_BATCH_STATUS_LABELS[item.status]]
            .filter((value) => value !== undefined && value !== null)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        }
        return true;
      })
    );
  }, [
    queue,
    stockBatchExcludePreferred,
    stockBatchMarketFilter,
    stockBatchRankFrom,
    stockBatchRankTo,
    stockBatchSearch,
    stockBatchStatusFilter
  ]);

  const stockBatchSelectableStocks = useMemo(
    () => stockBatchVisibleStocks.filter((item) => item.status === "queued"),
    [stockBatchVisibleStocks]
  );

  useEffect(() => {
    const selectableIds = new Set(stockBatchSelectableStocks.map((item) => item.id));
    setStockBatchSelectedIds((current) => current.filter((id) => selectableIds.has(id)));
  }, [stockBatchSelectableStocks]);

  const stockBatchTargets = useMemo(() => {
    const selected = stockBatchSelectableStocks.filter((item) => stockBatchSelectedIds.includes(item.id));
    if (selected.length > 0) {
      return selected;
    }
    const limit = Math.max(1, Math.min(20, Number.parseInt(stockBatchCount, 10) || 1));
    return stockBatchSelectableStocks.slice(0, limit);
  }, [stockBatchSelectableStocks, stockBatchCount, stockBatchSelectedIds]);

  const tistoryUploadableIdeas = useMemo(
    () => ideas.filter((idea) => idea.status !== "done" && idea.markdown.trim().length > 0).slice(0, 30),
    [ideas]
  );

  const tistoryBatchIdeas = useMemo(
    () => tistoryUploadableIdeas.filter((idea) => tistoryBatchSelectedIds.includes(idea.id)),
    [tistoryUploadableIdeas, tistoryBatchSelectedIds]
  );

  async function refreshAutomationStatus(): Promise<void> {
    try {
      const response = await fetch("/api/blog/tistory/automation/status", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as TistoryAutomationStatus;
      setAutomationStatus(payload);
      finalizeCompletedTistoryBatch(payload);
    } catch {
      setAutomationStatus({ state: "error", message: "자동화 상태를 가져오지 못했습니다." });
    }
  }

  async function startTistoryAutomation(): Promise<void> {
    if (!draft?.title || !draft?.body) {
      setAutomationStatus({ state: "error", message: "작성 Draft가 없습니다. 글작성 화면에서 본문을 먼저 준비해 주세요." });
      return;
    }
    if (!tistoryUrl.trim()) {
      setAutomationStatus({ state: "error", message: "티스토리 글쓰기 URL을 입력해 주세요." });
      return;
    }
    setAutomationBusy(true);
    window.localStorage.setItem(BLOG_TISTORY_WRITE_URL_KEY, tistoryUrl.trim());
    window.localStorage.setItem(BLOG_TISTORY_AUTOMATION_MODE_KEY, tistoryMode);
    try {
      const response = await fetch("/api/blog/tistory/automation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: stripLegacyBlogTemplateNotice(draft.body),
          category: "주식",
          mode: tistoryMode,
          tags: draft.tags || "",
          title: draft.title,
          writeUrl: tistoryUrl.trim()
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; status?: TistoryAutomationStatus };
      if (!response.ok) {
        throw new Error(payload.error || "티스토리 자동화 시작에 실패했습니다.");
      }
      setAutomationStatus(payload.status || { state: "running", message: "티스토리 자동화를 시작했습니다." });
    } catch (error) {
      setAutomationStatus({ state: "error", message: error instanceof Error ? error.message : "티스토리 자동화 시작에 실패했습니다." });
    } finally {
      setAutomationBusy(false);
    }
  }

  async function startTistoryBatchAutomation(): Promise<void> {
    if (tistoryBatchIdeas.length === 0) {
      setTistoryBatchMessage("연속 업로드할 아이디어를 선택해 주세요.");
      return;
    }
    if (!tistoryUrl.trim()) {
      setTistoryBatchMessage("티스토리 글쓰기 URL을 입력해 주세요.");
      return;
    }
    if (tistoryBatchIdeas.length > 1 && tistoryMode === "prepare") {
      setTistoryBatchMessage("다건 연속 자동화는 입력 후 검수 모드로 사용할 수 없습니다. 임시저장 또는 공개 발행까지를 선택해 주세요.");
      return;
    }

    const posts = tistoryBatchIdeas.map((idea) => {
      const nextDraft = buildDraftFromIdea(idea, templates);
      return {
        body: stripLegacyBlogTemplateNotice(nextDraft.body),
        category: "주식",
        tags: nextDraft.tags || "",
        title: nextDraft.title
      };
    });

    setAutomationBusy(true);
    setTistoryBatchMessage(`${posts.length}건 티스토리 자동화를 시작합니다.`);
    window.localStorage.setItem(BLOG_TISTORY_WRITE_URL_KEY, tistoryUrl.trim());
    window.localStorage.setItem(BLOG_TISTORY_AUTOMATION_MODE_KEY, tistoryMode);
    try {
      const response = await fetch("/api/blog/tistory/automation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "주식",
          mode: tistoryMode,
          posts,
          writeUrl: tistoryUrl.trim()
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; status?: TistoryAutomationStatus };
      if (!response.ok) {
        throw new Error(payload.error || "티스토리 연속 자동화 시작에 실패했습니다.");
      }
      const now = new Date().toISOString();
      const selectedIds = new Set(tistoryBatchIdeas.map((idea) => idea.id));
      writePendingTistoryBatch({
        expectedCount: tistoryBatchIdeas.length,
        ids: Array.from(selectedIds),
        mode: tistoryMode,
        startedAt: now
      });
      persistIdeas(
        ideas.map((idea) =>
          selectedIds.has(idea.id) ? { ...idea, status: "sent_to_write", updatedAt: now } : idea
        )
      );
      if (tistoryBatchIdeas[0]) {
        const firstDraft = buildDraftFromIdea(tistoryBatchIdeas[0], templates);
        window.localStorage.setItem(BLOG_WRITE_DRAFT_KEY, JSON.stringify(firstDraft));
        setDraft(firstDraft);
      }
      setTistoryBatchSelectedIds([]);
      setTistoryBatchMessage(`${posts.length}건 연속 자동화를 요청했습니다. 발행 후 글 관리 화면에서 글쓰기 버튼으로 다음 글을 이어갑니다.`);
      setAutomationStatus(payload.status || { state: "running", message: "티스토리 연속 자동화를 시작했습니다." });
    } catch (error) {
      setTistoryBatchMessage(error instanceof Error ? error.message : "티스토리 연속 자동화 시작에 실패했습니다.");
      setAutomationStatus({ state: "error", message: error instanceof Error ? error.message : "티스토리 연속 자동화 시작에 실패했습니다." });
    } finally {
      setAutomationBusy(false);
    }
  }

  function persistIdeas(nextIdeas: BlogIdea[]): void {
    setIdeas(nextIdeas);
    writeArray(BLOG_IDEAS_STORAGE_KEY, nextIdeas);
  }

  function persistQueue(nextQueue: BlogStockQueueItem[]): void {
    setQueue(nextQueue);
    writeArray(BLOG_STOCK_QUEUE_STORAGE_KEY, nextQueue);
  }

  function finalizeCompletedTistoryBatch(status: TistoryAutomationStatus): void {
    if (status.state !== "success") {
      return;
    }

    const pending = readPendingTistoryBatch();
    const fingerprint = getTistorySuccessFingerprint(status);
    if (!pending && fingerprint && window.localStorage.getItem(BLOG_TISTORY_FINALIZED_STATUS_KEY) === fingerprint) {
      return;
    }

    if (pending && pending.mode !== "publish") {
      clearPendingTistoryBatch();
      window.localStorage.setItem(BLOG_TISTORY_FINALIZED_STATUS_KEY, fingerprint);
      return;
    }

    const storedIdeas = readArray<BlogIdea>(BLOG_IDEAS_STORAGE_KEY, []);
    const storedQueue = readArray<BlogStockQueueItem>(BLOG_STOCK_QUEUE_STORAGE_KEY, []);
    const completedCount = extractCompletedTistoryCount(status);
    let targetIds = pending?.ids || [];
    const savedMode = window.localStorage.getItem(BLOG_TISTORY_AUTOMATION_MODE_KEY);
    const effectiveMode = isTistoryMode(savedMode) ? savedMode : tistoryMode;

    if (targetIds.length === 0 && effectiveMode === "publish" && completedCount) {
      targetIds = storedIdeas
        .filter((idea) => idea.status === "sent_to_write" && idea.markdown.trim().length > 0)
        .slice(0, completedCount)
        .map((idea) => idea.id);
    }

    if (targetIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const targetSet = new Set(targetIds);
    const completedIdeas = storedIdeas.filter((idea) => targetSet.has(idea.id));
    const completedStockKeys = new Set(
      completedIdeas
        .filter((idea) => idea.stock?.name || idea.stock?.code)
        .map((idea) => `${idea.stock?.name || ""}::${idea.stock?.code || ""}`)
    );

    const nextIdeas = storedIdeas.map((idea) =>
      targetSet.has(idea.id) ? { ...idea, status: "done" as const, updatedAt: now } : idea
    );
    const nextQueue = storedQueue.map((item) => {
      const key = `${item.name || ""}::${item.code || ""}`;
      return targetSet.has(item.lastIdeaId || "") || completedStockKeys.has(key)
        ? { ...item, status: "done" as const, updatedAt: now }
        : item;
    });

    persistIdeas(nextIdeas);
    persistQueue(nextQueue);
    setTistoryBatchSelectedIds((current) => current.filter((id) => !targetSet.has(id)));
    clearPendingTistoryBatch();
    window.localStorage.setItem(BLOG_TISTORY_FINALIZED_STATUS_KEY, fingerprint);
    setTistoryBatchMessage(`${completedIdeas.length}건을 업로드 완료로 처리했습니다. 완료된 글은 연속 업로드 대상에서 제외됩니다.`);
  }

  function toggleStockBatchSelected(id: string): void {
    const target = queue.find((item) => item.id === id);
    if (target && target.status !== "queued") {
      return;
    }
    setStockBatchSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleTistoryBatchSelected(id: string): void {
    setTistoryBatchSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function selectRecentTistoryIdeas(): void {
    const limit = Math.max(1, Math.min(20, Number.parseInt(tistoryBatchCount, 10) || 1));
    setTistoryBatchSelectedIds(tistoryUploadableIdeas.slice(0, limit).map((idea) => idea.id));
  }

  function deleteSelectedTistoryIdeas(): void {
    if (tistoryBatchSelectedIds.length === 0) {
      return;
    }

    const selectedIds = new Set(tistoryBatchSelectedIds);
    const selectedIdeas = ideas.filter((idea) => selectedIds.has(idea.id));
    const confirmed = window.confirm(
      [
        `선택한 ${selectedIdeas.length}개 아이디어를 연속 업로드 대상에서 삭제합니다.`,
        "앱 목록에서만 제거되며, 이미 티스토리에 발행된 게시글은 티스토리 관리자에서 별도로 삭제해야 합니다.",
        "연결된 종목 큐는 완료 처리되어 다시 자동 생성/업로드 대상에 잡히지 않습니다."
      ].join("\n")
    );
    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();
    const selectedStockKeys = new Set(
      selectedIdeas
        .filter((idea) => idea.stock?.name || idea.stock?.code)
        .map((idea) => `${idea.stock?.name || ""}::${idea.stock?.code || ""}`)
    );
    const nextIdeas = ideas.filter((idea) => !selectedIds.has(idea.id));
    const nextQueue = queue.map((item) => {
      const stockKey = `${item.name || ""}::${item.code || ""}`;
      return selectedIds.has(item.lastIdeaId || "") || selectedStockKeys.has(stockKey)
        ? { ...item, status: "done" as const, updatedAt: now }
        : item;
    });

    persistIdeas(nextIdeas);
    persistQueue(nextQueue);
    setTistoryBatchSelectedIds([]);
    setTistoryBatchMessage(`${selectedIdeas.length}개 아이디어를 연속 업로드 대상에서 삭제했습니다.`);
  }

  function selectStockBatchTopCount(): void {
    const limit = Math.max(1, Math.min(20, Number.parseInt(stockBatchCount, 10) || 1));
    setStockBatchSelectedIds(stockBatchSelectableStocks.slice(0, limit).map((item) => item.id));
  }

  async function generateStockBatchIdeas(): Promise<void> {
    const targets = stockBatchTargets;
    if (targets.length === 0) {
      setStockBatchMessage("생성할 대기 종목이 없습니다.");
      return;
    }
    setStockBatchBusy(true);
    let nextIdeas = [...ideas];
    let nextQueue = [...queue];
    let latestCreatedIdea: BlogIdea | undefined;
    const succeededIds = new Set<string>();
    const failures: string[] = [];
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        let payload: GeneratedBlogIdeaResponse | undefined;
        let lastErrorMessage = "";

        for (let attempt = 0; attempt <= STOCK_BATCH_RETRY_DELAYS_MS.length; attempt += 1) {
          const attemptLabel = STOCK_BATCH_RETRY_DELAYS_MS.length > 0 ? ` · 시도 ${attempt + 1}/${STOCK_BATCH_RETRY_DELAYS_MS.length + 1}` : "";
          setStockBatchMessage(`[${index + 1}/${targets.length}] ${stockLabel(target)} 초안 생성 중입니다${attemptLabel}.`);
          const response = await fetch("/api/blog/ideas/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "stock",
              keyword: target.keyword || target.name,
              tone: stockBatchTone,
              stock: {
                code: target.code,
                market: target.market,
                name: target.name,
                rank: target.rank
              }
            })
          });
          const responsePayload = (await response.json().catch(() => ({}))) as GeneratedBlogIdeaResponse;
          if (response.ok) {
            payload = responsePayload;
            break;
          }

          lastErrorMessage = stringifyBlogIdeaError(responsePayload, response.status, `${target.name} 초안 생성에 실패했습니다.`);
          const shouldRetry = isTransientBlogIdeaError(response.status, lastErrorMessage) && attempt < STOCK_BATCH_RETRY_DELAYS_MS.length;
          if (!shouldRetry) {
            break;
          }

          const delayMs = STOCK_BATCH_RETRY_DELAYS_MS[attempt];
          setStockBatchMessage(
            `[${index + 1}/${targets.length}] ${stockLabel(target)} 모델 일시 오류로 ${Math.round(delayMs / 1000)}초 후 재시도합니다. ${lastErrorMessage}`
          );
          await sleep(delayMs);
        }

        if (!payload) {
          failures.push(`${target.name}: ${lastErrorMessage || "초안 생성 실패"}`);
          setStockBatchMessage(`[${index + 1}/${targets.length}] ${stockLabel(target)} 생성 실패 후 다음 종목으로 넘어갑니다.`);
          continue;
        }

        const now = new Date().toISOString();
        const idea: BlogIdea = {
          id: createBlogId("blog_idea"),
          kind: "stock",
          status: "generated",
          title: String(payload.title || target.name).trim(),
          topic: target.name,
          summary: String(payload.summary || "").trim(),
          markdown: String(payload.markdown || "").trim(),
          hashtags: normalizeHashtags(payload.hashtags, "#주식분석 #투자정보"),
          sourceLabel: `${payload.provider || "ai"}:${payload.model || "text"}`,
          stock: {
            code: target.code,
            market: target.market,
            name: target.name,
            rank: target.rank
          },
          createdAt: now,
          updatedAt: now
        };
        if (!idea.markdown) {
          failures.push(`${target.name}: 초안 본문이 비어 있습니다.`);
          setStockBatchMessage(`[${index + 1}/${targets.length}] ${stockLabel(target)} 본문이 비어 있어 다음 종목으로 넘어갑니다.`);
          continue;
        }
        idea.imagePrompt = buildRepresentativeImagePrompt(idea);
        nextIdeas = [idea, ...nextIdeas];
        nextQueue = nextQueue.map((item) =>
          item.id === target.id
            ? { ...item, status: "idea_generated", lastIdeaId: idea.id, updatedAt: now }
            : item
        );
        persistIdeas(nextIdeas);
        persistQueue(nextQueue);
        latestCreatedIdea = idea;
        succeededIds.add(target.id);
      }

      if (latestCreatedIdea) {
        const latestDraft = buildDraftFromIdea(latestCreatedIdea, templates);
        window.localStorage.setItem(BLOG_WRITE_DRAFT_KEY, JSON.stringify(latestDraft));
        setDraft(latestDraft);
      }

      setStockBatchSelectedIds((current) => current.filter((id) => !succeededIds.has(id)));
      if (succeededIds.size === 0) {
        setStockBatchMessage(`생성 완료 0/${targets.length}개 · 실패: ${summarizeStockBatchFailures(failures) || "모델 응답 실패"}`);
      } else if (failures.length > 0) {
        setStockBatchMessage(
          `생성 완료 ${succeededIds.size}/${targets.length}개 · 실패 ${failures.length}개는 선택/대기 상태로 남겼습니다: ${summarizeStockBatchFailures(failures)}`
        );
      } else {
        setStockBatchMessage(`${succeededIds.size}개 종목 초안을 생성했습니다. 가장 마지막 생성 글을 작성 Draft로 준비했습니다.`);
      }
    } catch (error) {
      setStockBatchMessage(error instanceof Error ? error.message : "종목 배치 생성에 실패했습니다.");
    } finally {
      setStockBatchBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">블로그 Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            템플릿, 아이디어, 종목 큐, 작성 draft 상태를 한 곳에서 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/blog/ideas">아이디어 생성</Link></Button>
          <Button asChild><Link href="/blog/write">글작성 열기</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4" /> 템플릿</p>
          <p className="mt-2 text-2xl font-bold">{templates.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4" /> 아이디어</p>
          <p className="mt-2 text-2xl font-bold">{stats.totalIdeas}</p>
          <p className="text-xs text-muted-foreground">대기 {stats.generatedIdeas} · 글작성 {stats.sentIdeas}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><ListChecks className="h-4 w-4" /> 종목 큐</p>
          <p className="mt-2 text-2xl font-bold">{stats.totalQueue}</p>
          <p className="text-xs text-muted-foreground">대기 {stats.queued} · 완료 {stats.done}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><PenLine className="h-4 w-4" /> 작성 Draft</p>
          <p className="mt-2 truncate text-lg font-semibold">{draft?.title || "없음"}</p>
          <p className="text-xs text-muted-foreground">{draft?.createdAt ? new Date(draft.createdAt).toLocaleString("ko-KR") : "저장된 draft 없음"}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">최근 블로그 아이디어</h2>
            <Button asChild size="sm" variant="outline"><Link href="/blog/ideas">전체 보기</Link></Button>
          </div>
          <div className="space-y-2">
            {ideas.slice(0, 6).map((idea) => (
              <div key={idea.id} className="rounded-lg border border-border p-3">
                <p className="truncate font-medium">{idea.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{idea.kind} · {idea.status} · {new Date(idea.createdAt).toLocaleString("ko-KR")}</p>
              </div>
            ))}
            {ideas.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">아직 생성된 아이디어가 없습니다.</p> : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" /> 운영 흐름</h2>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. 종목 큐에 KOSPI/KOSDAQ 대상 종목을 순서대로 추가</li>
              <li>2. 아이디어에서 종목별 Markdown 초안 생성</li>
              <li>3. 글작성으로 보내기 후 검수/복사</li>
              <li>4. 향후 Playwright/Selenium 업로드 자동화 연결</li>
            </ol>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" /> 자동화 준비 상태</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              로컬 Chrome 세션을 재사용해 티스토리 글쓰기 화면에 draft를 자동 입력합니다. 기본 모드는 발행 전 검수입니다.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">주식 모드 · 종목 큐 배치 생성</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              체크한 종목을 우선 처리하고, 체크가 없으면 대기 순서대로 지정 개수만큼 Markdown 초안을 생성합니다.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/blog/stocks">종목 큐 관리</Link>
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_190px]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>순차 처리 개수</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={stockBatchCount}
              onChange={(event) => setStockBatchCount(event.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>글 톤</span>
            <Input value={stockBatchTone} onChange={(event) => setStockBatchTone(event.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={selectStockBatchTopCount} disabled={stockBatchSelectableStocks.length === 0}>
              상위 선택
            </Button>
            <Button type="button" className="flex-1" onClick={() => void generateStockBatchIdeas()} disabled={stockBatchBusy || stockBatchTargets.length === 0}>
              {stockBatchBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              생성
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[150px_170px_minmax(180px,1fr)_120px_120px_140px_110px]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>시장</span>
            <Select value={stockBatchMarketFilter} onValueChange={(value) => setStockBatchMarketFilter(value as StockBatchMarketFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 시장</SelectItem>
                <SelectItem value="KOSPI">KOSPI</SelectItem>
                <SelectItem value="KOSDAQ">KOSDAQ</SelectItem>
                <SelectItem value="OTHER">기타</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>상태</span>
            <Select value={stockBatchStatusFilter} onValueChange={(value) => setStockBatchStatusFilter(value as StockBatchStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="queued">대기</SelectItem>
                <SelectItem value="idea_generated">초안 생성</SelectItem>
                <SelectItem value="sent_to_write">글작성</SelectItem>
                <SelectItem value="done">완료</SelectItem>
                <SelectItem value="skipped">제외</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>검색</span>
            <Input
              value={stockBatchSearch}
              onChange={(event) => setStockBatchSearch(event.target.value)}
              placeholder="종목명, 코드, 시장 검색"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>순위 시작</span>
            <Input
              type="number"
              min={1}
              value={stockBatchRankFrom}
              onChange={(event) => setStockBatchRankFrom(event.target.value)}
              placeholder="예: 1"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>순위 끝</span>
            <Input
              type="number"
              min={1}
              value={stockBatchRankTo}
              onChange={(event) => setStockBatchRankTo(event.target.value)}
              placeholder="예: 50"
            />
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border border-border px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={stockBatchExcludePreferred}
              onChange={(event) => setStockBatchExcludePreferred(event.target.checked)}
              aria-label="우선주 제외"
            />
            <span>우선주 제외</span>
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setStockBatchMarketFilter("all");
                setStockBatchExcludePreferred(true);
                setStockBatchStatusFilter("queued");
                setStockBatchSearch("");
                setStockBatchRankFrom("");
                setStockBatchRankTo("");
              }}
            >
              초기화
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-2">선택</th>
                <th className="px-3 py-2">시장</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">종목코드</th>
                <th className="px-3 py-2">종목명</th>
              </tr>
            </thead>
            <tbody>
              {stockBatchVisibleStocks.slice(0, 50).map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={stockBatchSelectedIds.includes(item.id)}
                      onChange={() => toggleStockBatchSelected(item.id)}
                      disabled={item.status !== "queued"}
                      aria-label={`${item.name} 선택`}
                    />
                  </td>
                  <td className="px-3 py-2">{item.market}</td>
                  <td className="px-3 py-2 text-muted-foreground">{STOCK_BATCH_STATUS_LABELS[item.status]}</td>
                  <td className="px-3 py-2">{item.rank || "-"}</td>
                  <td className="px-3 py-2">{item.code || "-"}</td>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                </tr>
              ))}
              {stockBatchVisibleStocks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    필터 조건에 맞는 종목이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            이번 실행 대상 {stockBatchTargets.length}개 · 필터 결과 {stockBatchVisibleStocks.length}개 · 생성 가능 {stockBatchSelectableStocks.length}개
            {stockBatchVisibleStocks.length > 50 ? " · 화면 표시 50개" : ""}
          </p>
          {stockBatchMessage ? <p className="text-primary">{stockBatchMessage}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Bot className="h-4 w-4" />
              티스토리 글쓰기 자동화
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              티스토리 글쓰기 URL을 열고 현재 작성 Draft의 제목/본문/태그를 자동 입력합니다.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshAutomationStatus()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            상태 새로고침
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>티스토리 글쓰기 URL</span>
            <Input
              value={tistoryUrl}
              onChange={(event) => setTistoryUrl(event.target.value)}
              placeholder="예: https://내블로그.tistory.com/manage/newpost"
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>실행 모드</span>
            <Select value={tistoryMode} onValueChange={(value) => setTistoryMode(isTistoryMode(value) ? value : "prepare")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prepare">입력 후 검수</SelectItem>
                <SelectItem value="save-draft">입력 후 임시저장</SelectItem>
                <SelectItem value="publish">공개 발행까지</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              onClick={() => void startTistoryAutomation()}
              disabled={automationBusy || automationStatus.state === "running"}
            >
              {automationBusy || automationStatus.state === "running" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bot className="mr-1 h-4 w-4" />}
              자동 입력 시작
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">연속 업로드 대상</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                체크한 아이디어를 순서대로 티스토리에 입력합니다. 발행 후 글 관리 화면으로 이동하면 `글쓰기` 버튼을 눌러 다음 글을 이어갑니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                선택 개수
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={tistoryBatchCount}
                  onChange={(event) => setTistoryBatchCount(event.target.value)}
                  className="h-8 w-20"
                />
              </label>
              <Button type="button" size="sm" variant="outline" onClick={selectRecentTistoryIdeas} disabled={tistoryUploadableIdeas.length === 0}>
                최근 {Math.max(1, Math.min(20, Number.parseInt(tistoryBatchCount, 10) || 1))}개 선택
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setTistoryBatchSelectedIds([])} disabled={tistoryBatchSelectedIds.length === 0}>
                선택 해제
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={deleteSelectedTistoryIdeas} disabled={tistoryBatchSelectedIds.length === 0}>
                <Trash2 className="h-4 w-4" />
                선택 삭제
              </Button>
            </div>
          </div>

          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border bg-background">
            {tistoryUploadableIdeas.length > 0 ? (
              tistoryUploadableIdeas.map((idea) => (
                <label
                  key={idea.id}
                  className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={tistoryBatchSelectedIds.includes(idea.id)}
                    onChange={() => toggleTistoryBatchSelected(idea.id)}
                    aria-label={`${idea.title} 연속 업로드 선택`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{idea.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {idea.kind} · {idea.status} · {idea.stock?.name || idea.topic}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">연속 업로드할 아이디어가 없습니다.</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              선택 {tistoryBatchIdeas.length}건 · 다건 실행은 `입력 후 임시저장` 또는 `공개 발행까지` 모드 권장
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => void startTistoryBatchAutomation()}
              disabled={automationBusy || automationStatus.state === "running" || tistoryBatchIdeas.length === 0}
            >
              {automationBusy || automationStatus.state === "running" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListChecks className="mr-1 h-4 w-4" />}
              선택 아이디어 연속 시작
            </Button>
          </div>
          {tistoryBatchMessage ? <p className="mt-2 text-xs text-primary">{tistoryBatchMessage}</p> : null}
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              상태: {automationStatus.state || "idle"} {automationStatus.step ? `· ${automationStatus.step}` : ""}
            </p>
            {automationStatus.updatedAt ? (
              <p className="text-xs text-muted-foreground">{new Date(automationStatus.updatedAt).toLocaleString("ko-KR")}</p>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{automationStatus.message || "실행 이력이 없습니다."}</p>
          <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-border bg-background p-3 text-xs leading-5">
            {(automationStatus.logs || []).length > 0 ? (
              (automationStatus.logs || []).slice(-20).map((log, index) => (
                <p key={`${log.at}-${index}`}>
                  <span className="text-muted-foreground">[{new Date(log.at).toLocaleTimeString("ko-KR")}]</span> {log.message}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">표시할 자동화 로그가 없습니다.</p>
            )}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-muted-foreground">
          열린 Chrome에서 로그인이 필요하면 직접 로그인해 주세요. `공개 발행까지` 모드는 완료 버튼을 누른 뒤 바텀시트에서 공개 발행을 시도합니다.
        </div>
      </div>
    </section>
  );
}
