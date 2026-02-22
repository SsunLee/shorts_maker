export interface VoiceOption {
  id: string;
  label: string;
  provider: "openai" | "gemini" | "both";
}

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

