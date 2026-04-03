import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import { IdeaLanguage } from "@/lib/types";

type Provider = "openai" | "gemini";

function stripJsonFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const withoutStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutStart.replace(/\s*```$/, "").trim();
}

function normalizeRecord(record: unknown): Record<string, string> | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  const source = record as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    output[String(key)] = String(value ?? "").trim();
  }
  output.status = "준비";
  const normalizedType = String(
    output.type || output.Type || source["type"] || source["Type"] || ""
  ).trim();
  output.type = normalizedType;
  return output;
}

function parseRows(raw: string): Record<string, string>[] {
  const cleaned = stripJsonFence(raw);
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("아이디어 생성 응답이 JSON 배열 형식이 아닙니다.");
  }
  return parsed
    .map((item) => normalizeRecord(item))
    .filter((item): item is Record<string, string> => Boolean(item));
}

function headersFromRows(rows: Record<string, string>[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  const preferred = [
    "id",
    "status",
    "type",
    "jlpt",
    "Subject",
    "kr_intonation",
    "romaji_intonation",
    "kr_mean",
    "example_1_title",
    "example_1_hira",
    "example_1_romaji",
    "example_1_mean",
    "example_1_kanji",
    "example_2_title",
    "example_2_hira",
    "example_2_romaji",
    "example_2_mean",
    "example_2_kanji",
    "Caption"
  ];

  preferred.forEach((key) => {
    if (rows.some((row) => key in row)) {
      seen.add(key.toLowerCase());
      output.push(key);
    }
  });
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      const normalized = key.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      output.push(key);
    });
  });
  return output;
}

async function requestRows(provider: Provider, prompt: string, userId?: string): Promise<Record<string, string>[]> {
  const keys = await resolveApiKeys(userId);
  const textModel = await resolveModelForTask(provider, "text", userId);

  if (provider === "gemini") {
    const client = new GoogleGenAI({ apiKey: keys.geminiKey });
    const response = await client.models.generateContent({
      model: textModel,
      contents: prompt
    });
    return parseRows(response.text || "");
  }

  const client = new OpenAI({ apiKey: keys.openaiKey });
  const response = await client.responses.create({
    model: textModel,
    input: [
      {
        role: "system",
        content:
          "You output only a strict JSON array of objects. Do not include markdown fences or extra text."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });
  return parseRows(response.output_text || "");
}

function languageLabel(language: IdeaLanguage): string {
  if (language === "ja") return "일본어";
  if (language === "en") return "영어";
  if (language === "es") return "스페인어";
  if (language === "hi") return "힌디어";
  return "한국어";
}

export async function generateInstagramIdeaRows(args: {
  prompt: string;
  count: number;
  language: IdeaLanguage;
  userId?: string;
}): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const provider = await resolveProviderForTask("text", args.userId);
  const rows = await requestRows(provider, args.prompt, args.userId);
  if (rows.length === 0) {
    throw new Error(`${languageLabel(args.language)} 결과가 비어 있습니다. 프롬프트를 확인 후 다시 시도해 주세요.`);
  }
  const limited = rows.slice(0, Math.max(1, Math.min(10, Math.floor(args.count))));
  const headers = headersFromRows(limited);
  return { headers, rows: limited };
}
