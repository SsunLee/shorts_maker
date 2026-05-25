import type {
  InstagramFeedPage,
  InstagramImageElement,
  InstagramPageElement,
  InstagramShapeElement,
  InstagramShapeType,
  InstagramTextElement
} from "@/lib/instagram-types";

const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;
export const SENTENCE_READING_SERIF_FONT = "문장 읽기 명조";

export type SentenceReadingRubyLine = {
  html: string;
  plain: string;
};

export type SentenceReadingBilingualLine = {
  jaHtml: string;
  jaPlain: string;
  ko: string;
};

export type SentenceReadingKanjiItem = {
  reading: string;
  word: string;
  meaning: string;
};

export type SentenceReadingGrammarPattern = {
  pattern: string;
  meaning: string;
  exampleJa?: string;
  exampleKo?: string;
};

export type SentenceReadingCardSet = {
  audioScript: string;
  bilingualBack: SentenceReadingBilingualLine[];
  bilingualFront: SentenceReadingBilingualLine[];
  grammarPatterns: SentenceReadingGrammarPattern[];
  hashtags: string;
  instagramDescription: string;
  instagramTitle: string;
  japaneseOnlyBlocks: string[];
  jlptLevel: string;
  kanjiGlossary: SentenceReadingKanjiItem[];
  postTitle: string;
  rubyBackLines: SentenceReadingRubyLine[];
  rubyFrontLines: SentenceReadingRubyLine[];
  title: string;
};

export type SentenceReadingUploadInfo = {
  cardTitle: string;
  caption: string;
  description: string;
  hashtags: string;
  instagramTitle: string;
};

const DEFAULT_HASHTAGS =
  "#일본어공부 #일본어읽기 #일본어일기 #JLPTN5 #JLPTN4 #일본어회화 #기초일본어 #초급일본어 #쑨에듀\n#日本語 #日本語学習 #日本語日記 #やさしい日本語 #JLPT #毎日日本語";

const SENTENCE_READING_TITLE_PREFIX = "오늘의 일본어 일기 | ";

const SAMPLE_CARD_SET: SentenceReadingCardSet = {
  title: "오늘의 일본어 일기 | 한국 워홀 일상",
  postTitle: "JLPT N5~N4 일본어 일기｜한국 워홀 일상",
  instagramTitle: "JLPT N5~N4 일본어 일기｜한국 워홀 일상",
  instagramDescription: "",
  jlptLevel: "N5~N4",
  audioScript:
    "今日はアルバイトが早く終わったので、\n帰りにコンビニでキンパを買いました。\n\n韓国でのワーホリ生活にも、\n少しずつ慣れてきて、\n前より不安が少なくなりました。\n\n夜は部屋でラテを飲みながら、\n家族にメッセージを送りました。\n\n大変な日もありますが、\n今の毎日を大切にしたいです。",
  japaneseOnlyBlocks: [
    "今日はアルバイトが早く終わったので、\n帰りにコンビニでキンパを買いました。",
    "韓国でのワーホリ生活にも、\n少しずつ慣れてきて、\n前より不安が少なくなりました。",
    "夜は部屋でラテを飲みながら、\n家族にメッセージを送りました。",
    "大変な日もありますが、\n今の毎日を大切にしたいです。"
  ],
  rubyFrontLines: [
    {
      plain: "今日はアルバイトが早く終わったので、",
      html: "<ruby>今日<rt>きょう</rt></ruby>はアルバイトが<ruby>早<rt>はや</rt></ruby>く<ruby>終<rt>お</rt></ruby>わったので、"
    },
    {
      plain: "帰りにコンビニでキンパを買いました。",
      html: "<ruby>帰<rt>かえ</rt></ruby>りにコンビニでキンパを<ruby>買<rt>か</rt></ruby>いました。"
    },
    {
      plain: "韓国でのワーホリ生活にも、",
      html: "<ruby>韓国<rt>かんこく</rt></ruby>でのワーホリ<ruby>生活<rt>せいかつ</rt></ruby>にも、"
    },
    {
      plain: "少しずつ慣れてきて、",
      html: "<ruby>少<rt>すこ</rt></ruby>しずつ<ruby>慣<rt>な</rt></ruby>れてきて、"
    },
    {
      plain: "前より不安が少なくなりました。",
      html: "<ruby>前<rt>まえ</rt></ruby>より<ruby>不安<rt>ふあん</rt></ruby>が<ruby>少<rt>すく</rt></ruby>なくなりました。"
    }
  ],
  rubyBackLines: [
    {
      plain: "夜は部屋でラテを飲みながら、",
      html: "<ruby>夜<rt>よる</rt></ruby>は<ruby>部屋<rt>へや</rt></ruby>でラテを<ruby>飲<rt>の</rt></ruby>みながら、"
    },
    {
      plain: "家族にメッセージを送りました。",
      html: "<ruby>家族<rt>かぞく</rt></ruby>にメッセージを<ruby>送<rt>おく</rt></ruby>りました。"
    },
    {
      plain: "大変な日もありますが、",
      html: "<ruby>大変<rt>たいへん</rt></ruby>な<ruby>日<rt>ひ</rt></ruby>もありますが、"
    },
    {
      plain: "今の毎日を大切にしたいです。",
      html: "<ruby>今<rt>いま</rt></ruby>の<ruby>毎日<rt>まいにち</rt></ruby>を<ruby>大切<rt>たいせつ</rt></ruby>にしたいです。"
    }
  ],
  bilingualFront: [
    {
      jaPlain: "今日はアルバイトが早く終わったので、",
      jaHtml: "<ruby>今日<rt>きょう</rt></ruby>はアルバイトが<ruby>早<rt>はや</rt></ruby>く<ruby>終<rt>お</rt></ruby>わったので、",
      ko: "오늘은 아르바이트가 일찍 끝났기 때문에"
    },
    {
      jaPlain: "帰りにコンビニでキンパを買いました。",
      jaHtml: "<ruby>帰<rt>かえ</rt></ruby>りにコンビニでキンパを<ruby>買<rt>か</rt></ruby>いました。",
      ko: "돌아오는 길에 편의점에서 김밥을 샀습니다."
    },
    {
      jaPlain: "韓国でのワーホリ生活にも、",
      jaHtml: "<ruby>韓国<rt>かんこく</rt></ruby>でのワーホリ<ruby>生活<rt>せいかつ</rt></ruby>にも、",
      ko: "한국에서의 워홀 생활에도"
    },
    {
      jaPlain: "少しずつ慣れてきて、",
      jaHtml: "<ruby>少<rt>すこ</rt></ruby>しずつ<ruby>慣<rt>な</rt></ruby>れてきて、",
      ko: "조금씩 익숙해져서"
    },
    {
      jaPlain: "前より不安が少なくなりました。",
      jaHtml: "<ruby>前<rt>まえ</rt></ruby>より<ruby>不安<rt>ふあん</rt></ruby>が<ruby>少<rt>すく</rt></ruby>なくなりました。",
      ko: "전보다 불안이 줄어들었습니다."
    }
  ],
  bilingualBack: [
    {
      jaPlain: "夜は部屋でラテを飲みながら、",
      jaHtml: "<ruby>夜<rt>よる</rt></ruby>は<ruby>部屋<rt>へや</rt></ruby>でラテを<ruby>飲<rt>の</rt></ruby>みながら、",
      ko: "밤에는 방에서 라떼를 마시면서"
    },
    {
      jaPlain: "家族にメッセージを送りました。",
      jaHtml: "<ruby>家族<rt>かぞく</rt></ruby>にメッセージを<ruby>送<rt>おく</rt></ruby>りました。",
      ko: "가족에게 메시지를 보냈습니다."
    },
    {
      jaPlain: "大変な日もありますが、",
      jaHtml: "<ruby>大変<rt>たいへん</rt></ruby>な<ruby>日<rt>ひ</rt></ruby>もありますが、",
      ko: "힘든 날도 있지만"
    },
    {
      jaPlain: "今の毎日を大切にしたいです。",
      jaHtml: "<ruby>今<rt>いま</rt></ruby>の<ruby>毎日<rt>まいにち</rt></ruby>を<ruby>大切<rt>たいせつ</rt></ruby>にしたいです。",
      ko: "지금의 매일을 소중히 하고 싶습니다."
    }
  ],
  kanjiGlossary: [
    { reading: "きょう", word: "今日", meaning: "오늘" },
    { reading: "はやく", word: "早く", meaning: "일찍, 빨리" },
    { reading: "おわった", word: "終わった", meaning: "끝났다" },
    { reading: "かえり", word: "帰り", meaning: "돌아오는 길" },
    { reading: "かいました", word: "買いました", meaning: "샀습니다" },
    { reading: "かんこく", word: "韓国", meaning: "한국" },
    { reading: "せいかつ", word: "生活", meaning: "생활" },
    { reading: "すこし", word: "少し", meaning: "조금" },
    { reading: "なれて", word: "慣れて", meaning: "익숙해져서" },
    { reading: "まえ", word: "前", meaning: "전" },
    { reading: "ふあん", word: "不安", meaning: "불안" },
    { reading: "すくなく", word: "少なく", meaning: "적게, 줄어" },
    { reading: "よる", word: "夜", meaning: "밤" },
    { reading: "へや", word: "部屋", meaning: "방" },
    { reading: "のみながら", word: "飲みながら", meaning: "마시면서" },
    { reading: "かぞく", word: "家族", meaning: "가족" },
    { reading: "おくりました", word: "送りました", meaning: "보냈습니다" },
    { reading: "たいへん", word: "大変", meaning: "힘듦, 큰일" },
    { reading: "ひ", word: "日", meaning: "날" },
    { reading: "いま", word: "今", meaning: "지금" },
    { reading: "まいにち", word: "毎日", meaning: "매일" },
    { reading: "たいせつ", word: "大切", meaning: "소중함" }
  ],
  grammarPatterns: [
    { pattern: "〜ので", meaning: "~해서 / ~이기 때문에" },
    { pattern: "帰りに", meaning: "돌아오는 길에" },
    { pattern: "〜にも", meaning: "~에도" },
    { pattern: "少しずつ", meaning: "조금씩" },
    { pattern: "〜てきて", meaning: "점점 ~해져서" },
    { pattern: "〜ながら", meaning: "~하면서" },
    { pattern: "〜たいです", meaning: "~하고 싶습니다" }
  ],
  hashtags: DEFAULT_HASHTAGS
};

export function normalizeSentenceReadingCardTitle(value: string): string {
  const raw = String(value || "").trim();
  const topic = raw
    .replace(/^JLPT\s*N[1-5](?:~N[1-5])?\s*일본어\s*일기\s*[|｜]\s*/i, "")
    .replace(/^오늘의\s*일본어\s*일기\s*[|｜]\s*/i, "")
    .trim();
  return `${SENTENCE_READING_TITLE_PREFIX}${topic || "일본어 읽기"}`;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sr_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function pctX(px: number): number {
  return (px / DEFAULT_CANVAS_WIDTH) * 100;
}

function pctY(px: number): number {
  return (px / DEFAULT_CANVAS_HEIGHT) * 100;
}

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function readField(sampleData: Record<string, string>, keys: string[]): string {
  const sampleKeys = Object.keys(sampleData || {});
  for (const key of keys) {
    const direct = sampleData[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const normalized = normalizeKey(key);
    const matched = sampleKeys.find((candidate) => normalizeKey(candidate) === normalized);
    if (matched && String(sampleData[matched] || "").trim()) {
      return String(sampleData[matched] || "").trim();
    }
  }
  return "";
}

function safeJsonParse<T>(value: string, fallback: T): T {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function splitParagraphs(value: string): string[] {
  const paragraphs = String(value || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    chunks.push(lines.slice(index, index + 2).join("\n"));
  }
  return chunks.filter(Boolean);
}

function splitFrontBack<T>(items: T[]): { front: T[]; back: T[] } {
  const middle = Math.ceil(items.length / 2);
  return { front: items.slice(0, middle), back: items.slice(middle) };
}

function decodeBasicHtmlEntities(value: string): string {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtmlTags(value: string): string {
  return decodeBasicHtmlEntities(value).replace(/<[^>]+>/g, "").trim();
}

export function repairMalformedRubyHtml(value: string): string {
  const source = decodeBasicHtmlEntities(value);
  if (!source.includes("<rt")) return source;

  return source.replace(
    /(?<!<ruby>)([\u3040-\u30ff\u3400-\u9fff々ヶー]{1,10})\s*<rt>\s*([^<]+?)\s*<\/rt>(?!\s*<\/ruby>)/giu,
    (_match, base: string, reading: string) => {
      const cleanBase = stripHtmlTags(base);
      const cleanReading = stripHtmlTags(reading);
      if (!cleanBase || !cleanReading) return _match;
      const baseChars = Array.from(cleanBase);
      const isAllKanjiLike = /^[\u3400-\u9fff々ヶ]+$/u.test(cleanBase);
      if (isAllKanjiLike && baseChars.length > 3) {
        const rubyBaseLength = cleanReading.length <= 4 ? 2 : 3;
        const prefix = baseChars.slice(0, -rubyBaseLength).join("");
        const rubyBase = baseChars.slice(-rubyBaseLength).join("");
        return `${prefix}<ruby>${rubyBase}<rt>${cleanReading}</rt></ruby>`;
      }
      const trailingKanji = cleanBase.match(/([\u3400-\u9fff々ヶ]{1,4})$/u);
      if (trailingKanji && trailingKanji[1] && trailingKanji[1] !== cleanBase) {
        const rubyBase = trailingKanji[1];
        const prefix = cleanBase.slice(0, cleanBase.length - rubyBase.length);
        return `${prefix}<ruby>${rubyBase}<rt>${cleanReading}</rt></ruby>`;
      }
      return `<ruby>${cleanBase}<rt>${cleanReading}</rt></ruby>`;
    }
  );
}

function stripRubyHtml(value: string): string {
  return repairMalformedRubyHtml(value)
    .replace(/<rt>[\s\S]*?<\/rt>/gi, "")
    .replace(/<\/?ruby>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function stripSentenceReadingRubyHtml(value: string): string {
  return stripRubyHtml(value);
}

function hasJapaneseText(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
}

function hasKanjiText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function isKanaReading(value: string): boolean {
  const text = String(value || "").trim();
  return Boolean(text) && /^[\u3040-\u30ffー・\s]+$/.test(text) && !hasKanjiText(text);
}

function isLikelyEnglishSentence(value: string): boolean {
  const text = stripRubyHtml(value);
  if (!text || hasJapaneseText(text)) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const korean = (text.match(/[\uac00-\ud7af]/g) || []).length;
  return latin >= 8 && latin > korean;
}

export function isValidSentenceReadingJapaneseText(value: string): boolean {
  const text = stripRubyHtml(value).replace(/\s+/g, "");
  if (!text || !hasJapaneseText(text)) return false;
  if (/[\uac00-\ud7afA-Za-z]/u.test(text)) return false;
  return /^[\u3040-\u30ff\u3400-\u9fff々ヶー、。！？「」『』（）()・…〜ー0-9０-９,.!?:;:]+$/u.test(text);
}

function normalizeJapaneseTextBlock(value: string): string {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => isValidSentenceReadingJapaneseText(line))
    .join("\n")
    .trim();
}

function linesFromAudioScript(audioScript: string): SentenceReadingRubyLine[] {
  return String(audioScript || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && isValidSentenceReadingJapaneseText(line))
    .map((line) => ({ html: line, plain: line }));
}

function normalizeRubyLine(item: Partial<SentenceReadingRubyLine>): SentenceReadingRubyLine | null {
  const repairedHtml = repairMalformedRubyHtml(String(item.html || "").trim());
  const rawPlain = String(item.plain || "").trim();
  const htmlPlain = stripRubyHtml(repairedHtml);
  const plain = isValidSentenceReadingJapaneseText(rawPlain)
    ? rawPlain
    : isValidSentenceReadingJapaneseText(htmlPlain)
      ? htmlPlain
      : "";
  const html = isValidSentenceReadingJapaneseText(repairedHtml) ? repairedHtml : plain;
  if (!html && !plain) return null;
  if (isLikelyEnglishSentence(plain || html)) return null;
  return { html: html || plain, plain: plain || stripRubyHtml(html) };
}

function normalizeBilingualLine(item: Partial<SentenceReadingBilingualLine>): SentenceReadingBilingualLine | null {
  const repairedJaHtml = repairMalformedRubyHtml(String(item.jaHtml || "").trim());
  const rawJaPlain = String(item.jaPlain || "").trim();
  const htmlPlain = stripRubyHtml(repairedJaHtml);
  const jaPlain = isValidSentenceReadingJapaneseText(rawJaPlain)
    ? rawJaPlain
    : isValidSentenceReadingJapaneseText(htmlPlain)
      ? htmlPlain
      : "";
  const jaHtml = isValidSentenceReadingJapaneseText(repairedJaHtml) ? repairedJaHtml : jaPlain;
  const ko = String(item.ko || "").trim();
  if (!jaHtml && !jaPlain) return null;
  if (isLikelyEnglishSentence(jaPlain || jaHtml)) return null;
  return { jaHtml: jaHtml || jaPlain, jaPlain, ko };
}

function normalizeKanjiItem(item: Partial<SentenceReadingKanjiItem>): SentenceReadingKanjiItem | null {
  const reading = String(item.reading || "").trim();
  const word = String(item.word || "").trim();
  const meaning = String(item.meaning || "").trim();
  if (!reading && !word && !meaning) return null;
  if (word && !isValidSentenceReadingJapaneseText(word)) return null;
  return { reading, word, meaning };
}

function extractRubyReadings(htmlValues: string[]): Map<string, string> {
  const readings = new Map<string, string>();
  const rubyPattern = /<ruby>\s*([\s\S]*?)\s*<rt>\s*([\s\S]*?)\s*<\/rt>\s*<\/ruby>/gi;

  htmlValues.forEach((value) => {
    const html = repairMalformedRubyHtml(String(value || ""));
    rubyPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rubyPattern.exec(html))) {
      const word = stripRubyHtml(match[1] || "").trim();
      const reading = stripRubyHtml(match[2] || "").trim();
      if (word && isKanaReading(reading)) {
        readings.set(word, reading);
      }
    }
  });

  return readings;
}

function inferReadingFromRubyMap(word: string, readings: Map<string, string>): string {
  const target = String(word || "").trim();
  if (!target) return "";
  const exact = readings.get(target);
  if (exact) return exact;

  const candidates = [...readings.entries()]
    .filter(([base]) => base && target.startsWith(base) && target.length > base.length)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [base, reading] of candidates) {
    const suffix = target.slice(base.length);
    if (/^[\u3040-\u30ffー]+$/.test(suffix)) {
      return `${reading}${suffix}`;
    }
  }
  return "";
}

function normalizeKanjiGlossaryReadings(
  items: SentenceReadingKanjiItem[],
  rubySourceLines: string[]
): SentenceReadingKanjiItem[] {
  const rubyReadings = extractRubyReadings(rubySourceLines);
  return items
    .map((item) => {
      const word = String(item.word || "").trim();
      const meaning = String(item.meaning || "").trim();
      const rawReading = String(item.reading || "").trim();
      const reading =
        isKanaReading(rawReading) && rawReading !== word
          ? rawReading
          : inferReadingFromRubyMap(word, rubyReadings);

      if (!word && !meaning && !reading) return null;
      return {
        reading: isKanaReading(reading) ? reading : "",
        word,
        meaning
      };
    })
    .filter((item): item is SentenceReadingKanjiItem => Boolean(item));
}

function normalizeGrammarPattern(item: Partial<SentenceReadingGrammarPattern>): SentenceReadingGrammarPattern | null {
  const pattern = String(item.pattern || "").trim();
  const meaning = String(item.meaning || "").trim();
  const exampleJa = String(item.exampleJa || "").trim();
  const exampleKo = String(item.exampleKo || "").trim();
  if (!pattern && !meaning) return null;
  return { pattern, meaning, exampleJa, exampleKo };
}

function normalizeHashtagText(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_HASHTAGS;
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("\n");
}

export function normalizeSentenceReadingCardSet(sampleData: Record<string, string>): SentenceReadingCardSet {
  const rawAudioScript =
    readField(sampleData, ["audioScript", "audio_script", "diaryBody", "diary_body", "japaneseDiary", "japanese_diary", "body"]) ||
    SAMPLE_CARD_SET.audioScript;
  const audioScript = normalizeJapaneseTextBlock(rawAudioScript) || SAMPLE_CARD_SET.audioScript;
  const title = normalizeSentenceReadingCardTitle(
    readField(sampleData, ["title", "shortTitle", "short_title", "Subject", "subject", "topic"]) ||
      SAMPLE_CARD_SET.title
  );
  const postTitle = readField(sampleData, ["postTitle", "post_title", "Caption", "caption"]) || title;
  const instagramTitle = readField(sampleData, ["instagramTitle", "instagram_title"]) || postTitle;
  const japaneseOnlyBlocks = safeJsonParse<string[]>(
    readField(sampleData, ["japaneseOnlyBlocks", "japanese_only_blocks"]),
    []
  )
    .map((item) => normalizeJapaneseTextBlock(String(item || "")))
    .filter(Boolean);
  const rubyFrontLines = safeJsonParse<SentenceReadingRubyLine[]>(
    readField(sampleData, ["rubyFrontLines", "ruby_front_lines"]),
    []
  )
    .map(normalizeRubyLine)
    .filter((item): item is SentenceReadingRubyLine => Boolean(item));
  const rubyBackLines = safeJsonParse<SentenceReadingRubyLine[]>(
    readField(sampleData, ["rubyBackLines", "ruby_back_lines"]),
    []
  )
    .map(normalizeRubyLine)
    .filter((item): item is SentenceReadingRubyLine => Boolean(item));
  const rubyLines = safeJsonParse<SentenceReadingRubyLine[]>(readField(sampleData, ["rubyLines", "ruby_lines"]), [])
    .map(normalizeRubyLine)
    .filter((item): item is SentenceReadingRubyLine => Boolean(item));
  const splitRuby = splitFrontBack(rubyLines);
  const bilingualFront = safeJsonParse<SentenceReadingBilingualLine[]>(
    readField(sampleData, ["bilingualFront", "bilingual_front"]),
    []
  )
    .map(normalizeBilingualLine)
    .filter((item): item is SentenceReadingBilingualLine => Boolean(item));
  const bilingualBack = safeJsonParse<SentenceReadingBilingualLine[]>(
    readField(sampleData, ["bilingualBack", "bilingual_back"]),
    []
  )
    .map(normalizeBilingualLine)
    .filter((item): item is SentenceReadingBilingualLine => Boolean(item));
  const bilingualLines = safeJsonParse<SentenceReadingBilingualLine[]>(
    readField(sampleData, ["bilingualLines", "bilingual_lines"]),
    []
  )
    .map(normalizeBilingualLine)
    .filter((item): item is SentenceReadingBilingualLine => Boolean(item));
  const splitBilingual = splitFrontBack(bilingualLines);
  const splitAudioRuby = splitFrontBack(linesFromAudioScript(audioScript));
  const kanjiGlossary = safeJsonParse<SentenceReadingKanjiItem[]>(
    readField(sampleData, ["kanjiGlossary", "kanji_glossary"]),
    []
  )
    .map(normalizeKanjiItem)
    .filter((item): item is SentenceReadingKanjiItem => Boolean(item));
  const grammarPatterns = safeJsonParse<SentenceReadingGrammarPattern[]>(
    readField(sampleData, ["grammarPatterns", "grammar_patterns"]),
    []
  )
    .map(normalizeGrammarPattern)
    .filter((item): item is SentenceReadingGrammarPattern => Boolean(item));
  const frontBilingual = bilingualFront.length > 0 ? bilingualFront : splitBilingual.front;
  const backBilingual = bilingualBack.length > 0 ? bilingualBack : splitBilingual.back;
  const frontRuby =
    rubyFrontLines.length > 0
      ? rubyFrontLines
      : splitRuby.front.length > 0
        ? splitRuby.front
        : frontBilingual.length > 0
          ? frontBilingual.map((line) => ({ html: line.jaHtml || line.jaPlain, plain: line.jaPlain }))
          : splitAudioRuby.front;
  const backRuby =
    rubyBackLines.length > 0
      ? rubyBackLines
      : splitRuby.back.length > 0
        ? splitRuby.back
        : backBilingual.length > 0
          ? backBilingual.map((line) => ({ html: line.jaHtml || line.jaPlain, plain: line.jaPlain }))
          : splitAudioRuby.back;
  const normalizedKanjiGlossary = normalizeKanjiGlossaryReadings(kanjiGlossary, [
    ...frontRuby.map((line) => line.html),
    ...backRuby.map((line) => line.html),
    ...frontBilingual.map((line) => line.jaHtml),
    ...backBilingual.map((line) => line.jaHtml)
  ]);

  return {
    title,
    postTitle,
    instagramTitle,
    instagramDescription: readField(sampleData, ["instagramDescription", "instagram_description"]),
    jlptLevel: readField(sampleData, ["jlptLevel", "jlpt_level", "jlpt"]) || SAMPLE_CARD_SET.jlptLevel,
    audioScript,
    japaneseOnlyBlocks: japaneseOnlyBlocks.length > 0 ? japaneseOnlyBlocks : splitParagraphs(audioScript),
    rubyFrontLines: frontRuby.length > 0 ? frontRuby : SAMPLE_CARD_SET.rubyFrontLines,
    rubyBackLines: backRuby.length > 0 ? backRuby : SAMPLE_CARD_SET.rubyBackLines,
    bilingualFront: frontBilingual.length > 0 ? frontBilingual : SAMPLE_CARD_SET.bilingualFront,
    bilingualBack: backBilingual.length > 0 ? backBilingual : SAMPLE_CARD_SET.bilingualBack,
    kanjiGlossary: normalizedKanjiGlossary.length > 0 ? normalizedKanjiGlossary : SAMPLE_CARD_SET.kanjiGlossary,
    grammarPatterns: grammarPatterns.length > 0 ? grammarPatterns : SAMPLE_CARD_SET.grammarPatterns,
    hashtags: normalizeHashtagText(readField(sampleData, ["hashtags", "hashTags", "tags"]))
  };
}

function makeTextLayer(args: {
  text: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  zIndex: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  color?: string;
  fontFamily?: string;
  rotation?: number;
  bindingKey?: string;
}): InstagramTextElement {
  return {
    id: uid(),
    type: "text",
    textMode: "plain",
    bindingKey: args.bindingKey || "sentence_content",
    text: args.text,
    x: pctX(args.centerX),
    y: pctY(args.centerY),
    width: pctX(args.width),
    height: pctY(args.height),
    rotation: args.rotation || 0,
    opacity: 1,
    zIndex: args.zIndex,
    autoWrap: true,
    color: args.color || "#1F1F1F",
    fontFamily: args.fontFamily || SENTENCE_READING_SERIF_FONT,
    fontSize: args.fontSize,
    lineHeight: args.lineHeight,
    letterSpacing: 0.6,
    rubyGap: 6,
    textOffsetY: 0,
    textAlign: args.align || "center",
    bold: Boolean(args.bold),
    italic: false,
    underline: false,
    strikeThrough: false,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 0,
    backgroundColor: "#FFFFFF",
    backgroundOpacity: 0,
    padding: 0
  };
}

function makeShapeLayer(args: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zIndex: number;
  fillColor?: string;
  shape?: InstagramShapeType;
  strokeColor?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  rotation?: number;
}): InstagramShapeElement {
  return {
    id: uid(),
    type: "shape",
    shape: args.shape || "roundedRectangle",
    x: pctX(args.centerX),
    y: pctY(args.centerY),
    width: pctX(args.width),
    height: pctY(args.height),
    rotation: args.rotation || 0,
    opacity: 1,
    zIndex: args.zIndex,
    fillEnabled: true,
    fillColor: args.fillColor || "#F8F6F0",
    fillOpacity: args.fillColor ? 0.16 : 0,
    strokeColor: args.strokeColor || "#6A5F52",
    strokeWidth: args.strokeWidth ?? 2,
    cornerRadius: args.cornerRadius ?? 24
  };
}

function makeImageLayer(args: {
  imageUrl: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
}): InstagramImageElement {
  return {
    id: uid(),
    type: "image",
    imageUrl: args.imageUrl,
    mediaType: "image",
    x: pctX(args.centerX),
    y: pctY(args.centerY),
    width: pctX(args.width),
    height: pctY(args.height),
    rotation: args.rotation || 0,
    opacity: 1,
    zIndex: args.zIndex,
    fit: "contain",
    cropX: 50,
    cropY: 50,
    borderRadius: 0,
    overlayColor: "#000000",
    overlayOpacity: 0,
    aiGenerateEnabled: false,
    aiModel: "auto",
    aiPrompt: "",
    aiPromptVariableKey: "",
    aiStylePreset: "Cinematic photo-real",
    aiImageOrientation: "vertical"
  };
}

export function sentencePaperSvgDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><radialGradient id="lightA" cx="20%" cy="10%" r="45%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".78"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient><radialGradient id="lightB" cx="80%" cy="70%" r="42%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".45"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient><pattern id="gridA" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M0 0H13M0 0V13" stroke="#3c3228" stroke-opacity=".035" stroke-width="1"/></pattern><pattern id="gridB" width="17" height="17" patternUnits="userSpaceOnUse"><path d="M0 0H17M0 0V17" stroke="#3c3228" stroke-opacity=".025" stroke-width="1"/></pattern><pattern id="fiberA" width="9" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(100)"><path d="M0 0V64" stroke="#5f5546" stroke-opacity=".05" stroke-width="1"/></pattern><pattern id="fiberB" width="11" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(10)"><path d="M0 0V64" stroke="#ffffff" stroke-opacity=".22" stroke-width="1"/></pattern></defs><rect width="1080" height="1350" fill="#f8f6f0"/><rect width="1080" height="1350" fill="url(#lightA)"/><rect width="1080" height="1350" fill="url(#lightB)"/><rect width="1080" height="1350" fill="url(#gridA)"/><rect width="1080" height="1350" fill="url(#gridB)"/><rect width="1080" height="1350" fill="url(#fiberA)" opacity=".28"/><rect width="1080" height="1350" fill="url(#fiberB)" opacity=".28"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function brandSvgDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none"><path d="M75 19c9 2 15 11 13 21-2 12-12 20-24 18-10-2-17-11-16-21 2-12 12-21 27-18Z" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M63 35h.1M78 38h.1M69 48c4 2 8 1 11-2" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M50 58c-7 8-9 19-5 32M88 58c8 11 10 22 7 34" stroke="#111" stroke-width="5" stroke-linecap="round"/><path d="M24 55l36 20v42L25 96 24 55Z" fill="#f0f6ec" stroke="#5f7d62" stroke-width="4" stroke-linejoin="round"/><path d="M60 75l36-16v40l-36 18V75Z" fill="#edf5e9" stroke="#5f7d62" stroke-width="4" stroke-linejoin="round"/><path d="M42 92c8 4 18 6 28 2" stroke="#111" stroke-width="6" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildBaseElements(cardSet: SentenceReadingCardSet, pageNumber: number, options?: { firstCard?: boolean }): InstagramPageElement[] {
  const titleTop = options?.firstCard ? 90 : 74;
  const titleWidth = options?.firstCard ? 740 : 760;
  return [
    makeTextLayer({
      text: cardSet.title,
      centerX: DEFAULT_CANVAS_WIDTH / 2,
      centerY: titleTop + 47,
      width: titleWidth,
      height: options?.firstCard ? 94 : 82,
      fontSize: 34,
      lineHeight: 1.4,
      zIndex: 2,
      color: "#333333",
      bindingKey: "sentence_title"
    }),
    makeShapeLayer({
      centerX: DEFAULT_CANVAS_WIDTH - 72 - 36,
      centerY: 54 + 36,
      width: 72,
      height: 72,
      zIndex: 3,
      shape: "circle",
      fillColor: "#FFFFFF",
      strokeColor: "#6A5F52",
      strokeWidth: 2,
      rotation: -7
    }),
    makeTextLayer({
      text: String(pageNumber).padStart(2, "0"),
      centerX: DEFAULT_CANVAS_WIDTH - 72 - 36,
      centerY: 54 + 36,
      width: 62,
      height: 50,
      fontSize: 40,
      lineHeight: 1,
      zIndex: 4,
      color: "#5A5348",
      bold: true,
      fontFamily: "Brush Script MT",
      rotation: -7,
      bindingKey: "sentence_page_number"
    }),
    makeImageLayer({
      imageUrl: brandSvgDataUrl(),
      centerX: DEFAULT_CANVAS_WIDTH - 88 - 64,
      centerY: DEFAULT_CANVAS_HEIGHT - 100 - 66,
      width: 128,
      height: 132,
      zIndex: 20
    }),
    {
      ...makeTextLayer({
        text: "쑨에듀",
        centerX: DEFAULT_CANVAS_WIDTH - 77 - 75,
        centerY: DEFAULT_CANVAS_HEIGHT - 74 - 16,
        width: 150,
        height: 42,
        fontSize: 30,
        lineHeight: 1,
        zIndex: 21,
        color: "#2C362A",
        fontFamily: "Nanum Pen Script",
        rotation: -7,
        bindingKey: "sentence_signature"
      }),
      opacity: 0.86,
      letterSpacing: 0.6,
      shadowEnabled: true,
      shadowColor: "#FFFFFF",
      shadowBlur: 0,
      shadowX: 0,
      shadowY: 1
    },
  ];
}

function createSentencePage(name: string, elements: InstagramPageElement[]): InstagramFeedPage {
  return {
    id: uid(),
    name,
    backgroundColor: "#F8F6F0",
    backgroundImageUrl: sentencePaperSvgDataUrl(),
    backgroundFit: "cover",
    durationSec: 4,
    audioEnabled: false,
    audioProvider: "auto",
    audioVoice: "alloy",
    audioSpeed: 1,
    audioUrl: "",
    audioPrompt: "",
    elements
  };
}

function lineCount(value: string): number {
  return Math.max(1, String(value || "").split("\n").length);
}

function visibleTextLength(value: string): number {
  return Array.from(stripRubyHtml(value).replace(/\s+/g, "")).length;
}

function estimateWrappedLineCount(value: string, charsPerLine: number): number {
  const safeCharsPerLine = Math.max(8, charsPerLine);
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return 1;
  return lines.reduce((sum, line) => {
    const length = Math.max(1, visibleTextLength(line));
    return sum + Math.max(1, Math.ceil(length / safeCharsPerLine));
  }, 0);
}

function buildJapaneseOnlyLayers(blocks: string[]): InstagramTextElement[] {
  const contentTop = 280;
  const contentBottom = 170;
  const gap = 52;
  const blockHeights = blocks.map((block) =>
    Math.max(Math.max(1, lineCount(block)), estimateWrappedLineCount(block, 24)) * 41 * 1.52
  );
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const totalHeight = blockHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, blocks.length - 1) * gap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  return blocks.map((block, index) => {
    const height = blockHeights[index] || 70;
    const layer = makeTextLayer({
      text: block,
      centerX: DEFAULT_CANVAS_WIDTH / 2,
      centerY: cursor + height / 2,
      width: 856,
      height: height + 18,
      fontSize: 41,
      lineHeight: 1.52,
      zIndex: 5 + index
    });
    cursor += height + gap;
    return layer;
  });
}

function buildRubyLayers(lines: SentenceReadingRubyLine[], options?: { back?: boolean }): InstagramTextElement[] {
  const count = Math.max(1, lines.length);
  const baseFontSize = 40;
  const baseGap = options?.back ? 78 : 60;
  const contentTop = 180;
  const contentBottom = 110;
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const baseHeights = lines.map((line) =>
    Math.max(146, estimateWrappedLineCount(line.html || line.plain, 20) * 104 + 34)
  );
  const baseTotalHeight = baseHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, count - 1) * baseGap;
  const scale = baseTotalHeight > contentHeight ? Math.max(0.74, contentHeight / baseTotalHeight) : 1;
  const fontSize = Math.max(30, Math.round(baseFontSize * scale));
  const lineHeight = scale < 0.86 ? 1.74 : 1.88;
  const gap = Math.max(24, Math.round(baseGap * scale));
  const heights = baseHeights.map((height) => Math.max(118, Math.round(height * scale)));
  const totalHeight = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, count - 1) * gap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  return lines.map((line, index) => {
    const height = heights[index] || 146;
    const layer = makeTextLayer({
      text: repairMalformedRubyHtml(line.html || line.plain),
      centerX: DEFAULT_CANVAS_WIDTH / 2,
      centerY: cursor + height / 2,
      width: 820,
      height,
      fontSize,
      lineHeight,
      zIndex: 5 + index
    });
    cursor += height + gap;
    return layer;
  });
}

function buildBilingualLayers(lines: SentenceReadingBilingualLine[], options?: { back?: boolean }): InstagramTextElement[] {
  const output: InstagramTextElement[] = [];
  const innerGap = 8;
  const basePairGap = options?.back ? 40 : 28;
  const contentTop = 180;
  const contentBottom = 110;
  const contentHeight = DEFAULT_CANVAS_HEIGHT - contentTop - contentBottom;
  const basePairs = lines.map((line) => {
    const jpHeight = Math.max(112, estimateWrappedLineCount(line.jaHtml || line.jaPlain, 21) * 86 + 30);
    const koHeight = Math.max(50, estimateWrappedLineCount(line.ko, 25) * 38 + 12);
    return { jpHeight, koHeight };
  });
  const baseTotalHeight =
    basePairs.reduce((sum, pair) => sum + pair.jpHeight + innerGap + pair.koHeight, 0) +
    Math.max(0, lines.length - 1) * basePairGap;
  const scale = baseTotalHeight > contentHeight ? Math.max(0.74, contentHeight / baseTotalHeight) : 1;
  const jpFontSize = Math.max(29, Math.round(37 * scale));
  const koFontSize = Math.max(22, Math.round(29 * scale));
  const jpLineHeight = scale < 0.86 ? 1.55 : 1.68;
  const koLineHeight = scale < 0.86 ? 1.25 : 1.35;
  const pairGap = Math.max(16, Math.round(basePairGap * scale));
  const pairs = basePairs.map((pair) => ({
    jpHeight: Math.max(86, Math.round(pair.jpHeight * scale)),
    koHeight: Math.max(40, Math.round(pair.koHeight * scale))
  }));
  const totalHeight =
    pairs.reduce((sum, pair) => sum + pair.jpHeight + innerGap + pair.koHeight, 0) +
    Math.max(0, lines.length - 1) * pairGap;
  let cursor = contentTop + Math.max(0, (contentHeight - totalHeight) / 2);
  lines.forEach((line, index) => {
    const pair = pairs[index] || { jpHeight: 112, koHeight: 50 };
    output.push(
      makeTextLayer({
        text: repairMalformedRubyHtml(line.jaHtml || line.jaPlain),
        centerX: DEFAULT_CANVAS_WIDTH / 2,
        centerY: cursor + pair.jpHeight / 2,
        width: 820,
        height: pair.jpHeight,
        fontSize: jpFontSize,
        lineHeight: jpLineHeight,
        zIndex: 5 + index * 2
      })
    );
    output.push(
      makeTextLayer({
        text: line.ko,
        centerX: DEFAULT_CANVAS_WIDTH / 2,
        centerY: cursor + pair.jpHeight + innerGap + pair.koHeight / 2,
        width: 820,
        height: pair.koHeight,
        fontSize: koFontSize,
        lineHeight: koLineHeight,
        zIndex: 6 + index * 2,
        color: "#333333"
      })
    );
    cursor += pair.jpHeight + innerGap + pair.koHeight + pairGap;
  });
  return output;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildKanjiLayers(items: SentenceReadingKanjiItem[]): InstagramTextElement[] {
  const layers: InstagramTextElement[] = [
    makeTextLayer({
      text: "오늘의 한자 표현",
      centerX: DEFAULT_CANVAS_WIDTH / 2,
      centerY: 158,
      width: 760,
      height: 70,
      fontSize: 38,
      lineHeight: 1.2,
      zIndex: 5,
      bold: true
    })
  ];
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)];
  const columnXs = [315, 765];
  const startY = 245;
  const maxRows = Math.max(columns[0].length, columns[1].length, 1);
  const stepY = Math.min(132, Math.max(104, (DEFAULT_CANVAS_HEIGHT - startY - 122) / maxRows));
  columns.forEach((column, columnIndex) => {
    column.forEach((item, rowIndex) => {
      const baseY = startY + rowIndex * stepY;
      const x = columnXs[columnIndex];
      layers.push(
        makeTextLayer({
          text: item.reading,
          centerX: x,
          centerY: baseY,
          width: 300,
          height: 30,
          fontSize: 22,
          lineHeight: 1.08,
          zIndex: 6 + columnIndex * 100 + rowIndex * 3
        }),
        makeTextLayer({
          text: item.word,
          centerX: x,
          centerY: baseY + 35,
          width: 300,
          height: 46,
          fontSize: 36,
          lineHeight: 1.08,
          zIndex: 7 + columnIndex * 100 + rowIndex * 3
        }),
        makeTextLayer({
          text: item.meaning,
          centerX: x,
          centerY: baseY + 74,
          width: 300,
          height: 36,
          fontSize: 27,
          lineHeight: 1.1,
          zIndex: 8 + columnIndex * 100 + rowIndex * 3,
          color: "#333333",
          bold: true
        })
      );
    });
  });
  return layers;
}

export function buildSentenceReadingPages(cardSet: SentenceReadingCardSet): InstagramFeedPage[] {
  const fullBlocks = cardSet.japaneseOnlyBlocks.length > 0 ? cardSet.japaneseOnlyBlocks : splitParagraphs(cardSet.audioScript);
  const pages: InstagramFeedPage[] = [
    createSentencePage("01 일본어만 보기", [
      ...buildBaseElements(cardSet, 1, { firstCard: true }),
      ...buildJapaneseOnlyLayers(fullBlocks)
    ]),
    createSentencePage("02 루비 앞부분", [
      ...buildBaseElements(cardSet, 2),
      ...buildRubyLayers(cardSet.rubyFrontLines)
    ]),
    createSentencePage("03 루비 뒷부분", [
      ...buildBaseElements(cardSet, 3),
      ...buildRubyLayers(cardSet.rubyBackLines, { back: true })
    ]),
    createSentencePage("04 뜻 앞부분", [
      ...buildBaseElements(cardSet, 4),
      ...buildBilingualLayers(cardSet.bilingualFront)
    ]),
    createSentencePage("05 뜻 뒷부분", [
      ...buildBaseElements(cardSet, 5),
      ...buildBilingualLayers(cardSet.bilingualBack, { back: true })
    ])
  ];

  chunkItems(cardSet.kanjiGlossary, 16).forEach((chunk, index) => {
    const pageNumber = 6 + index;
    pages.push(
      createSentencePage(`${String(pageNumber).padStart(2, "0")} 한자 표현 ${index + 1}`, [
        ...buildBaseElements(cardSet, pageNumber),
        ...buildKanjiLayers(chunk)
      ])
    );
  });
  return pages;
}

function cleanTopicFromTitle(title: string): string {
  return String(title || "")
    .replace(/^JLPT\s*N[1-5](?:~N[1-5])?\s*/i, "")
    .replace(/^일본어\s*일기[｜|\-:：]?\s*/i, "")
    .replace(/^오늘의\s*일본어\s*일기[｜|\-:：]?\s*/, "")
    .trim();
}

function buildGrammarLines(patterns: SentenceReadingGrammarPattern[]): string[] {
  return patterns
    .filter((item) => item.pattern || item.meaning)
    .flatMap((item) => [item.pattern, item.meaning ? `→ ${item.meaning}` : ""])
    .filter(Boolean);
}

function buildExampleLines(lines: SentenceReadingBilingualLine[]): string[] {
  return lines
    .filter((line) => line.jaPlain || line.ko)
    .slice(0, 6)
    .flatMap((line) => [line.jaPlain, line.ko ? `→ ${line.ko}` : ""])
    .filter(Boolean);
}

export function buildSentenceReadingUploadInfo(cardSet: SentenceReadingCardSet): SentenceReadingUploadInfo {
  const hashtags = normalizeHashtagText(cardSet.hashtags);
  const instagramTitle = cardSet.instagramTitle || cardSet.postTitle || cardSet.title;
  const topic = cleanTopicFromTitle(cardSet.title || cardSet.postTitle);
  const grammarLines = buildGrammarLines(cardSet.grammarPatterns);
  const exampleLines = buildExampleLines([...cardSet.bilingualFront, ...cardSet.bilingualBack]);
  const generatedDescription = [
    `JLPT ${cardSet.jlptLevel} 수준의 일본어 읽기 콘텐츠입니다.`,
    "",
    "오늘의 주제는",
    `“${topic || cardSet.title}”`,
    "",
    "짧은 일기 형식으로",
    "현지인이 쓸 법한 자연스러운 일본어 표현을 읽어볼 수 있습니다.",
    grammarLines.length > 0 ? "\n이번 문장에서는 이런 표현들이 나왔습니다." : "",
    ...grammarLines,
    exampleLines.length > 0 ? "\n예문" : "",
    ...exampleLines,
    "",
    "먼저 일본어만 읽고,",
    "그다음 루비와 뜻을 보면서 다시 읽어보세요.",
    "",
    hashtags
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const description = cardSet.instagramDescription.trim() || generatedDescription;
  const caption = [instagramTitle, hashtags, "", description].filter(Boolean).join("\n").trim();
  return {
    cardTitle: cardSet.title,
    caption,
    description,
    hashtags,
    instagramTitle
  };
}
