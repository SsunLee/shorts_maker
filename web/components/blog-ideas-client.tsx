"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FileText, Loader2, PenLine, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOG_ACTIVE_TEMPLATE_KEY,
  BLOG_IDEA_FONT_STORAGE_KEY,
  BLOG_IDEAS_STORAGE_KEY,
  BLOG_STOCK_QUEUE_SELECTED_KEY,
  BLOG_STOCK_QUEUE_STORAGE_KEY,
  BLOG_TEMPLATE_STORAGE_KEY,
  BLOG_WRITE_DRAFT_KEY,
  DEFAULT_BLOG_TEMPLATES,
  createBlogId,
  materializeBlogTemplateText,
  stripLegacyBlogTemplateNotice,
  type BlogIdea,
  type BlogIdeaKind,
  type BlogStockQueueItem,
  type BlogTemplate,
  type BlogWriteDraft,
  type BlogWriteSource
} from "@/lib/blog-storage";

type GeneratedBlogIdeaResponse = {
  error?: string;
  hashtags?: string[];
  markdown?: string;
  model?: string;
  provider?: string;
  summary?: string;
  title?: string;
};

const BLOG_FONT_OPTIONS = [
  {
    id: "system",
    label: "기본 시스템",
    css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  {
    id: "pretendard",
    label: "Pretendard",
    css: "'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
  },
  {
    id: "noto-sans-kr",
    label: "Noto Sans KR",
    css: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
  },
  {
    id: "spoqa",
    label: "Spoqa Han Sans Neo",
    css: "'Spoqa Han Sans Neo', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif"
  },
  {
    id: "nanum-gothic",
    label: "Nanum Gothic",
    css: "'Nanum Gothic', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
  },
  {
    id: "noto-serif-kr",
    label: "Noto Serif KR",
    css: "'Noto Serif KR', 'Nanum Myeongjo', serif"
  }
] as const;

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

function readTemplates(): BlogTemplate[] {
  const loaded = readArray<BlogTemplate>(BLOG_TEMPLATE_STORAGE_KEY, []);
  return loaded.length > 0 ? loaded : DEFAULT_BLOG_TEMPLATES;
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
    source: idea.sourceLabel || (idea.kind === "stock" ? "블로그 종목 큐" : "블로그 아이디어"),
    link: "",
    publishedAt: new Date(idea.createdAt).toLocaleString("ko-KR")
  };
}

function buildDraftFromIdea(idea: BlogIdea): BlogWriteDraft {
  const templates = readTemplates();
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
  const stockHint = idea.kind === "stock"
    ? "Financial blog cover image for Korean stock analysis, realistic editorial business mood, charts or office context allowed but no readable text."
    : "Editorial blog cover image matching the article topic.";
  return [
    stockHint,
    `Article topic: ${idea.topic || idea.title}.`,
    content,
    "Make the scene specific to the article content. Avoid generic stock-photo feeling."
  ]
    .filter(Boolean)
    .join("\n");
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

function isSelectableQueueItem(item: BlogStockQueueItem): boolean {
  return item.status !== "done";
}

function getBlogFontOption(fontId: string | undefined): (typeof BLOG_FONT_OPTIONS)[number] {
  return BLOG_FONT_OPTIONS.find((item) => item.id === fontId) || BLOG_FONT_OPTIONS[0];
}

function readLastBlogIdeaFont(): string {
  if (typeof window === "undefined") {
    return BLOG_FONT_OPTIONS[0].id;
  }
  const saved = window.localStorage.getItem(BLOG_IDEA_FONT_STORAGE_KEY) || "";
  return getBlogFontOption(saved).id;
}

function stripBlogFontWrapper(markdown: string): string {
  const value = String(markdown || "").trim();
  const match = value.match(/^<div\s+data-blog-font="[^"]+"\s+style="font-family:[^"]*;">\s*\n\n?([\s\S]*?)\n\n?<\/div>\s*$/);
  return match ? match[1].trim() : value;
}

function wrapMarkdownWithFont(markdown: string, fontId: string | undefined): string {
  const option = getBlogFontOption(fontId);
  const body = stripBlogFontWrapper(markdown);
  return `<div data-blog-font="${option.id}" style="font-family:${option.css};">\n\n${body}\n\n</div>`;
}

function normalizeHashtags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => (item.startsWith("#") ? item : `#${item}`)).slice(0, 18);
  }
  return [];
}

export function BlogIdeasClient(): React.JSX.Element {
  const router = useRouter();
  const [kind, setKind] = useState<BlogIdeaKind>("keyword");
  const [keyword, setKeyword] = useState("주식 종목 분석");
  const [tone, setTone] = useState("차분하고 신뢰감 있는 정보성 블로그 글");
  const [ideas, setIdeas] = useState<BlogIdea[]>([]);
  const [queue, setQueue] = useState<BlogStockQueueItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    const loadedIdeas = readArray<BlogIdea>(BLOG_IDEAS_STORAGE_KEY, []);
    const loadedQueue = readArray<BlogStockQueueItem>(BLOG_STOCK_QUEUE_STORAGE_KEY, []);
    const preselected = window.localStorage.getItem(BLOG_STOCK_QUEUE_SELECTED_KEY) || "";
    setIdeas(loadedIdeas);
    setQueue(loadedQueue);
    if (preselected && loadedQueue.some((item) => item.id === preselected && isSelectableQueueItem(item))) {
      setKind("stock");
      setSelectedStockId(preselected);
    } else {
      const selectable = loadedQueue.filter(isSelectableQueueItem);
      setSelectedStockId(selectable.find((item) => item.status === "queued")?.id || selectable[0]?.id || "");
    }
  }, []);

  const selectableQueue = useMemo(() => queue.filter(isSelectableQueueItem), [queue]);

  const selectedStock = useMemo(
    () => selectableQueue.find((item) => item.id === selectedStockId),
    [selectableQueue, selectedStockId]
  );

  function persistIdeas(nextIdeas: BlogIdea[]): void {
    setIdeas(nextIdeas);
    writeArray(BLOG_IDEAS_STORAGE_KEY, nextIdeas);
  }

  function persistQueue(nextQueue: BlogStockQueueItem[]): void {
    setQueue(nextQueue);
    writeArray(BLOG_STOCK_QUEUE_STORAGE_KEY, nextQueue);
  }

  async function generateIdea(): Promise<void> {
    const topic = kind === "stock" ? selectedStock?.name || "" : keyword.trim();
    if (!topic) {
      setStatus(kind === "stock" ? "종목 큐에서 종목을 선택해 주세요." : "키워드를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setStatus("AI 블로그 초안을 생성 중입니다. 완료 전까지 다시 누르지 마세요.");
    try {
      const response = await fetch("/api/blog/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          keyword: kind === "stock" ? selectedStock?.keyword || selectedStock?.name : keyword.trim(),
          tone,
          stock:
            kind === "stock" && selectedStock
              ? {
                  code: selectedStock.code,
                  market: selectedStock.market,
                  name: selectedStock.name,
                  rank: selectedStock.rank
                }
              : undefined
        })
      });
      const payload = (await response.json().catch(() => ({}))) as GeneratedBlogIdeaResponse;
      if (!response.ok) {
        throw new Error(payload.error || "블로그 아이디어 생성에 실패했습니다.");
      }
      const now = new Date().toISOString();
      const selectedFont = readLastBlogIdeaFont();
      const idea: BlogIdea = {
        id: createBlogId("blog_idea"),
        kind,
        status: "generated",
        title: String(payload.title || topic).trim(),
        topic,
        summary: String(payload.summary || "").trim(),
        markdown: String(payload.markdown || "").trim(),
        fontFamily: selectedFont,
        imagePrompt: "",
        hashtags: normalizeHashtags(payload.hashtags),
        sourceLabel: `${payload.provider || "ai"}:${payload.model || "text"}`,
        stock: selectedStock
          ? {
              code: selectedStock.code,
              market: selectedStock.market,
              name: selectedStock.name,
              rank: selectedStock.rank
            }
          : undefined,
        createdAt: now,
        updatedAt: now
      };
      if (!idea.markdown) {
        throw new Error("AI가 markdown 본문을 반환하지 않았습니다.");
      }
      idea.imagePrompt = buildRepresentativeImagePrompt(idea);
      persistIdeas([idea, ...ideas]);
      if (kind === "stock" && selectedStock) {
        persistQueue(
          queue.map((item) =>
            item.id === selectedStock.id
              ? { ...item, status: "idea_generated", lastIdeaId: idea.id, updatedAt: now }
              : item
          )
        );
      }
      setStatus("블로그 초안을 생성했습니다. 글작성으로 보내서 바로 편집할 수 있습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "블로그 아이디어 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function sendToWrite(idea: BlogIdea): void {
    const draft = buildDraftFromIdea(idea);
    window.localStorage.setItem(BLOG_WRITE_DRAFT_KEY, JSON.stringify(draft));
    const now = new Date().toISOString();
    persistIdeas(
      ideas.map((item) => (item.id === idea.id ? { ...item, status: "sent_to_write", updatedAt: now } : item))
    );
    if (idea.stock?.name) {
      persistQueue(
        queue.map((item) =>
          item.lastIdeaId === idea.id || (item.name === idea.stock?.name && item.code === idea.stock?.code)
            ? { ...item, status: "sent_to_write", updatedAt: now }
            : item
        )
      );
    }
    router.push("/blog/write");
  }

  async function copyIdea(idea: BlogIdea): Promise<void> {
    await navigator.clipboard.writeText(`${idea.title}\n\n${idea.markdown}\n\n${idea.hashtags.join(" ")}`.trim());
    setCopiedId(idea.id);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  async function copyIdeaTitle(idea: BlogIdea): Promise<void> {
    await navigator.clipboard.writeText(idea.title);
    setCopiedId(`${idea.id}:title`);
    window.setTimeout(() => setCopiedId(""), 1200);
  }

  function findNextSelectableId(nextQueue: BlogStockQueueItem[], currentId?: string): string {
    const selectable = nextQueue.filter((item) => isSelectableQueueItem(item) && item.id !== currentId);
    return selectable.find((item) => item.status === "queued")?.id || selectable[0]?.id || "";
  }

  function updateIdeaFont(ideaId: string, fontFamily: string): void {
    const now = new Date().toISOString();
    window.localStorage.setItem(BLOG_IDEA_FONT_STORAGE_KEY, getBlogFontOption(fontFamily).id);
    persistIdeas(ideas.map((item) => (item.id === ideaId ? { ...item, fontFamily, updatedAt: now } : item)));
  }

  function convertIdeaFont(idea: BlogIdea): void {
    const font = getBlogFontOption(idea.fontFamily);
    const now = new Date().toISOString();
    window.localStorage.setItem(BLOG_IDEA_FONT_STORAGE_KEY, font.id);
    persistIdeas(
      ideas.map((item) =>
        item.id === idea.id
          ? { ...item, markdown: wrapMarkdownWithFont(item.markdown, idea.fontFamily), fontFamily: font.id, updatedAt: now }
          : item
      )
    );
    setStatus(`${font.label} 폰트를 본문 Markdown 블록에 반영했습니다.`);
  }

  function deleteIdea(idea: BlogIdea): void {
    const nextIdeas = ideas.filter((item) => item.id !== idea.id);
    persistIdeas(nextIdeas);
    if (idea.stock?.name) {
      const now = new Date().toISOString();
      const nextQueue = queue.map((item) =>
        item.lastIdeaId === idea.id && item.status !== "done"
          ? { ...item, status: "queued" as const, lastIdeaId: undefined, updatedAt: now }
          : item
      );
      persistQueue(nextQueue);
    }
    setStatus("아이디어 섹션을 삭제했습니다.");
  }

  function completeIdea(idea: BlogIdea): void {
    const now = new Date().toISOString();
    persistIdeas(ideas.map((item) => (item.id === idea.id ? { ...item, status: "done", updatedAt: now } : item)));
    if (idea.stock?.name) {
      const nextQueue = queue.map((item) =>
        item.lastIdeaId === idea.id || (item.name === idea.stock?.name && item.code === idea.stock?.code)
          ? { ...item, status: "done" as const, updatedAt: now }
          : item
      );
      persistQueue(nextQueue);
      if (selectedStockId && nextQueue.some((item) => item.id === selectedStockId && item.status === "done")) {
        setSelectedStockId(findNextSelectableId(nextQueue, selectedStockId));
      }
    }
    setStatus("완료 처리했습니다. 완료된 종목은 대상 종목 목록에서 제외됩니다.");
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">블로그 아이디어</h1>
          <p className="text-sm text-muted-foreground">
            키워드나 종목 큐를 기반으로 완성형 Markdown 초안을 만들고 글작성으로 보냅니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/blog/stocks">종목 큐 관리</Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant={kind === "keyword" ? "default" : "outline"} onClick={() => setKind("keyword")}>
            키워드 모드
          </Button>
          <Button type="button" variant={kind === "stock" ? "default" : "outline"} onClick={() => setKind("stock")}>
            종목 큐 모드
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          {kind === "stock" ? (
            <label className="space-y-1.5 text-sm font-medium">
              <span>대상 종목</span>
              <Select value={selectedStockId} onValueChange={setSelectedStockId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="종목 큐에서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {selectableQueue.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {stockLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : (
            <label className="space-y-1.5 text-sm font-medium">
              <span>키워드</span>
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="예: 코스피 배당주, 여행 일본어" />
            </label>
          )}
          <label className="space-y-1.5 text-sm font-medium">
            <span>글 톤</span>
            <Input value={tone} onChange={(event) => setTone(event.target.value)} />
          </label>
        </div>

        {kind === "stock" && selectableQueue.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            선택 가능한 종목 큐가 없습니다. <Link href="/blog/stocks" className="text-primary underline">종목 큐</Link>에서 KOSPI/KOSDAQ 목록을 추가하거나 완료 상태를 확인하세요.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void generateIdea()} disabled={busy || (kind === "stock" && !selectedStock)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Markdown 초안 생성
          </Button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {ideas.map((idea) => (
          <article key={idea.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                <p className="text-xs uppercase text-muted-foreground">{idea.kind === "stock" ? "종목 글" : "키워드 글"} · {idea.status}</p>
                </div>
                <div className="flex max-w-full flex-wrap items-center justify-start gap-2 sm:justify-end">
                  <Button type="button" size="sm" className="shrink-0" onClick={() => sendToWrite(idea)}>
                    <PenLine className="mr-1 h-4 w-4" />
                    글작성으로
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyIdea(idea)}>
                    {copiedId === idea.id ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                    {copiedId === idea.id ? "복사됨" : "복사"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => completeIdea(idea)} disabled={idea.status === "done"}>
                    <Check className="mr-1 h-4 w-4" />
                    완료 처리
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={() => deleteIdea(idea)}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    삭제
                  </Button>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug [overflow-wrap:anywhere] [word-break:keep-all]">{idea.title}</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 rounded-md p-0"
                    title="제목 복사"
                    aria-label="제목 복사"
                    onClick={() => void copyIdeaTitle(idea)}
                  >
                    {copiedId === `${idea.id}:title` ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] [word-break:keep-all]">{idea.summary || idea.topic}</p>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <label className="min-w-[180px] flex-1 space-y-1 text-xs font-semibold text-foreground">
                <span>본문 폰트</span>
                <Select value={idea.fontFamily || BLOG_FONT_OPTIONS[0].id} onValueChange={(value) => updateIdeaFont(idea.id, value)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOG_FONT_OPTIONS.map((font) => (
                      <SelectItem key={font.id} value={font.id}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button type="button" variant="outline" onClick={() => convertIdeaFont(idea)}>
                변환
              </Button>
              <p className="basis-full text-xs text-muted-foreground">
                Markdown은 기본 폰트 문법이 없어 HTML 래퍼로 변환합니다. 티스토리/HTML 지원 편집기에서 적용됩니다.
              </p>
            </div>
            <Textarea value={idea.markdown} readOnly rows={10} className="font-mono text-xs leading-5" />
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">대표 이미지 프롬프트</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(idea.imagePrompt || buildRepresentativeImagePrompt(idea))}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  프롬프트 복사
                </Button>
              </div>
              <Textarea
                value={idea.imagePrompt || buildRepresentativeImagePrompt(idea)}
                readOnly
                rows={4}
                className="font-mono text-xs leading-5"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{idea.hashtags.join(" ")}</div>
            </div>
          </article>
        ))}
        {ideas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground xl:col-span-2">
            생성된 블로그 아이디어가 없습니다.
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <FileText className="h-4 w-4" />
          운영 메모
        </p>
        <p className="mt-2">
          종목 큐와 아이디어 이력은 현재 브라우저에 저장됩니다. AI 호출은 초안 생성 버튼을 누를 때만 발생하므로 상시 DB 컴퓨팅 비용을 늘리지 않습니다.
        </p>
      </div>
    </section>
  );
}
