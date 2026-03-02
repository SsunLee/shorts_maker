import { google } from "googleapis";
import { getSettings } from "@/lib/settings-store";

export interface SheetsContext {
  spreadsheetId: string;
  sheetName: string;
  sheets: ReturnType<typeof google.sheets>;
}

/** Build authenticated Google Sheets client from environment or saved settings. */
export async function getSheetsContext(
  overrideSheetName?: string,
  userId?: string
): Promise<SheetsContext | null> {
  const settings = await getSettings(userId);
  const spreadsheetId =
    settings.gsheetSpreadsheetId || process.env.GSHEETS_SPREADSHEET_ID || "";
  const clientEmail =
    settings.gsheetClientEmail || process.env.GSHEETS_CLIENT_EMAIL || "";
  const privateKeyRaw =
    settings.gsheetPrivateKey || process.env.GSHEETS_PRIVATE_KEY || "";
  const sheetName =
    overrideSheetName ||
    settings.gsheetSheetName ||
    process.env.GSHEETS_SHEET_NAME ||
    "Shorts";

  if (!spreadsheetId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKeyRaw.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return {
    spreadsheetId,
    sheetName,
    sheets: google.sheets({ version: "v4", auth })
  };
}

/** Read all values from a sheet tab as matrix rows. */
export async function readSheetValues(
  context: SheetsContext
): Promise<string[][]> {
  const response = await context.sheets.spreadsheets.values.get({
    spreadsheetId: context.spreadsheetId,
    range: `${context.sheetName}!A:ZZ`
  });

  return (response.data.values ?? []).map((row) => row.map(String));
}
