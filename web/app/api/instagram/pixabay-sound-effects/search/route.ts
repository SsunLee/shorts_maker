import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getSettings } from "@/lib/settings-store";

export const runtime = "nodejs";

type PixabayAudioHit = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readNestedString(source: PixabayAudioHit, keys: string[]): string {
  for (const key of keys) {
    const parts = key.split(".");
    let current: unknown = source;
    for (const part of parts) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    const value = asString(current);
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeHit(hit: PixabayAudioHit): Record<string, unknown> | undefined {
  const audioUrl = readNestedString(hit, [
    "audio",
    "audioUrl",
    "audioURL",
    "audio_url",
    "downloadURL",
    "downloadUrl",
    "download_url",
    "previewURL",
    "previewUrl",
    "preview_url",
    "src"
  ]);
  if (!audioUrl) {
    return undefined;
  }
  const id = String(hit.id || hit.audio_id || audioUrl);
  const title =
    asString(hit.title) ||
    asString(hit.name) ||
    asString(hit.tags).split(",")[0]?.trim() ||
    "Pixabay sound effect";
  const user = asString(hit.user) || asString(hit.artist) || asString(hit.author);
  const tags = asString(hit.tags);
  const duration = asNumber(hit.duration) ?? asNumber(hit.durationSeconds) ?? asNumber(hit.duration_sec);
  const pageUrl = readNestedString(hit, ["pageURL", "pageUrl", "page_url", "url"]);
  return {
    id,
    title,
    user,
    tags,
    duration,
    pageUrl,
    audioUrl
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    if (query.length < 2) {
      return NextResponse.json({ error: "검색어를 2자 이상 입력해 주세요." }, { status: 400 });
    }
    const settings = await getSettings(userId);
    const apiKey = String(settings.pixabayApiKey || process.env.PIXABAY_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Settings에 Pixabay API Key를 먼저 저장해 주세요." }, { status: 400 });
    }

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      audio_type: "sound_effects",
      safesearch: "true",
      per_page: "12"
    });
    const response = await fetch(`https://pixabay.com/api/audio/?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: text || `Pixabay 검색 요청에 실패했습니다. HTTP ${response.status}` },
        { status: response.status }
      );
    }
    const payload = JSON.parse(text) as { hits?: PixabayAudioHit[]; totalHits?: number; total?: number };
    const results = (payload.hits || []).map(normalizeHit).filter(Boolean);
    return NextResponse.json({
      ok: true,
      total: payload.total,
      totalHits: payload.totalHits,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pixabay Sound Effects 검색에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
