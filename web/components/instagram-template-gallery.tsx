"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INSTAGRAM_PRESET_CATEGORY_LABELS,
  INSTAGRAM_TEMPLATE_PRESETS,
  type InstagramPresetCategory,
  type InstagramTemplatePreset
} from "@/lib/instagram-template-presets";
import type { InstagramFeedPage, InstagramTemplate } from "@/lib/instagram-types";
import { cn } from "@/lib/utils";

type GalleryFilter = "all" | InstagramPresetCategory | "mine";

type GalleryCard = {
  key: string;
  kind: "preset" | "mine";
  name: string;
  description: string;
  categoryLabel: string;
  filter: GalleryFilter;
  haystack: string;
  pageCount: number;
  page?: InstagramFeedPage;
  canvasWidth: number;
  canvasHeight: number;
  preset?: InstagramTemplatePreset;
  templateId?: string;
};

const FILTERS: Array<{ id: GalleryFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "study", label: INSTAGRAM_PRESET_CATEGORY_LABELS.study },
  { id: "sentence", label: INSTAGRAM_PRESET_CATEGORY_LABELS.sentence },
  { id: "news", label: INSTAGRAM_PRESET_CATEGORY_LABELS.news },
  { id: "mine", label: "내 프리셋" },
  { id: "blank", label: INSTAGRAM_PRESET_CATEGORY_LABELS.blank }
];

const SEARCH_EXAMPLES = ["JLPT N5 동사 카드", "오늘의 뉴스 3줄 요약", "일본어 일기 루비 카드", "3초 퀴즈"];

function relativeDay(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return "오늘 수정";
  if (days === 1) return "어제 수정";
  if (days < 30) return `${days}일 전 수정`;
  return new Date(time).toLocaleDateString();
}

/**
 * 템플릿 첫 페이지를 카드 크기로 축소해 그립니다.
 * 실제 렌더러를 돌리지 않고 레이어 좌표만 그대로 옮기므로 가볍고, 저장된 구성과 어긋나지 않습니다.
 * 폰트 크기는 캔버스 폭 대비 비율(cqw)로 환산해 카드 크기와 무관하게 비례를 유지합니다.
 */
function PagePreview(props: {
  page?: InstagramFeedPage;
  canvasWidth: number;
  canvasHeight: number;
}): React.JSX.Element {
  const { page, canvasWidth, canvasHeight } = props;
  const ratio = `${canvasWidth} / ${canvasHeight}`;

  if (!page) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className="flex w-full items-center justify-center rounded-md border border-dashed border-border bg-background/60 text-xs text-muted-foreground"
      >
        빈 캔버스
      </div>
    );
  }

  const layers = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      style={{
        aspectRatio: ratio,
        background: page.backgroundColor || "#FFFFFF",
        containerType: "inline-size"
      }}
      className="relative w-full overflow-hidden rounded-md"
    >
      {layers.map((layer) => {
        const box: React.CSSProperties = {
          position: "absolute",
          left: `${layer.x - layer.width / 2}%`,
          top: `${layer.y - layer.height / 2}%`,
          width: `${layer.width}%`,
          height: `${layer.height}%`,
          opacity: layer.opacity,
          transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined
        };

        if (layer.type === "shape") {
          return (
            <div
              key={layer.id}
              style={{
                ...box,
                background: layer.fillEnabled ? layer.fillColor : "transparent",
                opacity: layer.opacity * (layer.fillOpacity ?? 1),
                borderRadius: `${(layer.cornerRadius / canvasWidth) * 100}cqw`,
                border: layer.strokeWidth ? `1px solid ${layer.strokeColor}` : undefined
              }}
            />
          );
        }

        if (layer.type === "image" || layer.type === "video") {
          return (
            <div
              key={layer.id}
              style={{
                ...box,
                background: layer.imageUrl ? `center / cover url(${layer.imageUrl})` : "rgba(127,127,127,.28)",
                borderRadius: `${(layer.borderRadius / canvasWidth) * 100}cqw`
              }}
            />
          );
        }

        return (
          <div
            key={layer.id}
            style={{
              ...box,
              display: "flex",
              alignItems: "center",
              justifyContent:
                layer.textAlign === "left" ? "flex-start" : layer.textAlign === "right" ? "flex-end" : "center",
              color: layer.color,
              fontFamily: layer.fontFamily,
              fontSize: `${(layer.fontSize / canvasWidth) * 100}cqw`,
              fontWeight: layer.bold ? 700 : 400,
              lineHeight: layer.lineHeight,
              letterSpacing: `${(layer.letterSpacing / canvasWidth) * 100}cqw`,
              textAlign: layer.textAlign,
              overflow: "hidden",
              whiteSpace: "pre-line"
            }}
          >
            <span style={{ width: "100%" }}>{layer.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InstagramTemplateGallery(props: {
  templates: InstagramTemplate[];
  busy?: boolean;
  onUsePreset: (preset: InstagramTemplatePreset) => void;
  onOpenTemplate: (templateId: string) => void;
  /** 값이 없으면 닫기 버튼을 숨깁니다. (저장된 템플릿이 없어 갤러리가 유일한 화면일 때) */
  onClose?: () => void;
}): React.JSX.Element {
  const { templates, busy, onUsePreset, onOpenTemplate, onClose } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string>();

  const cards = useMemo<GalleryCard[]>(() => {
    const presetCards: GalleryCard[] = INSTAGRAM_TEMPLATE_PRESETS.map((preset) => ({
      key: `preset:${preset.id}`,
      kind: "preset",
      name: preset.name,
      description: preset.description,
      categoryLabel: INSTAGRAM_PRESET_CATEGORY_LABELS[preset.category],
      filter: preset.category,
      haystack: [preset.name, preset.description, ...preset.keywords].join(" ").toLowerCase(),
      pageCount: 0,
      canvasWidth: 1080,
      canvasHeight: 1350,
      preset
    }));

    // 프리셋 미리보기는 실제 build() 결과의 첫 페이지를 씁니다.
    presetCards.forEach((card) => {
      if (!card.preset) return;
      const built = card.preset.build();
      card.page = built.pages[0];
      card.pageCount = built.pages.length;
      card.canvasWidth = built.canvasWidth ?? 1080;
      card.canvasHeight = built.canvasHeight ?? 1350;
    });

    const mineCards: GalleryCard[] = templates
      .filter((item) => item.pinnedToGallery)
      .map((item) => ({
        key: `mine:${item.id}`,
        kind: "mine",
        name: item.templateName,
        description: relativeDay(item.updatedAt),
        categoryLabel: "내 프리셋",
        filter: "mine",
        haystack: [item.templateName, item.mode].join(" ").toLowerCase(),
        pageCount: item.pages.length,
        page: item.pages[0],
        canvasWidth: item.canvasWidth ?? 1080,
        canvasHeight: item.canvasHeight ?? 1350,
        templateId: item.id
      }));

    return [...mineCards, ...presetCards];
  }, [templates]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (filter !== "all" && card.filter !== filter) return false;
      if (!needle) return true;
      return card.haystack.includes(needle);
    });
  }, [cards, filter, query]);

  const selected = cards.find((card) => card.key === selectedKey);
  const pinnedCount = cards.filter((card) => card.kind === "mine").length;

  function start(card: GalleryCard): void {
    if (card.kind === "mine" && card.templateId) {
      onOpenTemplate(card.templateId);
      return;
    }
    if (card.preset) {
      onUsePreset(card.preset);
    }
  }

  const blankPreset = INSTAGRAM_TEMPLATE_PRESETS.find((preset) => preset.id === "blank-portrait");

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">무엇을 만들고 싶으신가요?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            한 줄로 적으면 맞는 템플릿을 추려 드립니다. 아래에서 바로 골라도 됩니다.
          </p>
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose} title="갤러리 닫기">
            <X className="h-4 w-4" />
            닫기
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-info" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예) JLPT N5 동사 카드 6장"
            className="h-12 rounded-xl bg-card pl-11 text-base"
            aria-label="템플릿 검색"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">예시</span>
          {SEARCH_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="inline-flex h-7 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const hidden = item.id === "mine" && pinnedCount === 0;
            if (hidden) return null;
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors",
                  active
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {blankPreset ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onUsePreset(blankPreset)} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            빈 캔버스에서 시작
          </Button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <Search className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            &lsquo;{query.trim()}&rsquo; 와(과) 맞는 템플릿이 없습니다. 다른 낱말로 찾아보시거나 빈 캔버스에서 시작하세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((card) => {
            const active = card.key === selectedKey;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setSelectedKey(card.key)}
                onDoubleClick={() => start(card)}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-card p-2 text-left transition-shadow",
                  active ? "border-info shadow-[0_0_0_1px_hsl(var(--info))]" : "border-border hover:border-border/60"
                )}
              >
                <div className="relative">
                  <PagePreview page={card.page} canvasWidth={card.canvasWidth} canvasHeight={card.canvasHeight} />
                  {card.pageCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                      {card.pageCount}장
                    </span>
                  ) : null}
                </div>
                <div className="px-1 pb-1">
                  <p className="truncate text-[13px] font-semibold">{card.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {card.categoryLabel} · {card.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 backdrop-blur-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 shrink-0">
              <PagePreview page={selected.page} canvasWidth={selected.canvasWidth} canvasHeight={selected.canvasHeight} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selected.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.categoryLabel} · {selected.description}
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => start(selected)} disabled={busy}>
            {selected.kind === "mine" ? "이 템플릿 열기" : "이 템플릿으로 시작"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
