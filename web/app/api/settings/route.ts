import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, saveSettings } from "@/lib/settings-store";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

const schema = z.object({
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  aiMode: z.enum(["auto", "openai", "gemini", "mixed"]).optional(),
  aiTextProvider: z.enum(["openai", "gemini"]).optional(),
  aiImageProvider: z.enum(["openai", "gemini"]).optional(),
  aiTtsProvider: z.enum(["openai", "gemini"]).optional(),
  openaiTextModel: z.string().optional(),
  openaiImageModel: z.string().optional(),
  openaiTtsModel: z.string().optional(),
  geminiTextModel: z.string().optional(),
  geminiImageModel: z.string().optional(),
  geminiTtsModel: z.string().optional(),
  gsheetSpreadsheetId: z.string().optional(),
  gsheetClientEmail: z.string().optional(),
  gsheetPrivateKey: z.string().optional(),
  gsheetSheetName: z.string().optional(),
  youtubeClientId: z.string().optional(),
  youtubeClientSecret: z.string().optional(),
  youtubeRedirectUri: z.string().optional(),
  youtubeRefreshToken: z.string().optional()
});

/** Retrieve saved local integration settings. */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings(userId);
  return NextResponse.json(settings);
}

/** Persist integration settings to local storage. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = schema.parse(body);
    const saved = await saveSettings(payload, userId);
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
