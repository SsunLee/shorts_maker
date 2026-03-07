import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { fetchYoutubeChannelProfile } from "@/lib/youtube-service";

export const runtime = "nodejs";

const schema = z.object({
  youtubeClientId: z.string().optional(),
  youtubeClientSecret: z.string().optional(),
  youtubeRedirectUri: z.string().optional(),
  youtubeRefreshToken: z.string().optional()
});

export async function GET(): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await fetchYoutubeChannelProfile({ userId });
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve YouTube channel";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const payload = schema.parse(body || {});
    const profile = await fetchYoutubeChannelProfile({
      userId,
      settings: payload
    });
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve YouTube channel";
    const status = error instanceof z.ZodError ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
