import { getSheetsContext, readSheetValues } from "@/lib/google-sheets-client";

function normalizeHeader(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findValueByHeader(row: Record<string, string>, header: string): string {
  const target = normalizeHeader(header);
  const key = Object.keys(row).find((item) => normalizeHeader(item) === target);
  return key ? String(row[key] || "") : "";
}

function findColumnIndex(headers: string[], aliases: string[]): number | undefined {
  const normalizedAliases = aliases.map((item) => normalizeHeader(item));
  const index = headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
  return index >= 0 ? index : undefined;
}

function normalizeId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function columnToA1(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export async function appendInstagramIdeasToSheet(args: {
  sheetName?: string;
  items: Array<Record<string, string>>;
  userId?: string;
}): Promise<{ inserted: number; sheetName: string }> {
  const context = await getSheetsContext(args.sheetName, args.userId);
  if (!context) {
    throw new Error("Google Sheets 연결 정보를 찾을 수 없습니다. Settings를 확인해 주세요.");
  }

  const values = await readSheetValues(context);
  const headers = (values[0] || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (headers.length === 0) {
    throw new Error("시트 헤더가 비어 있습니다. 1행에 컬럼명을 먼저 입력해 주세요.");
  }

  const appendRows = args.items.map((item) =>
    headers.map((header) => {
      if (normalizeHeader(header) === "status") {
        return "준비";
      }
      return findValueByHeader(item, header);
    })
  );

  if (appendRows.length > 0) {
    await context.sheets.spreadsheets.values.append({
      spreadsheetId: context.spreadsheetId,
      range: `${context.sheetName}!A:ZZ`,
      valueInputOption: "RAW",
      requestBody: {
        values: appendRows
      }
    });
  }

  return {
    inserted: appendRows.length,
    sheetName: context.sheetName
  };
}

export async function updateInstagramSheetRowAfterUpload(args: {
  userId?: string;
  sheetName?: string;
  rowId?: string;
  status?: string;
  publishValue?: string;
  permalink?: string;
  mediaId?: string;
}): Promise<{ updated: boolean; reason?: string; sheetName?: string }> {
  const rowId = String(args.rowId || "").trim();
  if (!rowId) {
    return { updated: false, reason: "rowId 없음" };
  }
  const context = await getSheetsContext(args.sheetName, args.userId);
  if (!context) {
    return { updated: false, reason: "Google Sheets 연결 정보 없음" };
  }

  const values = await readSheetValues(context);
  const headers = (values[0] || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (headers.length === 0) {
    return { updated: false, reason: "시트 헤더가 비어 있음", sheetName: context.sheetName };
  }

  const idIndex = findColumnIndex(headers, ["id", "row_id", "rowid"]);
  if (idIndex === undefined) {
    return { updated: false, reason: "id 컬럼 없음", sheetName: context.sheetName };
  }

  const bodyRows = values.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
  const targetIndex = bodyRows.findIndex(
    (row) => normalizeId(String(row[idIndex] || "")) === normalizeId(rowId)
  );
  if (targetIndex < 0) {
    return { updated: false, reason: `row 미발견(${rowId})`, sheetName: context.sheetName };
  }

  const statusIndex = findColumnIndex(headers, ["status", "Status"]);
  const publishIndex = findColumnIndex(headers, ["publish", "Publish"]);
  const permalinkIndex = findColumnIndex(headers, [
    "video_link",
    "videoLink",
    "videourl",
    "videoUrl",
    "permalink",
    "instagram_link",
    "instagramLink",
    "insta_link",
    "instaLink",
    "url"
  ]);
  const mediaIdIndex = findColumnIndex(headers, ["media_id", "mediaId", "instagram_media_id"]);
  const updatedAtIndex = findColumnIndex(headers, ["updatedAt", "updated_at", "modifiedAt"]);

  const row = [...bodyRows[targetIndex]];
  while (row.length < headers.length) {
    row.push("");
  }

  if (statusIndex !== undefined) {
    row[statusIndex] = String(args.status || "업로드완료").trim() || "업로드완료";
  }
  if (publishIndex !== undefined) {
    row[publishIndex] = String(args.publishValue || "완료").trim() || "완료";
  }
  if (permalinkIndex !== undefined) {
    row[permalinkIndex] = String(args.permalink || "").trim();
  }
  if (mediaIdIndex !== undefined) {
    row[mediaIdIndex] = String(args.mediaId || "").trim();
  }
  if (updatedAtIndex !== undefined) {
    row[updatedAtIndex] = new Date().toISOString();
  }

  const rowNumber = targetIndex + 2;
  const endColumn = columnToA1(Math.max(0, headers.length - 1));
  await context.sheets.spreadsheets.values.update({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [row]
    }
  });

  return { updated: true, sheetName: context.sheetName };
}
