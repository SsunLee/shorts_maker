import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateIdeas } from "@/lib/idea-generator";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import { IdeaDraftRow, IdeaLanguage } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  topic: z.string().min(1),
  count: z.number().int().min(1).max(10).default(1),
  sheetName: z.string().optional(),
  idBase: z.string().optional(),
  language: z.enum(["ko", "en", "ja", "es", "hi"]).optional()
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

function findRowValue(row: Record<string, string>, aliases: string[]): string {
  const aliasSet = new Set(aliases.map((item) => item.trim().toLowerCase()));
  const key = Object.keys(row).find((item) => aliasSet.has(item.trim().toLowerCase()));
  return key ? String(row[key] || "").trim() : "";
}

function resolveNextSequence(base: string, existingIds: string[]): number {
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  let max = 0;
  existingIds.forEach((id) => {
    const match = id.match(pattern);
    if (!match) {
      return;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  });
  return max + 1;
}

function attachIdeaIds(args: {
  rows: IdeaDraftRow[];
  idBase: string;
  existingIds: string[];
}): IdeaDraftRow[] {
  const usedIds = new Set(
    args.existingIds.map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
  let seq = resolveNextSequence(args.idBase, args.existingIds);
  return args.rows.map((row) => {
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

/** Generate idea rows for Google Sheet template. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const sheetTable = await loadIdeasSheetTable(payload.sheetName);
    const existingKeywords = sheetTable.rows
      .map((row) => findRowValue(row, ["keyword"]))
      .filter(Boolean);
    const existingIds = sheetTable.rows
      .map((row) => findRowValue(row, ["id"]))
      .filter(Boolean);
    const items = await generateIdeas({
      topic: payload.topic,
      count: payload.count,
      existingKeywords,
      language: (payload.language || "ko") as IdeaLanguage
    });
    const idBase = normalizeIdBase(payload.idBase || payload.topic);
    const withIds = attachIdeaIds({
      rows: items,
      idBase,
      existingIds
    });
    return NextResponse.json({ items: withIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate ideas";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
