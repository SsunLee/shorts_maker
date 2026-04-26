import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import { fetchLatestGoogleNews, type GoogleNewsCountryCode, type GoogleNewsItem } from "@/lib/google-news";
import { IdeaDraftRow, IdeaLanguage } from "@/lib/types";

type Provider = "openai" | "gemini";
type LatestNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  link: string;
  summary?: string;
  detail?: string;
};

type IdeaGenerationFailureCode =
  | "TOPIC_REQUIRED"
  | "JSON_PARSE_FAILED"
  | "LANGUAGE_REJECTED"
  | "SPECIFICITY_REJECTED"
  | "PLACEHOLDER_REJECTED"
  | "NARRATION_REJECTED"
  | "INSUFFICIENT_UNIQUE_RESULTS";

type IdeaGenerationDebug = {
  provider?: Provider;
  language: IdeaLanguage;
  topicAnchors: string[];
  appliedTopicAnchors?: string[];
  latestNewsItemCount: number;
  maxAttempts: number;
  attemptsTried: number;
  requestedCount: number;
  generatedCount: number;
  parseFailureCount: number;
  languageRejectedCount: number;
  specificityRejectedCount: number;
  narrationRejectedCount: number;
  placeholderRejectedCount: number;
  duplicateRejectedCount: number;
};

export class IdeaGenerationError extends Error {
  code: IdeaGenerationFailureCode;
  debug: IdeaGenerationDebug;

  constructor(message: string, code: IdeaGenerationFailureCode, debug: IdeaGenerationDebug) {
    super(message);
    this.name = "IdeaGenerationError";
    this.code = code;
    this.debug = debug;
  }
}

function stripJsonFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function extractFirstJsonArray(raw: string): string {
  const text = String(raw || "");
  const start = text.indexOf("[");
  if (start < 0) {
    return "";
  }
  let inString = false;
  let escaping = false;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char !== "]") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return text.slice(start, index + 1).trim();
    }
  }
  return "";
}

function collectJsonArrayCandidates(raw: string): string[] {
  const trimmed = String(raw || "").trim().replace(/^\uFEFF/, "");
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    const normalized = String(value || "").trim();
    if (normalized) {
      candidates.add(normalized);
    }
  };

  addCandidate(trimmed);
  addCandidate(stripJsonFence(trimmed));
  addCandidate(extractFirstJsonArray(trimmed));
  addCandidate(extractFirstJsonArray(stripJsonFence(trimmed)));

  const fencedBlocks = trimmed.match(/```(?:json)?\s*[\s\S]*?\s*```/gi) || [];
  fencedBlocks.forEach((block) => {
    const stripped = stripJsonFence(block);
    addCandidate(stripped);
    addCandidate(extractFirstJsonArray(stripped));
  });

  return Array.from(candidates);
}

function parseJsonArray(raw: string): unknown[] {
  const candidates = collectJsonArrayCandidates(raw);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return [];
}

function normalizeField(value: unknown): string {
  return String(value ?? "").trim();
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateForPrompt(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeKeywordKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSubjectKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTopicAnchors(topic: string): string[] {
  const raw = String(topic || "").trim();
  if (!raw) {
    return [];
  }

  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "for",
    "on",
    "with",
    "about",
    "latest",
    "news",
    "trend",
    "trending",
    "최신",
    "뉴스",
    "주제",
    "관련",
    "話題",
    "最新",
    "ニュース",
    "समाचार"
  ]);

  const candidates = [
    raw,
    ...raw
      .split(/[\s,./|()[\]{}\-–—:;!?'"`~@#$%^&*+=<>]+/u)
      .map((item) => item.trim())
      .filter(Boolean)
  ];

  const seen = new Set<string>();
  const output: string[] = [];
  for (const token of candidates) {
    const normalized = token.toLowerCase();
    if (!normalized || stopwords.has(normalized)) {
      continue;
    }
    const hasLatin = /[a-z]/i.test(token);
    const minLength = hasLatin ? 3 : 2;
    if (Array.from(token).length < minLength) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(token);
    if (output.length >= 6) {
      break;
    }
  }
  return output;
}

function rowIncludesTopicAnchor(row: IdeaDraftRow, anchors: string[]): boolean {
  if (anchors.length === 0) {
    return true;
  }
  const keyword = normalizeField(row.Keyword);
  const subject = normalizeField(row.Subject);
  const narration = normalizeField(row.Narration);
  const haystackRaw = `${keyword}\n${subject}\n${narration}`;
  const haystackLower = haystackRaw.toLowerCase();
  return anchors.some((anchor) => {
    const anchorRaw = String(anchor || "").trim();
    if (!anchorRaw) {
      return false;
    }
    const anchorLower = anchorRaw.toLowerCase();
    return haystackRaw.includes(anchorRaw) || haystackLower.includes(anchorLower);
  });
}

function countAnchorHits(text: string, anchors: string[]): number {
  if (anchors.length === 0) {
    return 0;
  }
  const raw = String(text || "");
  const lowered = raw.toLowerCase();
  let hits = 0;
  anchors.forEach((anchor) => {
    const value = String(anchor || "").trim();
    if (!value) {
      return;
    }
    const lower = value.toLowerCase();
    if (raw.includes(value) || lowered.includes(lower)) {
      hits += 1;
    }
  });
  return hits;
}

function splitMeaningfulSentences(text: string): string[] {
  return String(text || "")
    .split(/[.!?。！？\n]+/u)
    .map((item) => item.trim())
    .filter((item) => Array.from(item).length >= 6);
}

function hasGenericNarrationFiller(text: string): boolean {
  const raw = String(text || "");
  const lowered = raw.toLowerCase();
  return (
    /파헤쳐|함께해|함께 하|알아보(?:겠|죠|자)|살펴보(?:겠|죠|자)|끝까지 시청|지금 바로/u.test(raw) ||
    /深掘り|一緒に見ていきましょう|詳しく見ていきましょう|ぜひチャンネル登録|気になる方は/u.test(raw) ||
    /let'?s dive in|stay tuned|subscribe for more|you won'?t believe/i.test(lowered) ||
    /vamos a ver|suscr[ií]bete para más/i.test(lowered) ||
    /आइए जानते हैं|अंत तक देखें|सब्सक्राइब/i.test(raw)
  );
}

function containsPlaceholderToken(text: string): boolean {
  const raw = String(text || "");
  const lowered = raw.toLowerCase();
  return (
    /〇{2,}|○{2,}/u.test(raw) ||
    /\b(?:xx|xxx|tbd|n\/a)\b/i.test(lowered) ||
    /\[redacted\]/i.test(lowered) ||
    /미정|未定|某/u.test(raw)
  );
}

function rowContainsPlaceholder(row: IdeaDraftRow): boolean {
  return (
    containsPlaceholderToken(row.Keyword) ||
    containsPlaceholderToken(row.Subject) ||
    containsPlaceholderToken(row.Description) ||
    containsPlaceholderToken(row.Narration)
  );
}

function minimumNarrationLength(language: IdeaLanguage): number {
  if (language === "en" || language === "es") {
    return 140;
  }
  if (language === "hi") {
    return 120;
  }
  return 90;
}

function meetsNarrationQuality(args: {
  narration: string;
  topicAnchors: string[];
  language: IdeaLanguage;
}): boolean {
  const cleaned = removeTrailingHashtags(args.narration).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return false;
  }

  const cta = subscribeCtaByLanguage(args.language);
  const body = cleaned.replace(cta, "").trim();
  const bodyLength = Array.from(body).length;
  if (bodyLength < minimumNarrationLength(args.language)) {
    return false;
  }

  const sentenceCount = splitMeaningfulSentences(body).length;
  if (sentenceCount < 2) {
    return false;
  }

  const anchorHits = countAnchorHits(body, args.topicAnchors);
  const fillerHeavy = hasGenericNarrationFiller(body);
  if (args.topicAnchors.length > 0 && anchorHits === 0 && fillerHeavy && bodyLength < 120) {
    return false;
  }
  if (fillerHeavy && bodyLength < minimumNarrationLength(args.language) + 20) {
    return false;
  }

  return true;
}

function stripCdata(value: string): string {
  return String(value || "").replace(/^<!\[CDATA\[/i, "").replace(/\]\]>$/i, "");
}

function decodeXmlEntities(value: string): string {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number.parseInt(digits, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function extractXmlTagValue(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return "";
  }
  return decodeXmlEntities(stripCdata(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseLatestNewsItemsFromRss(xml: string, limit: number): LatestNewsItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const items: LatestNewsItem[] = [];

  for (const block of blocks) {
    if (items.length >= limit) {
      break;
    }
    let title = extractXmlTagValue(block, "title");
    const link = extractXmlTagValue(block, "link");
    const publishedAt = extractXmlTagValue(block, "pubDate");
    const description = extractXmlTagValue(block, "description");
    let source = extractXmlTagValue(block, "source");

    if (!source && title.includes(" - ")) {
      const split = title.split(" - ");
      if (split.length >= 2) {
        source = split.pop() || "";
        title = split.join(" - ").trim();
      }
    }

    title = title.replace(/\s*-\s*Google News$/i, "").trim();
    if (!title) {
      continue;
    }
    items.push({
      title,
      source: source || "Unknown source",
      publishedAt,
      link,
      summary: truncateForPrompt(description, 220),
      detail: truncateForPrompt(description, 420)
    });
  }

  return items;
}

function safeParseIdeaRows(raw: string): IdeaDraftRow[] {
  const parsed = parseJsonArray(raw);
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const status = normalizeField((record.Status ?? record.status) || "준비");
      const keyword = normalizeField(record.Keyword ?? record.keyword);
      const subject = normalizeField(record.Subject ?? record.subject);
      const description = normalizeField(record.Description ?? record.description);
      const narration = normalizeField(record.Narration ?? record.narration);
      const publish = normalizeField((record.publish ?? record.Publish) || "대기중");
      if (!keyword || !subject || !description || !narration) {
        return null;
      }
      return {
        Status: status || "준비",
        Keyword: keyword,
        Subject: subject,
        Description: description,
        Narration: narration,
        publish: publish || "대기중"
      } satisfies IdeaDraftRow;
    })
    .filter((item): item is IdeaDraftRow => Boolean(item));
}

function safeParseKeywordList(raw: string): string[] {
  const parsed = parseJsonArray(raw);
  const seen = new Set<string>();
  return parsed
    .map((item) => normalizeField(item))
    .filter((item) => item.length > 0)
    .filter((item) => {
      const key = normalizeKeywordKey(item);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function formatExcludedKeywords(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  const limited = values.slice(0, 120);
  return limited.join(", ");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

function isRetryableProviderError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("resource exhausted") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("deadline exceeded") ||
    message.includes("internal error")
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runGeminiWithRetry<T>(task: () => Promise<T>): Promise<T> {
  const retryCount = parsePositiveInt(process.env.GEMINI_RETRY_COUNT, 3);
  const baseDelayMs = parsePositiveInt(process.env.GEMINI_RETRY_BASE_MS, 800);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt >= retryCount) {
        break;
      }
      const waitMs = baseDelayMs * Math.max(1, 2 ** attempt) + Math.floor(Math.random() * 200);
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Idea generation failed.");
}

async function resolveProvider(userId?: string): Promise<Provider> {
  return resolveProviderForTask("text", userId);
}

function resolveLanguageInstruction(language: IdeaLanguage): string {
  if (language === "en") {
    return "Write Keyword, Subject, Description, Narration in English.";
  }
  if (language === "ja") {
    return "Write Keyword, Subject, Description, Narration in Japanese.";
  }
  if (language === "es") {
    return "Write Keyword, Subject, Description, Narration in Spanish.";
  }
  if (language === "hi") {
    return "Write Keyword, Subject, Description, Narration in Hindi.";
  }
  return "Write Keyword, Subject, Description, Narration in Korean.";
}

function describeLanguageForError(language: IdeaLanguage): string {
  if (language === "en") {
    return "영어";
  }
  if (language === "ja") {
    return "일본어";
  }
  if (language === "es") {
    return "스페인어";
  }
  if (language === "hi") {
    return "힌디어";
  }
  return "한국어";
}

function stripDecorationsForLanguageCheck(text: string): string {
  return String(text || "")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsHangul(text: string): boolean {
  return /[가-힣]/u.test(text);
}

function containsJapaneseKana(text: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}々〆ヵヶ]/u.test(text);
}

function containsHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/u.test(text);
}

function normalizeTopicAnchorsForLanguage(anchors: string[], language: IdeaLanguage): string[] {
  if (anchors.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const output: string[] = [];
  anchors.forEach((anchor) => {
    const value = String(anchor || "").trim();
    if (!value) {
      return;
    }
    const lower = value.toLowerCase();
    if (seen.has(lower)) {
      return;
    }

    const hasLatinOrDigit = /[a-z0-9]/i.test(value);
    if (language === "ja") {
      if (!containsHangul(value) && (containsJapaneseKana(value) || containsHan(value) || hasLatinOrDigit)) {
        seen.add(lower);
        output.push(value);
      }
      return;
    }
    if (language === "hi") {
      if (containsDevanagari(value) || hasLatinOrDigit) {
        seen.add(lower);
        output.push(value);
      }
      return;
    }
    if (language === "ko") {
      if (containsHangul(value) || containsHan(value) || hasLatinOrDigit) {
        seen.add(lower);
        output.push(value);
      }
      return;
    }

    seen.add(lower);
    output.push(value);
  });

  return output;
}

function stripAllowedAnchorsForLanguageCheck(text: string, allowedAnchors: string[]): string {
  let output = String(text || "");
  allowedAnchors.forEach((anchor) => {
    const value = String(anchor || "").trim();
    if (!value || Array.from(value).length < 2) {
      return;
    }
    const pattern = new RegExp(escapeRegExp(value), "giu");
    output = output.replace(pattern, " ");
  });
  return output.replace(/\s+/g, " ").trim();
}

function matchesRequestedLanguageText(
  text: string,
  language: IdeaLanguage,
  field: "keyword" | "longform",
  languageExemptAnchors: string[] = []
): boolean {
  const cleaned = stripDecorationsForLanguageCheck(text);
  if (!cleaned) {
    return false;
  }
  const cleanedWithoutExemptAnchors = stripAllowedAnchorsForLanguageCheck(
    cleaned,
    languageExemptAnchors
  );
  const candidate = cleanedWithoutExemptAnchors || cleaned;
  if (language === "ko") {
    return /[가-힣]/u.test(candidate);
  }
  if (language === "ja") {
    if (containsHangul(candidate)) {
      return false;
    }
    if (field === "keyword") {
      return containsJapaneseKana(candidate) || containsHan(candidate);
    }
    return containsJapaneseKana(candidate) || containsHan(candidate);
  }
  if (language === "hi") {
    return containsDevanagari(candidate);
  }
  return true;
}

function rowMatchesRequestedLanguage(
  row: IdeaDraftRow,
  language: IdeaLanguage,
  languageExemptAnchors: string[] = []
): boolean {
  if (language === "en" || language === "es") {
    return true;
  }
  return (
    matchesRequestedLanguageText(row.Keyword, language, "keyword", languageExemptAnchors) &&
    matchesRequestedLanguageText(row.Subject, language, "longform", languageExemptAnchors) &&
    matchesRequestedLanguageText(row.Description, language, "longform", languageExemptAnchors) &&
    matchesRequestedLanguageText(row.Narration, language, "longform", languageExemptAnchors)
  );
}

function subscribeCtaByLanguage(language: IdeaLanguage): string {
  if (language === "en") {
    return "Subscribe for more stories like this.";
  }
  if (language === "ja") {
    return "続きが気になる方は、ぜひチャンネル登録してください。";
  }
  if (language === "es") {
    return "Si te gustó, suscríbete para más historias.";
  }
  if (language === "hi") {
    return "ऐसी और कहानियों के लिए चैनल को सब्सक्राइब करें।";
  }
  return "더 많은 이야기, 구독하고 함께해 주세요.";
}

function hasSubscribeCta(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    /구독/.test(text) ||
    /subscribe/.test(lowered) ||
    /suscr[ií]bete/.test(lowered) ||
    /チャンネル登録/.test(text) ||
    /सब्सक्राइब/.test(text)
  );
}

function removeTrailingHashtags(text: string): string {
  let output = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Remove trailing hashtag-only lines.
  output = output.replace(/(?:\n\s*(?:#[\p{L}\p{N}_-]+\s*)+)+$/u, "").trim();

  // Remove trailing inline hashtag tokens at the end.
  output = output.replace(/\s*(?:#[\p{L}\p{N}_-]+\s*)+$/u, "").trim();

  return output;
}

function normalizeNarrationForIdeas(narration: string, language: IdeaLanguage): string {
  const cleaned = removeTrailingHashtags(narration);
  if (!cleaned) {
    return cleaned;
  }
  if (hasSubscribeCta(cleaned)) {
    return cleaned;
  }
  return `${cleaned}\n\n${subscribeCtaByLanguage(language)}`;
}

function normalizeNarrationCoreKey(narration: string, language: IdeaLanguage): string {
  const cta = subscribeCtaByLanguage(language);
  const cleaned = removeTrailingHashtags(String(narration || ""));
  const withoutCta = cleaned.endsWith(cta) ? cleaned.slice(0, -cta.length).trim() : cleaned;
  return withoutCta
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim()
    .slice(0, 220);
}

function requiresHardSpecificity(topic: string): boolean {
  const normalized = String(topic || "").toLowerCase();
  return (
    /(latest|breaking|news|trend|trending|announcement|announced|202\d|20\d{2})/.test(normalized) ||
    /(최신|실시간|속보|뉴스|트렌드|발표|신소재|신기술|핫한|화제)/u.test(topic) ||
    /(最新|速報|ニュース|発表|新素材|新技術|話題|トレンド)/u.test(topic) ||
    /(último|noticias|tendencia|anuncio)/u.test(normalized) ||
    /(ताज़ा|समाचार|घोषणा|ट्रेंड)/u.test(topic)
  );
}

function hasNewsIntent(topic: string): boolean {
  const normalized = String(topic || "").toLowerCase();
  return (
    /(news|breaking|headline|headlines|latest)/.test(normalized) ||
    /(뉴스|속보|헤드라인|최신)/u.test(topic) ||
    /(ニュース|速報|最新|ヘッドライン)/u.test(topic) ||
    /(noticias|últimas|titulares)/u.test(normalized) ||
    /(समाचार|ताज़ा|सुर्खियां)/u.test(topic)
  );
}

function isEntertainmentTopic(topic: string): boolean {
  const normalized = String(topic || "").toLowerCase();
  return (
    /(entertainment|celebrity|idol|k-pop|kpop|movie|drama|tv show|music)/.test(normalized) ||
    /(연예|아이돌|배우|가수|드라마|예능|영화|뮤직|음악)/u.test(topic) ||
    /(芸能|アイドル|俳優|女優|ドラマ|映画|音楽)/u.test(topic)
  );
}

function looksEntertainmentHeadline(title: string): boolean {
  const normalized = String(title || "").toLowerCase();
  return (
    /(celebrity|entertainment|idol|k-pop|kpop|movie|drama|tv show|music|box office)/.test(normalized) ||
    /(연예|아이돌|배우|가수|드라마|예능|영화|음악|컴백)/u.test(title) ||
    /(芸能|アイドル|俳優|女優|ドラマ|映画|音楽|復帰|熱愛)/u.test(title)
  );
}

function resolveNewsCountryByLanguage(language: IdeaLanguage): GoogleNewsCountryCode {
  if (language === "ja") {
    return "JP";
  }
  if (language === "hi") {
    return "IN";
  }
  if (language === "ko") {
    return "KR";
  }
  return "US";
}

function buildNewsSearchQuery(topic: string, language: IdeaLanguage): string {
  const raw = collapseWhitespace(topic);
  const genericTerms = new Set([
    "latest",
    "breaking",
    "news",
    "headline",
    "headlines",
    "trend",
    "trending",
    "최신",
    "속보",
    "뉴스",
    "헤드라인",
    "트렌드",
    "最新",
    "速報",
    "ニュース",
    "話題",
    "trend",
    "trending",
    "noticias",
    "últimas",
    "titulares",
    "समाचार"
  ]);
  const topicTerms = raw
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => {
      const normalized = token.toLowerCase();
      return !genericTerms.has(normalized) && !genericTerms.has(token);
    });
  const core = collapseWhitespace(topicTerms.join(" "));
  const base = core || raw;
  if (!base) {
    return "latest news when:7d";
  }
  const exclusion =
    isEntertainmentTopic(base) || isEntertainmentTopic(topic)
      ? ""
      : language === "ja"
        ? "-芸能 -アイドル -ドラマ -映画"
        : language === "ko"
          ? "-연예 -아이돌 -드라마 -영화 -예능"
          : language === "hi"
            ? "-मनोरंजन -फिल्म -टीवी -सेलिब्रिटी"
            : "-entertainment -celebrity -movie -drama -tv";
  return collapseWhitespace(`${base} when:7d ${exclusion}`);
}

function parsePublishedAtTimestamp(value: string): number {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function scoreLatestNewsItem(item: LatestNewsItem, topicAnchors: string[], entertainmentAllowed: boolean): number {
  const title = collapseWhitespace(item.title);
  const summary = collapseWhitespace(item.summary || "");
  const detail = collapseWhitespace(item.detail || "");
  const combined = `${title}\n${summary}\n${detail}`;
  const titleAnchorHits = countAnchorHits(title, topicAnchors);
  const bodyAnchorHits = countAnchorHits(combined, topicAnchors);
  const publishedAt = parsePublishedAtTimestamp(item.publishedAt);
  const ageHours = publishedAt > 0 ? Math.max(0, (Date.now() - publishedAt) / (1000 * 60 * 60)) : 48;
  const freshnessScore = Math.max(0, 4 - ageHours / 24);
  const entertainmentPenalty = !entertainmentAllowed && looksEntertainmentHeadline(title) ? 4 : 0;
  const summaryPenalty = summary.length < 40 ? 0.6 : 0;
  return titleAnchorHits * 4 + bodyAnchorHits * 2 + freshnessScore - entertainmentPenalty - summaryPenalty;
}

function rankLatestNewsItems(items: LatestNewsItem[], topic: string, topicAnchors: string[]): LatestNewsItem[] {
  const entertainmentAllowed = isEntertainmentTopic(topic);
  return [...items].sort((left, right) => {
    const scoreDiff =
      scoreLatestNewsItem(right, topicAnchors, entertainmentAllowed) -
      scoreLatestNewsItem(left, topicAnchors, entertainmentAllowed);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return parsePublishedAtTimestamp(right.publishedAt) - parsePublishedAtTimestamp(left.publishedAt);
  });
}

function mapGoogleNewsItemToLatestNews(item: GoogleNewsItem): LatestNewsItem {
  const summary = truncateForPrompt(item.summaryOriginal || item.summaryKo || item.description || item.title, 220);
  const detail = truncateForPrompt(item.detailOriginal || item.detailKo || item.description || item.title, 420);
  return {
    title: collapseWhitespace(item.title),
    source: collapseWhitespace(item.source || "Google News"),
    publishedAt: collapseWhitespace(item.publishedAt || ""),
    link: collapseWhitespace(item.link || ""),
    summary,
    detail
  };
}

type NewsLocale = { hl: string; gl: string; ceid: string };

function isGlobalSportsTopic(topic: string): boolean {
  const normalized = String(topic || "").toLowerCase();
  return (
    /(wbc|world cup|olympic|fifa|uefa|mlb|npb|kbo|champions league|premier league)/.test(
      normalized
    ) || /(월드컵|올림픽|국제대회|세계대회|대표팀|ワールドカップ|オリンピック|国際大会|世界大会|代表戦)/u.test(topic)
  );
}

function resolveNewsLocales(language: IdeaLanguage, topic: string): NewsLocale[] {
  const primary =
    language === "ja"
      ? { hl: "ja-JP", gl: "JP", ceid: "JP:ja" }
      : language === "ko"
        ? { hl: "ko-KR", gl: "KR", ceid: "KR:ko" }
        : language === "es"
          ? { hl: "es-ES", gl: "ES", ceid: "ES:es" }
          : language === "hi"
            ? { hl: "hi-IN", gl: "IN", ceid: "IN:hi" }
            : { hl: "en-US", gl: "US", ceid: "US:en" };

  if (language !== "ja") {
    return [primary];
  }

  const globalEnglish = { hl: "en-US", gl: "US", ceid: "US:en" };
  const globalFirst = isGlobalSportsTopic(topic);
  return globalFirst ? [globalEnglish, primary] : [primary, globalEnglish];
}

function dedupeLatestNewsItems(items: LatestNewsItem[], limit: number): LatestNewsItem[] {
  const seen = new Set<string>();
  const output: LatestNewsItem[] = [];
  for (const item of items) {
    if (output.length >= limit) {
      break;
    }
    const key = `${item.title}`.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function fetchLatestNewsContext(topic: string, language: IdeaLanguage): Promise<LatestNewsItem[]> {
  if (!requiresHardSpecificity(topic)) {
    return [];
  }

  const mergedLimit = parsePositiveInt(process.env.IDEA_NEWS_MERGED_LIMIT, 6);
  const topicAnchors = normalizeTopicAnchorsForLanguage(extractTopicAnchors(topic), language);
  const query = buildNewsSearchQuery(topic, language);

  if (hasNewsIntent(topic)) {
    const newsCountry = resolveNewsCountryByLanguage(language);
    const detailedNewsCount = parsePositiveInt(
      process.env.IDEA_NEWS_CONTEXT_COUNT,
      Math.max(4, Math.min(10, mergedLimit))
    );
    try {
      const enrichedItems = await fetchLatestGoogleNews({
        country: newsCountry,
        count: detailedNewsCount,
        query
      });
      const mapped = enrichedItems.map((item) => mapGoogleNewsItemToLatestNews(item));
      const ranked = rankLatestNewsItems(mapped, topic, topicAnchors);
      const deduped = dedupeLatestNewsItems(ranked, mergedLimit);
      if (deduped.length > 0) {
        return deduped;
      }
    } catch {
      // Fall through to lightweight RSS query fallback.
    }
  }

  const timeoutMs = parsePositiveInt(process.env.IDEA_NEWS_TIMEOUT_MS, 3500);
  const locales = resolveNewsLocales(language, topic);
  const perLocaleLimit = parsePositiveInt(process.env.IDEA_NEWS_PER_LOCALE_LIMIT, 4);
  const fetched = await Promise.all(
    locales.map(async ({ hl, gl, ceid }) => {
      const endpoint =
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
        `&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          signal: controller.signal
        });
        if (!response.ok) {
          return [];
        }
        const xml = await response.text();
        return parseLatestNewsItemsFromRss(xml, perLocaleLimit);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const ranked = rankLatestNewsItems(fetched.flat(), topic, topicAnchors);
  const merged = dedupeLatestNewsItems(ranked, mergedLimit);
  if (merged.length > 0) {
    return merged;
  }
  return [];
}

function buildPrompt(
  topic: string,
  count: number,
  excludedKeywords: string[],
  language: IdeaLanguage,
  latestNewsItems: LatestNewsItem[] = [],
  topicAnchors: string[] = [],
  rawTopicAnchors: string[] = []
): string {
  const excludedText = formatExcludedKeywords(excludedKeywords);
  const duplicateRule = excludedText
    ? `- Do not reuse existing keywords: ${excludedText}\n`
    : "- Do not duplicate existing keywords.\n";
  const hardSpecificity = requiresHardSpecificity(topic);
  const specificityRule =
    "- Avoid vague placeholders with no concrete referent (e.g. 'innovative new material' alone).\n" +
    "- Prefer including at least one concrete anchor noun relevant to the topic in Subject or Narration.\n" +
    "  Concrete anchors include: person/team/organization/material/technology/product/event/competition/zodiac sign/place.\n";
  const hardSpecificityRule = hardSpecificity
    ? "- Because this topic implies recency/news, every idea must name at least one specific real-world anchor\n" +
      "  (e.g. material name like graphene, organization/lab, league/team/player, product line, event name).\n" +
      "- If the claim is future-looking or unconfirmed, phrase it as outlook/expectation (not confirmed fact).\n"
    : "";
  const newsScriptModeRule = hasNewsIntent(topic)
    ? "- Because this is a news-oriented request, write Narration in a YouTube news-script flow:\n" +
      "  hook (1 sentence) -> context -> 2~4 concrete fact beats from context -> what-it-means/next-watch -> CTA.\n" +
      "- Use concrete names, dates, numbers, and organizations from the context when available.\n"
    : "";
  const entertainmentBiasRule = isEntertainmentTopic(topic)
    ? ""
    : "- Do not default to celebrity/entertainment gossip angles unless the topic explicitly asks for entertainment.\n";
  const topicAnchorBlock =
    topicAnchors.length > 0
      ? "[Topic Anchors]\n" +
        `- Preferred anchor terms extracted from user topic: ${topicAnchors.join(", ")}\n` +
        "- Prefer including at least one anchor term (or close inflection) in Subject or Narration.\n\n"
      : "";
  const crossLanguageAnchorGuidanceBlock =
    topicAnchors.length === 0 && rawTopicAnchors.length > 0
      ? "[Topic Anchors]\n" +
        "- User topic includes anchors in a different script/language.\n" +
        "- Keep the same entity meaning, but express anchor terms naturally in the requested output language.\n\n"
      : "";
  const latestNewsContextBlock =
    latestNewsItems.length > 0
      ? "[Recent News Context]\n" +
        latestNewsItems
          .map((item, index) => {
            const published = item.publishedAt ? ` | Published: ${item.publishedAt}` : "";
            const source = item.source ? ` | Source: ${item.source}` : "";
            const link = item.link ? ` | URL: ${item.link}` : "";
            const summary = item.summary ? `\n   Summary: ${truncateForPrompt(item.summary, 200)}` : "";
            const detail = item.detail ? `\n   Key facts: ${truncateForPrompt(item.detail, 320)}` : "";
            return `${index + 1}. ${item.title}${source}${published}${link}${summary}${detail}`;
          })
          .join("\n") +
        "\n\n[News Grounding Rules]\n" +
        "- Treat Recent News Context as anchor facts. Do not invent outlets, dates, or specific claims not grounded there.\n" +
        "- For each idea, reference at least one concrete anchor from the context in Subject or Narration.\n" +
        "- If certainty is low, use cautious wording (e.g. expected/reported/under discussion).\n\n"
      : "";
  const domainSpecificityRule =
    "- Prefer concrete nouns over abstract wording.\n" +
    "- If topic is place/culture, mention specific district/landmark/store/event names.\n" +
    "- If topic is technology/science, mention specific material/component/process/protocol names.\n" +
    "- If topic is sports, mention league/team/player/tournament names.\n" +
    "- If topic is history, mention era/person/place/artifact names.\n";

  return (
    `You are a short-video content idea assistant for topic "${topic}".\n\n` +
    "Return JSON array following Google Sheet row schema.\n\n" +
    "[Output Format]\n" +
    "- Output must be a JSON array only: [ { ... }, { ... } ]\n" +
    `- Array length must be exactly ${count}\n` +
    "- Every value must be string\n\n" +
    "[Object Keys]\n" +
    "- Status\n" +
    "- Keyword\n" +
    "- Subject\n" +
    "- Description\n" +
    "- Narration\n" +
    "- publish\n\n" +
    "[Rules]\n" +
    `- Generate exactly ${count} ideas strictly related to "${topic}"\n` +
    "- Do not force Ancient Egypt or any unrelated domain unless the topic explicitly asks for it\n" +
    '- Status must be "준비"\n' +
    '- publish must be "대기중"\n' +
    duplicateRule +
    "- Keywords must also be unique within this response\n" +
    "- Subject and Narration must also be meaningfully distinct across ideas in the same response\n" +
    "- Do not repeat the same main person/team/organization/event across multiple ideas unless user asked single-focus coverage\n" +
    "- Keyword: concise core keyword for the idea\n" +
    "- Subject: one strong hook sentence\n" +
    "- Description: YouTube-ready summary + hashtags (#shorts + topic-related tags)\n" +
    "- Narration: story-driven voiceover script, around 120-220 words, with concrete details\n" +
    "- Narration should include at least 2 concrete points (facts/examples/scenes) tied to the topic\n" +
    "- Avoid empty filler lines such as generic hype or 'we will explore this' with no details\n" +
    "- Never use placeholders like 〇〇, ○○, XX, TBD, N/A in any field\n" +
    "- Narration must NOT contain hashtags (#...) anywhere, especially at the end\n" +
    `- Narration must end with this exact CTA sentence: "${subscribeCtaByLanguage(language)}"\n` +
    `- Language: ${resolveLanguageInstruction(language)}\n` +
    topicAnchorBlock +
    crossLanguageAnchorGuidanceBlock +
    latestNewsContextBlock +
    domainSpecificityRule +
    specificityRule +
    hardSpecificityRule +
    newsScriptModeRule +
    entertainmentBiasRule +
    "- Use only the requested output language in Keyword, Subject, Description, and Narration.\n" +
    "- Never switch those fields back to Korean unless Korean is the requested language.\n" +
    "- Output JSON only, no markdown, no explanation"
  );
}

function buildRelatedKeywordPrompt(
  topic: string,
  excludedKeywords: string[],
  language: IdeaLanguage,
  limit: number,
  topicAnchors: string[] = [],
  hardSpecificity = false
): string {
  const excludedText = formatExcludedKeywords(excludedKeywords);
  const duplicateRule = excludedText
    ? `- Avoid these keywords because they already exist or were just generated: ${excludedText}\n`
    : "- Avoid repeating the exact input topic or existing sheet keywords.\n";
  const anchorRule =
    topicAnchors.length > 0
      ? `- Prefer terms closely connected to these anchors: ${topicAnchors.join(", ")}\n`
      : "";
  const entertainmentBiasRule = isEntertainmentTopic(topic)
    ? ""
    : "- Avoid defaulting to celebrity/entertainment gossip keywords unless topic explicitly requests that domain.\n";

  const strategistRole = hardSpecificity
    ? "short-video trend strategist"
    : "short-video content strategist";
  const topicDirection = hardSpecificity
    ? `- Suggest ${limit} adjacent or faster-growing subtopic keywords related to "${topic}"\n` +
      "- Prioritize topics that feel current, clickable, and specific for short-form videos\n"
    : `- Suggest ${limit} adjacent subtopic keywords related to "${topic}"\n` +
      "- Balance evergreen + searchable + specific angles (not only breaking-news angles)\n";

  return (
    `You are a ${strategistRole} for topic "${topic}".\n\n` +
    "Return a JSON array of related keyword strings only.\n\n" +
    "[Output Format]\n" +
    '- Output must be a JSON array only: ["keyword1", "keyword2"]\n' +
    `- Array length must be exactly ${limit}\n` +
    "- Every item must be a short string keyword, not a sentence\n\n" +
    "[Rules]\n" +
    topicDirection +
    anchorRule +
    entertainmentBiasRule +
    "- Do not output the exact same phrase as the input topic\n" +
    duplicateRule +
    "- Keep each keyword under 20 characters when possible\n" +
    `- Language: ${resolveLanguageInstruction(language)}\n` +
    "- Use only the requested output language for every keyword.\n" +
    "- Output JSON only, no markdown, no explanation"
  );
}

function enforceRules(args: {
  rows: IdeaDraftRow[];
  count: number;
  blockedKeywords: Set<string>;
  blockedSubjectKeys: Set<string>;
  blockedNarrationKeys: Set<string>;
  language: IdeaLanguage;
  topicAnchors: string[];
  languageExemptAnchors: string[];
  strictNarrationQuality: boolean;
}): {
  rows: IdeaDraftRow[];
  languageRejectedCount: number;
  specificityRejectedCount: number;
  narrationRejectedCount: number;
  placeholderRejectedCount: number;
  duplicateRejectedCount: number;
} {
  const output: IdeaDraftRow[] = [];
  const relaxedCandidates: IdeaDraftRow[] = [];
  const seenInBatch = new Set<string>();
  const seenSubjectKeysInBatch = new Set<string>();
  const seenNarrationKeysInBatch = new Set<string>();
  let languageRejectedCount = 0;
  let specificityRejectedCount = 0;
  let narrationRejectedCount = 0;
  let placeholderRejectedCount = 0;
  let duplicateRejectedCount = 0;
  args.rows.forEach((row) => {
    if (output.length >= args.count) {
      return;
    }
    if (!rowMatchesRequestedLanguage(row, args.language, args.languageExemptAnchors)) {
      languageRejectedCount += 1;
      return;
    }
    const keyword = normalizeField(row.Keyword);
    const keywordKey = normalizeKeywordKey(keyword);
    if (!keywordKey) {
      return;
    }
    if (args.blockedKeywords.has(keywordKey) || seenInBatch.has(keywordKey)) {
      return;
    }
    const normalized: IdeaDraftRow = {
      Status: "준비",
      Keyword: keyword,
      Subject: normalizeField(row.Subject),
      Description: normalizeField(row.Description),
      Narration: normalizeNarrationForIdeas(normalizeField(row.Narration), args.language),
      publish: "대기중"
    };
    if (rowContainsPlaceholder(normalized)) {
      placeholderRejectedCount += 1;
      return;
    }
    const subjectKey = normalizeSubjectKey(normalized.Subject);
    const narrationKey = normalizeNarrationCoreKey(normalized.Narration, args.language);
    const subjectDuplicated = subjectKey
      ? args.blockedSubjectKeys.has(subjectKey) || seenSubjectKeysInBatch.has(subjectKey)
      : false;
    const narrationDuplicated = narrationKey
      ? args.blockedNarrationKeys.has(narrationKey) || seenNarrationKeysInBatch.has(narrationKey)
      : false;
    if (subjectDuplicated || narrationDuplicated) {
      duplicateRejectedCount += 1;
      return;
    }
    if (
      !meetsNarrationQuality({
        narration: normalized.Narration,
        topicAnchors: args.topicAnchors,
        language: args.language
      })
    ) {
      narrationRejectedCount += 1;
      if (args.strictNarrationQuality) {
        seenInBatch.add(keywordKey);
        relaxedCandidates.push(normalized);
        return;
      }
    }
    if (rowIncludesTopicAnchor(normalized, args.topicAnchors)) {
      seenInBatch.add(keywordKey);
      if (subjectKey) {
        seenSubjectKeysInBatch.add(subjectKey);
      }
      if (narrationKey) {
        seenNarrationKeysInBatch.add(narrationKey);
      }
      output.push(normalized);
      return;
    }
    if (args.topicAnchors.length > 0) {
      specificityRejectedCount += 1;
    }
    seenInBatch.add(keywordKey);
    if (subjectKey) {
      seenSubjectKeysInBatch.add(subjectKey);
    }
    if (narrationKey) {
      seenNarrationKeysInBatch.add(narrationKey);
    }
    relaxedCandidates.push(normalized);
  });
  if (output.length < args.count && relaxedCandidates.length > 0) {
    output.push(...relaxedCandidates.slice(0, args.count - output.length));
  }
  return {
    rows: output,
    languageRejectedCount,
    specificityRejectedCount,
    narrationRejectedCount,
    placeholderRejectedCount,
    duplicateRejectedCount
  };
}

async function requestIdeaRows(
  provider: Provider,
  prompt: string,
  userId?: string
): Promise<IdeaDraftRow[]> {
  const keys = await resolveApiKeys(userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: keys.geminiKey });
    const response = await runGeminiWithRetry(() =>
      client.models.generateContent({
        model: textModel,
        contents: prompt
      })
    );
    return safeParseIdeaRows(response.text || "");
  }

  const client = new OpenAI({ apiKey: keys.openaiKey });
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          "You output only a strict JSON array. Do not include markdown fences or extra text."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });
  return safeParseIdeaRows(response.output_text || "");
}

async function requestRelatedKeywords(
  provider: Provider,
  prompt: string,
  userId?: string
): Promise<string[]> {
  const keys = await resolveApiKeys(userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: keys.geminiKey });
    const response = await runGeminiWithRetry(() =>
      client.models.generateContent({
        model: textModel,
        contents: prompt
      })
    );
    return safeParseKeywordList(response.text || "");
  }

  const client = new OpenAI({ apiKey: keys.openaiKey });
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          "You output only a strict JSON array of strings. Do not include markdown fences or extra text."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });
  return safeParseKeywordList(response.output_text || "");
}

function fallbackRelatedKeywords(args: {
  topic: string;
  blockedKeywords: Set<string>;
  candidateKeywords?: string[];
  limit: number;
  language: IdeaLanguage;
}): string[] {
  const topicKey = normalizeKeywordKey(args.topic);
  const seen = new Set<string>();
  return (args.candidateKeywords || [])
    .map((value) => normalizeField(value))
    .filter((value) => {
      const key = normalizeKeywordKey(value);
      if (
        !key ||
        key === topicKey ||
        args.blockedKeywords.has(key) ||
        seen.has(key) ||
        !matchesRequestedLanguageText(value, args.language, "keyword")
      ) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, args.limit);
}

export async function generateIdeas(args: {
  topic: string;
  count: number;
  existingKeywords?: string[];
  existingSubjects?: string[];
  existingNarrations?: string[];
  language?: IdeaLanguage;
  userId?: string;
}): Promise<IdeaDraftRow[]> {
  const topic = args.topic.trim();
  const count = Math.max(1, Math.min(10, Math.floor(args.count)));
  const language: IdeaLanguage =
    args.language === "en" ||
    args.language === "ja" ||
    args.language === "es" ||
    args.language === "hi"
      ? args.language
      : "ko";
  const baseDebug: IdeaGenerationDebug = {
    provider: undefined,
    language,
    topicAnchors: [],
    latestNewsItemCount: 0,
    maxAttempts: 0,
    attemptsTried: 0,
    requestedCount: Math.max(1, Math.min(10, Math.floor(args.count))),
    generatedCount: 0,
    parseFailureCount: 0,
    languageRejectedCount: 0,
    specificityRejectedCount: 0,
    narrationRejectedCount: 0,
    placeholderRejectedCount: 0,
    duplicateRejectedCount: 0
  };
  if (!topic) {
    throw new IdeaGenerationError("주제를 입력해 주세요.", "TOPIC_REQUIRED", baseDebug);
  }
  const provider = await resolveProvider(args.userId);
  const blockedKeywords = new Set(
    (args.existingKeywords || [])
      .map((value) => normalizeKeywordKey(value))
      .filter(Boolean)
  );
  const blockedSubjectKeys = new Set(
    (args.existingSubjects || [])
      .map((value) => normalizeSubjectKey(value))
      .filter(Boolean)
  );
  const blockedNarrationKeys = new Set(
    (args.existingNarrations || [])
      .map((value) => normalizeNarrationCoreKey(String(value || ""), language))
      .filter(Boolean)
  );
  const collected: IdeaDraftRow[] = [];
  const maxAttempts = Math.max(3, Math.min(8, parsePositiveInt(process.env.IDEA_GENERATION_MAX_ATTEMPTS, 6)));
  const hardSpecificityTopic = requiresHardSpecificity(topic);
  let parseFailureCount = 0;
  let languageRejectedCount = 0;
  let specificityRejectedCount = 0;
  let narrationRejectedCount = 0;
  let placeholderRejectedCount = 0;
  let duplicateRejectedCount = 0;
  const topicAnchors = extractTopicAnchors(topic);
  const appliedTopicAnchors = normalizeTopicAnchorsForLanguage(topicAnchors, language);
  const latestNewsItems = await fetchLatestNewsContext(topic, language);
  let attemptsTried = 0;

  const snapshotDebug = (): IdeaGenerationDebug => ({
    provider,
    language,
    topicAnchors,
    appliedTopicAnchors,
    latestNewsItemCount: latestNewsItems.length,
    maxAttempts,
    attemptsTried,
    requestedCount: count,
    generatedCount: collected.length,
    parseFailureCount,
    languageRejectedCount,
    specificityRejectedCount,
    narrationRejectedCount,
    placeholderRejectedCount,
    duplicateRejectedCount
  });

  for (let attempt = 1; attempt <= maxAttempts && collected.length < count; attempt += 1) {
    attemptsTried = attempt;
    const remaining = count - collected.length;
    const prompt = buildPrompt(
      topic,
      remaining,
      Array.from(blockedKeywords),
      language,
      latestNewsItems,
      appliedTopicAnchors,
      topicAnchors
    );
    const rows = await requestIdeaRows(provider, prompt, args.userId);
    if (rows.length === 0) {
      parseFailureCount += 1;
      continue;
    }
    const accepted = enforceRules({
      rows,
      count: remaining,
      blockedKeywords,
      blockedSubjectKeys,
      blockedNarrationKeys,
      language,
      topicAnchors: appliedTopicAnchors,
      languageExemptAnchors: topicAnchors,
      strictNarrationQuality: hardSpecificityTopic
    });
    languageRejectedCount += accepted.languageRejectedCount;
    specificityRejectedCount += accepted.specificityRejectedCount;
    narrationRejectedCount += accepted.narrationRejectedCount;
    placeholderRejectedCount += accepted.placeholderRejectedCount;
    duplicateRejectedCount += accepted.duplicateRejectedCount;
    accepted.rows.forEach((item) => {
      const key = normalizeKeywordKey(item.Keyword);
      blockedKeywords.add(key);
      const subjectKey = normalizeSubjectKey(item.Subject);
      if (subjectKey) {
        blockedSubjectKeys.add(subjectKey);
      }
      const narrationKey = normalizeNarrationCoreKey(item.Narration, language);
      if (narrationKey) {
        blockedNarrationKeys.add(narrationKey);
      }
      collected.push(item);
    });
  }

  if (collected.length === 0 && parseFailureCount > 0) {
    throw new IdeaGenerationError(
      "아이디어 JSON 파싱에 실패했습니다. 다시 시도해 주세요.",
      "JSON_PARSE_FAILED",
      snapshotDebug()
    );
  }
  if (collected.length === 0 && languageRejectedCount > 0) {
    throw new IdeaGenerationError(
      `선택한 ${describeLanguageForError(language)} 결과가 안정적으로 생성되지 않았습니다. 다시 시도해 주세요.`,
      "LANGUAGE_REJECTED",
      snapshotDebug()
    );
  }
  if (collected.length === 0 && specificityRejectedCount > 0) {
    throw new IdeaGenerationError(
      `아이디어 품질 검증을 통과한 결과가 부족했습니다. 잠시 후 다시 시도해 주세요.`,
      "SPECIFICITY_REJECTED",
      snapshotDebug()
    );
  }
  if (collected.length === 0 && placeholderRejectedCount > 0) {
    throw new IdeaGenerationError(
      "플레이스홀더(예: 〇〇/XX)가 포함된 결과가 감지되어 차단되었습니다. 다시 시도해 주세요.",
      "PLACEHOLDER_REJECTED",
      snapshotDebug()
    );
  }
  if (collected.length === 0 && narrationRejectedCount > 0 && hardSpecificityTopic) {
    throw new IdeaGenerationError(
      `실질적인 스토리 내용을 포함한 나레이션 결과가 부족했습니다. 주제를 조금 더 구체화해 다시 시도해 주세요.`,
      "NARRATION_REJECTED",
      snapshotDebug()
    );
  }
  if (collected.length < count) {
    if (languageRejectedCount > 0) {
      throw new IdeaGenerationError(
        `선택한 ${describeLanguageForError(language)} 결과만 유지하다 보니 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
        "LANGUAGE_REJECTED",
        snapshotDebug()
      );
    }
    if (specificityRejectedCount > 0) {
      throw new IdeaGenerationError(
        `품질 기준을 유지하면서 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
        "SPECIFICITY_REJECTED",
        snapshotDebug()
      );
    }
    if (narrationRejectedCount > 0 && hardSpecificityTopic) {
      throw new IdeaGenerationError(
        `스토리 밀도를 유지하면서 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
        "NARRATION_REJECTED",
        snapshotDebug()
      );
    }
    if (placeholderRejectedCount > 0) {
      throw new IdeaGenerationError(
        `플레이스홀더(예: 〇〇/XX)를 제거하다 보니 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
        "PLACEHOLDER_REJECTED",
        snapshotDebug()
      );
    }
    if (duplicateRejectedCount > 0) {
      throw new IdeaGenerationError(
        `중복되는 주제/서사(Subject/Narration)를 제외하다 보니 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
        "INSUFFICIENT_UNIQUE_RESULTS",
        snapshotDebug()
      );
    }
    throw new IdeaGenerationError(
      `기존 keyword와 중복되지 않는 아이디어를 ${count}개 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`,
      "INSUFFICIENT_UNIQUE_RESULTS",
      snapshotDebug()
    );
  }
  return collected;
}

export async function generateRelatedIdeaKeywords(args: {
  topic: string;
  existingKeywords?: string[];
  candidateKeywords?: string[];
  language?: IdeaLanguage;
  limit?: number;
  userId?: string;
}): Promise<string[]> {
  const topic = args.topic.trim();
  const limit = Math.max(1, Math.min(6, Math.floor(args.limit ?? 4)));
  const language: IdeaLanguage =
    args.language === "en" ||
    args.language === "ja" ||
    args.language === "es" ||
    args.language === "hi"
      ? args.language
      : "ko";

  if (!topic) {
    return [];
  }

  const blockedKeywords = new Set(
    [topic, ...(args.existingKeywords || [])]
      .map((value) => normalizeKeywordKey(value))
      .filter(Boolean)
  );

  try {
    const provider = await resolveProvider(args.userId);
    const topicAnchors = normalizeTopicAnchorsForLanguage(extractTopicAnchors(topic), language);
    const prompt = buildRelatedKeywordPrompt(
      topic,
      Array.from(blockedKeywords),
      language,
      limit,
      topicAnchors,
      requiresHardSpecificity(topic)
    );
    const keywords = await requestRelatedKeywords(provider, prompt, args.userId);
    const accepted = fallbackRelatedKeywords({
      topic,
      blockedKeywords,
      candidateKeywords: keywords,
      limit,
      language
    });
    if (accepted.length > 0) {
      return accepted;
    }
  } catch {
    // Fall back to generated idea keywords when the keyword-only request fails.
  }

  return fallbackRelatedKeywords({
    topic,
    blockedKeywords,
    candidateKeywords: args.candidateKeywords,
    limit,
    language
  });
}
