"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Code2,
  Eye,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  MoreHorizontal,
  Quote,
  Smile,
  Sparkles,
  Type,
  Underline
} from "lucide-react";

export type BlogMarkdownAction =
  | "heading"
  | "image"
  | "aiImage"
  | "bold"
  | "italic"
  | "underline"
  | "quote"
  | "table"
  | "link"
  | "list"
  | "code"
  | "html"
  | "script"
  | "fold"
  | "special";

export type BlogMarkdownMode = "edit" | "preview";

const TOOL_BUTTON_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground";

type FormatResult = {
  next: string;
  selectionEnd: number;
  selectionStart: number;
};

function wrapSelection(args: {
  after?: string;
  before: string;
  current: string;
  end: number;
  fallback: string;
  start: number;
}): FormatResult {
  const after = args.after || "";
  const selected = args.current.slice(args.start, args.end) || args.fallback;
  const next = `${args.current.slice(0, args.start)}${args.before}${selected}${after}${args.current.slice(args.end)}`;
  const selectionStart = args.start + args.before.length;
  return {
    next,
    selectionEnd: selectionStart + selected.length,
    selectionStart
  };
}

export function applyBlogMarkdownFormat(current: string, start: number, end: number, action: BlogMarkdownAction): FormatResult {
  const selected = current.slice(start, end);
  if (action === "heading") {
    return wrapSelection({ before: "## ", current, end, fallback: "소제목", start });
  }
  if (action === "image") {
    return wrapSelection({ before: "![", after: "](https://image-url)", current, end, fallback: "이미지 설명", start });
  }
  if (action === "aiImage") {
    return wrapSelection({
      before: "\n```ai-image\n",
      after: "\n```\n",
      current,
      end,
      fallback:
        "기사 제목: {{title}}\n요약: {{summary}}\n본문: {{detail}}\n스타일: 블로그 대표 이미지, 텍스트 없음, 깔끔한 구도",
      start
    });
  }
  if (action === "bold") {
    return wrapSelection({ before: "**", after: "**", current, end, fallback: "굵은 텍스트", start });
  }
  if (action === "italic") {
    return wrapSelection({ before: "*", after: "*", current, end, fallback: "기울임 텍스트", start });
  }
  if (action === "underline") {
    return wrapSelection({ before: "<u>", after: "</u>", current, end, fallback: "밑줄 텍스트", start });
  }
  if (action === "quote") {
    return wrapSelection({ before: "> ", current, end, fallback: "인용문", start });
  }
  if (action === "table") {
    return wrapSelection({
      before: "\n| 항목 | 내용 |\n| --- | --- |\n| ",
      after: " | 값 |\n",
      current,
      end,
      fallback: selected || "이름",
      start
    });
  }
  if (action === "link") {
    return wrapSelection({ before: "[", after: "](https://)", current, end, fallback: "링크 텍스트", start });
  }
  if (action === "list") {
    return wrapSelection({ before: "\n- ", current, end, fallback: "목록", start });
  }
  if (action === "code") {
    return wrapSelection({ before: "\n```\n", after: "\n```\n", current, end, fallback: "code", start });
  }
  if (action === "html") {
    return wrapSelection({ before: "\n<div>\n  ", after: "\n</div>\n", current, end, fallback: "HTML", start });
  }
  if (action === "script") {
    return wrapSelection({
      before: "\n```script\n",
      after: "\n```\n",
      current,
      end,
      fallback:
        '(adsbygoogle = window.adsbygoogle || []).push({\n  google_ad_client: "ca-pub-xxxxxxxxxxxxxxxx",\n  enable_page_level_ads: true\n});',
      start
    });
  }
  if (action === "fold") {
    return wrapSelection({
      before: "\n<details>\n<summary>",
      after: "</summary>\n\n내용\n</details>\n",
      current,
      end,
      fallback: "접은글 제목",
      start
    });
  }
  return wrapSelection({ before: "", current, end, fallback: "※ ", start });
}

export function BlogMarkdownToolbar({
  label,
  mode,
  onFormat,
  onModeChange
}: {
  label: string;
  mode: BlogMarkdownMode;
  onFormat: (action: BlogMarkdownAction) => void;
  onModeChange: (mode: BlogMarkdownMode) => void;
}): React.JSX.Element {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [moreMenuStyle, setMoreMenuStyle] = useState<React.CSSProperties>({});
  const mainActions: Array<{ action: BlogMarkdownAction; icon?: React.ComponentType<{ className?: string }>; label?: string; title: string }> = [
    { action: "heading", icon: Type, title: "소제목" },
    { action: "bold", icon: Bold, title: "굵게" },
    { action: "italic", icon: Italic, title: "기울임" },
    { action: "underline", icon: Underline, title: "밑줄" },
    { action: "quote", icon: Quote, title: "인용" },
    { action: "code", icon: Code2, title: "코드블럭" },
    { action: "link", icon: Link2, title: "링크" },
    { action: "list", icon: List, title: "목록" },
    { action: "image", icon: ImageIcon, title: "이미지" },
    { action: "aiImage", icon: Sparkles, title: "AI 이미지 영역" },
    { action: "table", icon: Grid3X3, title: "표" }
  ];
  const moreActions: Array<{ action: BlogMarkdownAction; icon: React.ComponentType<{ className?: string }>; label: string }> = [
    { action: "fold", icon: FileText, label: "접은글" },
    { action: "script", icon: Code2, label: "스크립트" },
    { action: "html", icon: Code2, label: "HTML블럭" },
    { action: "special", icon: Smile, label: "특수문자" }
  ];

  function openMoreMenu(): void {
    const rect = moreButtonRef.current?.getBoundingClientRect();
    if (!rect) {
      setMoreOpen(true);
      return;
    }
    const menuWidth = 176;
    const menuHeight = 184;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    const top =
      rect.bottom + menuHeight + 8 > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 8)
        : rect.bottom + 8;
    setMoreMenuStyle({
      left,
      position: "fixed",
      top,
      width: menuWidth,
      zIndex: 1000
    });
    setMoreOpen(true);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [moreOpen]);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/95 text-foreground shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-2 overflow-x-auto px-4">
        <span className="mr-3 whitespace-nowrap text-sm font-semibold">{label}</span>
        <div className="inline-flex rounded-md border border-border p-1">
          <button
            type="button"
            className={`h-7 rounded px-3 text-xs ${mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            onClick={() => onModeChange("edit")}
          >
            Markdown
          </button>
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1 rounded px-3 text-xs ${
              mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onModeChange("preview")}
          >
            <Eye className="h-3.5 w-3.5" />
            미리보기
          </button>
        </div>
        <div className="h-5 w-px bg-border" />
        {mainActions.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.action} type="button" className={TOOL_BUTTON_CLASS} title={item.title} onClick={() => onFormat(item.action)}>
              {Icon ? <Icon className="h-4 w-4" /> : item.label}
            </button>
          );
        })}
        <div className="relative">
          <button
            ref={moreButtonRef}
            type="button"
            className={`${TOOL_BUTTON_CLASS} ${moreOpen ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`}
            title="더보기"
            onClick={() => {
              if (moreOpen) {
                setMoreOpen(false);
                return;
              }
              openMoreMenu();
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
      {moreOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="rounded-md border border-border bg-card py-2 text-sm text-card-foreground shadow-xl" style={moreMenuStyle}>
              {moreActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.action}
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
                    onClick={() => {
                      onFormat(item.action);
                      setMoreOpen(false);
                    }}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function escapePreviewHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInlineMarkdownToHtml(text: string): string {
  return String(text || "")
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '<figure class="my-6 overflow-hidden rounded-lg border border-border bg-muted/30"><img src="$2" alt="$1" class="max-h-[520px] w-full object-contain" /><figcaption class="px-3 py-2 text-xs text-muted-foreground">$1</figcaption></figure>')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdownTableToHtml(rows: string[]): string {
  const parsed = rows
    .filter((row) => row.includes("|") && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row))
    .map((row) =>
      row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => renderInlineMarkdownToHtml(cell.trim()))
    );
  if (parsed.length === 0) {
    return "";
  }
  const [head, ...body] = parsed;
  const headHtml = head.map((cell) => `<th class="border border-border bg-muted px-3 py-2 text-left font-semibold">${cell}</th>`).join("");
  const bodyHtml = body
    .map((row) => `<tr>${row.map((cell) => `<td class="border border-border px-3 py-2 align-top">${cell}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="my-5 overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function renderBlogMarkdownToHtml(body: string): string {
  const lines = body.split(/\r?\n/);
  const html: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = "";
  let tableLines: string[] = [];
  let listLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length > 0) {
      html.push(renderMarkdownTableToHtml(tableLines));
      tableLines = [];
    }
  };
  const flushList = () => {
    if (listLines.length > 0) {
      html.push(
        `<ul class="my-4 list-disc space-y-1 pl-6">${listLines
          .map((line) => `<li class="leading-8">${renderInlineMarkdownToHtml(line.replace(/^-\s*/, ""))}</li>`)
          .join("")}</ul>`
      );
      listLines = [];
    }
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      flushTable();
      flushList();
      if (inCode) {
        const code = escapePreviewHtml(codeLines.join("\n"));
        if (codeLang === "ai-image") {
          html.push(
            `<div class="my-6 overflow-hidden rounded-lg border border-primary/30 bg-primary/5"><div class="border-b border-primary/20 px-4 py-2 text-xs font-bold tracking-wide text-primary">AI IMAGE</div><pre class="whitespace-pre-wrap p-4 text-sm leading-6 text-foreground"><code>${code}</code></pre></div>`
          );
        } else {
          const label = codeLang === "script" ? "SCRIPT" : codeLang ? codeLang.toUpperCase() : "CODE";
          html.push(
            `<div class="my-6 overflow-hidden rounded-lg border border-border bg-muted/40"><div class="border-b border-border px-4 py-2 text-xs font-bold tracking-wide text-foreground">${label}</div><pre class="overflow-x-auto p-4 text-sm"><code>${code}</code></pre></div>`
          );
        }
        codeLines = [];
        inCode = false;
        codeLang = "";
      } else {
        inCode = true;
        codeLang = line.trim().replace(/^```/, "").trim().toLowerCase();
      }
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushTable();
      flushList();
      html.push('<div class="h-4"></div>');
      return;
    }
    if (trimmed.startsWith("|")) {
      flushList();
      tableLines.push(line);
      return;
    }
    if (trimmed.startsWith("- ")) {
      flushTable();
      listLines.push(line);
      return;
    }

    flushTable();
    flushList();

    if (trimmed.startsWith("<")) {
      html.push(line);
      return;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2 class="mt-8 text-2xl font-bold">${renderInlineMarkdownToHtml(line.slice(3))}</h2>`);
      return;
    }
    if (line.startsWith("# ")) {
      html.push(`<h1 class="mt-8 text-3xl font-bold">${renderInlineMarkdownToHtml(line.slice(2))}</h1>`);
      return;
    }
    if (line.startsWith("> ")) {
      html.push(`<blockquote class="border-l-4 border-border pl-4 text-muted-foreground">${renderInlineMarkdownToHtml(line.slice(2))}</blockquote>`);
      return;
    }
    html.push(`<p class="leading-8">${renderInlineMarkdownToHtml(line)}</p>`);

    if (index === lines.length - 1) {
      flushTable();
      flushList();
    }
  });
  flushTable();
  flushList();
  return html.join("\n");
}

export function BlogMarkdownPreview({ body, title }: { body: string; title?: string }): React.JSX.Element {
  return (
    <article className="min-h-[470px] space-y-1 text-foreground">
      {title ? <h1 className="mb-8 border-b border-border pb-6 text-3xl font-semibold">{title}</h1> : null}
      <div dangerouslySetInnerHTML={{ __html: renderBlogMarkdownToHtml(body) }} />
    </article>
  );
}
