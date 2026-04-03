import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSheetsContext, readSheetValues } from "@/lib/google-sheets-client";
import { getSettings } from "@/lib/settings-store";

export const runtime = "nodejs";

const schema = z.object({
  sheetName: z.string().optional(),
  items: z.array(z.record(z.string(), z.string())).min(1).max(50)
});

function normalizeHeader(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findValueByHeader(row: Record<string, string>, header: string): string {
  const target = normalizeHeader(header);
  const key = Object.keys(row).find((item) => normalizeHeader(item) === target);
  return key ? String(row[key] || "") : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const payload = schema.parse(body);
    const settings = await getSettings(userId);
    const resolvedSheetName =
      String(payload.sheetName || "").trim() ||
      String(settings.gsheetInstagramSheetName || "").trim() ||
      undefined;

    const context = await getSheetsContext(resolvedSheetName, userId);
    if (!context) {
      throw new Error("Google Sheets 연결 정보를 찾을 수 없습니다. Settings를 확인해 주세요.");
    }

    const values = await readSheetValues(context);
    const headers = (values[0] || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (headers.length === 0) {
      throw new Error("시트 헤더가 비어 있습니다. 1행에 컬럼명을 먼저 입력해 주세요.");
    }

    const appendRows = payload.items.map((item) =>
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

    return NextResponse.json({
      inserted: appendRows.length,
      sheetName: context.sheetName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "시트 반영에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
