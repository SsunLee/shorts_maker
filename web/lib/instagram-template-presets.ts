import type {
  InstagramFeedPage,
  InstagramPageElement,
  InstagramShapeElement,
  InstagramTemplate,
  InstagramTemplateMode,
  InstagramTextElement
} from "@/lib/instagram-types";

export type InstagramPresetCategory = "study" | "sentence" | "news" | "blank";

export interface InstagramTemplatePreset {
  id: string;
  name: string;
  category: InstagramPresetCategory;
  /** 갤러리 카드에 노출되는 한 줄 설명 */
  description: string;
  /** 검색어 매칭에만 쓰이는 보조 키워드 */
  keywords: string[];
  build: () => InstagramTemplate;
}

export const INSTAGRAM_PRESET_CATEGORY_LABELS: Record<InstagramPresetCategory, string> = {
  study: "일본어 학습",
  sentence: "문장 읽기",
  news: "뉴스",
  blank: "빈 캔버스"
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `igp_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function bindingKey(): string {
  return `auto_txt_${uid().replace(/-/g, "").slice(0, 8)}`;
}

type TextOptions = {
  text: string;
  x?: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  zIndex?: number;
  plain?: boolean;
};

/**
 * 텍스트 레이어를 만듭니다.
 * backgroundColor #FFFFFF + padding 0 + opacity 1 조합은 렌더러에서 "배경 없음"으로 취급되므로
 * 투명 텍스트를 원하면 이 조합을 유지해야 합니다.
 */
function text(options: TextOptions): InstagramTextElement {
  return {
    id: uid(),
    type: "text",
    textMode: options.plain ? "plain" : "variable",
    bindingKey: bindingKey(),
    x: options.x ?? 50,
    y: options.y,
    width: options.width ?? 84,
    height: options.height ?? 18,
    rotation: 0,
    opacity: 1,
    zIndex: options.zIndex ?? 2,
    text: options.text,
    autoWrap: true,
    color: options.color ?? "#111111",
    fontFamily: options.fontFamily ?? "Noto Sans KR",
    fontSize: options.fontSize ?? 56,
    lineHeight: options.lineHeight ?? 1.25,
    letterSpacing: options.letterSpacing ?? 0,
    rubyGap: 6,
    textOffsetY: 0,
    textAlign: options.align ?? "center",
    bold: options.bold ?? false,
    italic: false,
    underline: false,
    strikeThrough: false,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    backgroundColor: "#FFFFFF",
    backgroundOpacity: 1,
    padding: 0
  };
}

type BandOptions = {
  y: number;
  height: number;
  fill: string;
  x?: number;
  width?: number;
  cornerRadius?: number;
  zIndex?: number;
  opacity?: number;
};

function band(options: BandOptions): InstagramShapeElement {
  return {
    id: uid(),
    type: "shape",
    shape: options.cornerRadius ? "roundedRectangle" : "rectangle",
    x: options.x ?? 50,
    y: options.y,
    width: options.width ?? 100,
    height: options.height,
    rotation: 0,
    opacity: options.opacity ?? 1,
    zIndex: options.zIndex ?? 1,
    fillEnabled: true,
    fillColor: options.fill,
    fillOpacity: 1,
    strokeColor: "#111111",
    strokeWidth: 0,
    cornerRadius: options.cornerRadius ?? 0
  };
}

function rule(y: number, fill: string, width = 18): InstagramShapeElement {
  return band({ y, height: 0.6, fill, width, cornerRadius: 8, zIndex: 1 });
}

function page(
  name: string,
  backgroundColor: string,
  elements: InstagramPageElement[],
  durationSec = 4
): InstagramFeedPage {
  return {
    id: uid(),
    name,
    backgroundColor,
    backgroundImageUrl: "",
    backgroundFit: "cover",
    durationSec,
    audioEnabled: false,
    audioProvider: "auto",
    audioVoice: "alloy",
    audioSpeed: 1,
    elements
  };
}

type TemplateOptions = {
  name: string;
  mode?: InstagramTemplateMode;
  pages: InstagramFeedPage[];
  hashtags?: string[];
  hashtagSourceFields?: string[];
  captionSourceFields?: string[];
  canvasPreset?: string;
  canvasWidth?: number;
  canvasHeight?: number;
};

function template(options: TemplateOptions): InstagramTemplate {
  return {
    id: uid(),
    templateName: options.name,
    mode: options.mode ?? "general",
    sourceTitle: "{{subject}}",
    sourceTopic: "{{description}}",
    bgmEnabled: false,
    bgmUrl: "",
    bgmVolume: 0.18,
    hashtags: options.hashtags ?? [],
    hashtagSourceFields: options.hashtagSourceFields ?? ["keyword", "subject"],
    captionSourceFields: options.captionSourceFields ?? ["Caption", "Subject"],
    canvasPreset: options.canvasPreset ?? "instagram_feed_portrait",
    canvasWidth: options.canvasWidth ?? 1080,
    canvasHeight: options.canvasHeight ?? 1350,
    pageDurationSec: 4,
    pageCount: options.pages.length,
    pages: options.pages,
    customFonts: [],
    pinnedToGallery: false,
    updatedAt: new Date().toISOString()
  };
}

const INK = "#12100E";
const PAPER = "#F6F2E9";
const NIGHT = "#101820";
const NIGHT_INK = "#E7F1FB";
const MOSS = "#14261E";
const MOSS_INK = "#EAFBF2";
const PLUM = "#1D1A2E";
const PLUM_INK = "#EFEBFF";
const NEWS_BG = "#111417";
const NEWS_INK = "#F2F5F7";
const NEWS_ACCENT = "#E2544B";

export const INSTAGRAM_TEMPLATE_PRESETS: InstagramTemplatePreset[] = [
  {
    id: "study-word-flip",
    name: "단어 앞뒤 카드",
    category: "study",
    description: "단어를 크게 보여주고 뒷면에 뜻을 붙이는 2장 구성",
    keywords: ["단어", "앞면", "뒷면", "플래시카드", "JLPT", "암기"],
    build: () =>
      template({
        name: "단어 앞뒤 카드",
        hashtags: ["#일본어", "#일본어공부", "#JLPT"],
        pages: [
          page("01 앞면", MOSS, [
            text({ text: "{{keyword}}", y: 16, height: 8, fontSize: 32, color: "#7BE3AF", letterSpacing: 2 }),
            rule(23, "#7BE3AF"),
            text({
              text: "{{subject}}",
              y: 44,
              height: 26,
              fontSize: 92,
              fontFamily: "Noto Sans JP",
              color: MOSS_INK,
              bold: true
            }),
            text({ text: "뜻은 다음 장에서", y: 88, height: 7, fontSize: 30, color: "#6F8F80", plain: true })
          ]),
          page("02 뒷면", MOSS_INK, [
            text({
              text: "{{subject}}",
              y: 20,
              height: 12,
              fontSize: 52,
              fontFamily: "Noto Sans JP",
              color: "#22483A",
              bold: true
            }),
            rule(34, "#22483A"),
            text({
              text: "{{description}}",
              y: 60,
              height: 40,
              fontSize: 48,
              color: INK,
              bold: true,
              lineHeight: 1.45
            })
          ])
        ]
      })
  },
  {
    id: "study-word-full",
    name: "단어 + 예문 + 뜻",
    category: "study",
    description: "단어 · 읽기 · 예문 · 뜻 · 정리까지 6장으로 이어지는 기본 세트",
    keywords: ["단어", "예문", "뜻", "6장", "JLPT", "동사", "형용사"],
    build: () =>
      template({
        name: "단어 + 예문 + 뜻",
        hashtags: ["#일본어", "#일본어단어", "#JLPT"],
        pages: [
          page("01 표지", NIGHT, [
            text({ text: "{{keyword}}", y: 40, height: 10, fontSize: 44, color: "#7FB6E8", letterSpacing: 3 }),
            rule(50, "#7FB6E8", 22),
            text({ text: "오늘의 표현", y: 60, height: 10, fontSize: 72, color: NIGHT_INK, bold: true, plain: true })
          ]),
          page("02 단어", NIGHT, [
            text({
              text: "{{subject}}",
              y: 44,
              height: 24,
              fontSize: 88,
              fontFamily: "Noto Sans JP",
              color: NIGHT_INK,
              bold: true
            }),
            text({ text: "{{keyword}}", y: 72, height: 8, fontSize: 34, color: "#7FB6E8" })
          ]),
          page("03 예문", PAPER, [
            band({ y: 8, height: 16, fill: "#E9E2D3" }),
            text({ text: "예문", y: 8, height: 8, fontSize: 38, color: "#6B6355", bold: true, plain: true }),
            text({
              text: "{{narration}}",
              y: 50,
              height: 46,
              fontSize: 46,
              fontFamily: "Noto Sans JP",
              color: INK,
              lineHeight: 1.6
            })
          ]),
          page("04 뜻", PAPER, [
            band({ y: 8, height: 16, fill: "#E9E2D3" }),
            text({ text: "뜻", y: 8, height: 8, fontSize: 38, color: "#6B6355", bold: true, plain: true }),
            text({
              text: "{{description}}",
              y: 50,
              height: 44,
              fontSize: 48,
              color: INK,
              bold: true,
              lineHeight: 1.55
            })
          ]),
          page("05 다시 보기", NIGHT, [
            text({
              text: "{{subject}}",
              y: 36,
              height: 18,
              fontSize: 76,
              fontFamily: "Noto Sans JP",
              color: NIGHT_INK,
              bold: true
            }),
            rule(56, "#7FB6E8", 14),
            text({ text: "{{description}}", y: 72, height: 26, fontSize: 42, color: "#B9CFE3", lineHeight: 1.5 })
          ]),
          page("06 마무리", NIGHT_INK, [
            text({ text: "저장해두고 내일 다시 보기", y: 46, height: 14, fontSize: 58, color: "#1B3450", bold: true, plain: true }),
            text({ text: "{{keyword}}", y: 66, height: 8, fontSize: 36, color: "#5C7C9B" })
          ])
        ]
      })
  },
  {
    id: "study-quiz",
    name: "3초 퀴즈",
    category: "study",
    description: "질문 → 생각할 시간 → 정답 순서로 넘기는 4장 퀴즈",
    keywords: ["퀴즈", "정답", "문제", "맞히기", "릴스"],
    build: () =>
      template({
        name: "3초 퀴즈",
        hashtags: ["#일본어퀴즈", "#일본어공부"],
        pages: [
          page("01 질문", PLUM, [
            text({ text: "이거 일본어로?", y: 22, height: 10, fontSize: 52, color: "#B9AEFF", bold: true, plain: true }),
            text({ text: "{{description}}", y: 52, height: 36, fontSize: 60, color: PLUM_INK, bold: true, lineHeight: 1.4 })
          ]),
          page("02 카운트", PLUM, [
            text({ text: "3", y: 50, height: 30, fontSize: 240, color: "#4B4470", bold: true, plain: true })
          ], 3),
          page("03 정답", PLUM_INK, [
            text({ text: "정답", y: 20, height: 8, fontSize: 40, color: "#6E63A8", bold: true, plain: true }),
            rule(28, "#6E63A8", 12),
            text({
              text: "{{subject}}",
              y: 52,
              height: 26,
              fontSize: 84,
              fontFamily: "Noto Sans JP",
              color: "#241F3D",
              bold: true
            })
          ]),
          page("04 예문", PLUM_INK, [
            text({
              text: "{{narration}}",
              y: 50,
              height: 46,
              fontSize: 44,
              fontFamily: "Noto Sans JP",
              color: "#241F3D",
              lineHeight: 1.6
            })
          ])
        ]
      })
  },
  {
    id: "sentence-ruby",
    name: "루비 앞뒤 카드",
    category: "sentence",
    description: "일본어 원문 → 후리가나 → 해석 순으로 넘기는 4장",
    keywords: ["루비", "후리가나", "문장", "읽기", "원문", "해석"],
    build: () =>
      template({
        name: "루비 앞뒤 카드",
        mode: "sentence_reading",
        hashtags: ["#일본어문장", "#일본어읽기"],
        pages: [
          page("01 일본어만", NIGHT, [
            text({
              text: "{{narration}}",
              y: 50,
              height: 56,
              fontSize: 46,
              fontFamily: "Noto Sans JP",
              color: NIGHT_INK,
              align: "left",
              x: 52,
              lineHeight: 1.8
            })
          ]),
          page("02 루비 앞부분", NIGHT, [
            text({
              text: "{{subject}}",
              y: 46,
              height: 50,
              fontSize: 46,
              fontFamily: "Noto Sans JP",
              color: NIGHT_INK,
              align: "left",
              x: 52,
              lineHeight: 2
            }),
            text({ text: "후리가나", y: 84, height: 7, fontSize: 30, color: "#6E8AA3", plain: true })
          ]),
          page("03 뜻", PAPER, [
            text({
              text: "{{description}}",
              y: 50,
              height: 54,
              fontSize: 44,
              color: INK,
              align: "left",
              x: 52,
              lineHeight: 1.75
            })
          ]),
          page("04 정리", PAPER, [
            band({ y: 50, height: 62, fill: "#EAE3D4", width: 84, cornerRadius: 32 }),
            text({ text: "오늘의 표현", y: 26, height: 8, fontSize: 36, color: "#6B6355", bold: true, plain: true }),
            text({
              text: "{{subject}}",
              y: 54,
              height: 42,
              fontSize: 44,
              fontFamily: "Noto Sans JP",
              color: INK,
              lineHeight: 1.7
            })
          ])
        ]
      })
  },
  {
    id: "sentence-diary",
    name: "일본어 일기",
    category: "sentence",
    description: "표지 + 문단 4개 + 마무리로 이어지는 일기 형식 6장",
    keywords: ["일기", "일상", "워홀", "문단", "긴 문장"],
    build: () =>
      template({
        name: "일본어 일기",
        mode: "sentence_reading",
        hashtags: ["#일본어일기", "#일본어공부"],
        pages: [
          page("01 표지", PAPER, [
            band({ y: 50, height: 46, fill: "#E4DCCA", width: 76, cornerRadius: 24 }),
            text({ text: "오늘의 일본어 일기", y: 44, height: 12, fontSize: 66, color: INK, bold: true, plain: true }),
            text({ text: "{{keyword}}", y: 58, height: 8, fontSize: 34, color: "#6B6355" })
          ]),
          page("02 문단 1", PAPER, [
            text({
              text: "{{narration}}",
              y: 50,
              height: 56,
              fontSize: 44,
              fontFamily: "Noto Sans JP",
              color: INK,
              align: "left",
              x: 52,
              lineHeight: 1.9
            })
          ]),
          page("03 문단 2", PAPER, [
            text({
              text: "{{subject}}",
              y: 50,
              height: 56,
              fontSize: 44,
              fontFamily: "Noto Sans JP",
              color: INK,
              align: "left",
              x: 52,
              lineHeight: 1.9
            })
          ]),
          page("04 해석", NIGHT, [
            text({ text: "해석", y: 18, height: 8, fontSize: 36, color: "#7FB6E8", bold: true, plain: true }),
            text({
              text: "{{description}}",
              y: 54,
              height: 52,
              fontSize: 42,
              color: NIGHT_INK,
              align: "left",
              x: 52,
              lineHeight: 1.8
            })
          ]),
          page("05 오늘의 단어", NIGHT, [
            text({ text: "오늘의 단어", y: 20, height: 8, fontSize: 36, color: "#7FB6E8", bold: true, plain: true }),
            text({
              text: "{{keyword}}",
              y: 50,
              height: 28,
              fontSize: 66,
              fontFamily: "Noto Sans JP",
              color: NIGHT_INK,
              bold: true
            })
          ]),
          page("06 마무리", PAPER, [
            text({ text: "내일도 한 줄씩", y: 48, height: 12, fontSize: 60, color: INK, bold: true, plain: true })
          ])
        ]
      })
  },
  {
    id: "news-headline",
    name: "뉴스 헤드라인",
    category: "news",
    description: "헤드라인 한 장 + 요약 두 장. 가져온 뉴스에 바로 연결됩니다",
    keywords: ["뉴스", "헤드라인", "속보", "요약"],
    build: () =>
      template({
        name: "뉴스 헤드라인",
        mode: "news",
        hashtags: ["#뉴스", "#오늘의뉴스"],
        hashtagSourceFields: ["keyword", "subject"],
        pages: [
          page("01 헤드라인", NEWS_BG, [
            band({ y: 6, height: 1.2, fill: NEWS_ACCENT, width: 100 }),
            text({ text: "{{keyword}}", y: 16, height: 7, fontSize: 32, color: NEWS_ACCENT, letterSpacing: 3 }),
            text({
              text: "{{subject}}",
              y: 50,
              height: 44,
              fontSize: 62,
              color: NEWS_INK,
              bold: true,
              align: "left",
              x: 52,
              lineHeight: 1.35
            }),
            band({ y: 92, height: 0.5, fill: "#39414A", width: 84 })
          ]),
          page("02 요약", NEWS_BG, [
            text({ text: "3줄 요약", y: 16, height: 8, fontSize: 40, color: NEWS_ACCENT, bold: true, plain: true }),
            text({
              text: "{{description}}",
              y: 54,
              height: 52,
              fontSize: 44,
              color: NEWS_INK,
              align: "left",
              x: 52,
              lineHeight: 1.75
            })
          ]),
          page("03 출처", NEWS_INK, [
            text({ text: "자세한 내용은 프로필 링크", y: 46, height: 12, fontSize: 52, color: "#1A1E22", bold: true, plain: true }),
            text({ text: "{{keyword}}", y: 62, height: 8, fontSize: 32, color: "#5A626A" })
          ])
        ]
      })
  },
  {
    id: "news-photo",
    name: "사진 배경 뉴스",
    category: "news",
    description: "AI 이미지 위에 헤드라인을 얹는 3장 구성",
    keywords: ["뉴스", "사진", "이미지", "AI", "배경"],
    build: () =>
      template({
        name: "사진 배경 뉴스",
        mode: "news",
        hashtags: ["#뉴스", "#이슈"],
        pages: [
          page("01 커버", NEWS_BG, [
            {
              id: uid(),
              type: "image",
              x: 50,
              y: 40,
              width: 100,
              height: 62,
              rotation: 0,
              opacity: 1,
              zIndex: 0,
              imageUrl: "",
              mediaType: "image",
              fit: "cover",
              cropX: 50,
              cropY: 50,
              borderRadius: 0,
              overlayColor: "#000000",
              overlayOpacity: 0.35,
              aiGenerateEnabled: true,
              aiModel: "auto",
              aiPrompt: "",
              aiPromptVariableKey: "subject",
              aiStylePreset: "Cinematic photo-real",
              aiImageOrientation: "horizontal"
            },
            text({
              text: "{{subject}}",
              y: 80,
              height: 30,
              fontSize: 54,
              color: NEWS_INK,
              bold: true,
              align: "left",
              x: 52,
              lineHeight: 1.35
            })
          ]),
          page("02 본문", NEWS_BG, [
            text({
              text: "{{description}}",
              y: 50,
              height: 56,
              fontSize: 44,
              color: NEWS_INK,
              align: "left",
              x: 52,
              lineHeight: 1.75
            })
          ]),
          page("03 마무리", NEWS_ACCENT, [
            text({ text: "저장하고 나중에 다시 보기", y: 48, height: 14, fontSize: 58, color: "#FFF3F2", bold: true, plain: true })
          ])
        ]
      })
  },
  {
    id: "blank-portrait",
    name: "빈 캔버스 · 피드",
    category: "blank",
    description: "1080×1350 한 장. 레이어를 처음부터 직접 쌓습니다",
    keywords: ["빈", "처음부터", "직접", "1080", "1350"],
    build: () =>
      template({
        name: "새 템플릿",
        pages: [page("01", "#FFFFFF", [])]
      })
  },
  {
    id: "blank-square",
    name: "빈 캔버스 · 정사각",
    category: "blank",
    description: "1080×1080 한 장",
    keywords: ["빈", "정사각", "스퀘어", "1080"],
    build: () =>
      template({
        name: "새 템플릿 (정사각)",
        canvasPreset: "instagram_square",
        canvasHeight: 1080,
        pages: [page("01", "#FFFFFF", [])]
      })
  },
  {
    id: "blank-story",
    name: "빈 캔버스 · 릴스",
    category: "blank",
    description: "1080×1920 한 장",
    keywords: ["빈", "릴스", "스토리", "세로", "1920"],
    build: () =>
      template({
        name: "새 템플릿 (릴스)",
        canvasPreset: "instagram_story",
        canvasHeight: 1920,
        pages: [page("01", "#FFFFFF", [])]
      })
  }
];

export function findInstagramTemplatePreset(presetId: string): InstagramTemplatePreset | undefined {
  return INSTAGRAM_TEMPLATE_PRESETS.find((preset) => preset.id === presetId);
}
