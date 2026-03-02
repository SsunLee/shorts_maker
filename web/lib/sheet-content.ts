import { getSheetsContext, readSheetValues } from "@/lib/google-sheets-client";
import { SheetContentRow } from "@/lib/types";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function pickValue(source: Record<string, string>, candidates: string[]): string {
  for (const key of candidates) {
    const value = source[normalizeHeader(key)];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function findHeaderKey(
  headers: string[],
  candidates: string[]
): string | undefined {
  return headers.find((header) =>
    candidates.some((candidate) => header === normalizeHeader(candidate))
  );
}

/**
 * Read content rows from a connected Google Sheet.
 * Required columns:
 * - id
 * - status (must be "준비")
 * - keyword
 * - subject
 * - description
 * - narration
 */
export async function listSheetContentRows(
  sheetName?: string,
  userId?: string
): Promise<SheetContentRow[]> {
  const context = await getSheetsContext(sheetName, userId);
  if (!context) {
    throw new Error(
      "Google Sheets is not configured. Set spreadsheet ID, client email, and private key in /settings."
    );
  }

  const values = await readSheetValues(context);
  if (values.length === 0) {
    return [];
  }

  const [headerRow, ...bodyRows] = values;
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const requiredHeaders = {
    id: findHeaderKey(normalizedHeaders, ["id"]),
    status: findHeaderKey(normalizedHeaders, ["status"]),
    keyword: findHeaderKey(normalizedHeaders, ["keyword"]),
    subject: findHeaderKey(normalizedHeaders, ["subject"]),
    description: findHeaderKey(normalizedHeaders, ["description"]),
    narration: findHeaderKey(normalizedHeaders, ["narration"])
  };
  const missing = Object.entries(requiredHeaders)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Sheet header is missing required columns: ${missing.join(", ")}`
    );
  }

  const output: SheetContentRow[] = [];
  bodyRows.forEach((cells, rowIndex) => {
    const map: Record<string, string> = {};
    normalizedHeaders.forEach((header, colIdx) => {
      if (!header) {
        return;
      }
      map[header] = (cells[colIdx] ?? "").trim();
    });

    const id = pickValue(map, ["id"]);
    const status = pickValue(map, ["status"]);
    const keyword = pickValue(map, ["keyword"]);
    const subject = pickValue(map, ["subject"]);
    const description = pickValue(map, ["description"]);
    const narration = pickValue(map, ["narration"]);

    // Only rows explicitly marked as ready are loaded.
    if (status !== "준비") {
      return;
    }

    if (!id || !keyword || !subject || !description || !narration) {
      return;
    }

    const raw: Record<string, string> = {};
    normalizedHeaders.forEach((header, colIdx) => {
      if (!header) {
        return;
      }
      raw[header] = cells[colIdx] ?? "";
    });

    output.push({
      id,
      rowNumber: rowIndex + 2,
      status,
      keyword,
      subject,
      description,
      narration,
      raw
    });
  });

  return output;
}
