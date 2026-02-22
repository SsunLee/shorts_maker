import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getSettings } from "@/lib/settings-store";
import { IdeaDraftRow } from "@/lib/types";

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

function buildPrompt(topic: string, count: number, excludedKeywords: string[]): string {
  const excludedText = formatExcludedKeywords(excludedKeywords);
  const duplicateRule = excludedText
    ? `- 아래 기존 keyword와 중복되면 안 됨: ${excludedText}\n`
    : "- 기존 keyword와 중복되지 않게 생성할 것\n";

  return (
    `당신은 ${topic} 쇼츠 생성하는 Assistant입니다.\n\n` +
    `${topic} 관련 컨텐츠를 뽑아내야합니다. ex) “고대 이집트 하트셉수트”\n` +
    "아래의 Google Sheet row 구조에 맞는 JSON 배열을 출력하세요.\n\n" +
    "[출력 형식]\n" +
    "- 최종 출력은 반드시 JSON 배열이어야 함 → [ {…}, {…}, ... ]\n" +
    `- 배열 길이는 ${count}개\n` +
    "- 값은 모두 string\n\n" +
    "[object 구조]\n" +
    "- Status\n" +
    "- Keyword\n" +
    "- Subject\n" +
    "- Description\n" +
    "- Narration\n" +
    "- publish\n\n" +
    "[규칙]\n" +
    `- ${topic} 관련 주제에 맞는 주제를 ${count}개 생성할 것\n` +
    '- Status : 는 반드시 "준비" 로 쓸 것\n' +
    duplicateRule +
    "- 이번 응답 내에서도 Keyword는 서로 중복되지 않아야 함\n" +
    "- Keyword : 핵심 키워드 ex) 하트셉수트\n" +
    "- Subject : 후킹 문장 ex) 최초의 여성 파라오?\n" +
    `- Description : 유투브 설명 영역에 올릴 주제 관련 설명, 해시태그 추가, 고대이집트, 고대이집트문명, 이집트문명, ${topic} 관련 태그\n` +
    "- Narration : 200 ~ 250 단어 분량의 스토리 기반 고대 이집트 관련 나레이션, 영상용 음성 설명에 맞게 매끄러운 문장\n" +
    '- publish : 항상 "대기중"\n' +
    "- JSON 외 아무것도 출력하지 말 것"
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
    const response = await client.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite",
      contents: prompt
    });
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

export async function generateIdeas(args: {
  topic: string;
  count: number;
  existingKeywords?: string[];
}): Promise<IdeaDraftRow[]> {
  const topic = args.topic.trim();
  const count = Math.max(1, Math.min(10, Math.floor(args.count)));
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
    const prompt = buildPrompt(topic, remaining, Array.from(blockedKeywords));
    const rows = await requestIdeaRows(provider, prompt);
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
