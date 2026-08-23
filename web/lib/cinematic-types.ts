/**
 * Types for the cinematic shorts pipeline: a reverse-hook script split into
 * short cuts, each rendered by an AI video model under one locked master style.
 */

export type CinematicAspectRatio = "9:16" | "16:9";

/** Block ids come from the chosen script template, not a fixed set. */
export type CinematicScriptBlockId = string;

export interface CinematicScriptBlock {
  id: CinematicScriptBlockId;
  text: string;
}

export interface CinematicResearchFinding {
  claim: string;
  detail: string;
}

export interface CinematicResearchSource {
  title: string;
  url: string;
}

/** Web-checked facts gathered before any script is written. */
export interface CinematicResearch {
  topic: string;
  mainCause: string;
  findings: CinematicResearchFinding[];
  misconceptions: string[];
  sources: CinematicResearchSource[];
  createdAt: string;
}

export interface CinematicTopicCandidate {
  id: string;
  topic: string;
  /** The counterintuitive angle that makes this topic work as a hook. */
  angle: string;
  /** Why it can be shown as a cutaway rather than just narrated. */
  whyVisual: string;
}

export interface CinematicHookCandidate {
  id: string;
  hook: string;
  commonBelief: string;
  reality: string;
}

/** One 2–5 second cut. `subject`/`action`/`camera` are the only per-cut variables. */
export interface CinematicCut {
  id: string;
  index: number;
  narrationText: string;
  /** Korean description shown in the UI so the operator can review at a glance. */
  screenNote: string;
  subject: string;
  action: string;
  camera: string;
  durationSec: number;
  /** Assembled English prompt = master style + subject/action/camera. */
  prompt: string;
  /** Short English description of the sound this cut should make. */
  sfxPrompt?: string;
  sfxUrl?: string;
  sfxGain?: number;
  takes: CinematicTake[];
  selectedTakeId?: string;
}

export type CinematicTakeStatus = "queued" | "in_progress" | "completed" | "failed";

export interface CinematicTake {
  id: string;
  jobId: string;
  model: string;
  status: CinematicTakeStatus;
  videoUrl?: string;
  previewUrl?: string;
  credits?: number;
  error?: string;
  createdAt: string;
}

export interface CinematicStylePreset {
  id: string;
  label: string;
  description: string;
  /** English master prompt shared by every cut in the project. */
  masterPrompt: string;
  /** Korean guidance handed to the LLM when it writes subject/action/camera. */
  directionHint: string;
}

export interface CinematicProject {
  id: string;
  title: string;
  topic: string;
  stylePresetId: string;
  scriptTemplateId: string;
  /** Snapshot of the master prompt so preset edits never mutate old projects. */
  masterPrompt: string;
  aspectRatio: CinematicAspectRatio;
  model: string;
  resolution: "480p" | "720p" | "1080p";
  targetDurationSec: number;
  research?: CinematicResearch;
  selectedHook?: CinematicHookCandidate;
  hookCandidates: CinematicHookCandidate[];
  scriptBlocks: CinematicScriptBlock[];
  cuts: CinematicCut[];
  narrationVoice?: string;
  ttsUrl?: string;
  finalVideoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CinematicProjectCatalog {
  projects: CinematicProject[];
  updatedAt: string;
}



/**
 * Shortest clip any video model sells. A 2s editorial cut still bills 4s, so
 * the surplus footage is trimmed at assembly rather than paid for twice.
 */
export const MIN_BILLABLE_CLIP_SEC = 4;

/** Seconds actually charged for an editorial cut of the given length. */
export function billableClipSeconds(editorialSec: number): number {
  return Math.max(MIN_BILLABLE_CLIP_SEC, Math.min(10, Math.round(editorialSec)));
}

/**
 * Credits charged per second of generated footage, measured against the live
 * Higgsfield cost endpoint on 2026-08-23. Used only for the pre-spend estimate
 * shown in the UI — the authoritative number comes back with each job.
 */
export const CINEMATIC_MODEL_CREDITS_PER_SEC: Record<string, number> = {
  veo3_1_lite: 1.0,
  wan2_7: 1.5,
  grok_video: 1.5,
  kling3_0_turbo: 1.5,
  kling2_6: 2.0,
  seedance_2_0_mini: 2.5,
  happy_horse_video: 2.5,
  wan2_6: 2.6,
  veo3_1: 2.75,
  gemini_omni: 3.0,
  minimax_h3: 4.0,
  flux_3_video: 5.5,
  seedance_2_5: 6.5
};

/** Estimated credits for a run, or undefined when the model is unmeasured. */
export function estimateRunCredits(model: string, billableSeconds: number): number | undefined {
  const rate = CINEMATIC_MODEL_CREDITS_PER_SEC[model];
  if (!rate) {
    return undefined;
  }
  return Math.round(rate * billableSeconds * 10) / 10;
}
