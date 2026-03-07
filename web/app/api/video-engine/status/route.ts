import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  isVideoEngineSharedSecretConfigured,
  resolveVideoEngineBaseUrls,
  resolveVideoEngineTimeoutMs
} from "@/lib/video-engine-endpoint-config";

export const runtime = "nodejs";

interface VideoEngineHealthCheck {
  url: string;
  status: "ok" | "error";
  latencyMs: number;
  httpStatus?: number;
  error?: string;
}

async function checkVideoEngineHealth(baseUrl: string): Promise<VideoEngineHealthCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        url: baseUrl,
        status: "error",
        latencyMs,
        httpStatus: response.status,
        error: `HTTP ${response.status}`
      };
    }
    try {
      const json = (await response.json()) as { status?: string };
      if (String(json?.status || "").toLowerCase() === "ok") {
        return { url: baseUrl, status: "ok", latencyMs, httpStatus: response.status };
      }
      return {
        url: baseUrl,
        status: "error",
        latencyMs,
        httpStatus: response.status,
        error: "Unexpected health payload"
      };
    } catch {
      return {
        url: baseUrl,
        status: "error",
        latencyMs,
        httpStatus: response.status,
        error: "Health response is not JSON"
      };
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      url: baseUrl,
      status: "error",
      latencyMs,
      error: error instanceof Error ? error.message : "Network error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrls = resolveVideoEngineBaseUrls();
  const timeoutMs = resolveVideoEngineTimeoutMs();
  const checks = await Promise.all(baseUrls.map((url) => checkVideoEngineHealth(url)));
  const connected = checks.find((item) => item.status === "ok")?.url;

  return NextResponse.json({
    primaryUrl: baseUrls[0] || null,
    fallbackUrl: baseUrls.length > 1 ? baseUrls[1] : null,
    baseUrls,
    timeoutMs,
    sharedSecretConfigured: isVideoEngineSharedSecretConfigured(),
    connectedUrl: connected || null,
    checks
  });
}

