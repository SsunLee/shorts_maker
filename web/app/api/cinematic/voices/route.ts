import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { listElevenLabsVoices } from "@/lib/elevenlabs-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ voices: await listElevenLabsVoices(userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "보이스 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message, voices: [] }, { status: 500 });
  }
}
