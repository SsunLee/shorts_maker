import { promises as fs } from "fs";
import path from "path";
import {
  getSheetsContext,
  readSheetValues,
  SheetsContext
} from "@/lib/google-sheets-client";
import { progressFromStatus } from "@/lib/status";
import { VideoRow, VideoStatus } from "@/lib/types";

const rowsFile = path.join(process.cwd(), "data", "rows.json");
const DEFAULT_SHEET_COLUMNS = [
  "id",
  "status",
  "keyword",
  "subject",
  "description",
  "narration",
  "imagePrompts",
  "publish",
  "videoUrl",
  "youtubeUrl",
  "tags",
  "createdAt",
  "updatedAt"
] as const;
const VALID_STATUSES: VideoStatus[] = [
  "queued",
  "generating_script",
  "generating_images",
  "generating_tts",
  "video_rendering",
  "ready",
  "uploading",
  "uploaded",
  "failed"
];

type SheetField =
  | "id"
  | "status"
  | "title"
  | "topic"
  | "narration"
  | "imagePrompts"
  | "videoUrl"
  | "youtubeUrl"
  | "tags"
  | "createdAt"
  | "updatedAt";

interface SheetSchema {
  headers: string[];
  indexes: Record<SheetField, number | undefined>;
}

const FIELD_ALIASES: Record<SheetField, string[]> = {
  id: ["id"],
  status: ["status", "state"],
  title: ["title", "subject"],
  topic: ["topic", "description"],
  narration: ["narration", "script", "voiceover"],
  imagePrompts: [
    "imageprompts",
    "imageprompt",
    "sceneprompts",
    "prompts",
    "image_prompts"
  ],
  videoUrl: ["videourl", "video", "finalvideourl", "final_video_url"],
  youtubeUrl: ["youtubeurl", "youtubelink", "youtube", "youtube_url"],
  tags: ["tags", "tag", "hashtags", "hash_tags"],
  createdAt: ["createdat", "created", "createdtime", "createddate"],
  updatedAt: ["updatedat", "updated", "updatedtime", "updateddate"]
};

function normalizeHeader(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isVideoStatus(value: string | undefined): value is VideoStatus {
  return VALID_STATUSES.includes((value || "").trim() as VideoStatus);
}

function toVideoStatus(value: string | undefined): VideoStatus {
  return isVideoStatus(value) ? (value as VideoStatus) : "queued";
}

function safeParseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function getCell(values: string[], index: number | undefined): string {
  if (index === undefined) {
    return "";
  }
  return values[index] ?? "";
}

function setCell(values: string[], index: number | undefined, value: string): void {
  if (index === undefined) {
    return;
  }
  values[index] = value;
}

function toSheetListValue(values: string[]): string {
  return JSON.stringify(values);
}

function normalizeId(value: string): string {
  return value.trim();
}

function columnToA1(index: number): string {
  let value = "";
  let current = index;
  while (current > 0) {
    const offset = (current - 1) % 26;
    value = String.fromCharCode(65 + offset) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function rowFromObject(
  row: Omit<Partial<VideoRow>, "status"> & { status?: string }
): VideoRow {
  const status = toVideoStatus(row.status);
  return {
    id: normalizeId(row.id ?? crypto.randomUUID()),
    title: row.title ?? "",
    narration: row.narration ?? "",
    imagePrompts: row.imagePrompts ?? [],
    status,
    progress: row.progress ?? progressFromStatus(status),
    videoUrl: row.videoUrl,
    youtubeUrl: row.youtubeUrl,
    tags: row.tags ?? [],
    topic: row.topic,
    imageStyle: row.imageStyle,
    voice: row.voice,
    voiceSpeed: row.voiceSpeed,
    useSfx: row.useSfx,
    videoLengthSec: row.videoLengthSec,
    error: row.error,
    createdAt: row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updatedAt ?? new Date().toISOString()
  };
}

function rowFromSheetValues(values: string[], schema: SheetSchema): VideoRow {
  const createdAt =
    getCell(values, schema.indexes.createdAt) ||
    getCell(values, schema.indexes.updatedAt) ||
    new Date().toISOString();
  const updatedAt =
    getCell(values, schema.indexes.updatedAt) || createdAt;

  return rowFromObject({
    id: getCell(values, schema.indexes.id),
    title: getCell(values, schema.indexes.title),
    topic: getCell(values, schema.indexes.topic),
    narration: getCell(values, schema.indexes.narration),
    imagePrompts: safeParseList(getCell(values, schema.indexes.imagePrompts)),
    status: getCell(values, schema.indexes.status),
    videoUrl: getCell(values, schema.indexes.videoUrl) || undefined,
    youtubeUrl: getCell(values, schema.indexes.youtubeUrl) || undefined,
    tags: safeParseList(getCell(values, schema.indexes.tags)),
    createdAt,
    updatedAt
  });
}

function isRowVisibleInDashboard(values: string[], schema: SheetSchema): boolean {
  const rawStatus = getCell(values, schema.indexes.status).trim();
  const videoUrl = getCell(values, schema.indexes.videoUrl).trim();
  const youtubeUrl = getCell(values, schema.indexes.youtubeUrl).trim();

  if (isVideoStatus(rawStatus)) {
    return true;
  }

  return Boolean(videoUrl || youtubeUrl);
}

function findHeaderIndex(headers: string[], aliases: string[]): number | undefined {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
  const index = headers.findIndex((header) => aliasSet.has(normalizeHeader(header)));
  return index >= 0 ? index : undefined;
}

function buildSchema(headers: string[]): SheetSchema {
  const indexes = Object.keys(FIELD_ALIASES).reduce(
    (acc, key) => {
      const field = key as SheetField;
      acc[field] = findHeaderIndex(headers, FIELD_ALIASES[field]);
      return acc;
    },
    {} as Record<SheetField, number | undefined>
  );

  return {
    headers,
    indexes
  };
}

function isContentManagedSheet(schema: SheetSchema): boolean {
  const normalized = new Set(schema.headers.map((header) => normalizeHeader(header)));
  return (
    normalized.has("id") &&
    normalized.has("status") &&
    normalized.has("keyword") &&
    normalized.has("subject") &&
    normalized.has("description") &&
    normalized.has("narration")
  );
}

async function ensureSheetTable(
  context: SheetsContext
): Promise<{ schema: SheetSchema; bodyRows: string[][] }> {
  let values = await readSheetValues(context);
  const headerRow = values[0] ?? [];
  const isHeaderEmpty =
    headerRow.length === 0 ||
    headerRow.every((value) => !String(value || "").trim());

  if (isHeaderEmpty) {
    await context.sheets.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: `${context.sheetName}!A1:${columnToA1(DEFAULT_SHEET_COLUMNS.length)}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [Array.from(DEFAULT_SHEET_COLUMNS)]
      }
    });
    values = [Array.from(DEFAULT_SHEET_COLUMNS)];
  }

  let headers = (values[0] ?? []).map((value) => String(value).trim());
  let schema = buildSchema(headers);

  // Older content-managed sheets may not have a dedicated `videoUrl` column.
  // In that case writes become no-op for final video URL, so we append it once.
  if (schema.indexes.videoUrl === undefined) {
    headers = [...headers, "videoUrl"];
    await context.sheets.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: `${context.sheetName}!A1:${columnToA1(headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers]
      }
    });
    values = [headers, ...values.slice(1)];
    schema = buildSchema(headers);
  }

  if (schema.indexes.id === undefined) {
    throw new Error("Google Sheet must include an 'id' column.");
  }

  const bodyRows = values.slice(1).map((row) => row.map(String));
  return { schema, bodyRows };
}

function findBodyRowIndexById(
  rows: string[][],
  schema: SheetSchema,
  id: string
): number {
  const target = normalizeId(id);
  return rows.findIndex((row) => normalizeId(getCell(row, schema.indexes.id)) === target);
}

async function readSheetRowValues(
  context: SheetsContext,
  rowNumber: number,
  endColumn: string
): Promise<string[]> {
  const response = await context.sheets.spreadsheets.values.get({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!A${rowNumber}:${endColumn}${rowNumber}`
  });
  return (response.data.values?.[0] ?? []).map(String);
}

async function readSheetIdAtRow(
  context: SheetsContext,
  schema: SheetSchema,
  rowNumber: number
): Promise<string> {
  if (schema.indexes.id === undefined) {
    return "";
  }

  const idColumn = columnToA1(schema.indexes.id + 1);
  const response = await context.sheets.spreadsheets.values.get({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!${idColumn}${rowNumber}:${idColumn}${rowNumber}`
  });
  const value = response.data.values?.[0]?.[0];
  return normalizeId(value ? String(value) : "");
}

function toGridCellString(cell: unknown): string {
  if (!cell || typeof cell !== "object") {
    return "";
  }

  const record = cell as Record<string, unknown>;
  if (typeof record.formattedValue === "string") {
    return record.formattedValue;
  }

  const effective = record.effectiveValue;
  if (!effective || typeof effective !== "object") {
    return "";
  }

  const value = effective as Record<string, unknown>;
  if (typeof value.stringValue === "string") {
    return value.stringValue;
  }
  if (typeof value.numberValue === "number") {
    return String(value.numberValue);
  }
  if (typeof value.boolValue === "boolean") {
    return value.boolValue ? "TRUE" : "FALSE";
  }
  if (typeof value.formulaValue === "string") {
    return value.formulaValue;
  }
  return "";
}

async function findRowNumberByIdFromGridData(
  context: SheetsContext,
  schema: SheetSchema,
  id: string
): Promise<number | undefined> {
  if (schema.indexes.id === undefined) {
    return undefined;
  }

  const response = await context.sheets.spreadsheets.get({
    spreadsheetId: context.spreadsheetId,
    ranges: [`${context.sheetName}!A:ZZ`],
    includeGridData: true
  });

  const sheet = response.data.sheets?.[0];
  const grid = sheet?.data?.[0];
  const rowData = grid?.rowData ?? [];
  const startRow = grid?.startRow ?? 0;
  const idIndex = schema.indexes.id;
  const target = normalizeId(id);

  for (let offset = 0; offset < rowData.length; offset += 1) {
    const rowNumber = startRow + offset + 1;
    if (rowNumber < 2) {
      continue;
    }
    const row = rowData[offset];
    const cell = row.values?.[idIndex];
    if (normalizeId(toGridCellString(cell)) === target) {
      return rowNumber;
    }
  }

  return undefined;
}

async function resolveExactSheetRowNumber(
  context: SheetsContext,
  schema: SheetSchema,
  rows: string[][],
  id: string
): Promise<number | undefined> {
  const rowIndex = findBodyRowIndexById(rows, schema, id);
  if (rowIndex < 0) {
    return undefined;
  }

  const candidateRow = rowIndex + 2;
  const target = normalizeId(id);
  const candidateId = await readSheetIdAtRow(context, schema, candidateRow);
  if (candidateId === target) {
    return candidateRow;
  }

  return findRowNumberByIdFromGridData(context, schema, target);
}

function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function buildSheetRowValues(
  schema: SheetSchema,
  row: VideoRow,
  patch: Partial<VideoRow>,
  existing: string[] | undefined
): string[] {
  const targetLength = Math.max(
    schema.headers.length,
    ...Object.values(schema.indexes)
      .filter((value): value is number => value !== undefined)
      .map((value) => value + 1)
  );
  const values =
    existing && existing.length > 0
      ? [...existing, ...Array(Math.max(0, targetLength - existing.length)).fill("")]
      : Array(targetLength).fill("");

  setCell(values, schema.indexes.id, row.id);
  setCell(values, schema.indexes.status, row.status);

  if (!existing || hasOwn(patch, "title")) {
    setCell(values, schema.indexes.title, row.title);
  }
  if (!existing || hasOwn(patch, "topic")) {
    setCell(values, schema.indexes.topic, row.topic ?? "");
  }
  if (!existing || hasOwn(patch, "narration")) {
    setCell(values, schema.indexes.narration, row.narration);
  }
  if (!existing || hasOwn(patch, "imagePrompts")) {
    setCell(values, schema.indexes.imagePrompts, toSheetListValue(row.imagePrompts));
  }
  if (!existing || hasOwn(patch, "videoUrl")) {
    setCell(values, schema.indexes.videoUrl, row.videoUrl ?? "");
  }
  if (!existing || hasOwn(patch, "youtubeUrl")) {
    setCell(values, schema.indexes.youtubeUrl, row.youtubeUrl ?? "");
  }
  if (!existing || hasOwn(patch, "tags")) {
    setCell(values, schema.indexes.tags, toSheetListValue(row.tags));
  }
  if (!existing) {
    setCell(values, schema.indexes.createdAt, row.createdAt);
  }
  setCell(values, schema.indexes.updatedAt, row.updatedAt);

  return values;
}

function resetSheetRowValues(schema: SheetSchema, existing: string[]): string[] {
  const values = [...existing];
  setCell(values, schema.indexes.status, "준비");
  setCell(values, schema.indexes.imagePrompts, "");
  setCell(values, schema.indexes.videoUrl, "");
  setCell(values, schema.indexes.youtubeUrl, "");
  setCell(values, schema.indexes.updatedAt, new Date().toISOString());
  return values;
}

function resetLocalRowValues(row: VideoRow): VideoRow {
  const now = new Date().toISOString();
  return rowFromObject({
    ...row,
    status: "queued",
    progress: progressFromStatus("queued"),
    imagePrompts: [],
    videoUrl: undefined,
    youtubeUrl: undefined,
    error: undefined,
    updatedAt: now
  });
}

function compareIsoDesc(a: VideoRow, b: VideoRow): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function isValidIsoDate(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function ensureKnownStatusForLocalRows(status: string | undefined): VideoStatus {
  return toVideoStatus(status);
}

function normalizeLocalRow(
  row: Omit<Partial<VideoRow>, "status"> & { status?: string }
): VideoRow {
  const status = ensureKnownStatusForLocalRows(row.status);
  return rowFromObject({ ...row, status });
}

function normalizeRows(rows: VideoRow[]): VideoRow[] {
  return rows.map((row) => rowFromObject(row));
}

function shouldKeepLocalRow(row: VideoRow): boolean {
  return Boolean(row.id);
}

function sanitizeSheetRows(rows: VideoRow[]): VideoRow[] {
  return rows.filter(shouldKeepLocalRow);
}

function ensureProgress(row: VideoRow): VideoRow {
  const status = toVideoStatus(row.status);
  return {
    ...row,
    status,
    progress: progressFromStatus(status)
  };
}

async function ensureRowsFile(): Promise<void> {
  await fs.mkdir(path.dirname(rowsFile), { recursive: true });
  try {
    await fs.access(rowsFile);
  } catch {
    await fs.writeFile(rowsFile, JSON.stringify([], null, 2), "utf8");
  }
}

async function readRowsFile(): Promise<VideoRow[]> {
  await ensureRowsFile();
  const raw = await fs.readFile(rowsFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<VideoRow>[];
    return parsed.map((row) => normalizeLocalRow(row));
  } catch {
    return [];
  }
}

async function writeRowsFile(rows: VideoRow[]): Promise<void> {
  await ensureRowsFile();
  await fs.writeFile(rowsFile, JSON.stringify(rows, null, 2), "utf8");
}

async function listRowsFromSheets(context: SheetsContext): Promise<VideoRow[]> {
  const table = await ensureSheetTable(context);
  return table.bodyRows
    .filter((row) => Boolean(getCell(row, table.schema.indexes.id)))
    .filter((row) => isRowVisibleInDashboard(row, table.schema))
    .map((row) => ensureProgress(rowFromSheetValues(row, table.schema)))
    .filter((row) => isValidIsoDate(row.createdAt) && isValidIsoDate(row.updatedAt));
}

async function upsertRowInSheets(
  context: SheetsContext,
  row: VideoRow,
  patch: Partial<VideoRow>
): Promise<VideoRow> {
  const table = await ensureSheetTable(context);
  const rowIndex = findBodyRowIndexById(table.bodyRows, table.schema, row.id);
  const endColumn = columnToA1(Math.max(1, table.schema.headers.length));

  if (rowIndex < 0) {
    if (isContentManagedSheet(table.schema)) {
      throw new Error(
        `Sheet row with id '${row.id}' was not found. ` +
          "Select an existing sheet row (id) before running workflow."
      );
    }
    const values = buildSheetRowValues(table.schema, row, patch, undefined);
    await context.sheets.spreadsheets.values.append({
      spreadsheetId: context.spreadsheetId,
      range: `${context.sheetName}!A:${endColumn}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [values]
      }
    });
  } else {
    const rowNumber = await resolveExactSheetRowNumber(
      context,
      table.schema,
      table.bodyRows,
      row.id
    );
    if (!rowNumber) {
      throw new Error(
        `Sheet row with id '${row.id}' could not be resolved to an exact row number.`
      );
    }
    const existing = await readSheetRowValues(context, rowNumber, endColumn);
    const values = buildSheetRowValues(table.schema, row, patch, existing);
    await context.sheets.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: `${context.sheetName}!A${rowNumber}:${endColumn}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [values]
      }
    });
  }

  return row;
}

async function deleteRowInSheets(
  context: SheetsContext,
  id: string
): Promise<boolean> {
  const table = await ensureSheetTable(context);
  const rowIndex = findBodyRowIndexById(table.bodyRows, table.schema, id);
  if (rowIndex < 0) {
    return false;
  }

  const rowNumber = await resolveExactSheetRowNumber(
    context,
    table.schema,
    table.bodyRows,
    id
  );
  if (!rowNumber) {
    throw new Error(`Sheet row with id '${id}' could not be resolved to an exact row number.`);
  }
  const endColumn = columnToA1(Math.max(1, table.schema.headers.length));
  const existing = await readSheetRowValues(context, rowNumber, endColumn);
  const values = resetSheetRowValues(table.schema, existing);
  await context.sheets.spreadsheets.values.update({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values]
    }
  });
  return true;
}

/** Return every row from storage, preferring Google Sheets when configured. */
export async function listRows(): Promise<VideoRow[]> {
  const sheetsContext = await getSheetsContext();
  if (!sheetsContext) {
    const rows = await readRowsFile();
    return normalizeRows(rows).sort(compareIsoDesc);
  }

  try {
    const rows = await listRowsFromSheets(sheetsContext);
    return sanitizeSheetRows(rows).sort(compareIsoDesc);
  } catch {
    const rows = await readRowsFile();
    return normalizeRows(rows).sort(compareIsoDesc);
  }
}

/** Fetch a single row by its ID. */
export async function getRow(id: string): Promise<VideoRow | undefined> {
  const rows = await listRows();
  return rows.find((row) => row.id === id);
}

/** Insert or update a row in storage while keeping timestamps current. */
export async function upsertRow(partial: Partial<VideoRow>): Promise<VideoRow> {
  const existing = partial.id ? await getRow(partial.id) : undefined;
  const status = toVideoStatus((partial.status ?? existing?.status ?? "queued") as string);
  const now = new Date().toISOString();

  const row = rowFromObject({
    ...existing,
    ...partial,
    id: partial.id ?? existing?.id ?? crypto.randomUUID(),
    status,
    progress: partial.progress ?? progressFromStatus(status),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  const sheetsContext = await getSheetsContext();
  if (!sheetsContext) {
    const rows = await readRowsFile();
    const index = rows.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      rows[index] = row;
    } else {
      rows.push(row);
    }
    await writeRowsFile(rows);
    return row;
  }

  return upsertRowInSheets(sheetsContext, row, partial);
}

/** Delete a row by ID from active storage. */
export async function deleteRow(id: string): Promise<boolean> {
  const sheetsContext = await getSheetsContext();
  if (!sheetsContext) {
    const rows = await readRowsFile();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) {
      return false;
    }

    rows[index] = resetLocalRowValues(rows[index]);
    await writeRowsFile(rows);
    return true;
  }

  return deleteRowInSheets(sheetsContext, id);
}
