import { CinematicStylePreset } from "@/lib/cinematic-types";

/**
 * Master style prompts. Every cut in a project reuses the same block verbatim so
 * unrelated topics still look like they came off one production line; only the
 * subject/action/camera lines change per cut.
 */
export const CINEMATIC_STYLE_PRESETS: CinematicStylePreset[] = [
  {
    id: "architecture_diorama",
    label: "건축 디오라마",
    description: "미니어처 건축물 단면도, 콘크리트·강철 재질, 구조 원리 설명",
    masterPrompt: [
      "Vertical 9:16 educational 3D explainer animation.",
      "A miniature architectural diorama with clean realistic materials,",
      "simplified faceless human figures for scale,",
      "detailed cutaway cross-section,",
      "physically plausible construction and engineering mechanisms,",
      "neutral concrete, steel and muted blue-gray materials,",
      "clear visual hierarchy,",
      "smooth mechanical animation,",
      "studio-quality lighting,",
      "no captions, no labels, no logos, no text."
    ].join("\n"),
    directionHint:
      "건축·토목 구조물의 숨은 원리를 단면과 하중 전달로 보여줍니다. 지반, 말뚝, 보, 트러스, 케이블처럼 눈에 안 보이는 부분을 드러내세요."
  },
  {
    id: "machine_cutaway",
    label: "기계 단면",
    description: "엔진·기어·유압 등 기계 내부 절개도와 작동 애니메이션",
    masterPrompt: [
      "Vertical 9:16 educational 3D explainer animation.",
      "A precision mechanical cutaway model with clean realistic materials,",
      "machined metal, anodized aluminium and muted industrial colors,",
      "exploded-view and cross-section reveals,",
      "physically plausible gear, piston and hydraulic motion,",
      "clear visual hierarchy,",
      "smooth mechanical animation,",
      "studio-quality lighting on a neutral backdrop,",
      "no captions, no labels, no logos, no text."
    ].join("\n"),
    directionHint:
      "기계 내부가 어떻게 맞물려 돌아가는지 보여줍니다. 절개면, 분해 조립, 힘의 전달 경로를 강조하세요."
  },
  {
    id: "history_diorama",
    label: "역사 디오라마",
    description: "시대 배경 미니어처, 축조·전투·생활 장면 재현",
    masterPrompt: [
      "Vertical 9:16 educational 3D explainer animation.",
      "A historical miniature diorama with tactile realistic materials,",
      "simplified faceless human figures in period clothing,",
      "weathered stone, timber and earth tones,",
      "cutaway reveals of structures and terrain,",
      "physically plausible period construction and logistics,",
      "clear visual hierarchy,",
      "smooth animation,",
      "warm directional lighting,",
      "no captions, no labels, no logos, no text."
    ].join("\n"),
    directionHint:
      "역사적 사건이나 구조물을 미니어처로 재현합니다. 지형, 동선, 시대별 기술의 한계를 시각적으로 드러내세요."
  },
  {
    id: "anatomy_science",
    label: "인체·과학",
    description: "인체 단면과 생활과학 현상을 반투명 모델로 설명",
    masterPrompt: [
      "Vertical 9:16 educational 3D explainer animation.",
      "A clean scientific model with semi-translucent anatomical layers,",
      "soft clinical materials and muted teal and bone-white palette,",
      "cross-section and layer-peel reveals,",
      "physically plausible biological and physical processes,",
      "clear visual hierarchy,",
      "smooth animation,",
      "even studio lighting on a neutral backdrop,",
      "no captions, no labels, no logos, no text."
    ].join("\n"),
    directionHint:
      "몸속이나 눈에 보이지 않는 물리 현상을 층층이 벗겨내며 보여줍니다. 흐름, 압력, 온도 변화를 시각화하세요."
  }
];

export const DEFAULT_CINEMATIC_STYLE_PRESET_ID = "architecture_diorama";

export function findCinematicStylePreset(id: string | undefined): CinematicStylePreset {
  const found = CINEMATIC_STYLE_PRESETS.find((preset) => preset.id === id);
  return found || CINEMATIC_STYLE_PRESETS[0];
}

/**
 * Collapse a prompt onto a single line.
 *
 * Higgsfield reads a newline in the prompt as a shot separator: a multi-line
 * prompt is billed per shot and generates something other than the single
 * continuous take we asked for. Measured at 2x the cost for the same params.
 */
export function flattenPrompt(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

/** Combine the locked master style with one cut's subject/action/camera lines. */
export function buildCutPrompt(args: {
  masterPrompt: string;
  subject: string;
  action: string;
  camera: string;
  aspectRatio?: string;
}): string {
  const master =
    args.aspectRatio === "16:9"
      ? args.masterPrompt.replace("Vertical 9:16", "Horizontal 16:9")
      : args.masterPrompt;
  return flattenPrompt(
    [
      master,
      `Scene: ${args.subject.trim()}`,
      `Action: ${args.action.trim()}`,
      `Camera: ${args.camera.trim()}`
    ].join(" ")
  );
}

/**
 * Words that make a video model draw the very thing the cut wants gone.
 *
 * Generators have no notion of absence: naming an object renders it, whatever
 * negation surrounds it. A cut that says "the tank disappears" comes back with
 * a tank in frame, so these are flagged before any credits are spent.
 */
const NEGATION_PATTERNS: RegExp[] = [
  /\bno\s+\w+/i,
  /\bwithout\b/i,
  /\bnot\b/i,
  /\bnone\b/i,
  /\bdisappear(s|ing|ed)?\b/i,
  /\bvanish(es|ing|ed)?\b/i,
  /\bremov(e|es|ed|ing)\b/i,
  /\bgone\b/i,
  /\bmissing\b/i,
  /\babsent\b/i,
  /\bempty of\b/i,
  /\bfree of\b/i
];

/** Negation terms found in a cut's prompt lines, empty when the cut is clean. */
export function findNegativePhrasing(args: {
  subject: string;
  action: string;
  camera: string;
}): string[] {
  const haystack = [args.subject, args.action, args.camera].join(" ");
  const hits = new Set<string>();
  NEGATION_PATTERNS.forEach((pattern) => {
    const match = haystack.match(pattern);
    if (match) {
      hits.add(match[0].trim());
    }
  });
  return Array.from(hits);
}
