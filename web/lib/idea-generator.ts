import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import { IdeaDraftRow, IdeaLanguage } from "@/lib/types";

type Provider = "openai" | "gemini";
type LatestNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  link: string;
};

function stripJsonFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function normalizeField(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKeywordKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
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

function minimumNarrationLength(language: IdeaLanguage): number {
  if (language === "en" || language === "es") {
    return 220;
  }
  if (language === "hi") {
    return 180;
  }
  return 130;
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
  if (sentenceCount < 3) {
    return false;
  }

  const anchorHits = countAnchorHits(body, args.topicAnchors);
  const fillerHeavy = hasGenericNarrationFiller(body);
  if (args.topicAnchors.length > 0 && anchorHits === 0 && fillerHeavy) {
    return false;
  }
  if (fillerHeavy && bodyLength < minimumNarrationLength(args.language) + 40) {
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
      link
    });
  }

  return items;
}

function safeParseIdeaRows(raw: string): IdeaDraftRow[] {
  try {
    const parsed = JSON.parse(stripJsonFence(raw));
    if (!Array.isArray(parsed)) {
      return [];
    }
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
  } catch {
    return [];
  }
}

function safeParseKeywordList(raw: string): string[] {
  try {
    const parsed = JSON.parse(stripJsonFence(raw));
    if (!Array.isArray(parsed)) {
      return [];
    }
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
  } catch {
    return [];
  }
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

function matchesRequestedLanguageText(
  text: string,
  language: IdeaLanguage,
  field: "keyword" | "longform"
): boolean {
  const cleaned = stripDecorationsForLanguageCheck(text);
  if (!cleaned) {
    return false;
  }
  if (language === "ko") {
    return /[가-힣]/u.test(cleaned);
  }
  if (language === "ja") {
    if (containsHangul(cleaned)) {
      return false;
    }
    if (field === "keyword") {
      return containsJapaneseKana(cleaned) || containsHan(cleaned);
    }
    return containsJapaneseKana(cleaned) || containsHan(cleaned);
  }
  if (language === "hi") {
    return containsDevanagari(cleaned);
  }
  return true;
}

function rowMatchesRequestedLanguage(row: IdeaDraftRow, language: IdeaLanguage): boolean {
  if (language === "en" || language === "es") {
    return true;
  }
  return (
    matchesRequestedLanguageText(row.Keyword, language, "keyword") &&
    matchesRequestedLanguageText(row.Subject, language, "longform") &&
    matchesRequestedLanguageText(row.Description, language, "longform") &&
    matchesRequestedLanguageText(row.Narration, language, "longform")
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

function resolveNewsLocale(language: IdeaLanguage): { hl: string; gl: string; ceid: string } {
  if (language === "ja") {
    return { hl: "ja-JP", gl: "JP", ceid: "JP:ja" };
  }
  if (language === "ko") {
    return { hl: "ko-KR", gl: "KR", ceid: "KR:ko" };
  }
  if (language === "es") {
    return { hl: "es-ES", gl: "ES", ceid: "ES:es" };
  }
  if (language === "hi") {
    return { hl: "hi-IN", gl: "IN", ceid: "IN:hi" };
  }
  return { hl: "en-US", gl: "US", ceid: "US:en" };
}

async function fetchLatestNewsContext(topic: string, language: IdeaLanguage): Promise<LatestNewsItem[]> {
  if (!requiresHardSpecificity(topic)) {
    return [];
  }

  const timeoutMs = parsePositiveInt(process.env.IDEA_NEWS_TIMEOUT_MS, 3500);
  const { hl, gl, ceid } = resolveNewsLocale(language);
  const query = `${topic} when:7d`;
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
    return parseLatestNewsItemsFromRss(xml, 4);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(
  topic: string,
  count: number,
  excludedKeywords: string[],
  language: IdeaLanguage,
  latestNewsItems: LatestNewsItem[] = [],
  topicAnchors: string[] = []
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
  const topicAnchorBlock =
    topicAnchors.length > 0
      ? "[Topic Anchors]\n" +
        `- Preferred anchor terms extracted from user topic: ${topicAnchors.join(", ")}\n` +
        "- Prefer including at least one anchor term (or close inflection) in Subject or Narration.\n\n"
      : "";
  const latestNewsContextBlock =
    latestNewsItems.length > 0
      ? "[Recent News Context]\n" +
        latestNewsItems
          .map((item, index) => {
            const published = item.publishedAt ? ` | Published: ${item.publishedAt}` : "";
            const source = item.source ? ` | Source: ${item.source}` : "";
            const link = item.link ? ` | URL: ${item.link}` : "";
            return `${index + 1}. ${item.title}${source}${published}${link}`;
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
    "- Keyword: concise core keyword for the idea\n" +
    "- Subject: one strong hook sentence\n" +
    "- Description: YouTube-ready summary + hashtags (#shorts + topic-related tags)\n" +
    "- Narration: story-driven voiceover script, around 160-240 words, with concrete details\n" +
    "- Narration body must include at least 3 concrete points (facts/examples/scenes) tied to the topic\n" +
    "- Avoid empty filler lines such as generic hype or 'we will explore this' with no details\n" +
    "- Narration must NOT contain hashtags (#...) anywhere, especially at the end\n" +
    `- Narration must end with this exact CTA sentence: "${subscribeCtaByLanguage(language)}"\n` +
    `- Language: ${resolveLanguageInstruction(language)}\n` +
    topicAnchorBlock +
    latestNewsContextBlock +
    domainSpecificityRule +
    specificityRule +
    hardSpecificityRule +
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
  language: IdeaLanguage;
  topicAnchors: string[];
}): {
  rows: IdeaDraftRow[];
  languageRejectedCount: number;
  specificityRejectedCount: number;
  narrationRejectedCount: number;
} {
  const output: IdeaDraftRow[] = [];
  const relaxedCandidates: IdeaDraftRow[] = [];
  const seenInBatch = new Set<string>();
  let languageRejectedCount = 0;
  let specificityRejectedCount = 0;
  let narrationRejectedCount = 0;
  args.rows.forEach((row) => {
    if (output.length >= args.count) {
      return;
    }
    if (!rowMatchesRequestedLanguage(row, args.language)) {
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
    if (
      !meetsNarrationQuality({
        narration: normalized.Narration,
        topicAnchors: args.topicAnchors,
        language: args.language
      })
    ) {
      narrationRejectedCount += 1;
      return;
    }
    if (rowIncludesTopicAnchor(normalized, args.topicAnchors)) {
      seenInBatch.add(keywordKey);
      output.push(normalized);
      return;
    }
    if (args.topicAnchors.length > 0) {
      specificityRejectedCount += 1;
    }
    seenInBatch.add(keywordKey);
    relaxedCandidates.push(normalized);
  });
  if (output.length < args.count && relaxedCandidates.length > 0) {
    output.push(...relaxedCandidates.slice(0, args.count - output.length));
  }
  return { rows: output, languageRejectedCount, specificityRejectedCount, narrationRejectedCount };
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
  if (!topic) {
    throw new Error("주제를 입력해 주세요.");
  }
  const provider = await resolveProvider(args.userId);
  const blockedKeywords = new Set(
    (args.existingKeywords || [])
      .map((value) => normalizeKeywordKey(value))
      .filter(Boolean)
  );
  const collected: IdeaDraftRow[] = [];
  const maxAttempts = Math.max(3, Math.min(8, parsePositiveInt(process.env.IDEA_GENERATION_MAX_ATTEMPTS, 6)));
  let parseFailureCount = 0;
  let languageRejectedCount = 0;
  let specificityRejectedCount = 0;
  let narrationRejectedCount = 0;
  const topicAnchors = extractTopicAnchors(topic);
  const latestNewsItems = await fetchLatestNewsContext(topic, language);

  for (let attempt = 1; attempt <= maxAttempts && collected.length < count; attempt += 1) {
    const remaining = count - collected.length;
    const prompt = buildPrompt(
      topic,
      remaining,
      Array.from(blockedKeywords),
      language,
      latestNewsItems,
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
      language,
      topicAnchors
    });
    languageRejectedCount += accepted.languageRejectedCount;
    specificityRejectedCount += accepted.specificityRejectedCount;
    narrationRejectedCount += accepted.narrationRejectedCount;
    accepted.rows.forEach((item) => {
      const key = normalizeKeywordKey(item.Keyword);
      blockedKeywords.add(key);
      collected.push(item);
    });
  }

  if (collected.length === 0 && parseFailureCount > 0) {
    throw new Error("아이디어 JSON 파싱에 실패했습니다. 다시 시도해 주세요.");
  }
  if (collected.length === 0 && languageRejectedCount > 0) {
    throw new Error(
      `선택한 ${describeLanguageForError(language)} 결과가 안정적으로 생성되지 않았습니다. 다시 시도해 주세요.`
    );
  }
  if (collected.length === 0 && specificityRejectedCount > 0) {
    throw new Error(
      `아이디어 품질 검증을 통과한 결과가 부족했습니다. 잠시 후 다시 시도해 주세요.`
    );
  }
  if (collected.length === 0 && narrationRejectedCount > 0) {
    throw new Error(
      `실질적인 스토리 내용을 포함한 나레이션 결과가 부족했습니다. 주제를 조금 더 구체화해 다시 시도해 주세요.`
    );
  }
  if (collected.length < count) {
    if (languageRejectedCount > 0) {
      throw new Error(
        `선택한 ${describeLanguageForError(language)} 결과만 유지하다 보니 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`
      );
    }
    if (specificityRejectedCount > 0) {
      throw new Error(
        `품질 기준을 유지하면서 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`
      );
    }
    if (narrationRejectedCount > 0) {
      throw new Error(
        `스토리 밀도를 유지하면서 ${count}개를 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`
      );
    }
    throw new Error(
      `기존 keyword와 중복되지 않는 아이디어를 ${count}개 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`
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
    const topicAnchors = extractTopicAnchors(topic);
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
