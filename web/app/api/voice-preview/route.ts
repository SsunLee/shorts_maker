import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { synthesizeSpeech } from "@/lib/openai-service";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

const schema = z.object({
  voice: z.string().min(1),
  speed: z.number().min(0.5).max(2).default(1),
  text: z.string().min(1).max(320).optional()
});

/** Generate a short TTS clip so users can preview the selected voice. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = schema.parse(body);
    const audio = await synthesizeSpeech({
      voice: payload.voice,
      speed: payload.speed,
      preferredMimeType: "audio/wav",
      input:
        payload.text?.trim() ||
        "This is a voice preview for your short-form content."
    }, userId);

    return new NextResponse(new Uint8Array(audio.buffer), {
      status: 200,
      headers: {
        "Content-Type": audio.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="voice-preview.${audio.extension}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate preview";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
