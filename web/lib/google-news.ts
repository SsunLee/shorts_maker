import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";

export type GoogleNewsCountryCode =
  | "KR"
  | "US"
  | "JP"
  | "GB"
  | "CA"
  | "AU"
  | "IN"
  | "SG"
  | "DE"
  | "FR";

type GoogleNewsLocale = {
  hl: string;
  gl: string;
  ceid: string;
};

type GoogleNewsDecodingParams = {
  signature: string;
  timestamp: string;
};

export type GoogleNewsItem = {
  title: string;
  titleKo: string;
  description: string;
  summaryOriginal: string;
  summaryKo: string;
  detailOriginal: string;
  detailKo: string;
  imagePrompt: string;
  imageUrl?: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  link: string;
};

type KoreanNewsRewrite = {
  titleKo: string;
  summaryKo: string;
  detailKo: string;
};

const GOOGLE_NEWS_LOCALES: Record<GoogleNewsCountryCode, GoogleNewsLocale> = {
  KR: { hl: "ko-KR", gl: "KR", ceid: "KR:ko" },
  US: { hl: "en-US", gl: "US", ceid: "US:en" },
  JP: { hl: "ja-JP", gl: "JP", ceid: "JP:ja" },
  GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  CA: { hl: "en-CA", gl: "CA", ceid: "CA:en" },
  AU: { hl: "en-AU", gl: "AU", ceid: "AU:en" },
  IN: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
  SG: { hl: "en-SG", gl: "SG", ceid: "SG:en" },
  DE: { hl: "de-DE", gl: "DE", ceid: "DE:de" },
  FR: { hl: "fr-FR", gl: "FR", ceid: "FR:fr" }
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function stripCdata(value: string): string {
  return String(value || "").replace(/^<!\[CDATA\[/i, "").replace(/\]\]>$/i, "");
}

function collapseWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string): string {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number.parseInt(digits, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function stripHtmlTags(value: string): string {
  return collapseWhitespace(String(value || "").replace(/<[^>]+>/g, " "));
}

function cleanText(value: string): string {
  return stripHtmlTags(decodeXmlEntities(stripCdata(value)));
}

function extractTagRawValue(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return "";
  }
  return decodeXmlEntities(stripCdata(match[1]));
}

function extractTagValue(xml: string, tagName: string): string {
  return cleanText(extractTagRawValue(xml, tagName));
}

function extractTagAttribute(xml: string, tagName: string, attribute: string): string {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*\\b${attribute}="([^"]+)"`, "i"));
  if (!match) {
    return "";
  }
  return decodeXmlEntities(stripCdata(match[1]));
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of values) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(item);
  }
  return output;
}

function extractGoogleNewsBase64Token(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== "news.google.com") {
      return "";
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const articleIndex = parts.findIndex((part) => part === "articles" || part === "read");
    if (articleIndex >= 0 && articleIndex + 1 < parts.length) {
      return parts[articleIndex + 1];
    }
    return "";
  } catch {
    return "";
  }
}

function extractHtmlAttributeValue(html: string, attributeName: string): string {
  const regex = new RegExp(`${attributeName}="([^"]+)"`, "i");
  const match = String(html || "").match(regex);
  return match ? decodeXmlEntities(match[1]) : "";
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGoogleNewsDecodingParams(base64Token: string, timeoutMs: number): Promise<GoogleNewsDecodingParams | undefined> {
  const endpoints = [
    `https://news.google.com/articles/${encodeURIComponent(base64Token)}`,
    `https://news.google.com/rss/articles/${encodeURIComponent(base64Token)}`
  ];
  for (const endpoint of endpoints) {
    const html = await fetchTextWithTimeout(endpoint, timeoutMs);
    if (!html) {
      continue;
    }
    const signature = extractHtmlAttributeValue(html, "data-n-a-sg");
    const timestamp = extractHtmlAttributeValue(html, "data-n-a-ts");
    if (signature && timestamp) {
      return { signature, timestamp };
    }
  }
  return undefined;
}

async function decodeGoogleNewsArticleUrl(args: {
  base64Token: string;
  params: GoogleNewsDecodingParams;
  timeoutMs: number;
}): Promise<string> {
  const payload = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${args.base64Token}",${args.params.timestamp},"${args.params.signature}"]`
  ];
  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      },
      body
    });
    if (!response.ok) {
      return "";
    }
    const text = await response.text();
    const responseChunk = text.split("\n\n")[1];
    if (!responseChunk) {
      return "";
    }
    const parsed = JSON.parse(responseChunk) as unknown[];
    const trimmed = Array.isArray(parsed) ? parsed.slice(0, -2) : [];
    if (!Array.isArray(trimmed) || trimmed.length === 0 || !Array.isArray(trimmed[0])) {
      return "";
    }
    const payloadField = (trimmed[0] as unknown[])[2];
    if (typeof payloadField !== "string") {
      return "";
    }
    const decodedPayload = JSON.parse(payloadField) as unknown[];
    const decodedUrl = Array.isArray(decodedPayload) ? String(decodedPayload[1] || "") : "";
    return decodedUrl.trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePublisherArticleUrl(googleNewsUrl: string, timeoutMs: number): Promise<string> {
  const token = extractGoogleNewsBase64Token(googleNewsUrl);
  if (!token) {
    return String(googleNewsUrl || "").trim();
  }
  const params = await fetchGoogleNewsDecodingParams(token, timeoutMs);
  if (!params) {
    return String(googleNewsUrl || "").trim();
  }
  const decoded = await decodeGoogleNewsArticleUrl({
    base64Token: token,
    params,
    timeoutMs
  });
  return decoded || String(googleNewsUrl || "").trim();
}

function cleanArticleHtml(value: string): string {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function extractMetaContent(html: string, key: string, attr: "property" | "name"): string {
  const regex = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reverseRegex = new RegExp(
    `<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${attr}=["']${key}["'][^>]*>`,
    "i"
  );
  const match = html.match(regex) || html.match(reverseRegex);
  return match ? cleanText(match[1]) : "";
}

function extractFirstImageUrlFromHtml(html: string): string {
  const match = String(html || "").match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (!match) {
    return "";
  }
  const decoded = decodeXmlEntities(stripCdata(match[1] || "")).trim();
  if (!/^https?:\/\//i.test(decoded)) {
    return "";
  }
  return decoded;
}

function extractMetaImageUrl(html: string): string {
  const candidates = [
    extractMetaContent(html, "og:image", "property"),
    extractMetaContent(html, "og:image:url", "property"),
    extractMetaContent(html, "twitter:image", "name"),
    extractMetaContent(html, "twitter:image:src", "name")
  ]
    .map((value) => collapseWhitespace(value))
    .filter((value) => /^https?:\/\//i.test(value));
  return candidates[0] || "";
}

function extractJsonLdTexts(html: string): string[] {
  const scripts = Array.from(
    String(html || "").matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  const output: string[] = [];
  const visitNode = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visitNode);
      return;
    }
    if (typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    for (const key of ["articleBody", "description"]) {
      if (typeof record[key] === "string") {
        const cleaned = cleanText(record[key] as string);
        if (cleaned.length > 30) {
          output.push(cleaned);
        }
      }
    }
    for (const value of Object.values(record)) {
      if (typeof value === "object") {
        visitNode(value);
      }
    }
  };
  for (const script of scripts) {
    const raw = String(script[1] || "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      visitNode(parsed);
    } catch {
      continue;
    }
  }
  return dedupeCaseInsensitive(output);
}

function extractParagraphTexts(html: string): string[] {
  const articleScoped =
    String(html || "").match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || String(html || "");
  const paragraphs = Array.from(String(articleScoped || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi));
  const output = paragraphs
    .map((match) => cleanText(match[1] || ""))
    .filter((text) => text.length >= 45);
  return dedupeCaseInsensitive(output);
}

const DETAIL_NOISE_PATTERNS: RegExp[] = [
  /(무단\s*전재|재배포|저작권|copyright|all rights reserved)/i,
  /(광고|스폰서|구독|알림|앱\s*설치|뉴스레터)/i,
  /(관련\s*기사|많이\s*본\s*뉴스|추천\s*기사|실시간\s*랭킹)/i,
  /(기자\s*=?|특파원\s*=?|입력\s*\d{2,4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})/i
];
const REPORT_ONLY_SENTENCES = ["전합니다", "전했습니다", "전해졌습니다", "전해집니다", "밝혔습니다", "말했습니다"];

function splitDetailSentences(value: string): string[] {
  return dedupeCaseInsensitive(
    collapseWhitespace(value)
      .split(/(?<=[.!?。！？])\s+|\n+/u)
      .map((sentence) => collapseWhitespace(sentence))
      .filter((sentence) => sentence.length >= 12)
  );
}

function isLikelyNoiseSentence(sentence: string): boolean {
  const normalized = collapseWhitespace(sentence);
  if (!normalized) {
    return true;
  }
  if (normalized.length < 12) {
    return true;
  }
  if (DETAIL_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const tokenCount = tokenizeForMatch(normalized).length;
  return tokenCount < 2;
}

function dedupeNearDuplicateSentences(sentences: string[]): string[] {
  const picked: string[] = [];
  for (const sentence of sentences) {
    const normalized = collapseWhitespace(sentence);
    if (!normalized) {
      continue;
    }
    const tokens = tokenizeForMatch(normalized);
    const duplicated = picked.some((existing) => {
      if (existing.toLowerCase() === normalized.toLowerCase()) {
        return true;
      }
      const score = computeTokenJaccardScore(tokens, tokenizeForMatch(existing));
      return score >= 0.86;
    });
    if (!duplicated) {
      picked.push(normalized);
    }
  }
  return picked;
}

function removeConsecutiveDuplicateSentences(value: string): string {
  const segments = collapseWhitespace(value).match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  const output: string[] = [];
  for (const segment of segments) {
    const normalized = collapseWhitespace(segment);
    if (!normalized) {
      continue;
    }
    const comparable = normalized
      .replace(/[.!?。！？]+$/u, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const previous = output[output.length - 1] || "";
    const previousComparable = previous
      .replace(/[.!?。！？]+$/u, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (comparable && comparable === previousComparable) {
      continue;
    }
    output.push(normalized);
  }
  return collapseWhitespace(output.join(" "));
}

function removeReportOnlySentences(value: string): string {
  const segments = collapseWhitespace(value).match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  const output = segments.filter((segment) => {
    const comparable = normalizeReportOnlyComparable(segment);
    return !isReportOnlyComparable(comparable);
  });
  return collapseWhitespace(output.join(" "));
}

function normalizeReportOnlyComparable(value: string): string {
  return collapseWhitespace(value)
    .replace(/[.!?。！？]+$/u, "")
    .replace(/[^가-힣a-z0-9]/gi, "");
}

function isReportOnlyComparable(value: string): boolean {
  if (!value) {
    return false;
  }
  if (REPORT_ONLY_SENTENCES.includes(value)) {
    return true;
  }
  return REPORT_ONLY_SENTENCES.some((phrase) => value.length > phrase.length && value.split(phrase).join("") === "");
}

function normalizeNarrativeArtifacts(value: string): string {
  let text = collapseWhitespace(value);
  if (!text) {
    return "";
  }
  text = text.replace(/(전합니다[.!?。！？]?\s*){2,}/g, "전합니다. ");
  text = removeConsecutiveDuplicateSentences(text);
  text = removeReportOnlySentences(text);
  text = text.replace(/([.!?。！？])\1{1,}/g, "$1");
  text = text.replace(/([^\s])\1{4,}/g, "$1$1");
  text = text.replace(/\s+[·•]\s+/g, " ");
  return collapseWhitespace(text);
}

function computeTitleTokenOverlap(sentence: string, titleTokens: Set<string>): number {
  if (titleTokens.size === 0) {
    return 0;
  }
  const sentenceTokens = new Set(tokenizeForMatch(sentence));
  if (sentenceTokens.size === 0) {
    return 0;
  }
  let matched = 0;
  for (const token of sentenceTokens) {
    if (titleTokens.has(token)) {
      matched += 1;
    }
  }
  return matched / Math.max(1, titleTokens.size);
}

function buildStoryFocusedDetail(args: {
  title: string;
  candidates: string[];
  fallback: string;
  maxChars: number;
}): string {
  const titleTokens = new Set(tokenizeForMatch(args.title));
  const normalizedCandidates = dedupeCaseInsensitive(
    args.candidates.map((candidate) => normalizeNarrativeArtifacts(candidate)).filter((candidate) => candidate.length >= 24)
  );
  if (normalizedCandidates.length === 0) {
    return truncateBySentenceBoundary(args.fallback || args.title, args.maxChars);
  }

  const scored = normalizedCandidates
    .map((candidate, index) => {
      const sentences = splitDetailSentences(candidate).filter((sentence) => !isLikelyNoiseSentence(sentence));
      const overlapValues = sentences.map((sentence) => computeTitleTokenOverlap(sentence, titleTokens));
      const overlapCount = overlapValues.filter((score) => score > 0).length;
      const maxOverlap = overlapValues.length > 0 ? Math.max(...overlapValues) : 0;
      const score = maxOverlap * 5 + overlapCount * 1.2 + Math.min(candidate.length / 260, 4) - index * 0.05;
      return {
        candidate,
        sentences,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  const primary = scored[0];
  const primarySentences = primary?.sentences || [];
  const focusedPrimary = primarySentences.filter((sentence, index) => {
    const overlap = computeTitleTokenOverlap(sentence, titleTokens);
    return overlap > 0 || index < 2;
  });
  let selectedSentences = dedupeNearDuplicateSentences(focusedPrimary.length > 0 ? focusedPrimary : primarySentences.slice(0, 6));

  if (selectedSentences.length < 3 && scored.length > 1) {
    for (const fallbackCandidate of scored.slice(1)) {
      const additions = dedupeNearDuplicateSentences(
        fallbackCandidate.sentences.filter((sentence) => computeTitleTokenOverlap(sentence, titleTokens) > 0)
      );
      for (const sentence of additions) {
        if (selectedSentences.length >= 6) {
          break;
        }
        const merged = dedupeNearDuplicateSentences([...selectedSentences, sentence]);
        if (merged.length > selectedSentences.length) {
          selectedSentences = merged;
        }
      }
      if (selectedSentences.length >= 3) {
        break;
      }
    }
  }

  if (selectedSentences.length === 0) {
    selectedSentences = splitDetailSentences(primary?.candidate || "").slice(0, 4);
  }
  const merged = normalizeNarrativeArtifacts(selectedSentences.join(" "));
  if (!merged) {
    return truncateBySentenceBoundary(args.fallback || args.title, args.maxChars);
  }
  const clipped = truncateBySentenceBoundary(merged, args.maxChars);
  if (clipped.length >= 100) {
    return clipped;
  }
  const fallbackMerged = normalizeNarrativeArtifacts(`${args.fallback || args.title} ${clipped}`);
  return truncateBySentenceBoundary(fallbackMerged, args.maxChars);
}

function buildDetailedOriginalText(args: {
  title: string;
  html: string;
  maxChars: number;
  fallback: string;
}): string {
  const cleanedHtml = cleanArticleHtml(args.html);
  const metaDescription =
    extractMetaContent(cleanedHtml, "og:description", "property") ||
    extractMetaContent(cleanedHtml, "description", "name");
  const jsonLdTexts = extractJsonLdTexts(cleanedHtml);
  const paragraphTexts = extractParagraphTexts(cleanedHtml);
  const candidates = dedupeCaseInsensitive([
    ...jsonLdTexts,
    ...paragraphTexts,
    metaDescription
  ]).filter(Boolean);
  if (candidates.length === 0) {
    return truncateBySentenceBoundary(args.fallback || args.title, args.maxChars);
  }
  return buildStoryFocusedDetail({
    title: args.title,
    candidates,
    fallback: args.fallback || args.title,
    maxChars: args.maxChars
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const size = Math.max(1, Math.min(concurrency, items.length));
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function normalizeForMatch(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\u3040-\u30ff\u4e00-\u9faf\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForMatch(value: string): string[] {
  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function computeTokenJaccardScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isLikelySameStoryHeadline(title: string, candidate: string): boolean {
  const normalizedTitle = normalizeForMatch(title);
  const normalizedCandidate = normalizeForMatch(candidate);
  if (!normalizedTitle || !normalizedCandidate) {
    return false;
  }
  if (normalizedCandidate.includes(normalizedTitle) || normalizedTitle.includes(normalizedCandidate)) {
    return true;
  }
  const score = computeTokenJaccardScore(tokenizeForMatch(normalizedTitle), tokenizeForMatch(normalizedCandidate));
  return score >= 0.38;
}

function selectPrimaryHeadline(title: string, candidates: string[]): string {
  const normalizedTitle = collapseWhitespace(title);
  if (candidates.length === 0) {
    return normalizedTitle;
  }
  const matched = candidates.find((candidate) => isLikelySameStoryHeadline(normalizedTitle, candidate));
  if (matched) {
    return collapseWhitespace(matched);
  }
  return collapseWhitespace(candidates[0]);
}

function selectSameStoryHeadlines(title: string, candidates: string[], maxItems: number): string[] {
  if (candidates.length === 0) {
    return [];
  }
  const primary = selectPrimaryHeadline(title, candidates);
  const output = [primary];
  for (const candidate of candidates) {
    const normalized = collapseWhitespace(candidate);
    if (!normalized || normalized.toLowerCase() === primary.toLowerCase()) {
      continue;
    }
    if (!isLikelySameStoryHeadline(primary, normalized) && !isLikelySameStoryHeadline(title, normalized)) {
      continue;
    }
    output.push(normalized);
    if (output.length >= Math.max(1, maxItems)) {
      break;
    }
  }
  return dedupeCaseInsensitive(output);
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = collapseWhitespace(value);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  const trimmed = collapseWhitespace(value);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const effectiveMax = Math.max(1, maxLength);
  const clipLength = Math.max(1, effectiveMax - 1);
  let clipped = trimmed.slice(0, clipLength).trimEnd();
  const breakIndex = clipped.lastIndexOf(" ");
  if (breakIndex >= Math.floor(clipLength * 0.45)) {
    clipped = clipped.slice(0, breakIndex).trimEnd();
  }
  return `${clipped}…`;
}

function hasSentenceEnding(value: string): boolean {
  return /[.!?。！？]["'”’)\]]*$/u.test(collapseWhitespace(value));
}

function trimToSentenceBoundary(value: string): string {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (hasSentenceEnding(normalized)) {
    return normalized;
  }
  const matches = Array.from(normalized.matchAll(/[.!?。！？]["'”’)\]]*/gu));
  const last = matches.length > 0 ? matches[matches.length - 1] : undefined;
  if (!last || typeof last.index !== "number") {
    return normalized;
  }
  const cut = last.index + last[0].length;
  if (cut < Math.floor(normalized.length * 0.55)) {
    return normalized;
  }
  return normalized.slice(0, cut).trim();
}

function truncateBySentenceBoundary(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const segments = (normalized.match(/[^.!?。！？]+[.!?。！？]["'”’)\]]*|[^.!?。！？]+$/gu) || [])
    .map((segment) => collapseWhitespace(segment))
    .filter(Boolean);
  if (segments.length <= 1) {
    return truncateAtWordBoundary(normalized, maxLength);
  }
  const limit = Math.max(1, maxLength);
  let composed = "";
  for (const segment of segments) {
    const next = composed ? `${composed} ${segment}` : segment;
    if (next.length <= limit) {
      composed = next;
      continue;
    }
    break;
  }
  if (composed) {
    return trimToSentenceBoundary(composed);
  }
  return truncateAtWordBoundary(segments[0], limit);
}

function composeSummaryWithinLimit(sentences: string[], maxChars: number): string {
  const normalizedSentences = sentences
    .map((sentence) => collapseWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
  if (normalizedSentences.length === 0) {
    return "";
  }
  const limit = Math.max(1, maxChars);
  let composed = "";
  for (const sentence of normalizedSentences) {
    const next = composed ? `${composed} ${sentence}` : sentence;
    if (next.length <= limit) {
      composed = next;
      continue;
    }
    if (composed) {
      break;
    }
    return truncateAtWordBoundary(sentence, limit);
  }
  const finalized = trimToSentenceBoundary(composed || normalizedSentences[0]);
  if (finalized.length <= limit) {
    return finalized;
  }
  return truncateBySentenceBoundary(finalized, limit);
}

function extractLinkedHeadlineCandidates(rawHtml: string): string[] {
  const matches = Array.from(rawHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi));
  const headlines = matches
    .map((match) => cleanText(match[1] || ""))
    .filter((text) => text.length > 0);
  return dedupeCaseInsensitive(headlines);
}

function firstSentenceOrWholeText(value: string): string {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return "";
  }
  const sentenceSplit = normalized.split(/(?<=[.!?。！？])\s+/u);
  return sentenceSplit[0] ? sentenceSplit[0].trim() : normalized;
}

const SUMMARY_STOP_WORDS = new Set([
  "그리고",
  "그러나",
  "하지만",
  "또한",
  "이번",
  "관련",
  "대한",
  "위한",
  "에서",
  "으로",
  "했다",
  "했다고",
  "라고",
  "하는",
  "있는",
  "있는지",
  "등",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "about"
]);

function splitSentencesForSummary(value: string): string[] {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return [];
  }
  return dedupeNearDuplicateSentences(
    normalized
      .split(/(?<=[.!?。！？])\s+|\n+/u)
      .map((sentence) => collapseWhitespace(sentence))
      .filter((sentence) => sentence.length >= 18)
      .filter((sentence) => !isLikelyNoiseSentence(sentence))
  );
}

function tokenizeSummarySentence(value: string): string[] {
  return tokenizeForMatch(value).filter((token) => token.length >= 2 && !SUMMARY_STOP_WORDS.has(token));
}

function buildMeaningfulSummary(args: {
  title: string;
  body: string;
  maxSentences: number;
  maxChars: number;
}): string {
  const sentences = splitSentencesForSummary(args.body);
  if (sentences.length === 0) {
    return composeSummaryWithinLimit([firstSentenceOrWholeText(args.body || args.title)], args.maxChars);
  }

  const titleTokens = new Set(tokenizeSummarySentence(args.title));
  const tokenFrequency = new Map<string, number>();
  const tokenizedSentences = sentences.map((sentence) => {
    const tokens = tokenizeSummarySentence(sentence);
    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);
    }
    return tokens;
  });

  const scored = sentences.map((sentence, index) => {
    const tokens = tokenizedSentences[index];
    if (tokens.length === 0) {
      return { index, sentence, score: index === 0 ? 0.1 : 0 };
    }
    const uniqueTokens = Array.from(new Set(tokens));
    const frequencyScore = uniqueTokens.reduce((sum, token) => sum + (tokenFrequency.get(token) || 0), 0);
    const titleBoost = uniqueTokens.reduce((sum, token) => sum + (titleTokens.has(token) ? 2.4 : 0), 0);
    const lengthPenalty = Math.max(1, Math.sqrt(uniqueTokens.length));
    const score = (frequencyScore + titleBoost) / lengthPenalty;
    return { index, sentence, score };
  });

  const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
  const selected: Array<{ index: number; sentence: string }> = [];
  const targetCount = Math.max(1, Math.min(args.maxSentences, sentences.length));

  for (const candidate of sortedByScore) {
    if (selected.length >= targetCount) {
      break;
    }
    const candidateTokens = tokenizeSummarySentence(candidate.sentence);
    const isRedundant = selected.some((picked) => {
      const pickedTokens = tokenizeSummarySentence(picked.sentence);
      return computeTokenJaccardScore(candidateTokens, pickedTokens) >= 0.75;
    });
    if (isRedundant) {
      continue;
    }
    selected.push({ index: candidate.index, sentence: candidate.sentence });
  }

  if (selected.length === 0) {
    selected.push({ index: 0, sentence: sentences[0] });
  }

  const orderedSummarySentences = selected
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
  return normalizeNarrativeArtifacts(composeSummaryWithinLimit(orderedSummarySentences, args.maxChars));
}

function buildOriginalSummary(args: {
  title: string;
  rawDescription: string;
  plainDescription: string;
}): string {
  const linkedHeadlines = extractLinkedHeadlineCandidates(args.rawDescription);
  if (linkedHeadlines.length > 0) {
    const selected = selectSameStoryHeadlines(args.title, linkedHeadlines, 1);
    if (selected.length > 0) {
      return truncateText(selected[0], 220);
    }
  }
  if (args.plainDescription) {
    return truncateText(firstSentenceOrWholeText(args.plainDescription), 220);
  }
  return truncateText(args.title, 180);
}

function buildOriginalDetail(args: {
  title: string;
  rawDescription: string;
  plainDescription: string;
}): string {
  const linkedHeadlines = extractLinkedHeadlineCandidates(args.rawDescription);
  if (linkedHeadlines.length > 0) {
    const selected = selectSameStoryHeadlines(args.title, linkedHeadlines, 1);
    if (selected.length > 0) {
      return truncateText(selected[0], 900);
    }
  }
  if (args.plainDescription) {
    return truncateText(normalizeNarrativeArtifacts(args.plainDescription), 900);
  }
  return truncateText(normalizeNarrativeArtifacts(args.title), 320);
}

function containsKorean(value: string): boolean {
  return /[가-힣]/.test(value);
}

function sanitizePromptFragment(value: string, maxLength: number): string {
  const text = collapseWhitespace(String(value || "").replace(/[`\r\n]+/g, " "));
  return truncateText(text, maxLength);
}

function buildImagePrompt(args: {
  title: string;
  summaryOriginal: string;
  summaryKo: string;
  source: string;
}): string {
  const topic = sanitizePromptFragment(args.title, 120);
  const context = sanitizePromptFragment(args.summaryKo || args.summaryOriginal || args.title, 180);
  const source = sanitizePromptFragment(args.source || "Google News", 60);
  return [
    `뉴스 상황을 시각화한 사실적인 에디토리얼 사진, 주제: ${topic}`,
    `핵심 맥락: ${context}`,
    `배경: 기사 맥락과 맞는 실제적인 도시/현장 분위기, 정보 전달 중심 구성`,
    "스타일: natural light, documentary photography, high detail, cinematic composition, 9:16 vertical",
    "제외: 텍스트 오버레이, 로고, 워터마크, 과한 폭력 묘사, 선정적 연출",
    `출처 맥락 참고: ${source}`
  ].join("\n");
}

function readGoogleTranslatePayload(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }
  const segments = payload[0] as unknown[];
  const output = segments
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
    .join("");
  return collapseWhitespace(output);
}

function stripJsonFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseKoreanNewsRewrite(raw: string): KoreanNewsRewrite | undefined {
  const normalized = stripJsonFence(raw);
  try {
    const parsed = JSON.parse(normalized) as Partial<KoreanNewsRewrite>;
    const titleKo = collapseWhitespace(String(parsed.titleKo || ""));
    const summaryKo = collapseWhitespace(String(parsed.summaryKo || ""));
    const detailKo = collapseWhitespace(String(parsed.detailKo || ""));
    if (!titleKo && !summaryKo && !detailKo) {
      return undefined;
    }
    return { titleKo, summaryKo, detailKo };
  } catch {
    return undefined;
  }
}

function buildKoreanNewsRewritePrompt(args: {
  source: string;
  titleOriginal: string;
  summaryOriginal: string;
  detailOriginal: string;
  titleKo: string;
  summaryKo: string;
  detailKo: string;
}): string {
  return [
    "아래 해외/국내 뉴스 정보를 한국어 카드뉴스에 넣기 좋은 자연스러운 한국어로 다듬어 주세요.",
    "규칙:",
    "- 직역체를 쓰지 말고, 한국 독자가 바로 이해할 수 있는 뉴스 문장으로 씁니다.",
    "- 원문에 없는 사실을 추가하지 않습니다.",
    "- 사람/팀/회사/지명/출처명은 가능한 보존합니다.",
    "- 야구, 정치, 사고 기사처럼 맥락이 필요한 표현은 한국어로 자연스럽게 풀어 씁니다.",
    "- titleKo는 45자 이내의 제목형 문장.",
    "- summaryKo는 90자 이내 한 문장.",
    "- detailKo는 2~4문장, 360자 이내.",
    '- JSON만 출력합니다. 형식: {"titleKo":"...","summaryKo":"...","detailKo":"..."}',
    "",
    `출처: ${args.source || "Google News"}`,
    `원문 제목: ${args.titleOriginal}`,
    `원문 요약: ${args.summaryOriginal}`,
    `원문 상세: ${args.detailOriginal}`,
    `기계번역 제목: ${args.titleKo}`,
    `기계번역 요약: ${args.summaryKo}`,
    `기계번역 상세: ${args.detailKo}`
  ].join("\n");
}

function safeRewriteFallback(item: GoogleNewsItem): KoreanNewsRewrite {
  return {
    titleKo: normalizeNarrativeArtifacts(item.titleKo || item.title),
    summaryKo: normalizeNarrativeArtifacts(item.summaryKo || item.summaryOriginal || item.titleKo || item.title),
    detailKo: normalizeNarrativeArtifacts(item.detailKo || item.detailOriginal || item.summaryKo || item.summaryOriginal)
  };
}

async function polishKoreanNewsTextWithAi(
  item: GoogleNewsItem,
  userId: string | undefined,
  timeoutMs: number
): Promise<KoreanNewsRewrite> {
  const fallback = safeRewriteFallback(item);
  const prompt = buildKoreanNewsRewritePrompt({
    source: item.source,
    titleOriginal: item.title,
    summaryOriginal: item.summaryOriginal,
    detailOriginal: item.detailOriginal,
    titleKo: fallback.titleKo,
    summaryKo: fallback.summaryKo,
    detailKo: fallback.detailKo
  });

  try {
    const provider = await resolveProviderForTask("text", userId);
    const model = await resolveModelForTask(provider, "text", userId);
    const keys = await resolveApiKeys(userId);
    let raw = "";

    if (provider === "gemini") {
      if (!keys.geminiKey) {
        return fallback;
      }
      const client = new GoogleGenAI({ apiKey: keys.geminiKey });
      const response = await Promise.race([
        client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI rewrite timeout")), timeoutMs))
      ]);
      raw = response.text || "";
    } else {
      if (!keys.openaiKey) {
        return fallback;
      }
      const client = new OpenAI({ apiKey: keys.openaiKey });
      const response = await Promise.race([
        client.responses.create({
          model,
          input: [
            {
              role: "system",
              content: "You are a Korean news editor. Return only valid JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI rewrite timeout")), timeoutMs))
      ]);
      raw = response.output_text || "";
    }

    const parsed = parseKoreanNewsRewrite(raw);
    if (!parsed) {
      return fallback;
    }
    return {
      titleKo: normalizeNarrativeArtifacts(parsed.titleKo || fallback.titleKo),
      summaryKo: normalizeNarrativeArtifacts(parsed.summaryKo || fallback.summaryKo),
      detailKo: normalizeNarrativeArtifacts(parsed.detailKo || fallback.detailKo)
    };
  } catch {
    return fallback;
  }
}

function isLikelyUntranslatedJapanese(original: string, translated: string): boolean {
  return containsJapanese(original) && !containsKorean(translated);
}

async function translateTextToKoreanOnce(text: string, timeoutMs: number, sourceLanguage: string): Promise<string> {
  const trimmed = collapseWhitespace(text);
  if (!trimmed || containsKorean(trimmed)) {
    return trimmed;
  }

  const endpoint =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLanguage)}&tl=ko&dt=t&q=` +
    encodeURIComponent(trimmed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      return trimmed;
    }

    const payload = (await response.json()) as unknown;
    const translated = readGoogleTranslatePayload(payload);
    return translated || trimmed;
  } catch {
    return trimmed;
  } finally {
    clearTimeout(timer);
  }
}

async function translateTextToKorean(text: string, timeoutMs: number, sourceLanguage = "auto"): Promise<string> {
  const trimmed = collapseWhitespace(text);
  if (!trimmed || containsKorean(trimmed)) {
    return trimmed;
  }

  const sourceLanguages = dedupeCaseInsensitive([sourceLanguage, "auto"]).filter(Boolean);
  let best = trimmed;
  for (const language of sourceLanguages) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const translated = await translateTextToKoreanOnce(trimmed, timeoutMs, language);
      if (translated && translated !== trimmed) {
        best = normalizeNarrativeArtifacts(translated);
      }
      if (!isLikelyUntranslatedJapanese(trimmed, translated)) {
        return normalizeNarrativeArtifacts(translated);
      }
    }
  }
  return normalizeNarrativeArtifacts(best);
}

function splitTextForTranslation(text: string, maxChunkLength: number): string[] {
  const normalized = collapseWhitespace(text);
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChunkLength) {
    return [normalized];
  }
  const sentences = normalized.split(/(?<=[.!?。！？])\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    if (sentence.length <= maxChunkLength) {
      current = sentence;
      continue;
    }
    let remaining = sentence;
    while (remaining.length > maxChunkLength) {
      const cut = remaining.lastIndexOf(" ", maxChunkLength);
      const index = cut > Math.floor(maxChunkLength * 0.5) ? cut : maxChunkLength;
      chunks.push(remaining.slice(0, index).trim());
      remaining = remaining.slice(index).trim();
    }
    current = remaining;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

async function translateLongTextToKorean(
  text: string,
  timeoutMs: number,
  maxChunkLength: number,
  sourceLanguage = "auto"
): Promise<string> {
  const normalized = collapseWhitespace(text);
  if (!normalized || containsKorean(normalized)) {
    return normalized;
  }
  const chunks = splitTextForTranslation(normalized, Math.max(300, maxChunkLength));
  if (chunks.length <= 1) {
    return translateTextToKorean(normalized, timeoutMs, sourceLanguage);
  }
  const translatedChunks = await mapWithConcurrency(chunks, 2, (chunk) =>
    translateTextToKorean(chunk, timeoutMs, sourceLanguage)
  );
  return normalizeNarrativeArtifacts(translatedChunks.join(" "));
}

function resolveGoogleTranslateSourceLanguage(country: GoogleNewsCountryCode): string {
  const locale = GOOGLE_NEWS_LOCALES[country];
  return locale?.hl.split("-")[0] || "auto";
}

function containsJapanese(value: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(String(value || ""));
}

function isCountryAlignedNewsItem(item: GoogleNewsItem, country: GoogleNewsCountryCode): boolean {
  const combined = `${item.title} ${item.source} ${item.link}`;
  if (country === "JP") {
    return containsJapanese(combined) || /\.jp(?:\/|$)/i.test(item.link);
  }
  if (country === "KR") {
    return containsKorean(combined) || /\.kr(?:\/|$)/i.test(item.link);
  }
  return true;
}

function filterCountryAlignedItems(items: GoogleNewsItem[], country: GoogleNewsCountryCode): GoogleNewsItem[] {
  if (country !== "JP" && country !== "KR") {
    return items;
  }
  const filtered = items.filter((item) => isCountryAlignedNewsItem(item, country));
  const minimumThreshold = Math.max(2, Math.min(items.length, Math.ceil(items.length * 0.45)));
  return filtered.length >= minimumThreshold ? filtered : items;
}

function parseGoogleNewsRss(xml: string, limit: number): GoogleNewsItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const items: GoogleNewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const block of blocks) {
    if (items.length >= limit) {
      break;
    }

    let title = extractTagValue(block, "title");
    const link = extractTagValue(block, "link");
    const publishedAt = extractTagValue(block, "pubDate");
    const descriptionRaw = extractTagRawValue(block, "description");
    const description = cleanText(descriptionRaw);
    const rssImageUrl = extractFirstImageUrlFromHtml(descriptionRaw);
    let source = extractTagValue(block, "source");
    const sourceUrl = extractTagAttribute(block, "source", "url");

    if (!source && title.includes(" - ")) {
      const split = title.split(" - ");
      if (split.length >= 2) {
        source = split.pop() || "";
        title = split.join(" - ").trim();
      }
    }

    title = title.replace(/\s*-\s*Google News$/i, "").trim();
    if (!title || !link) {
      continue;
    }

    const normalizedTitle = title.toLowerCase();
    if (seenTitles.has(normalizedTitle)) {
      continue;
    }
    seenTitles.add(normalizedTitle);

    const summaryOriginal = buildOriginalSummary({
      title,
      rawDescription: descriptionRaw,
      plainDescription: description
    });
    const detailOriginal = buildOriginalDetail({
      title,
      rawDescription: descriptionRaw,
      plainDescription: description
    });

    items.push({
      title,
      titleKo: "",
      description,
      summaryOriginal,
      summaryKo: "",
      detailOriginal,
      detailKo: "",
      imagePrompt: "",
      imageUrl: rssImageUrl || undefined,
      source: source || "Google News",
      sourceUrl: sourceUrl || undefined,
      publishedAt,
      link
    });
  }

  return items;
}

async function enrichGoogleNewsItemDetail(
  item: GoogleNewsItem,
  args: {
    timeoutMs: number;
    maxChars: number;
    summaryMaxChars: number;
    summarySentences: number;
  }
): Promise<GoogleNewsItem> {
  const resolvedUrl = await resolvePublisherArticleUrl(item.link, args.timeoutMs);
  const html = await fetchTextWithTimeout(resolvedUrl, args.timeoutMs);
  if (!html) {
    return {
      ...item,
      link: resolvedUrl || item.link
    };
  }
  const cleanedHtml = cleanArticleHtml(html);
  const fallbackDetail = item.detailOriginal || item.summaryOriginal || item.title;
  const detailedOriginal = buildDetailedOriginalText({
    title: item.title,
    html: cleanedHtml,
    maxChars: args.maxChars,
    fallback: fallbackDetail
  });
  const summaryOriginal = buildMeaningfulSummary({
    title: item.title,
    body: detailedOriginal,
    maxSentences: args.summarySentences,
    maxChars: args.summaryMaxChars
  });
  const detailImageUrl = extractMetaImageUrl(cleanedHtml);
  return {
    ...item,
    link: resolvedUrl || item.link,
    description: detailedOriginal,
    summaryOriginal,
    detailOriginal: detailedOriginal,
    imageUrl: detailImageUrl || item.imageUrl
  };
}

export function isSupportedGoogleNewsCountry(raw: string): raw is GoogleNewsCountryCode {
  return Object.prototype.hasOwnProperty.call(
    GOOGLE_NEWS_LOCALES,
    String(raw || "").trim().toUpperCase()
  );
}

export function listSupportedGoogleNewsCountries(): GoogleNewsCountryCode[] {
  return Object.keys(GOOGLE_NEWS_LOCALES) as GoogleNewsCountryCode[];
}

export async function fetchLatestGoogleNews(args: {
  country: GoogleNewsCountryCode;
  count: number;
  query?: string;
  userId?: string;
}): Promise<GoogleNewsItem[]> {
  const locale = GOOGLE_NEWS_LOCALES[args.country];
  const limitedCount = Math.max(1, Math.min(50, Math.floor(args.count)));
  const timeoutMs = parsePositiveInt(process.env.GOOGLE_NEWS_TIMEOUT_MS, 5000);
  const queryText = String(args.query || "").trim();
  const endpoint =
    queryText.length > 0
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(queryText)}&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}&ceid=${encodeURIComponent(locale.ceid)}`
      : `https://news.google.com/rss?hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}&ceid=${encodeURIComponent(locale.ceid)}`;
  const translationTimeoutMs = parsePositiveInt(process.env.GOOGLE_NEWS_TRANSLATE_TIMEOUT_MS, 3500);
  const translationChunkChars = parsePositiveInt(process.env.GOOGLE_NEWS_TRANSLATE_CHUNK_CHARS, 900);
  const translationConcurrency = parsePositiveInt(process.env.GOOGLE_NEWS_TRANSLATE_CONCURRENCY, 2);
  const aiRewriteEnabled = parseBoolean(process.env.GOOGLE_NEWS_AI_REWRITE, true);
  const aiRewriteTimeoutMs = parsePositiveInt(process.env.GOOGLE_NEWS_AI_REWRITE_TIMEOUT_MS, 8000);
  const aiRewriteConcurrency = parsePositiveInt(process.env.GOOGLE_NEWS_AI_REWRITE_CONCURRENCY, 2);
  const enrichDetailEnabled = parseBoolean(process.env.GOOGLE_NEWS_ENRICH_DETAIL, true);
  const defaultDetailFetchLimit = Math.min(limitedCount, args.country === "KR" ? 8 : 5);
  const detailFetchLimit = Math.min(
    limitedCount,
    parsePositiveInt(process.env.GOOGLE_NEWS_DETAIL_FETCH_LIMIT, defaultDetailFetchLimit)
  );
  const detailTimeoutMs = parsePositiveInt(process.env.GOOGLE_NEWS_DETAIL_TIMEOUT_MS, 3200);
  const detailMaxChars = parsePositiveInt(process.env.GOOGLE_NEWS_DETAIL_MAX_CHARS, 2000);
  const detailConcurrency = parsePositiveInt(process.env.GOOGLE_NEWS_DETAIL_CONCURRENCY, 3);
  const summaryMaxChars = parsePositiveInt(process.env.GOOGLE_NEWS_SUMMARY_MAX_CHARS, 760);
  const summarySentences = parsePositiveInt(process.env.GOOGLE_NEWS_SUMMARY_SENTENCES, 5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Google News request failed (HTTP ${response.status}).`);
    }

    const xml = await response.text();
    const parsedItems = filterCountryAlignedItems(parseGoogleNewsRss(xml, limitedCount), args.country);
    const detailEnrichedItems = enrichDetailEnabled
      ? await mapWithConcurrency(parsedItems, detailConcurrency, async (item, index) => {
          if (index >= detailFetchLimit) {
            return item;
          }
          return enrichGoogleNewsItemDetail(item, {
            timeoutMs: detailTimeoutMs,
            maxChars: detailMaxChars,
            summaryMaxChars,
            summarySentences
          });
        })
      : parsedItems;

    const sourceLanguage = resolveGoogleTranslateSourceLanguage(args.country);
    const translatedItems = await mapWithConcurrency(
      detailEnrichedItems,
      translationConcurrency,
      async (item) => {
        if (args.country === "KR") {
          return {
            ...item,
            titleKo: item.title,
            summaryKo: item.summaryOriginal,
            detailKo: item.detailOriginal
          };
        }
        const [titleKo, summaryKo, detailKo] = await Promise.all([
          translateTextToKorean(item.title, translationTimeoutMs, sourceLanguage),
          translateTextToKorean(item.summaryOriginal, translationTimeoutMs, sourceLanguage),
          translateLongTextToKorean(item.detailOriginal, translationTimeoutMs, translationChunkChars, sourceLanguage)
        ]);
        return {
          ...item,
          titleKo,
          summaryKo,
          detailKo
        };
      }
    );
    const polishedItems = aiRewriteEnabled
      ? await mapWithConcurrency(translatedItems, aiRewriteConcurrency, async (item) => {
          const rewrite = await polishKoreanNewsTextWithAi(item, args.userId, aiRewriteTimeoutMs);
          return {
            ...item,
            titleKo: rewrite.titleKo,
            summaryKo: rewrite.summaryKo,
            detailKo: rewrite.detailKo
          };
        })
      : translatedItems;

    return polishedItems.map((item) => ({
      ...item,
      imagePrompt: buildImagePrompt({
        title: item.title,
        summaryOriginal: item.summaryOriginal,
        summaryKo: item.summaryKo,
        source: item.source
      })
    }));
  } finally {
    clearTimeout(timer);
  }
}
