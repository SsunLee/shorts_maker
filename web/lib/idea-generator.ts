import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getSettings } from "@/lib/settings-store";
import { IdeaDraftRow, IdeaLanguage } from "@/lib/types";

type Provider = "openai" | "gemini";

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

async function resolveKeys(): Promise<{ openaiKey?: string; geminiKey?: string }> {
  const settings = await getSettings();
  return {
    openaiKey: process.env.OPENAI_API_KEY || settings.openaiApiKey,
    geminiKey: process.env.GEMINI_API_KEY || settings.geminiApiKey
  };
}

async function resolveProvider(): Promise<Provider> {
  const requested = String(process.env.AI_PROVIDER || "auto").toLowerCase();
  const keys = await resolveKeys();
  if (requested === "gemini") {
    if (!keys.geminiKey) {
      throw new Error("Gemini API key is missing. Configure it in /settings.");
    }
    return "gemini";
  }
  if (requested === "openai") {
    if (!keys.openaiKey) {
      throw new Error("OpenAI API key is missing. Configure it in /settings.");
    }
    return "openai";
  }
  if (keys.geminiKey) {
    return "gemini";
  }
  if (keys.openaiKey) {
    return "openai";
  }
  throw new Error("No AI provider key found. Add GEMINI_API_KEY or OPENAI_API_KEY.");
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
  return "Write Keyword, Subject, Description, Narration in Korean.";
}

function buildPrompt(
  topic: string,
  count: number,
  excludedKeywords: string[],
  language: IdeaLanguage
): string {
  const excludedText = formatExcludedKeywords(excludedKeywords);
  const duplicateRule = excludedText
    ? `- Do not reuse existing keywords: ${excludedText}\n`
    : "- Do not duplicate existing keywords.\n";

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
    "- Narration: smooth story-driven voiceover script, around 200-250 words\n" +
    `- Language: ${resolveLanguageInstruction(language)}\n` +
    "- Output JSON only, no markdown, no explanation"
  );
}

function enforceRules(args: {
  rows: IdeaDraftRow[];
  count: number;
  blockedKeywords: Set<string>;
}): IdeaDraftRow[] {
  const output: IdeaDraftRow[] = [];
  const seenInBatch = new Set<string>();
  args.rows.forEach((row) => {
    if (output.length >= args.count) {
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
    seenInBatch.add(keywordKey);
    output.push({
      Status: "준비",
      Keyword: keyword,
      Subject: normalizeField(row.Subject),
      Description: normalizeField(row.Description),
      Narration: normalizeField(row.Narration),
      publish: "대기중"
    });
  });
  return output;
}

async function requestIdeaRows(provider: Provider, prompt: string): Promise<IdeaDraftRow[]> {
  if (provider === "gemini") {
    const keys = await resolveKeys();
    const client = new GoogleGenAI({ apiKey: keys.geminiKey });
    const response = await runGeminiWithRetry(() =>
      client.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite",
        contents: prompt
      })
    );
    return safeParseIdeaRows(response.text || "");
  }

  const keys = await resolveKeys();
  const client = new OpenAI({ apiKey: keys.openaiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
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

async function requestIdeaRowsWithFallback(provider: Provider, prompt: string): Promise<IdeaDraftRow[]> {
  try {
    return await requestIdeaRows(provider, prompt);
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase();
    const isGeminiUnavailable = provider === "gemini" && isRetryableProviderError(error);
    if (!isGeminiUnavailable) {
      throw error;
    }
    const keys = await resolveKeys();
    if (!keys.openaiKey) {
      throw error;
    }
    const fallbackResponse = await new OpenAI({ apiKey: keys.openaiKey }).responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
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
    if (!fallbackResponse.output_text) {
      throw new Error(message || "Idea generation failed.");
    }
    return safeParseIdeaRows(fallbackResponse.output_text || "");
  }
}

export async function generateIdeas(args: {
  topic: string;
  count: number;
  existingKeywords?: string[];
  language?: IdeaLanguage;
}): Promise<IdeaDraftRow[]> {
  const topic = args.topic.trim();
  const count = Math.max(1, Math.min(10, Math.floor(args.count)));
  const language: IdeaLanguage =
    args.language === "en" || args.language === "ja" || args.language === "es"
      ? args.language
      : "ko";
  if (!topic) {
    throw new Error("주제를 입력해 주세요.");
  }
  const provider = await resolveProvider();
  const blockedKeywords = new Set(
    (args.existingKeywords || [])
      .map((value) => normalizeKeywordKey(value))
      .filter(Boolean)
  );
  const collected: IdeaDraftRow[] = [];
  const maxAttempts = 4;
  let parseFailureCount = 0;

  for (let attempt = 1; attempt <= maxAttempts && collected.length < count; attempt += 1) {
    const remaining = count - collected.length;
    const prompt = buildPrompt(topic, remaining, Array.from(blockedKeywords), language);
    const rows = await requestIdeaRowsWithFallback(provider, prompt);
    if (rows.length === 0) {
      parseFailureCount += 1;
      continue;
    }
    const accepted = enforceRules({
      rows,
      count: remaining,
      blockedKeywords
    });
    accepted.forEach((item) => {
      const key = normalizeKeywordKey(item.Keyword);
      blockedKeywords.add(key);
      collected.push(item);
    });
  }

  if (collected.length === 0 && parseFailureCount > 0) {
    throw new Error("아이디어 JSON 파싱에 실패했습니다. 다시 시도해 주세요.");
  }
  if (collected.length < count) {
    throw new Error(
      `기존 keyword와 중복되지 않는 아이디어를 ${count}개 채우지 못했습니다. 현재 ${collected.length}개 생성되었습니다.`
    );
  }
  return collected;
}
