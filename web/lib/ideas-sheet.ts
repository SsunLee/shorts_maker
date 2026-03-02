import { getSheetsContext, readSheetValues } from "@/lib/google-sheets-client";
import { IdeaDraftRow } from "@/lib/types";

interface SheetMatrix {
  headers: string[];
  rows: string[][];
  sheetName: string;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findColumnIndex(headers: string[], aliases: string[]): number | undefined {
  const normalizedAliases = aliases.map((item) => normalizeHeader(item));
  const index = headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header))
  );
  return index >= 0 ? index : undefined;
}

function toObjectRows(headers: string[], bodyRows: string[][]): Record<string, string>[] {
  return bodyRows.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = String(cells[index] ?? "");
    });
    return row;
  });
}

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

function resolveNextSequence(args: {
  base: string;
  rows: string[][];
  idColumnIndex: number;
}): number {
  const pattern = new RegExp(`^${escapeRegex(args.base)}-(\\d+)$`);
  let max = 0;
  args.rows.forEach((row) => {
    const id = String(row[args.idColumnIndex] ?? "").trim();
    if (!id) {
      return;
    }
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

function buildIdeaId(base: string, seq: number): string {
  return `${base}-${String(seq).padStart(3, "0")}`;
}

function normalizeIdeaId(raw: string | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

async function readSheetMatrix(sheetName?: string, userId?: string): Promise<SheetMatrix> {
  const context = await getSheetsContext(sheetName, userId);
  if (!context) {
    throw new Error(
      "Google Sheets is not configured. Set spreadsheet ID, client email, and private key in /settings."
    );
  }
  const values = await readSheetValues(context);
  const headers = (values[0] ?? []).map((value) => String(value).trim()).filter(Boolean);
  const bodyRows = values.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
  return {
    headers,
    rows: bodyRows,
    sheetName: context.sheetName
  };
}

export async function loadIdeasSheetTable(sheetName?: string, userId?: string): Promise<{
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}> {
  const matrix = await readSheetMatrix(sheetName, userId);
  return {
    sheetName: matrix.sheetName,
    headers: matrix.headers,
    rows: toObjectRows(matrix.headers, matrix.rows)
  };
}

export async function appendIdeaRowsToSheet(args: {
  sheetName?: string;
  idBase?: string;
  items: IdeaDraftRow[];
  userId?: string;
}): Promise<{ inserted: number; sheetName: string }> {
  const context = await getSheetsContext(args.sheetName, args.userId);
  if (!context) {
    throw new Error(
      "Google Sheets is not configured. Set spreadsheet ID, client email, and private key in /settings."
    );
  }

  const values = await readSheetValues(context);
  const headers = (values[0] ?? []).map((value) => String(value).trim());
  if (headers.length === 0) {
    throw new Error("Sheet header row is empty. Add header columns first.");
  }

  const indexes = {
    id: findColumnIndex(headers, ["id"]),
    status: findColumnIndex(headers, ["status", "Status"]),
    keyword: findColumnIndex(headers, ["keyword", "Keyword"]),
    subject: findColumnIndex(headers, ["subject", "Subject"]),
    description: findColumnIndex(headers, ["description", "Description"]),
    narration: findColumnIndex(headers, ["narration", "Narration"]),
    publish: findColumnIndex(headers, ["publish", "Publish"])
  };

  const idColumnIndex = indexes.id;
  if (idColumnIndex === undefined) {
    throw new Error("시트에 id 컬럼이 필요합니다. 헤더에 'id' 컬럼을 추가해 주세요.");
  }

  const idBase = normalizeIdBase(args.idBase);
  const bodyRows = values.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
  let nextSeq = resolveNextSequence({
    base: idBase,
    rows: bodyRows,
    idColumnIndex
  });
  const usedIdKeys = new Set(
    bodyRows
      .map((row) => String(row[idColumnIndex] ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  const existingKeywordKeys = new Set<string>();
  if (indexes.keyword !== undefined) {
    bodyRows.forEach((row) => {
      const keyword = String(row[indexes.keyword!] ?? "")
        .trim()
        .toLowerCase();
      if (keyword) {
        existingKeywordKeys.add(keyword);
      }
    });
  }
  const pendingKeywordKeys = new Set<string>();

  function takeUniqueId(preferred?: string): string {
    const explicit = normalizeIdeaId(preferred);
    if (explicit && !usedIdKeys.has(explicit.toLowerCase())) {
      usedIdKeys.add(explicit.toLowerCase());
      return explicit;
    }
    let generated = buildIdeaId(idBase, nextSeq);
    nextSeq += 1;
    while (usedIdKeys.has(generated.toLowerCase())) {
      generated = buildIdeaId(idBase, nextSeq);
      nextSeq += 1;
    }
    usedIdKeys.add(generated.toLowerCase());
    return generated;
  }

  const appendRows = args.items.map((item) => {
    const row = Array(headers.length).fill("");
    const keyword = String(item.Keyword || "").trim();
    if (indexes.keyword !== undefined && keyword) {
      const keywordKey = keyword.toLowerCase();
      if (existingKeywordKeys.has(keywordKey) || pendingKeywordKeys.has(keywordKey)) {
        throw new Error(`중복 keyword는 반영할 수 없습니다: ${keyword}`);
      }
      pendingKeywordKeys.add(keywordKey);
    }

    row[idColumnIndex] = takeUniqueId(item.id);
    if (indexes.status !== undefined) {
      row[indexes.status] = "준비";
    }
    if (indexes.keyword !== undefined) {
      row[indexes.keyword] = keyword;
    }
    if (indexes.subject !== undefined) {
      row[indexes.subject] = item.Subject;
    }
    if (indexes.description !== undefined) {
      row[indexes.description] = item.Description;
    }
    if (indexes.narration !== undefined) {
      row[indexes.narration] = item.Narration;
    }
    if (indexes.publish !== undefined) {
      row[indexes.publish] = "대기중";
    }
    return row;
  });

  if (appendRows.length === 0) {
    return { inserted: 0, sheetName: context.sheetName };
  }

  await context.sheets.spreadsheets.values.append({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!A:ZZ`,
    valueInputOption: "RAW",
    requestBody: {
      values: appendRows
    }
  });

  return {
    inserted: appendRows.length,
    sheetName: context.sheetName
  };
}
