import { flattenPrompt } from "@/lib/cinematic-style-presets";
import { billableClipSeconds } from "@/lib/cinematic-types";
import {
  resolveVideoEngineBaseUrls,
  resolveVideoEngineTimeoutMs
} from "@/lib/video-engine-endpoint-config";

/**
 * Higgsfield runs through the official CLI hosted by the video engine. The public
 * REST gateway strips the `X-Fnf-*` headers it requires, so driving the CLI is the
 * only stable path; the engine already has the shared-secret handshake we need.
 */

export interface HiggsfieldStatus {
  available: boolean;
  cliPath?: string;
  email?: string;
  plan?: string;
  credits?: number;
  error?: string;
  endpoint?: string;
}

export interface HiggsfieldModel {
  job_type: string;
  display_name: string;
  type: string;
}

export interface HiggsfieldJob {
  id: string;
  status: string;
  jobType: string;
  displayName: string;
  resultUrl?: string | null;
  previewUrl?: string | null;
  error?: string | null;
}

function sharedSecret(): string | undefined {
  const secret = String(process.env.VIDEO_ENGINE_SHARED_SECRET || "").trim();
  return secret || undefined;
}

function requestTimeoutMs(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(5_000, Math.min(override, resolveVideoEngineTimeoutMs()));
  }
  return Math.min(120_000, resolveVideoEngineTimeoutMs());
}

async function callEngine<T>(args: {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<T> {
  const baseUrls = resolveVideoEngineBaseUrls();
  const secret = sharedSecret();
  const errors: string[] = [];

  for (const baseUrl of baseUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs(args.timeoutMs));
    try {
      const response = await fetch(`${baseUrl}${args.path}`, {
        method: args.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Video-Engine-Secret": secret } : {})
        },
        body: args.body ? JSON.stringify(args.body) : undefined,
        signal: controller.signal,
        cache: "no-store"
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${baseUrl} → HTTP ${response.status} ${text.slice(0, 200)}`);
        continue;
      }
      return (text ? JSON.parse(text) : {}) as T;
    } catch (error) {
      errors.push(`${baseUrl} → ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Higgsfield 엔진 호출에 실패했습니다. ${errors.join(" | ")}`);
}

export async function getHiggsfieldStatus(): Promise<HiggsfieldStatus> {
  try {
    const result = await callEngine<HiggsfieldStatus>({
      path: "/higgsfield/status",
      timeoutMs: 20_000
    });
    return { ...result, endpoint: resolveVideoEngineBaseUrls()[0] };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      endpoint: resolveVideoEngineBaseUrls()[0]
    };
  }
}

export async function listHiggsfieldVideoModels(): Promise<HiggsfieldModel[]> {
  const result = await callEngine<{ models: HiggsfieldModel[] }>({
    path: "/higgsfield/models?mediaType=video",
    timeoutMs: 30_000
  });
  return Array.isArray(result.models) ? result.models : [];
}

export async function estimateHiggsfieldCost(args: {
  jobType: string;
  params: Record<string, unknown>;
}): Promise<number | null> {
  const result = await callEngine<{ credits: number | null }>({
    path: "/higgsfield/cost",
    method: "POST",
    body: { jobType: args.jobType, params: args.params },
    timeoutMs: 60_000
  });
  return typeof result.credits === "number" ? result.credits : null;
}

export async function createHiggsfieldJob(args: {
  jobType: string;
  params: Record<string, unknown>;
}): Promise<string[]> {
  const result = await callEngine<{ jobIds: string[] }>({
    path: "/higgsfield/generate",
    method: "POST",
    body: { jobType: args.jobType, params: args.params },
    timeoutMs: 300_000
  });
  if (!Array.isArray(result.jobIds) || result.jobIds.length === 0) {
    throw new Error("Higgsfield가 작업 ID를 반환하지 않았습니다.");
  }
  return result.jobIds;
}

export async function getHiggsfieldJob(jobId: string): Promise<HiggsfieldJob> {
  return callEngine<HiggsfieldJob>({
    path: `/higgsfield/jobs/${encodeURIComponent(jobId)}`,
    timeoutMs: 60_000
  });
}

export async function uploadHiggsfieldMedia(source: string): Promise<string> {
  const result = await callEngine<{ media: Record<string, unknown> }>({
    path: "/higgsfield/upload",
    method: "POST",
    body: { source },
    timeoutMs: 300_000
  });
  const id = result.media?.id;
  if (!id) {
    throw new Error("Higgsfield 업로드 결과에 미디어 ID가 없습니다.");
  }
  return String(id);
}

/** Build the Higgsfield params for one cut. */
export function buildCutJobParams(args: {
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  resolution: string;
  startImage?: string;
  generateAudio?: boolean;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    prompt: flattenPrompt(args.prompt),
    duration: billableClipSeconds(args.durationSec),
    aspect_ratio: args.aspectRatio === "16:9" ? "16:9" : "9:16",
    resolution: args.resolution,
    // Narration is added later from TTS, so model audio would only fight it.
    generate_audio: args.generateAudio === true
  };
  if (args.startImage) {
    params.mode = "omni_reference";
    params.start_image = args.startImage;
  }
  return params;
}
