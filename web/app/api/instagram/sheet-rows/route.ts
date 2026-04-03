import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";

export const runtime = "nodejs";

type InstagramFeedSheetRow = {
  id: string;
  status: string;
  keyword: string;
  subject: string;
  description: string;
  narration: string;
  raw: Record<string, string>;
};

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function buildNormalizedRow(source: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    normalized[normalizeKey(key)] = String(value || "").trim();
  });
  return normalized;
}

function pickFirst(source: Record<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    const value = source[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildFallbackRowId(args: {
  row: Record<string, string>;
  index: number;
}): string {
  const base =
    pickFirst(args.row, ["subject", "type", "keyword", "jlpt"]) || "insta";
  const normalizedBase = base
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();
  return `${normalizedBase || "insta"}-${String(args.index + 1).padStart(3, "0")}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestedSheetName = String(request.nextUrl.searchParams.get("sheetName") || "").trim();
    let sheetName = requestedSheetName || undefined;
    if (!sheetName) {
      const settings = await getSettings(userId);
      const instagramSheetName = String(settings.gsheetInstagramSheetName || "").trim();
      sheetName = instagramSheetName || undefined;
    }

    const table = await loadIdeasSheetTable(sheetName, userId);
    const rows = (table.rows || [])
      .map((rawRow, index) => {
        const normalizedRow = buildNormalizedRow(rawRow);
        const status = pickFirst(normalizedRow, ["status"]);
        const id = pickFirst(normalizedRow, ["id", "rowid"]) || buildFallbackRowId({ row: normalizedRow, index });
        const subject = pickFirst(normalizedRow, ["subject"]);
        const keyword = pickFirst(normalizedRow, ["keyword", "type", "jlpt", "subject"]);
        const description = pickFirst(normalizedRow, ["description", "caption", "type"]);
        const narration = pickFirst(normalizedRow, ["narration", "example_1_title", "example1title", "subject"]);

        const normalizedRaw: Record<string, string> = {};
        Object.entries(rawRow || {}).forEach(([key, value]) => {
          normalizedRaw[key] = String(value || "");
        });
        Object.entries(normalizedRow).forEach(([key, value]) => {
          if (normalizedRaw[key] === undefined) {
            normalizedRaw[key] = String(value || "");
          }
        });

        const mapped: InstagramFeedSheetRow = {
          id,
          status,
          keyword,
          subject,
          description,
          narration,
          raw: normalizedRaw
        };
        return mapped;
      })
      .filter((row) => row.status === "준비" && row.subject);

    return NextResponse.json({
      rows,
      count: rows.length,
      readyOnly: true,
      sheetName: table.sheetName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch instagram sheet rows";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
