import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";
import { IdeaLanguage } from "@/lib/types";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import {
  extractPromptVariables,
  INSTAGRAM_IDEA_DEFAULT_PROMPT,
  renderPromptTemplate
} from "@/lib/instagram-ideas-prompt";
import { generateInstagramIdeaRows } from "@/lib/instagram-ideas-generator";

export const runtime = "nodejs";

const schema = z.object({
  topic: z.string().min(1),
  count: z.number().int().min(1).max(10).default(5),
  sheetName: z.string().optional(),
  idBase: z.string().optional(),
  language: z.enum(["ko", "en", "ja", "es", "hi"]).optional(),
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

function normalizeLanguage(raw: string | undefined): IdeaLanguage {
  if (raw === "en" || raw === "ja" || raw === "es" || raw === "hi") {
    return raw;
  }
  return "ko";
}

function buildPrompt(args: {
  template: string;
  topic: string;
  count: number;
  language: IdeaLanguage;
  variables?: Record<string, string>;
}): string {
  const requiredFields =
    "id, status, type, jlpt, Subject, kr_intonation, romaji_intonation, kr_mean, " +
    "example_1_title, example_1_hira, example_1_romaji, example_1_mean, example_1_kanji, " +
    "example_2_title, example_2_hira, example_2_romaji, example_2_mean, example_2_kanji, Caption";
  const variableMap: Record<string, string | number | undefined> = {
    ...args.variables,
    cnt: String(args.count),
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
    `- language: ${args.language}\n` +
    `- count: ${args.count}\n` +
    `- 각 object는 다음 필드를 모두 포함: ${requiredFields}\n` +
    `- status는 반드시 "준비"\n` +
    `- type은 문법/표현 유형 문자열(예: 과거부정형)\n` +
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
    const template =
      String(payload.template || "").trim() ||
      String(settings.instagramIdeaPromptTemplate || "").trim() ||
      INSTAGRAM_IDEA_DEFAULT_PROMPT;

    const prompt = buildPrompt({
      template,
      topic: payload.topic.trim(),
      count: payload.count,
      language,
      variables: payload.variables
    });

    const result = await generateInstagramIdeaRows({
      prompt,
      count: payload.count,
      language,
      userId
    });

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
      rows: result.rows,
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
