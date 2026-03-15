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
  const oauthClientId =
    settings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID || "";
  const oauthClientSecret =
    settings.youtubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET || "";
  const oauthRedirectUri =
    settings.youtubeRedirectUri ||
    process.env.YOUTUBE_REDIRECT_URI ||
    "http://localhost:3000/oauth2callback";
  const oauthRefreshToken =
    settings.youtubeRefreshToken || process.env.YOUTUBE_REFRESH_TOKEN || "";
  const sheetName =
    overrideSheetName ||
    settings.gsheetSheetName ||
    process.env.GSHEETS_SHEET_NAME ||
    "Shorts";

  if (!spreadsheetId) {
    return null;
  }

  let auth: InstanceType<typeof google.auth.JWT> | InstanceType<typeof google.auth.OAuth2> | null =
    null;
  if (clientEmail && privateKeyRaw) {
    auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKeyRaw.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  } else if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauth2 = new google.auth.OAuth2(
      oauthClientId,
      oauthClientSecret,
      oauthRedirectUri
    );
    oauth2.setCredentials({ refresh_token: oauthRefreshToken });
    auth = oauth2;
  }

  if (!auth) {
    return null;
  }

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
