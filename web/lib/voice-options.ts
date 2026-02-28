export interface VoiceOption {
  id: string;
  label: string;
  provider: "openai" | "gemini" | "both";
  hint?: string;
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
  ...OPENAI_VOICE_IDS.map((id) => ({
    id,
    label: id,
    provider: "openai" as const,
    hint:
      id === "alloy"
        ? "균형형 · 또렷한 중립 톤"
        : id === "echo"
          ? "차분형 · 안정적인 톤"
          : id === "fable"
            ? "스토리형 · 부드러운 톤"
            : id === "nova"
              ? "밝은형 · 경쾌한 톤"
              : id === "onyx"
                ? "저음형 · 묵직한 톤"
                : "선명형 · 밝은 톤"
  })),
  ...GEMINI_VOICE_IDS.map((id) => ({
    id,
    label: id,
    provider: "gemini" as const,
    hint:
      id === "aoede"
        ? "밝은형 · 경쾌한 톤"
        : id === "charon"
          ? "차분형 · 또렷한 톤"
          : id === "fenrir"
            ? "강한형 · 단단한 톤"
            : id === "kore"
              ? "중립형 · 밸런스 톤"
              : id === "leda"
                ? "부드러운형 · 따뜻한 톤"
                : id === "orus"
                  ? "저음형 · 안정적인 톤"
                  : id === "puck"
                    ? "발랄형 · 속도감 있는 톤"
                    : "맑은형 · 깨끗한 톤"
  }))
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

export function getVoiceHint(voiceId: string): string {
  const normalized = String(voiceId || "").trim().toLowerCase();
  const found = ALL_VOICE_OPTIONS.find((item) => item.id === normalized);
  return found?.hint || "중립형 톤";
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
