import { storeGeneratedAsset } from "@/lib/object-storage";
import { getSettings } from "@/lib/settings-store";

/**
 * ElevenLabs text-to-sound-effects.
 *
 * Generated effects beat a stock library here: each cut gets audio described
 * from its own scene text, at exactly the length the cut runs, instead of a
 * search result that only roughly matches.
 */

const SOUND_ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation";
const TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

/** Billing is 40 credits per second when a duration is given. */
export const ELEVENLABS_SFX_CREDITS_PER_SEC = 40;
/** Credits are billed at the same rate as TTS characters. */
export const ELEVENLABS_USD_PER_1K_CREDITS = 0.1;

export const MIN_SFX_SEC = 0.5;
export const MAX_SFX_SEC = 30;

export function estimateSfxCostUsd(durationSec: number): number {
  const seconds = Math.max(MIN_SFX_SEC, Math.min(MAX_SFX_SEC, durationSec));
  const credits = seconds * ELEVENLABS_SFX_CREDITS_PER_SEC;
  return Number(((credits / 1000) * ELEVENLABS_USD_PER_1K_CREDITS).toFixed(4));
}

async function resolveApiKey(userId?: string): Promise<string> {
  const settings = await getSettings(userId);
  const key = String(settings.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "ElevenLabs API 키가 없습니다. 설정 화면에서 elevenlabsApiKey를 저장해 주세요."
    );
  }
  return key;
}

export interface GeneratedSoundEffect {
  publicUrl: string;
  durationSec: number;
  estimatedCostUsd: number;
  usedPrompt: string;
}

/** Generate one sound effect and store it alongside the job's other assets. */
export async function generateSoundEffect(args: {
  jobId: string;
  fileName: string;
  prompt: string;
  durationSec: number;
  /** Higher values track the prompt more literally; 0.3 is the API default. */
  promptInfluence?: number;
  loop?: boolean;
  userId?: string;
}): Promise<GeneratedSoundEffect> {
  const apiKey = await resolveApiKey(args.userId);
  const prompt = args.prompt.trim();
  if (!prompt) {
    throw new Error("효과음 프롬프트가 비어 있습니다.");
  }
  const durationSec = Number(
    Math.max(MIN_SFX_SEC, Math.min(MAX_SFX_SEC, args.durationSec)).toFixed(2)
  );

  const response = await fetch(`${SOUND_ENDPOINT}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: durationSec,
      prompt_influence: args.promptInfluence ?? 0.5,
      loop: args.loop === true,
      model_id: "eleven_text_to_sound_v2"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs 효과음 생성 실패: HTTP ${response.status} ${detail.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("ElevenLabs가 빈 오디오를 반환했습니다.");
  }

  const stored = await storeGeneratedAsset({
    jobId: args.jobId,
    fileName: args.fileName,
    body: buffer,
    contentType: "audio/mpeg",
    cacheControl: "public, max-age=604800",
    userId: args.userId
  });

  return {
    publicUrl: stored.publicUrl,
    durationSec,
    estimatedCostUsd: estimateSfxCostUsd(durationSec),
    usedPrompt: prompt
  };
}

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  previewUrl?: string;
}

/** List the voices available on the account, for the narration picker. */
export async function listElevenLabsVoices(userId?: string): Promise<ElevenLabsVoice[]> {
  const apiKey = await resolveApiKey(userId);
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs 보이스 목록 실패: HTTP ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = (await response.json()) as { voices?: Array<Record<string, unknown>> };
  return (data.voices || []).map((voice) => ({
    voiceId: String(voice.voice_id || ""),
    name: String(voice.name || ""),
    category: String(voice.category || ""),
    labels: (voice.labels as Record<string, string>) || {},
    previewUrl: voice.preview_url ? String(voice.preview_url) : undefined
  }));
}

/**
 * Narration through ElevenLabs. Optional — the pipeline defaults to the
 * existing OpenAI/Gemini TTS, but Korean narration is noticeably stronger here.
 */
export async function generateElevenLabsNarration(args: {
  jobId: string;
  fileName: string;
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  userId?: string;
}): Promise<{ publicUrl: string; estimatedCostUsd: number }> {
  const apiKey = await resolveApiKey(args.userId);
  const text = args.text.trim();
  if (!text) {
    throw new Error("나레이션 텍스트가 비어 있습니다.");
  }

  const response = await fetch(
    `${TTS_ENDPOINT}/${encodeURIComponent(args.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: args.modelId || "eleven_multilingual_v2",
        // Steady delivery suits documentary narration; the defaults drift.
        voice_settings: {
          stability: args.stability ?? 0.55,
          similarity_boost: args.similarityBoost ?? 0.8,
          speed: args.speed ?? 1
        }
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs 나레이션 실패: HTTP ${response.status} ${detail.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const stored = await storeGeneratedAsset({
    jobId: args.jobId,
    fileName: args.fileName,
    body: buffer,
    contentType: "audio/mpeg",
    cacheControl: "public, max-age=604800",
    userId: args.userId
  });

  return {
    publicUrl: stored.publicUrl,
    estimatedCostUsd: Number(((text.length / 1000) * ELEVENLABS_USD_PER_1K_CREDITS).toFixed(4))
  };
}
