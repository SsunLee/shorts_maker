const DEFAULT_VIDEO_ENGINE_URL = "http://localhost:8000";
const DEFAULT_VIDEO_ENGINE_TIMEOUT_MS = 15 * 60 * 1000;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeEngineBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function resolveVideoEngineBaseUrls(): string[] {
  const urlsFromList = String(process.env.VIDEO_ENGINE_URLS || "")
    .split(/[,\n]/)
    .map((value) => normalizeEngineBaseUrl(value))
    .filter(Boolean);
  const primary = normalizeEngineBaseUrl(process.env.VIDEO_ENGINE_URL || DEFAULT_VIDEO_ENGINE_URL);
  const fallback = normalizeEngineBaseUrl(process.env.VIDEO_ENGINE_FALLBACK_URL || "");
  const merged = [...urlsFromList, primary, fallback]
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(merged));
  return unique.length > 0 ? unique : [DEFAULT_VIDEO_ENGINE_URL];
}

export function resolveVideoEngineTimeoutMs(): number {
  const parsed = Number(process.env.VIDEO_ENGINE_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_VIDEO_ENGINE_TIMEOUT_MS;
  }
  return clampNumber(Math.round(parsed), 30_000, 30 * 60 * 1000);
}

export function isVideoEngineSharedSecretConfigured(): boolean {
  return Boolean(String(process.env.VIDEO_ENGINE_SHARED_SECRET || "").trim());
}

