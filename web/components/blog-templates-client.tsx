"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileJson, FileText, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { BlogMarkdownPreview, BlogMarkdownToolbar, applyBlogMarkdownFormat, type BlogMarkdownAction, type BlogMarkdownMode } from "@/components/blog-markdown-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOG_ACTIVE_TEMPLATE_KEY,
  BLOG_TEMPLATE_STORAGE_KEY,
  createBlogId,
  DEFAULT_BLOG_TEMPLATES,
  stripLegacyBlogTemplateNotice,
  type BlogTemplate
} from "@/lib/blog-storage";

function readTemplates(): BlogTemplate[] {
  if (typeof window === "undefined") return DEFAULT_BLOG_TEMPLATES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOG_TEMPLATE_STORAGE_KEY) || "[]") as BlogTemplate[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.map((item) => ({ ...item, bodyTemplate: stripLegacyBlogTemplateNotice(item.bodyTemplate) }))
      : DEFAULT_BLOG_TEMPLATES;
  } catch {
    return DEFAULT_BLOG_TEMPLATES;
  }
}

function persistTemplates(templates: BlogTemplate[]): void {
  window.localStorage.setItem(BLOG_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

function sanitizeDownloadName(value: string): string {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || "blog-template";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImportedBlogTemplates(value: unknown): BlogTemplate[] {
  let candidates: unknown[] = [];
  if (Array.isArray(value)) {
    candidates = value;
  } else if (isRecord(value) && Array.isArray(value.templates)) {
    candidates = value.templates;
  } else if (isRecord(value) && isRecord(value.template)) {
    candidates = [value.template];
  } else if (isRecord(value)) {
    candidates = [value];
  } else {
    throw new Error("JSON 형식이 올바르지 않습니다. 템플릿 객체 또는 배열이어야 합니다.");
  }

  return candidates.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`템플릿 ${index + 1}: 객체 형식이 아닙니다.`);
    }
    const name = String(item.name || item.templateName || "").trim();
    const titleTemplate = String(item.titleTemplate || "").trim();
    const bodyTemplate = String(item.bodyTemplate || "").trim();
    if (!name || !titleTemplate || !bodyTemplate) {
      throw new Error(`템플릿 ${index + 1}: name, titleTemplate, bodyTemplate 값이 필요합니다.`);
    }
    return {
      id: createBlogId("blog_tpl"),
      name,
      category: String(item.category || "가져온 템플릿").trim() || "가져온 템플릿",
      titleTemplate,
      bodyTemplate,
      updatedAt: new Date().toISOString()
    };
  });
}

export function BlogTemplatesClient(): React.JSX.Element {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<BlogTemplate[]>(DEFAULT_BLOG_TEMPLATES);
  const [selectedId, setSelectedId] = useState(DEFAULT_BLOG_TEMPLATES[0].id);
  const [activeId, setActiveId] = useState(DEFAULT_BLOG_TEMPLATES[0].id);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<BlogMarkdownMode>("edit");
  const [templateJsonModalOpen, setTemplateJsonModalOpen] = useState(false);
  const [templateJsonModalMode, setTemplateJsonModalMode] = useState<"import" | "export">("export");
  const [templateJsonText, setTemplateJsonText] = useState("");
  const [templateJsonError, setTemplateJsonError] = useState<string>();
  const [templateJsonMessage, setTemplateJsonMessage] = useState<string>();

  useEffect(() => {
    const loaded = readTemplates();
    const active = window.localStorage.getItem(BLOG_ACTIVE_TEMPLATE_KEY) || loaded[0]?.id || DEFAULT_BLOG_TEMPLATES[0].id;
    setTemplates(loaded);
    setSelectedId(loaded.some((item) => item.id === active) ? active : loaded[0]?.id || DEFAULT_BLOG_TEMPLATES[0].id);
    setActiveId(active);
  }, []);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) || templates[0] || DEFAULT_BLOG_TEMPLATES[0],
    [selectedId, templates]
  );

  function updateSelected(patch: Partial<BlogTemplate>): void {
    setTemplates((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
      )
    );
  }

  function save(): void {
    persistTemplates(templates);
    setMessage("템플릿을 저장했습니다.");
  }

  function saveAsNew(): void {
    const next: BlogTemplate = {
      ...selected,
      id: createBlogId("blog_tpl"),
      name: `${selected.name} 복사본`,
      updatedAt: new Date().toISOString()
    };
    const nextTemplates = [next, ...templates];
    setTemplates(nextTemplates);
    setSelectedId(next.id);
    persistTemplates(nextTemplates);
    setMessage("새 템플릿으로 복제했습니다.");
  }

  function addNew(): void {
    const next: BlogTemplate = {
      id: createBlogId("blog_tpl"),
      name: "새 블로그 양식",
      category: "커스텀",
      titleTemplate: "{{title}}",
      bodyTemplate: "{{summary}}\n\n## 핵심 내용\n{{detail}}",
      updatedAt: new Date().toISOString()
    };
    const nextTemplates = [next, ...templates];
    setTemplates(nextTemplates);
    setSelectedId(next.id);
    persistTemplates(nextTemplates);
    setMessage("새 템플릿을 만들었습니다.");
  }

  function remove(): void {
    if (selected.id.startsWith("default-")) {
      setMessage("기본 템플릿은 삭제하지 않고 복제해서 사용하세요.");
      return;
    }
    const nextTemplates = templates.filter((item) => item.id !== selected.id);
    setTemplates(nextTemplates);
    setSelectedId(nextTemplates[0]?.id || DEFAULT_BLOG_TEMPLATES[0].id);
    persistTemplates(nextTemplates);
    setMessage("템플릿을 삭제했습니다.");
  }

  function setActive(): void {
    window.localStorage.setItem(BLOG_ACTIVE_TEMPLATE_KEY, selected.id);
    setActiveId(selected.id);
    setMessage("블로그 글쓰기 기본 템플릿으로 지정했습니다.");
  }

  function buildCurrentTemplateJson(): string {
    return JSON.stringify(selected, null, 2);
  }

  function openTemplateJsonModal(mode: "import" | "export"): void {
    setTemplateJsonModalMode(mode);
    setTemplateJsonModalOpen(true);
    setTemplateJsonError(undefined);
    setTemplateJsonMessage(undefined);
    if (mode === "export") {
      setTemplateJsonText(buildCurrentTemplateJson());
    }
  }

  function loadCurrentTemplateJsonToTextarea(): void {
    setTemplateJsonText(buildCurrentTemplateJson());
    setTemplateJsonError(undefined);
    setTemplateJsonMessage("현재 템플릿 JSON을 텍스트 영역에 불러왔습니다.");
  }

  async function copyCurrentTemplateJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildCurrentTemplateJson());
      setTemplateJsonError(undefined);
      setTemplateJsonMessage("현재 템플릿 JSON을 클립보드에 복사했습니다.");
      setMessage("현재 템플릿 JSON을 클립보드에 복사했습니다.");
    } catch {
      setTemplateJsonError("클립보드 복사에 실패했습니다.");
    }
  }

  function downloadCurrentTemplateJson(): void {
    const blob = new Blob([buildCurrentTemplateJson()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeDownloadName(selected.name || "blog-template")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setTemplateJsonError(undefined);
    setTemplateJsonMessage("현재 템플릿 JSON 다운로드를 시작했습니다.");
    setMessage("현재 템플릿 JSON 다운로드를 시작했습니다.");
  }

  function importTemplatesFromJsonText(): void {
    const raw = templateJsonText.trim();
    if (!raw) {
      setTemplateJsonError("JSON 텍스트를 입력해 주세요.");
      setTemplateJsonMessage(undefined);
      return;
    }
    try {
      const imported = normalizeImportedBlogTemplates(JSON.parse(raw) as unknown);
      const nextTemplates = [...imported, ...templates];
      setTemplates(nextTemplates);
      setSelectedId(imported[0]?.id || selected.id);
      persistTemplates(nextTemplates);
      setTemplateJsonError(undefined);
      setTemplateJsonMessage(`${imported.length}개 템플릿을 가져왔습니다.`);
      setMessage(`${imported.length}개 템플릿을 가져왔습니다.`);
    } catch (error) {
      setTemplateJsonError(error instanceof Error ? error.message : "템플릿 가져오기에 실패했습니다.");
      setTemplateJsonMessage(undefined);
    }
  }

  function onTemplateJsonFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file
      .text()
      .then((text) => {
        setTemplateJsonText(text);
        setTemplateJsonModalMode("import");
        setTemplateJsonError(undefined);
        setTemplateJsonMessage("JSON 파일을 불러왔습니다. 가져오기 버튼을 눌러 반영하세요.");
      })
      .catch(() => {
        setTemplateJsonError("JSON 파일을 읽지 못했습니다.");
        setTemplateJsonMessage(undefined);
      });
  }

  function insertMarkdown(action: BlogMarkdownAction): void {
    setMode("edit");
    const textarea = bodyRef.current;
    const current = selected.bodyTemplate || "";
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const result = applyBlogMarkdownFormat(current, start, end, action);
    updateSelected({ bodyTemplate: result.next });
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <section className="-m-4 min-h-[calc(100vh-2rem)] bg-background text-foreground sm:-m-6">
      <BlogMarkdownToolbar label="블로그 템플릿" mode={mode} onFormat={insertMarkdown} onModeChange={setMode} />

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pb-28 pt-10 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold">블로그 템플릿</h1>
            <Button type="button" size="sm" onClick={addNew}>
              <Plus className="mr-1 h-4 w-4" />
              새 양식
            </Button>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                  selected.id === template.id
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-transparent bg-transparent hover:bg-accent"
                }`}
                onClick={() => setSelectedId(template.id)}
              >
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <FileText className="h-4 w-4" />
                  {template.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {template.category}
                  {activeId === template.id ? " · 기본" : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main>
          <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>템플릿 이름</span>
                <Input
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                  className="h-10 rounded-none border-border bg-background text-foreground shadow-none"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>분류</span>
                <Input
                  value={selected.category}
                  onChange={(event) => updateSelected({ category: event.target.value })}
                  className="h-10 rounded-none border-border bg-background text-foreground shadow-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" onClick={saveAsNew}>
                <Copy className="mr-1 h-4 w-4" />
                복제
              </Button>
              <Button type="button" variant="outline" onClick={setActive}>
                <Check className="mr-1 h-4 w-4" />
                기본 지정
              </Button>
              <Button type="button" variant="outline" onClick={() => openTemplateJsonModal("export")}>
                <FileJson className="mr-1 h-4 w-4" />
                가져오기/내보내기
              </Button>
              <Button type="button" onClick={save}>
                <Save className="mr-1 h-4 w-4" />
                저장
              </Button>
            </div>
          </div>

          <div className="mx-auto max-w-[860px]">
            <Select defaultValue="카테고리">
              <SelectTrigger className="mb-5 h-9 w-[170px] rounded-none border-border bg-background text-muted-foreground shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="카테고리">카테고리</SelectItem>
                <SelectItem value="뉴스">뉴스</SelectItem>
                <SelectItem value="일상">일상</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={selected.titleTemplate}
              onChange={(event) => updateSelected({ titleTemplate: event.target.value })}
              placeholder="제목을 입력하세요"
              className="h-16 rounded-none border-0 border-b border-border bg-background px-0 text-3xl font-normal text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
            {mode === "preview" ? (
              <div className="mt-10 rounded-lg border border-border bg-card p-6">
                <BlogMarkdownPreview title={selected.titleTemplate} body={selected.bodyTemplate} />
              </div>
            ) : (
              <Textarea
                ref={bodyRef}
                rows={20}
                value={selected.bodyTemplate}
                onChange={(event) => updateSelected({ bodyTemplate: event.target.value })}
                placeholder="마크다운으로 템플릿 내용을 입력하세요"
                className="mt-10 min-h-[520px] resize-none rounded-none border-0 bg-background px-0 font-mono text-base leading-8 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
              />
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              사용 가능 변수: {"{{title}}, {{summary}}, {{detail}}, {{source}}, {{link}}, {{date}}"}
            </p>
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 text-card-foreground backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">{message || "템플릿을 편집한 뒤 저장하세요."}</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={remove}>
              <Trash2 className="mr-1 h-4 w-4" />
              삭제
            </Button>
            <Button type="button" className="rounded-full px-7" onClick={save}>
              완료
            </Button>
          </div>
        </div>
      </div>

      {templateJsonModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setTemplateJsonModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">템플릿 가져오기/내보내기</h2>
                <p className="text-xs text-muted-foreground">블로그 템플릿을 JSON 파일 또는 텍스트로 옮길 수 있습니다.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTemplateJsonModalOpen(false)}>
                <X className="mr-1 h-4 w-4" />
                닫기
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  templateJsonModalMode === "import" ? "border-primary bg-primary/10" : "border-border bg-muted/20"
                }`}
                onClick={() => {
                  setTemplateJsonModalMode("import");
                  setTemplateJsonError(undefined);
                  setTemplateJsonMessage(undefined);
                }}
              >
                <Upload className="mb-3 h-8 w-8" />
                <p className="font-semibold">가져오기</p>
                <p className="mt-1 text-xs text-muted-foreground">JSON 파일 또는 텍스트를 새 블로그 템플릿으로 추가합니다.</p>
              </button>
              <button
                type="button"
                className={`rounded-xl border p-5 text-left transition hover:bg-accent ${
                  templateJsonModalMode === "export" ? "border-primary bg-primary/10" : "border-border bg-muted/20"
                }`}
                onClick={() => {
                  setTemplateJsonModalMode("export");
                  loadCurrentTemplateJsonToTextarea();
                }}
              >
                <Download className="mb-3 h-8 w-8" />
                <p className="font-semibold">내보내기</p>
                <p className="mt-1 text-xs text-muted-foreground">현재 블로그 템플릿 JSON을 확인하고 다운로드합니다.</p>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <Textarea
                value={templateJsonModalMode === "export" ? templateJsonText || buildCurrentTemplateJson() : templateJsonText}
                onChange={(event) => {
                  setTemplateJsonText(event.target.value);
                  if (templateJsonError) setTemplateJsonError(undefined);
                }}
                rows={12}
                className="max-h-[42vh] min-h-[220px] font-mono text-xs"
                placeholder='{"name":"뉴스","category":"뉴스","titleTemplate":"{{title}}","bodyTemplate":"{{summary}}"}'
              />
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onTemplateJsonFileChange}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {templateJsonModalMode === "import" ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => jsonFileInputRef.current?.click()}>
                      JSON 파일
                    </Button>
                    <Button type="button" onClick={importTemplatesFromJsonText}>
                      가져오기
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={loadCurrentTemplateJsonToTextarea}>
                      JSON 텍스트
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void copyCurrentTemplateJson()}>
                      JSON 복사
                    </Button>
                    <Button type="button" onClick={downloadCurrentTemplateJson}>
                      다운로드
                    </Button>
                  </>
                )}
              </div>
              {templateJsonError ? (
                <p className="text-xs text-destructive">{templateJsonError}</p>
              ) : templateJsonMessage ? (
                <p className="text-xs text-emerald-500">{templateJsonMessage}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  형식: 템플릿 객체 1개, 템플릿 배열, 또는 {"{ templates: [...] }"} 형태를 지원합니다.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
