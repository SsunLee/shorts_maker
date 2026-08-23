import { generateElevenLabsNarration } from "@/lib/elevenlabs-service";
import { generateTtsAudio } from "@/lib/openai-service";
import { DEFAULT_RENDER_OPTIONS } from "@/lib/staged-workflow";
import { CinematicCut } from "@/lib/cinematic-types";
import { RenderOptions } from "@/lib/types";
import { appBaseUrl } from "@/lib/utils";
import {
  resolveVideoEngineBaseUrls,
  resolveVideoEngineTimeoutMs
} from "@/lib/video-engine-endpoint-config";

export interface AssembledShort {
  videoUrl: string;
  ttsUrl: string;
  narration: string;
  clipCount: number;
}

interface ClipSequenceItem {
  videoUrl: string;
  weight: number;
  sfxUrl?: string;
  sfxGain?: number;
}

/**
 * Pick the take the operator selected for each cut, in order. Cuts without a
 * usable take are reported so the caller can tell the user which ones to redo
 * rather than silently shipping a short with holes in it.
 */
export function collectSelectedClips(cuts: CinematicCut[]): {
  clips: ClipSequenceItem[];
  narration: string;
  missingCutIndexes: number[];
} {
  const clips: ClipSequenceItem[] = [];
  const narrationParts: string[] = [];
  const missingCutIndexes: number[] = [];

  [...cuts]
    .sort((a, b) => a.index - b.index)
    .forEach((cut) => {
      const take = cut.takes.find((item) => item.id === cut.selectedTakeId && item.videoUrl);
      if (!take?.videoUrl) {
        missingCutIndexes.push(cut.index);
        return;
      }
      const narrationText = String(cut.narrationText || "").trim();
      clips.push({
        videoUrl: toEngineUrl(take.videoUrl),
        // Narration length drives screen time, so cuts land on sentence ends.
        weight: Math.max(1, narrationText.length),
        sfxUrl: cut.sfxUrl ? toEngineUrl(cut.sfxUrl) : undefined,
        sfxGain: cut.sfxGain ?? 0.45
      });
      if (narrationText) {
        narrationParts.push(narrationText);
      }
    });

  return { clips, narration: narrationParts.join(" "), missingCutIndexes };
}

/**
 * The render engine is a separate process, so locally stored assets come back
 * as site-relative paths it cannot resolve. Remote URLs are passed through.
 */
function toEngineUrl(url: string): string {
  const value = String(url || "").trim();
  if (!value || /^https?:\/\//i.test(value)) {
    return value;
  }
  const base = appBaseUrl().replace(/\/+$/, "");
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

async function callEngine(body: Record<string, unknown>): Promise<{
  outputUrl: string;
  outputPath: string;
}> {
  const secret = String(process.env.VIDEO_ENGINE_SHARED_SECRET || "").trim();
  const errors: string[] = [];

  for (const baseUrl of resolveVideoEngineBaseUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveVideoEngineTimeoutMs());
    try {
      const response = await fetch(`${baseUrl}/build-clip-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Video-Engine-Secret": secret } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${baseUrl} → HTTP ${response.status} ${text.slice(0, 200)}`);
        continue;
      }
      return JSON.parse(text) as { outputUrl: string; outputPath: string };
    } catch (error) {
      errors.push(`${baseUrl} → ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`영상 조립에 실패했습니다. ${errors.join(" | ")}`);
}

/** Synthesize narration, then hand the clips and audio to the render engine. */
export async function assembleCinematicShort(args: {
  projectId: string;
  title: string;
  cuts: CinematicCut[];
  voice: string;
  voiceSpeed?: number;
  /** ElevenLabs carries the deep documentary tone the format expects. */
  ttsProvider?: "openai" | "elevenlabs";
  /** ElevenLabs delivery controls; lower stability reads more urgent. */
  voiceStability?: number;
  voiceSimilarityBoost?: number;
  useSfx?: boolean;
  bgmUrl?: string;
  bgmGain?: number;
  renderOptions?: RenderOptions;
  userId?: string;
}): Promise<AssembledShort> {
  const { clips, narration, missingCutIndexes } = collectSelectedClips(args.cuts);

  if (missingCutIndexes.length > 0) {
    throw new Error(
      `컷 ${missingCutIndexes.join(", ")}번의 영상이 아직 선택되지 않았습니다. 생성 후 다시 시도해주세요.`
    );
  }
  if (clips.length === 0) {
    throw new Error("조립할 컷이 없습니다.");
  }
  if (!narration.trim()) {
    throw new Error("나레이션이 비어 있습니다.");
  }

  const jobId = `cinematic-${args.projectId}-${Date.now()}`;
  const tts =
    args.ttsProvider === "elevenlabs"
      ? await generateElevenLabsNarration({
          jobId,
          fileName: "tts.mp3",
          text: narration,
          voiceId: args.voice,
          speed: args.voiceSpeed,
          stability: args.voiceStability,
          similarityBoost: args.voiceSimilarityBoost,
          userId: args.userId
        })
      : await generateTtsAudio(
          {
            jobId,
            narration,
            voice: args.voice,
            speed: args.voiceSpeed
          },
          args.userId
        );

  const result = await callEngine({
    jobId,
    clips,
    ttsPath: toEngineUrl(tts.publicUrl),
    subtitlesText: narration,
    titleText: args.title,
    useSfx: args.useSfx === true,
    bgmUrl: args.bgmUrl ? toEngineUrl(args.bgmUrl) : undefined,
    bgmGain: args.bgmGain,
    renderOptions: args.renderOptions || DEFAULT_RENDER_OPTIONS
  });

  return {
    videoUrl: result.outputUrl,
    ttsUrl: tts.publicUrl,
    narration,
    clipCount: clips.length
  };
}
