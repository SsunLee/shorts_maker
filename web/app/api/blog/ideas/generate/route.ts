import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiKeys, resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { buildStockMetricsMarkdown, fetchStockMetrics } from "@/lib/blog-stock-data";
import { getOpenAiClient } from "@/lib/openai-service";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["keyword", "stock"]).default("keyword"),
  keyword: z.string().optional(),
  tone: z.string().optional(),
  stock: z
    .object({
      code: z.string().optional(),
      market: z.enum(["KOSPI", "KOSDAQ", "OTHER"]).optional(),
      name: z.string().optional(),
      rank: z.number().optional()
    })
    .optional()
});

type BlogIdeaPayload = {
  hashtags?: unknown;
  markdown?: unknown;
  summary?: unknown;
  title?: unknown;
};

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function escapeControlCharsInJsonStrings(raw: string): string {
  let escaped = false;
  let inString = false;
  let output = "";

  for (const char of raw) {
    if (!inString) {
      output += char;
      if (char === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      output += char;
      inString = false;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 0x20) {
      if (char === "\n") output += "\\n";
      else if (char === "\r") output += "\\r";
      else if (char === "\t") output += "\\t";
      else if (char === "\b") output += "\\b";
      else if (char === "\f") output += "\\f";
      else output += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    output += char;
  }

  return output;
}

function parseJsonCandidate(candidate: string): BlogIdeaPayload | undefined {
  try {
    return JSON.parse(candidate) as BlogIdeaPayload;
  } catch {
    // Continue with a repaired candidate below.
  }

  const escapedCandidate = escapeControlCharsInJsonStrings(candidate);
  if (escapedCandidate !== candidate) {
    try {
      return JSON.parse(escapedCandidate) as BlogIdeaPayload;
    } catch {
      // Keep trying other candidates.
    }
  }

  return undefined;
}

function parseIdeaPayload(raw: string): BlogIdeaPayload {
  const normalized = stripJsonFence(raw);
  const candidates = [normalized];
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(normalized.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error("AI 응답 JSON 파싱에 실패했습니다. 본문 문자열의 줄바꿈/제어문자를 복구해도 JSON 구조가 유효하지 않습니다.");
}

function normalizeHashtags(raw: unknown, fallback: string): string[] {
  const list = Array.isArray(raw)
    ? raw.map(String)
    : String(raw || fallback)
        .split(/[\s,]+/)
        .map(String);
  return Array.from(
    new Set(
      list
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`))
        .map((item) => item.replace(/\s+/g, ""))
    )
  ).slice(0, 18);
}

function getProviderErrorStatus(error: unknown): number | undefined {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  for (const key of ["status", "statusCode", "code"]) {
    const value = record[key];
    if (typeof value === "number" && value >= 400 && value <= 599) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (parsed >= 400 && parsed <= 599) {
        return parsed;
      }
    }
  }

  const message = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(message) as { error?: { code?: number | string } };
    const code = parsed.error?.code;
    if (typeof code === "number" && code >= 400 && code <= 599) {
      return code;
    }
    if (typeof code === "string") {
      const parsedCode = Number.parseInt(code, 10);
      if (parsedCode >= 400 && parsedCode <= 599) {
        return parsedCode;
      }
    }
  } catch {
    // Error message is not provider JSON.
  }

  return undefined;
}

function isTransientProviderError(status: number | undefined, message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalized.includes("high demand") ||
    normalized.includes("try again later") ||
    normalized.includes("temporar") ||
    normalized.includes("unavailable") ||
    normalized.includes("overload") ||
    normalized.includes("rate limit") ||
    normalized.includes("timeout")
  );
}

function buildPrompt(args: z.infer<typeof schema>, stockMetricsMarkdown = ""): string {
  const tone = String(args.tone || "차분하고 신뢰감 있는 정보성 블로그 글").trim();
  if (args.kind === "stock") {
    const stock = args.stock || {};
    const market = stock.market || "KOSPI";
    const rank = typeof stock.rank === "number" ? `${stock.rank}위` : "순차 대상";
    return [
      "아래 종목을 다루는 완성된 한국어 블로그 글 초안을 작성하세요.",
      `종목명: ${stock.name || args.keyword || "미지정"}`,
      `종목코드: ${stock.code || "미지정"}`,
      `시장: ${market}`,
      `큐 순서: ${rank}`,
      `톤: ${tone}`,
      "",
      "중요 규칙:",
      "- 최신 주가, 실적 수치, 시가총액, 재무 수치, 뉴스 사실은 입력에 없으면 지어내지 마세요.",
      "- 제공된 숫자 데이터가 있으면 서버가 본문 상단에 표로 자동 삽입합니다.",
      "- AI 본문에서는 같은 표를 반복하지 말고, 제공된 숫자의 증감/비율에 근거한 해석만 작성하세요.",
      "- 숫자 데이터는 임의로 바꾸거나 추가하지 마세요.",
      "- 매수/매도/목표가/수익 보장 표현을 쓰지 마세요.",
      "- 투자 권유가 아닌 정보성 글이라는 문장을 본문 하단에 넣으세요.",
      "- 회사/종목을 처음 공부하는 독자가 이해할 수 있게 사업 개요, 핵심 숫자, 실적 흐름, 재무 건전성, 리스크 체크리스트, 다음에 볼 자료를 구성하세요.",
      "- 마크다운 형식의 완성 글을 작성하세요.",
      "- JSON 문자열 안의 줄바꿈은 실제 줄바꿈이 아니라 반드시 \\n으로 이스케이프하세요.",
      stockMetricsMarkdown
        ? [
            "",
            "제공된 숫자 데이터:",
            stockMetricsMarkdown
          ].join("\n")
        : "",
      "",
      "응답은 JSON 객체만 반환하세요:",
      '{ "title": "...", "summary": "...", "markdown": "...", "hashtags": ["#..."] }'
    ].join("\n");
  }

  return [
    "아래 키워드를 기반으로 완성된 한국어 블로그 글 초안을 작성하세요.",
    `키워드: ${String(args.keyword || "").trim()}`,
    `톤: ${tone}`,
    "",
    "중요 규칙:",
    "- 마크다운 형식의 완성 글을 작성하세요.",
    "- 독자가 바로 복사해 게시할 수 있도록 제목, 도입, 본문 소제목, 정리, 해시태그를 자연스럽게 구성하세요.",
    "- 사실이 필요한 내용은 과장하지 말고 확인이 필요한 부분은 확인 포인트로 표현하세요.",
    "- JSON 문자열 안의 줄바꿈은 실제 줄바꿈이 아니라 반드시 \\n으로 이스케이프하세요.",
    "",
    "응답은 JSON 객체만 반환하세요:",
    '{ "title": "...", "summary": "...", "markdown": "...", "hashtags": ["#..."] }'
  ].join("\n");
}

function normalizeGeneratedIdea(raw: string, fallbackTopic: string): {
  hashtags: string[];
  markdown: string;
  summary: string;
  title: string;
} {
  const parsed = parseIdeaPayload(raw);
  const title = String(parsed.title || fallbackTopic || "블로그 글").trim();
  const summary = String(parsed.summary || "").trim();
  const markdown = String(parsed.markdown || "").trim();
  if (!markdown) {
    throw new Error("AI가 블로그 본문 markdown을 반환하지 않았습니다.");
  }
  return {
    title,
    summary,
    markdown,
    hashtags: normalizeHashtags(parsed.hashtags, "#블로그 #정보")
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = schema.parse(await request.json());
    const topic =
      payload.kind === "stock"
        ? String(payload.stock?.name || payload.keyword || "").trim()
        : String(payload.keyword || "").trim();
    if (!topic) {
      return NextResponse.json({ error: "키워드 또는 종목명이 필요합니다." }, { status: 400 });
    }

    let stockMetricsMarkdown = "";
    if (payload.kind === "stock" && payload.stock?.code) {
      const metrics = await fetchStockMetrics({
        code: payload.stock.code,
        name: payload.stock.name || topic
      });
      stockMetricsMarkdown = buildStockMetricsMarkdown(metrics);
    }

    const provider = await resolveProviderForTask("text", userId);
    const model = await resolveModelForTask(provider, "text", userId);
    const prompt = buildPrompt(payload, stockMetricsMarkdown);

    let text = "";
    if (provider === "gemini") {
      const keys = await resolveApiKeys(userId);
      if (!keys.geminiKey) {
        throw new Error("Gemini API key is missing. Configure it in /settings.");
      }
      const client = new GoogleGenAI({ apiKey: keys.geminiKey });
      const response = await client.models.generateContent({
        model,
        contents: prompt
      });
      text = response.text || "";
    } else {
      const client = await getOpenAiClient(userId, { timeoutMs: 180000, maxRetries: 1 });
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "You write production-ready Korean blog drafts. Return valid JSON only. Do not include markdown fences around JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      text = response.output_text || "";
    }

    const idea = normalizeGeneratedIdea(text, topic);
    if (stockMetricsMarkdown) {
      idea.markdown = `${stockMetricsMarkdown}\n\n${idea.markdown}`;
    }
    return NextResponse.json({
      ...idea,
      provider,
      model
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "블로그 아이디어 생성에 실패했습니다.";
    const providerStatus = getProviderErrorStatus(error);
    const transient = isTransientProviderError(providerStatus, message);
    const status = error instanceof z.ZodError ? 400 : transient ? 503 : 500;
    return NextResponse.json({ error: message, transient }, { status });
  }
}
