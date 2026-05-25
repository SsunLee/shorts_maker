import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";
import { IdeaLanguage } from "@/lib/types";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import {
  extractPromptVariables,
  type InstagramIdeaPromptMode,
  INSTAGRAM_IDEA_DEFAULT_PROMPT,
  INSTAGRAM_IDEA_SHEET_HEADERS,
  INSTAGRAM_SENTENCE_READING_IDEA_PROMPT,
  INSTAGRAM_SENTENCE_READING_SHEET_HEADERS,
  renderPromptTemplate
} from "@/lib/instagram-ideas-prompt";
import { generateInstagramIdeaRows } from "@/lib/instagram-ideas-generator";
import {
  isValidSentenceReadingJapaneseText,
  repairMalformedRubyHtml,
  stripSentenceReadingRubyHtml
} from "@/lib/instagram-sentence-reading";

export const runtime = "nodejs";

const schema = z.object({
  topic: z.string().min(1),
  count: z.number().int().min(1).max(10).default(5),
  sheetName: z.string().optional(),
  idBase: z.string().optional(),
  language: z.enum(["ko", "en", "ja", "es", "hi"]).optional(),
  mode: z.enum(["default", "sentence_reading"]).optional(),
  template: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional()
});

function normalizeIdBase(raw: string | undefined): string {
  const text = String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
  return text || "idea";
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildIdeaId(base: string, seq: number): string {
  return `${base}-${String(seq).padStart(3, "0")}`;
}

function resolveNextSequence(base: string, existingIds: string[]): number {
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  let max = 0;
  existingIds.forEach((id) => {
    const match = id.match(pattern);
    if (!match) return;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  });
  return max + 1;
}

function attachIdeaIds(args: {
  rows: Array<Record<string, string>>;
  idBase: string;
  existingIds: string[];
}): Array<Record<string, string>> {
  const usedIds = new Set(
    args.existingIds.map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
  let seq = resolveNextSequence(args.idBase, args.existingIds);
  return args.rows.map((row) => {
    const preferred = String(row.id || "").trim();
    if (preferred && !usedIds.has(preferred.toLowerCase())) {
      usedIds.add(preferred.toLowerCase());
      return {
        ...row,
        id: preferred
      };
    }
    let next = buildIdeaId(args.idBase, seq);
    seq += 1;
    while (usedIds.has(next.toLowerCase())) {
      next = buildIdeaId(args.idBase, seq);
      seq += 1;
    }
    usedIds.add(next.toLowerCase());
    return {
      ...row,
      id: next
    };
  });
}

function stripRubyHtml(value: string): string {
  return stripSentenceReadingRubyHtml(value);
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

function isLikelyEnglishJapaneseField(value: string): boolean {
  const text = stripRubyHtml(value);
  if (!text || hasJapaneseText(text)) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const korean = (text.match(/[\uac00-\ud7af]/g) || []).length;
  return latin >= 8 && latin > korean;
}

function cleanJapaneseFieldValue(value: string): string {
  const repaired = repairMalformedRubyHtml(String(value || "").trim());
  if (isValidSentenceReadingJapaneseText(repaired)) return repaired;
  const plain = stripRubyHtml(repaired);
  return isValidSentenceReadingJapaneseText(plain) ? plain : "";
}

function cleanSentenceReadingJsonArray(raw: string, type: "ruby" | "bilingual"): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return text;
    const filtered = parsed
      .map((item) => {
        if (typeof item === "string") {
          return cleanJapaneseFieldValue(item) || null;
        }
        if (!item || typeof item !== "object") return false;
        const source = item as Record<string, unknown>;
        if (type === "ruby") {
          const html = cleanJapaneseFieldValue(String(source.html || ""));
          const plain = cleanJapaneseFieldValue(String(source.plain || stripRubyHtml(html) || ""));
          if (!html && !plain) return null;
          return {
            ...source,
            plain: plain || stripRubyHtml(html),
            html: html || plain
          };
        }
        const jaHtml = cleanJapaneseFieldValue(String(source.jaHtml || ""));
        const jaPlain = cleanJapaneseFieldValue(String(source.jaPlain || stripRubyHtml(jaHtml) || ""));
        if (!jaHtml && !jaPlain) return null;
        return {
          ...source,
          jaPlain: jaPlain || stripRubyHtml(jaHtml),
          jaHtml: jaHtml || jaPlain
        };
      })
      .filter(Boolean);
    return JSON.stringify(filtered);
  } catch {
    if (isLikelyEnglishJapaneseField(text)) return "";
    return cleanJapaneseFieldValue(text);
  }
}

function cleanKanjiGlossaryJsonArray(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return text;
    const cleaned = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const source = item as Record<string, unknown>;
        const reading = String(source.reading || "").trim();
        const word = cleanJapaneseFieldValue(String(source.word || ""));
        if (!word) return null;
        return {
          ...source,
          word,
          reading: isKanaReading(reading) ? reading : ""
        };
      })
      .filter(Boolean);
    return JSON.stringify(cleaned);
  } catch {
    return text;
  }
}

function cleanSentenceReadingTopic(row: Record<string, string>, fallbackTopic: string): string {
  const raw =
    String(row.shortTitle || "").trim() ||
    String(row.Subject || "").trim() ||
    String(row.title || "").trim() ||
    fallbackTopic;
  return raw
    .replace(/^JLPT\s*N[1-5](?:~N[1-5])?\s*일본어\s*일기\s*[|｜]\s*/i, "")
    .replace(/^오늘의\s*일본어\s*일기\s*[|｜]\s*/i, "")
    .trim() || fallbackTopic.trim() || "일본어 일기";
}

function normalizeSentenceReadingCaption(rawCaption: string, jlptLevel: string, topic: string): string {
  const caption = String(rawCaption || "").trim();
  const expectedStart = `JLPT ${jlptLevel} 수준의 일본어 읽기 콘텐츠입니다.`;
  if (caption.startsWith(expectedStart)) {
    return caption;
  }
  const body = caption
    .replace(/^.*?JLPT\s*N[1-5](?:~N[1-5])?\s*수준의\s*일본어\s*읽기\s*콘텐츠입니다\.?/is, "")
    .trim();
  return [
    expectedStart,
    "",
    "오늘의 주제는",
    `“${topic}”`,
    "",
    "짧은 일기 형식으로",
    "현지인이 쓸 법한 자연스러운 일본어 표현을 읽어볼 수 있습니다.",
    body
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeSentenceReadingRows(
  rows: Array<Record<string, string>>,
  options: { jlptLevel: string; topic: string }
): Array<Record<string, string>> {
  return rows.map((row) => ({
    ...row,
    jlpt: options.jlptLevel,
    Subject: cleanSentenceReadingTopic(row, options.topic),
    title: `오늘의 일본어 일기｜${cleanSentenceReadingTopic(row, options.topic)}`,
    postTitle: `JLPT ${options.jlptLevel} 일본어 일기｜${cleanSentenceReadingTopic(row, options.topic)}`,
    shortTitle: String(row.shortTitle || cleanSentenceReadingTopic(row, options.topic)).trim(),
    Caption: normalizeSentenceReadingCaption(row.Caption || row.caption || "", options.jlptLevel, cleanSentenceReadingTopic(row, options.topic)),
    japaneseOnlyBlocks: cleanSentenceReadingJsonArray(row.japaneseOnlyBlocks || "", "ruby"),
    rubyFrontLines: cleanSentenceReadingJsonArray(row.rubyFrontLines || "", "ruby"),
    rubyBackLines: cleanSentenceReadingJsonArray(row.rubyBackLines || "", "ruby"),
    bilingualFront: cleanSentenceReadingJsonArray(row.bilingualFront || "", "bilingual"),
    bilingualBack: cleanSentenceReadingJsonArray(row.bilingualBack || "", "bilingual"),
    kanjiGlossary: cleanKanjiGlossaryJsonArray(row.kanjiGlossary || "")
  }));
}

function normalizeLanguage(raw: string | undefined): IdeaLanguage {
  if (raw === "en" || raw === "ja" || raw === "es" || raw === "hi") {
    return raw;
  }
  return "ko";
}

function isSentenceReadingPromptTemplate(value: string): boolean {
  const text = String(value || "");
  if (!text.trim()) {
    return false;
  }
  const requiredMarkers = [
    "일기형 인스타그램 카드 세트",
    "audioScript",
    "rubyFrontLines",
    "bilingualFront",
    "kanjiGlossary"
  ];
  return requiredMarkers.every((marker) => text.includes(marker));
}

function buildPrompt(args: {
  template: string;
  topic: string;
  count: number;
  language: IdeaLanguage;
  mode: InstagramIdeaPromptMode;
  variables?: Record<string, string>;
}): string {
  const preferredHeaders =
    args.mode === "sentence_reading" ? INSTAGRAM_SENTENCE_READING_SHEET_HEADERS : INSTAGRAM_IDEA_SHEET_HEADERS;
  const sheetHeaders = preferredHeaders.join(", ");
  const requiredFields =
    args.mode === "sentence_reading"
      ? "id, status, type, jlpt, Subject, title, postTitle, shortTitle, audioScript, japaneseOnlyBlocks, rubyFrontLines, rubyBackLines, bilingualFront, bilingualBack, kanjiGlossary, Caption, hashtags"
      : "id, status, type, jlpt, Subject, kr_intonation, romaji_intonation, kr_mean, " +
        "example_1_title, example_1_hira, example_1_romaji, example_1_mean, example_1_kanji, example_1_kr_intonation, " +
        "example_2_title, example_2_hira, example_2_romaji, example_2_mean, example_2_kanji, example_2_kr_intonation, Caption";
  const sentenceJlptLevel = String(args.variables?.jlptLevels || args.variables?.num || "N5~N4").trim() || "N5~N4";
  const sentenceJlptHashtags =
    String(args.variables?.jlptHashtags || "")
      .trim() ||
    sentenceJlptLevel
      .split("~")
      .map((level) => `#JLPT${level.trim()}`)
      .join(" ");
  const variableMap: Record<string, string | number | undefined> = {
    ...args.variables,
    cnt: String(args.count),
    num: args.mode === "sentence_reading" ? sentenceJlptLevel : args.variables?.num,
    jlptLevels: sentenceJlptLevel,
    jlptHashtags: sentenceJlptHashtags,
    topic: args.topic,
    language: args.language
  };
  const rendered = renderPromptTemplate(args.template, variableMap).trim();
  const unresolved = extractPromptVariables(rendered);
  const unresolvedNote =
    unresolved.length > 0
      ? `\n\n[주의] 아래 변수는 값이 비어 있었습니다: ${unresolved.join(", ")}\n비어 있는 경우에도 JSON 구조는 반드시 유지하세요.`
      : "";

  return (
    `${rendered}\n\n` +
    `[사용자 요청]\n` +
    `- topic: ${args.topic}\n` +
    (args.mode === "sentence_reading"
      ? `- language: 문장 읽기 모드는 일본어 원문 + 한국어 뜻 고정. 영어/로마자는 생성하지 말 것\n`
      : `- language: ${args.language}\n`) +
    `- count: ${args.count}\n` +
    `- 각 object는 다음 필드를 모두 포함: ${requiredFields}\n` +
    `- Google Sheet 헤더 순서: ${sheetHeaders}\n` +
    `- publish, video link는 Google Sheet 관리용 헤더이며 JSON object에는 넣지 않아도 됨\n` +
    `- status는 반드시 "준비"\n` +
    `- type은 ${args.mode === "sentence_reading" ? "일기/읽기 콘텐츠 유형 문자열" : "문법/표현 유형 문자열(예: 과거부정형)"}\n` +
    (args.mode === "sentence_reading"
      ? `- jlpt는 반드시 "${sentenceJlptLevel}"\n` +
        `- title은 반드시 "오늘의 일본어 일기｜{topic}" 형식\n` +
        `- postTitle은 반드시 "JLPT ${sentenceJlptLevel} 일본어 일기｜{topic}" 형식\n` +
        `- Caption은 반드시 "JLPT ${sentenceJlptLevel} 수준의 일본어 읽기 콘텐츠입니다."로 시작하고, 오늘의 주제/문법 표현/예문/읽기 안내/해시태그를 포함\n` +
        `- 해시태그에는 ${sentenceJlptHashtags}를 포함\n` +
        `- 생성 전 자체 검수: 문법/어휘가 JLPT ${sentenceJlptLevel}보다 높으면 쉬운 표현으로 낮출 것\n` +
        `- audioScript/japaneseOnlyBlocks/ruby*/bilingual*.ja* 필드는 반드시 일본어 문장만 사용\n` +
        `- 일본어 본문은 100~150자 권장, 절대 250자 초과 금지, 5~7문장으로 구성\n`
      : "") +
    `- 출력은 JSON 배열만 허용\n` +
    unresolvedNote
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const payload = schema.parse(body);
    const language = normalizeLanguage(payload.language);

    const settings = await getSettings(userId);
    const resolvedSheetName =
      String(payload.sheetName || "").trim() ||
      String(settings.gsheetInstagramSheetName || "").trim() ||
      undefined;
    const mode: InstagramIdeaPromptMode = payload.mode === "sentence_reading" ? "sentence_reading" : "default";
    const payloadTemplate = String(payload.template || "").trim();
    const template =
      mode === "sentence_reading"
        ? isSentenceReadingPromptTemplate(payloadTemplate)
          ? payloadTemplate
          : INSTAGRAM_SENTENCE_READING_IDEA_PROMPT
        : payloadTemplate ||
          String(settings.instagramIdeaPromptTemplate || "").trim() ||
          INSTAGRAM_IDEA_DEFAULT_PROMPT;

    const prompt = buildPrompt({
      template,
      topic: payload.topic.trim(),
      count: payload.count,
      language,
      mode,
      variables: payload.variables
    });

    const result = await generateInstagramIdeaRows({
      prompt,
      count: payload.count,
      language,
      userId,
      preferredHeaders: mode === "sentence_reading" ? INSTAGRAM_SENTENCE_READING_SHEET_HEADERS : INSTAGRAM_IDEA_SHEET_HEADERS
    });
    const generatedRows =
      mode === "sentence_reading"
        ? sanitizeSentenceReadingRows(result.rows, {
            jlptLevel: String(payload.variables?.jlptLevels || payload.variables?.num || "N5~N4").trim() || "N5~N4",
            topic: payload.topic.trim()
          })
        : result.rows;

    let existingIds: string[] = [];
    try {
      const sheetTable = await loadIdeasSheetTable(resolvedSheetName, userId);
      existingIds = (sheetTable.rows || [])
        .map((row) => {
          const key = Object.keys(row).find(
            (item) => item.trim().toLowerCase().replace(/[\s_-]+/g, "") === "id"
          );
          return key ? String(row[key] || "").trim() : "";
        })
        .filter(Boolean);
    } catch {
      existingIds = [];
    }
    const idBase = normalizeIdBase(payload.idBase || payload.topic);
    const itemsWithIds = attachIdeaIds({
      rows: generatedRows,
      idBase,
      existingIds
    });

    return NextResponse.json({
      headers: result.headers,
      items: itemsWithIds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인스타 아이디어 생성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
