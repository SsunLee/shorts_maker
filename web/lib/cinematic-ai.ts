import { randomUUID } from "node:crypto";
import { generateTextCompletion, unwrapJsonFence } from "@/lib/openai-service";
import {
  CinematicCut,
  CinematicHookCandidate,
  CinematicResearch,
  CinematicTopicCandidate,
  CinematicScriptBlock
} from "@/lib/cinematic-types";
import { researchAsPromptContext } from "@/lib/cinematic-research";
import { findCinematicScriptTemplate } from "@/lib/cinematic-script-templates";
import { buildCutPrompt, findCinematicStylePreset } from "@/lib/cinematic-style-presets";

/** Editorial cut length. Generation bills a 4s floor, so short cuts get trimmed. */
const MIN_CUT_SEC = 2;
const MAX_CUT_SEC = 5;

function parseJson<T>(raw: string): T {
  const normalized = unwrapJsonFence(raw).trim();
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const start = normalized.search(/[[{]/);
    const end = Math.max(normalized.lastIndexOf("]"), normalized.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1)) as T;
    }
    throw new Error("모델이 JSON 형식으로 응답하지 않았습니다.");
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * Suggest topics that suit the format. A topic only works here if it hides a
 * counterintuitive fact AND that fact can be shown in a cutaway, so the model
 * is asked for both up front rather than being let down at the storyboard step.
 */
export async function generateTopicCandidates(args: {
  stylePresetId: string;
  count?: number;
  /** Topics already used or already shown, so a refresh returns new ones. */
  exclude?: string[];
  /** Optional nudge, e.g. "지하철" or "한국 근대사". */
  hint?: string;
  userId?: string;
}): Promise<CinematicTopicCandidate[]> {
  const preset = findCinematicStylePreset(args.stylePresetId);
  const count = clamp(Math.round(args.count ?? 6), 3, 10);
  const exclude = (args.exclude || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 60);

  const raw = await generateTextCompletion({
    system:
      "당신은 한국어 지식 숏폼 채널의 기획자입니다. 시청자가 '어? 왜 그렇지?'라고 멈추게 되는 " +
      "소재만 고릅니다. 검증 가능한 사실에 근거해야 하며, 도시전설이나 과장은 제외합니다. JSON만 출력하세요.",
    user:
      `영상 스타일: ${preset.label} — ${preset.directionHint}\n` +
      (args.hint ? `참고 방향: ${args.hint}\n` : "") +
      (exclude.length > 0
        ? `다음 주제는 이미 다뤘으니 제외하세요:\n- ${exclude.join("\n- ")}\n`
        : "") +
      `\n아래 스키마의 JSON 배열로 서로 겹치지 않는 ${count}개를 출력하세요.\n` +
      '[{"topic":"주제 (한국어, 30자 이내)","angle":"상식과 반대되는 지점 한 줄","whyVisual":"단면·구조로 보여줄 수 있는 이유 한 줄"}]\n' +
      "규칙:\n" +
      "- 눈에 보이지 않는 구조나 원리를 드러내는 주제여야 합니다.\n" +
      "- angle은 '~인데도', '~처럼 보이지만' 같은 모순 구조를 담습니다.\n" +
      "- 서로 다른 분야에서 고르게 뽑아 주제가 한쪽으로 몰리지 않게 하세요.",
    userId: args.userId
  });

  const parsed = parseJson<Array<Record<string, unknown>>>(raw);
  const seen = new Set(exclude.map((item) => item.toLowerCase()));
  const results: CinematicTopicCandidate[] = [];
  for (const item of parsed) {
    const topic = String(item.topic || "").trim();
    if (!topic || seen.has(topic.toLowerCase())) {
      continue;
    }
    seen.add(topic.toLowerCase());
    results.push({
      id: randomUUID(),
      topic,
      angle: String(item.angle || "").trim(),
      whyVisual: String(item.whyVisual || "").trim()
    });
    if (results.length >= count) {
      break;
    }
  }
  return results;
}

/**
 * Generate reverse-hook candidates: each one states a common belief and the
 * fact that contradicts it, which is the opening move of the whole format.
 */
export async function generateHookCandidates(args: {
  topic: string;
  stylePresetId: string;
  count?: number;
  research?: CinematicResearch;
  userId?: string;
}): Promise<CinematicHookCandidate[]> {
  const preset = findCinematicStylePreset(args.stylePresetId);
  const count = clamp(Math.round(args.count ?? 5), 3, 8);
  const raw = await generateTextCompletion({
    system:
      "당신은 한국어 숏폼 기획자입니다. 상식과 반대되는 사실을 첫 문장에 던지는 '모순형 훅'만 만듭니다. " +
      "과장이나 낚시는 금지하고, 실제로 검증 가능한 사실에 기반해야 합니다. JSON만 출력하세요.",
    user:
      `주제: ${args.topic}\n` +
      `영상 스타일: ${preset.label} — ${preset.directionHint}\n\n` +
      researchAsPromptContext(args.research) +
      `아래 스키마의 JSON 배열로 ${count}개를 출력하세요.\n` +
      `[{"hook":"영상 첫 문장 (한국어, 40자 이내)","commonBelief":"사람들이 흔히 믿는 것","reality":"실제 사실"}]\n` +
      "hook은 반드시 '~처럼 보이지만', '~인데도', '~하는 이유는' 같은 모순 구조를 포함해야 합니다.",
    userId: args.userId
  });

  const parsed = parseJson<Array<Record<string, unknown>>>(raw);
  return parsed.slice(0, count).map((item) => ({
    id: randomUUID(),
    hook: String(item.hook || "").trim(),
    commonBelief: String(item.commonBelief || "").trim(),
    reality: String(item.reality || "").trim()
  }));
}

/** Expand a chosen hook into the blocks of the selected script template. */
export async function generateScriptBlocks(args: {
  topic: string;
  hook: CinematicHookCandidate;
  stylePresetId: string;
  scriptTemplateId: string;
  targetDurationSec: number;
  research?: CinematicResearch;
  userId?: string;
}): Promise<CinematicScriptBlock[]> {
  const preset = findCinematicStylePreset(args.stylePresetId);
  const template = findCinematicScriptTemplate(args.scriptTemplateId);
  const targetChars = Math.round(clamp(args.targetDurationSec, 20, 120) * 6.5);
  const schema = `{${template.blocks.map((block) => `"${block.id}":"..."`).join(",")}}`;
  const blockGuide = template.blocks
    .map((block) => `- ${block.id} (${block.label}): ${block.guidance}`)
    .join("\n");

  const raw = await generateTextCompletion({
    system:
      `당신은 한국어 숏폼 내레이션 작가입니다. '${template.label}' 구조를 절대 벗어나지 않습니다. ` +
      "구어체 나레이션만 쓰고, 자막 지시나 이모지는 넣지 않습니다. JSON만 출력하세요.",
    user:
      `주제: ${args.topic}\n` +
      `확정된 훅: ${args.hook.hook}\n` +
      `통념: ${args.hook.commonBelief}\n` +
      `사실: ${args.hook.reality}\n` +
      `영상 스타일: ${preset.label} — ${preset.directionHint}\n` +
      `목표 길이: ${args.targetDurationSec}초 (전체 약 ${targetChars}자)\n\n` +
      researchAsPromptContext(args.research) +
      `구조: ${template.label} — ${template.description}\n${blockGuide}\n\n` +
      `다음 JSON 객체 하나만 출력하세요.\n${schema}\n` +
      "규칙:\n" +
      "- 각 값은 완결된 한국어 문장입니다. hook은 확정된 훅을 그대로 쓰거나 자연스럽게 다듬습니다.\n" +
      "- 이 현상의 실제 주된 원인을 씁니다. 영상 스타일에 맞춰 보이려고 부차적인 원인을 " +
      "주된 원인처럼 포장하지 않습니다. 주된 원인이 이 스타일로 그리기 어렵더라도 사실을 우선합니다.\n" +
      "- 앞 블록에서 부정한 내용을 뒤 블록에서 다시 전제로 삼지 않습니다.\n" +
      "- 확실하지 않은 수치나 연도는 쓰지 않습니다.",
    userId: args.userId
  });

  const parsed = parseJson<Record<string, unknown>>(raw);
  return template.blocks.map((block) => ({
    id: block.id,
    text: String(parsed[block.id] || "").trim()
  }));
}

/**
 * Write the YouTube listing.
 *
 * The reference channels title with the contradiction itself rather than a
 * question or a clickbait phrase, so the hook is the source of the title.
 */
export async function generateVideoMetadata(args: {
  topic: string;
  hook: CinematicHookCandidate;
  scriptBlocks: CinematicScriptBlock[];
  research?: CinematicResearch;
  userId?: string;
}): Promise<{ title: string; description: string; tags: string[] }> {
  const narration = args.scriptBlocks
    .map((block) => block.text)
    .filter(Boolean)
    .join(" ");

  const raw = await generateTextCompletion({
    system:
      "당신은 한국어 지식 숏폼 채널의 운영자입니다. 낚시 제목은 쓰지 않고, " +
      "영상이 실제로 답하는 내용을 제목으로 씁니다. JSON만 출력하세요.",
    user:
      `주제: ${args.topic}\n` +
      `훅: ${args.hook.hook}\n` +
      `나레이션: ${narration}\n\n` +
      researchAsPromptContext(args.research) +
      "다음 JSON 객체 하나만 출력하세요.\n" +
      '{"title":"제목","description":"설명란","tags":["태그"]}\n' +
      "규칙:\n" +
      "- title은 상식과 반대되는 사실 자체를 한 줄로 씁니다. 40자 이내, 물음표와 이모지 금지.\n" +
      "- description은 3~5줄. 첫 줄에 영상이 답하는 내용, 이후 핵심 사실을 짧게 나열합니다.\n" +
      "- tags는 8~12개. 한국어 위주로, 주제와 실제로 관련된 것만 씁니다.\n" +
      "- 나레이션에 없는 사실은 넣지 않습니다.",
    userId: args.userId
  });

  const parsed = parseJson<Record<string, unknown>>(raw);
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 15)
    : [];
  return {
    title: String(parsed.title || args.hook.hook || args.topic).trim().slice(0, 100),
    description: String(parsed.description || "").trim().slice(0, 4500),
    tags
  };
}

/**
 * Split the script into 2–5 second cuts and write the three per-cut prompt
 * lines. The master style block is appended locally, never by the model.
 */
export async function generateCuts(args: {
  topic: string;
  scriptBlocks: CinematicScriptBlock[];
  stylePresetId: string;
  masterPrompt: string;
  aspectRatio: string;
  targetDurationSec: number;
  userId?: string;
}): Promise<CinematicCut[]> {
  const preset = findCinematicStylePreset(args.stylePresetId);
  const narration = args.scriptBlocks
    .map((block) => block.text)
    .filter(Boolean)
    .join(" ");
  if (!narration) {
    throw new Error("대본이 비어 있어 장면을 나눌 수 없습니다.");
  }

  const estimatedCuts = clamp(Math.round(args.targetDurationSec / 3.5), 6, 20);
  const raw = await generateTextCompletion({
    system:
      "당신은 숏폼 스토리보드 감독입니다. 나레이션을 2~5초 컷으로 쪼개고, 각 컷의 화면을 " +
      "영어 프롬프트 3줄(subject/action/camera)로 씁니다. 스타일 묘사는 이미 고정되어 있으므로 " +
      "재질·조명·화풍은 절대 쓰지 마세요. JSON만 출력하세요.",
    user:
      `주제: ${args.topic}\n` +
      `영상 스타일: ${preset.label} — ${preset.directionHint}\n` +
      `전체 나레이션:\n${narration}\n\n` +
      `약 ${estimatedCuts}개 컷으로 나눠 아래 JSON 배열을 출력하세요.\n` +
      '[{"narrationText":"이 컷에서 읽는 나레이션 조각 (한국어)","screenNote":"화면 설명 (한국어 한 줄)","subject":"what is shown (English)","action":"what moves or changes (English)","camera":"camera movement (English)","sfx":"the sound this cut makes (English, short)","durationSec":3}]\n' +
      "규칙:\n" +
      "- narrationText를 순서대로 이으면 전체 나레이션과 정확히 같아야 합니다.\n" +
      "- durationSec은 2~5 사이 정수입니다.\n" +
      "- camera는 dolly in, orbit, crane down, cut to cross-section 같은 구체적 움직임으로 씁니다.\n" +
      "- subject/action/camera에 lighting, material, style, cinematic 같은 단어는 쓰지 마세요.\n" +
      "- **subject/action은 화면에 실제로 보이는 것만 씁니다.** 영상 모델은 부정을 그리지 못하고 " +
      "언급된 사물을 그대로 그립니다. 'no water tank', 'without a tank', 'the tank disappears', " +
      "'tank is removed' 같은 표현은 오히려 물탱크를 그리게 만듭니다.\n" +
      "- 무언가 없어졌다는 내용은 **남아 있는 것으로 바꿔 씁니다.** " +
      "예: 'the tank disappears' → 'a bare rooftop with a circular stain where the tank once stood'. " +
      "예: 'water flows without a tank' → 'water rising through a riser pipe straight from the ground floor'.\n" +
      "- sfx는 대사나 음악이 아니라 현장음입니다. 예: deep concrete impact with low rumble, metallic creak, muffled underwater thud.",
    userId: args.userId
  });

  const parsed = parseJson<Array<Record<string, unknown>>>(raw);
  return parsed.map((item, index) => {
    const subject = String(item.subject || "").trim();
    const action = String(item.action || "").trim();
    const camera = String(item.camera || "").trim();
    return {
      id: randomUUID(),
      index: index + 1,
      narrationText: String(item.narrationText || "").trim(),
      screenNote: String(item.screenNote || "").trim(),
      subject,
      action,
      camera,
      sfxPrompt: String(item.sfx || "").trim() || undefined,
      durationSec: clamp(Math.round(Number(item.durationSec) || 3), MIN_CUT_SEC, MAX_CUT_SEC),
      prompt: buildCutPrompt({
        masterPrompt: args.masterPrompt,
        subject,
        action,
        camera,
        aspectRatio: args.aspectRatio
      }),
      takes: []
    };
  });
}
