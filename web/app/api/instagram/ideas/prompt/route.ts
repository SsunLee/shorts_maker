import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings, saveSettings } from "@/lib/settings-store";
import { INSTAGRAM_IDEA_DEFAULT_PROMPT } from "@/lib/instagram-ideas-prompt";

export const runtime = "nodejs";

const schema = z.object({
  template: z.string().min(1)
});

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings(userId);
  return NextResponse.json({
    template: String(settings.instagramIdeaPromptTemplate || "").trim() || INSTAGRAM_IDEA_DEFAULT_PROMPT
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = schema.parse(body);
    const current = await getSettings(userId);
    const next = {
      ...current,
      instagramIdeaPromptTemplate: payload.template
    };
    await saveSettings(next, userId);
    return NextResponse.json({ ok: true, template: payload.template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프롬프트 저장에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

