import { getSheetsContext, readSheetValues } from "@/lib/google-sheets-client";
import { IdeaDraftRow } from "@/lib/types";

interface SheetMatrix {
  headers: string[];
  rows: string[][];
  sheetName: string;
}

type TextSignature = {
  raw: string;
  normalized: string;
  tokens: string[];
};

type AppendSkippedItem = {
  field: "keyword" | "subject";
  keyword: string;
  subject: string;
  reason: string;
  matchedValue?: string;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseRatio(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(String(value || "").trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeSimilarityText(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSimilarityText(value: string | undefined): string[] {
  const normalized = normalizeSimilarityText(value);
  if (!normalized) {
    return [];
  }
  const words = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const wordSet = new Set(words);
  if (wordSet.size >= 5) {
    return Array.from(wordSet).slice(0, 200);
  }

  const compact = normalized.replace(/\s+/g, "");
  const ngrams: string[] = [];
  if (compact.length >= 4) {
    const gramSize = compact.length > 40 ? 3 : 2;
    for (let index = 0; index <= compact.length - gramSize && ngrams.length < 200; index += 1) {
      ngrams.push(compact.slice(index, index + gramSize));
    }
  }
  return Array.from(new Set([...words, ...ngrams])).slice(0, 200);
}

function buildTextSignature(value: string): TextSignature {
  return {
    raw: String(value || "").trim(),
    normalized: normalizeSimilarityText(value),
    tokens: tokenizeSimilarityText(value)
  };
}

function computeJaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  });
  const union = leftSet.size + rightSet.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function countCommonTokens(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  let count = 0;
  left.forEach((token) => {
    if (rightSet.has(token)) {
      count += 1;
    }
  });
  return count;
}

function findNearDuplicateText(
  candidate: TextSignature,
  references: TextSignature[],
  threshold: number,
  minCommonTokens: number
): TextSignature | undefined {
  if (!candidate.normalized) {
    return undefined;
  }
  return references.find((target) => {
    if (!target.normalized) {
      return false;
    }
    if (target.normalized === candidate.normalized) {
      return true;
    }
    const longerLength = Math.max(candidate.normalized.length, target.normalized.length);
    const shorterLength = Math.min(candidate.normalized.length, target.normalized.length);
    if (
      longerLength >= 10 &&
      shorterLength >= 8 &&
      (target.normalized.includes(candidate.normalized) || candidate.normalized.includes(target.normalized))
    ) {
      return true;
    }
    const score = computeJaccard(candidate.tokens, target.tokens);
    const common = countCommonTokens(candidate.tokens, target.tokens);
    return score >= threshold && common >= minCommonTokens;
  });
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
}): Promise<{ inserted: number; sheetName: string; insertedIds: string[]; skipped: AppendSkippedItem[] }> {
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
  const keywordSimilarityThreshold = parseRatio(process.env.IDEA_SHEET_KEYWORD_SIMILARITY, 0.9, 0.4, 0.999);
  const subjectSimilarityThreshold = parseRatio(process.env.IDEA_SHEET_SUBJECT_SIMILARITY, 0.78, 0.35, 0.999);
  const keywordMinCommonTokens = parsePositiveInt(process.env.IDEA_SHEET_KEYWORD_MIN_COMMON_TOKENS, 3);
  const subjectMinCommonTokens = parsePositiveInt(process.env.IDEA_SHEET_SUBJECT_MIN_COMMON_TOKENS, 6);

  const existingKeywordSignatures: TextSignature[] = [];
  if (indexes.keyword !== undefined) {
    bodyRows.forEach((row) => {
      const value = String(row[indexes.keyword!] ?? "").trim();
      if (value) {
        existingKeywordSignatures.push(buildTextSignature(value));
      }
    });
  }

  const existingSubjectSignatures: TextSignature[] = [];
  if (indexes.subject !== undefined) {
    bodyRows.forEach((row) => {
      const value = String(row[indexes.subject!] ?? "").trim();
      if (value) {
        existingSubjectSignatures.push(buildTextSignature(value));
      }
    });
  }

  const pendingKeywordSignatures: TextSignature[] = [];
  const pendingSubjectSignatures: TextSignature[] = [];
  const skipped: AppendSkippedItem[] = [];

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

  const insertedIds: string[] = [];
  const appendRows = args.items
    .map((item) => {
    const row = Array(headers.length).fill("");
    const keyword = String(item.Keyword || "").trim();
    const subject = String(item.Subject || "").trim();
    const keywordSignature = buildTextSignature(keyword);
    const subjectSignature = buildTextSignature(subject);
    if (indexes.keyword !== undefined && keyword) {
      const keywordKey = keyword.toLowerCase();
      if (existingKeywordKeys.has(keywordKey) || pendingKeywordKeys.has(keywordKey)) {
        skipped.push({
          field: "keyword",
          keyword,
          subject,
          reason: "동일 keyword",
          matchedValue: keyword
        });
        return null;
      }
      const similarKeyword =
        findNearDuplicateText(
          keywordSignature,
          [...existingKeywordSignatures, ...pendingKeywordSignatures],
          keywordSimilarityThreshold,
          keywordMinCommonTokens
        ) || undefined;
      if (similarKeyword) {
        skipped.push({
          field: "keyword",
          keyword,
          subject,
          reason: `유사 keyword(${Math.round(keywordSimilarityThreshold * 100)}% 이상)`,
          matchedValue: similarKeyword.raw
        });
        return null;
      }
      pendingKeywordKeys.add(keywordKey);
    }

    if (indexes.subject !== undefined && subject) {
      const similarSubject =
        findNearDuplicateText(
          subjectSignature,
          [...existingSubjectSignatures, ...pendingSubjectSignatures],
          subjectSimilarityThreshold,
          subjectMinCommonTokens
        ) || undefined;
      if (similarSubject) {
        skipped.push({
          field: "subject",
          keyword,
          subject,
          reason: `유사 subject(${Math.round(subjectSimilarityThreshold * 100)}% 이상)`,
          matchedValue: similarSubject.raw
        });
        return null;
      }
    }

    const nextId = takeUniqueId(item.id);
    row[idColumnIndex] = nextId;
    insertedIds.push(nextId);
    if (indexes.status !== undefined) {
      row[indexes.status] = "준비";
    }
    if (indexes.keyword !== undefined) {
      row[indexes.keyword] = keyword;
    }
    if (indexes.subject !== undefined) {
      row[indexes.subject] = subject;
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
    pendingKeywordSignatures.push(keywordSignature);
    pendingSubjectSignatures.push(subjectSignature);
    existingKeywordSignatures.push(keywordSignature);
    existingSubjectSignatures.push(subjectSignature);
    return row;
  })
    .filter((row): row is string[] => Array.isArray(row));

  if (appendRows.length === 0) {
    return { inserted: 0, sheetName: context.sheetName, insertedIds: [], skipped };
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
    sheetName: context.sheetName,
    insertedIds,
    skipped
  };
}
