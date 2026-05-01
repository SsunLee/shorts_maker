import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateImagePrompts } from "@/lib/openai-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  topic: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  narration: z.string().optional(),
  currentPrompt: z.string().optional(),
  textHints: z.array(z.string()).optional(),
  sampleData: z.record(z.string(), z.string()).optional(),
  stylePreset: z.string().optional(),
  orientation: z.enum(["vertical", "horizontal"]).optional()
});

function compact(value: string | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Build one AI image prompt from page/sample context for Instagram template editor. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const sampleData = body.sampleData || {};
    const topic =
      compact(body.topic) ||
      compact(sampleData.topic) ||
      compact(sampleData.subject) ||
      compact(sampleData.keyword) ||
      compact(body.subject);
    const title =
      compact(body.title) ||
      compact(sampleData.title) ||
      compact(sampleData.newsTitleKR) ||
      compact(sampleData.newsTitle) ||
      compact(sampleData.subject) ||
      "인스타그램 카드 이미지";
    const description = compact(body.description) || compact(sampleData.description);
    const currentPrompt = compact(body.currentPrompt);
    const textHints = Array.isArray(body.textHints)
      ? body.textHints.map((item) => compact(item)).filter(Boolean).slice(0, 8)
      : [];
    const contextNarrationParts = [
      `주제: ${topic || "일반"}`,
      description ? `설명: ${description}` : "",
      textHints.length > 0 ? `페이지 텍스트 힌트: ${textHints.join(" | ")}` : "",
      currentPrompt ? `기존 프롬프트 참고: ${currentPrompt}` : ""
    ].filter(Boolean);
    const narration = compact(body.narration) || contextNarrationParts.join("\n");
    const imageStyle = compact(body.stylePreset) || "Cinematic photo-real";
    const imageAspectRatio = body.orientation === "horizontal" ? "16:9" : "9:16";

    const prompts = await generateImagePrompts(
      {
        title: topic ? `${title} - ${topic}` : title,
        narration: narration || `${title} 관련 인스타그램 카드 배경 이미지`,
        imageStyle,
        imageAspectRatio,
        sceneCount: 1,
        visualPolicy: "news_strict"
      },
      userId
    );
    const prompt = compact(prompts[0]);
    if (!prompt) {
      throw new Error("프롬프트를 생성하지 못했습니다.");
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프롬프트 생성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

