"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, FileText, RefreshCw, Save } from "lucide-react";
import { BlogMarkdownPreview, BlogMarkdownToolbar, applyBlogMarkdownFormat, type BlogMarkdownAction, type BlogMarkdownMode } from "@/components/blog-markdown-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOG_ACTIVE_TEMPLATE_KEY,
  BLOG_TEMPLATE_STORAGE_KEY,
  BLOG_WRITE_DRAFT_KEY,
  DEFAULT_BLOG_TEMPLATES,
  materializeBlogTemplateText,
  stripLegacyBlogTemplateNotice,
  type BlogTemplate,
  type BlogWriteDraft,
  type BlogWriteSource
} from "@/lib/blog-storage";

const CATEGORY_OPTIONS = ["카테고리", "뉴스", "일상", "리뷰", "정보"];
function readTemplates(): BlogTemplate[] {
  if (typeof window === "undefined") return DEFAULT_BLOG_TEMPLATES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOG_TEMPLATE_STORAGE_KEY) || "[]") as BlogTemplate[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BLOG_TEMPLATES;
  } catch {
    return DEFAULT_BLOG_TEMPLATES;
  }
}

function buildDraft(template: BlogTemplate, source?: BlogWriteSource): BlogWriteDraft {
  return {
    templateId: template.id,
    source,
    title: materializeBlogTemplateText(template.titleTemplate, source).trim() || source?.title || "",
    body: materializeBlogTemplateText(template.bodyTemplate, source).trim(),
    createdAt: new Date().toISOString()
  };
}

export function BlogWriteClient(): React.JSX.Element {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [templates, setTemplates] = useState<BlogTemplate[]>(DEFAULT_BLOG_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_BLOG_TEMPLATES[0].id);
  const [source, setSource] = useState<BlogWriteSource | undefined>();
  const [category, setCategory] = useState("카테고리");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [mode, setMode] = useState<BlogMarkdownMode>("edit");
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    const loaded = readTemplates();
    const active = window.localStorage.getItem(BLOG_ACTIVE_TEMPLATE_KEY) || loaded[0]?.id || DEFAULT_BLOG_TEMPLATES[0].id;
    const draftRaw = window.localStorage.getItem(BLOG_WRITE_DRAFT_KEY);
    let draft: Partial<BlogWriteDraft> | undefined;
    try {
      draft = draftRaw ? (JSON.parse(draftRaw) as Partial<BlogWriteDraft>) : undefined;
    } catch {
      draft = undefined;
    }
    const templateId = String(draft?.templateId || active);
    const selectedTemplate = loaded.find((item) => item.id === templateId) || loaded[0] || DEFAULT_BLOG_TEMPLATES[0];
    setTemplates(loaded);
    setSelectedTemplateId(selectedTemplate.id);
    setSource(draft?.source);
    setTitle(String(draft?.title || materializeBlogTemplateText(selectedTemplate.titleTemplate, draft?.source).trim()));
    setBody(stripLegacyBlogTemplateNotice(String(draft?.body || materializeBlogTemplateText(selectedTemplate.bodyTemplate, draft?.source).trim())));
    setTags(String(draft?.tags || ""));
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) {
      return;
    }
    const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setSavedAt(time);
    const draft: BlogWriteDraft = {
      templateId: selectedTemplateId,
      source,
      title,
      body,
      tags,
      createdAt: new Date().toISOString()
    };
    try {
      window.localStorage.setItem(BLOG_WRITE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // localStorage 저장 실패는 작성 흐름을 막지 않습니다.
    }
  }, [body, draftReady, selectedTemplateId, source, tags, title]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || templates[0] || DEFAULT_BLOG_TEMPLATES[0],
    [selectedTemplateId, templates]
  );

  function applyTemplate(templateId = selectedTemplateId): void {
    const template = templates.find((item) => item.id === templateId) || selectedTemplate;
    const draft = buildDraft(template, source);
    setSelectedTemplateId(template.id);
    setTitle(draft.title);
    setBody(draft.body);
    window.localStorage.setItem(BLOG_WRITE_DRAFT_KEY, JSON.stringify(draft));
  }

  function insertMarkdown(action: BlogMarkdownAction): void {
    setMode("edit");
    const textarea = bodyRef.current;
    const current = body;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const result = applyBlogMarkdownFormat(current, start, end, action);
    setBody(result.next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  async function copyPost(): Promise<void> {
    const tagText = tags.trim() ? `\n\n${tags.trim()}` : "";
    const text = [title.trim(), `${body.trim()}${tagText}`.trim()].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="-m-4 min-h-[calc(100vh-2rem)] bg-background text-foreground sm:-m-6">
      <BlogMarkdownToolbar label="블로그 글작성" mode={mode} onFormat={insertMarkdown} onModeChange={setMode} />

      <div className="mx-auto max-w-[920px] px-5 pb-28 pt-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Select value={selectedTemplateId} onValueChange={(value) => applyTemplate(value)}>
            <SelectTrigger className="h-9 w-[220px] rounded-none border-border bg-background text-foreground shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} · {template.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" asChild>
            <Link href="/blog/templates">템플릿 관리</Link>
          </Button>
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="mb-5 h-9 w-[170px] rounded-none border-border bg-background text-muted-foreground shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목을 입력하세요"
          className="h-16 rounded-none border-0 border-b border-border bg-background px-0 text-3xl font-normal text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
        />

        {mode === "preview" ? (
          <div className="mt-10 rounded-lg border border-border bg-card p-6">
            <BlogMarkdownPreview title={title} body={body} />
          </div>
        ) : (
          <Textarea
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="마크다운으로 내용을 입력하세요"
            className="mt-10 min-h-[470px] resize-none rounded-none border-0 bg-background px-0 font-mono text-base leading-8 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
        )}

        <Input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="#태그입력"
          className="mt-8 rounded-none border-0 bg-background px-0 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
        />

        {source ? (
          <div className="mt-8 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">가져온 뉴스</p>
            <p className="mt-2 line-clamp-3 leading-relaxed">{source.summary}</p>
            {source.link ? (
              <a className="mt-2 block truncate text-muted-foreground underline" href={source.link} target="_blank" rel="noreferrer">
                {source.link}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 text-card-foreground backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setMode("preview")}>
              <FileText className="h-4 w-4" />
              미리보기
            </button>
            <span className="h-4 w-px bg-border" />
            <span className="text-muted-foreground">자동 저장 완료 {savedAt}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => applyTemplate()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              다시 적용
            </Button>
            <Button type="button" variant="outline" className="rounded-full">
              <Save className="mr-1 h-4 w-4" />
              임시저장
            </Button>
            <Button type="button" className="rounded-full px-7" onClick={() => void copyPost()}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? "복사됨" : "완료"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
