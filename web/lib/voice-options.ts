export interface VoiceOption {
  id: string;
  label: string;
  provider: "openai" | "gemini" | "both";
}

export type VoiceProviderFilter = "openai" | "gemini" | "both";

export const OPENAI_VOICE_IDS = [
  "alloy",
  "echo",
  "fable",
  "nova",
  "onyx",
  "shimmer"
] as const;

export const GEMINI_VOICE_IDS = [
  "aoede",
  "charon",
  "fenrir",
  "kore",
  "leda",
  "orus",
  "puck",
  "zephyr"
] as const;

export const ALL_VOICE_OPTIONS: VoiceOption[] = [
  ...OPENAI_VOICE_IDS.map((id) => ({ id, label: id, provider: "openai" as const })),
  ...GEMINI_VOICE_IDS.map((id) => ({ id, label: id, provider: "gemini" as const }))
];

const GEMINI_TITLE_CASE: Record<string, string> = {
  aoede: "Aoede",
  charon: "Charon",
  fenrir: "Fenrir",
  kore: "Kore",
  leda: "Leda",
  orus: "Orus",
  puck: "Puck",
  zephyr: "Zephyr"
};

const OPENAI_TO_GEMINI_MAP: Record<string, string> = {
  alloy: "Kore",
  echo: "Puck",
  fable: "Charon",
  nova: "Leda",
  onyx: "Orus",
  shimmer: "Aoede"
};

export function toGeminiVoiceName(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (GEMINI_TITLE_CASE[normalized]) {
    return GEMINI_TITLE_CASE[normalized];
  }
  return OPENAI_TO_GEMINI_MAP[normalized] || "Kore";
}

export function toOpenAiVoiceName(input: string): string {
  const normalized = input.trim().toLowerCase();
  if ((OPENAI_VOICE_IDS as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return "alloy";
}

export function filterVoiceOptions(provider: VoiceProviderFilter): VoiceOption[] {
  if (provider === "both") {
    return ALL_VOICE_OPTIONS;
  }
  return ALL_VOICE_OPTIONS.filter((item) => item.provider === provider || item.provider === "both");
}

export function resolveTtsVoiceProvider(args: {
  aiMode?: string;
  aiTtsProvider?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}): VoiceProviderFilter {
  const mode = String(args.aiMode || "auto").trim().toLowerCase();
  const tts = String(args.aiTtsProvider || "").trim().toLowerCase();
  const hasOpenAi = Boolean(String(args.openaiApiKey || "").trim());
  const hasGemini = Boolean(String(args.geminiApiKey || "").trim());

  if (mode === "openai") {
    return "openai";
  }
  if (mode === "gemini") {
    return "gemini";
  }
  if (mode === "mixed") {
    if (tts === "openai" || tts === "gemini") {
      return tts;
    }
    if (hasGemini && !hasOpenAi) {
      return "gemini";
    }
    if (hasOpenAi && !hasGemini) {
      return "openai";
    }
    return "both";
  }

  if (hasGemini && !hasOpenAi) {
    return "gemini";
  }
  if (hasOpenAi && !hasGemini) {
    return "openai";
  }
  return "both";
}
