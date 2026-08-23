/**
 * Script templates for the format.
 *
 * The reference channels do not all use one structure. The plain reveal
 * (problem → principle → mechanism) is the base, but the highest-retention
 * variant voices the viewer's own idea and shoots it down — "그럼 직접 넣으면
 * 되냐구요? 아닙니다" — before giving the real answer. That rebuttal beat opens
 * a loop the viewer needs closed, so it is a template of its own rather than an
 * optional flourish.
 */

export interface CinematicScriptBlockSpec {
  id: string;
  label: string;
  /** Written into the prompt so the model knows this block's job. */
  guidance: string;
}

export interface CinematicScriptTemplate {
  id: string;
  label: string;
  description: string;
  blocks: CinematicScriptBlockSpec[];
}

export const CINEMATIC_SCRIPT_TEMPLATES: CinematicScriptTemplate[] = [
  {
    id: "reveal",
    label: "원리 공개형",
    description: "훅 → 문제 → 숨은 원리 → 메커니즘 → 반전. 가장 기본 구조.",
    blocks: [
      {
        id: "hook",
        label: "① 모순형 훅",
        guidance: "상식과 반대되는 사실을 첫 문장에 던진다. 설명은 아직 하지 않는다."
      },
      {
        id: "problem",
        label: "② 문제 상황",
        guidance: "그대로 두면 무엇이 잘못되는지 구체적으로 말한다."
      },
      {
        id: "principle",
        label: "③ 숨은 원리",
        guidance: "실제로 적용된 해법이나 원리를 공개한다."
      },
      {
        id: "mechanism",
        label: "④ 메커니즘",
        guidance: "그 원리가 실제로 작동하는 과정을 순서대로 설명한다."
      },
      {
        id: "twist",
        label: "⑤ 반전 결론",
        guidance: "훅으로 돌아와 한 문장으로 매듭짓는다."
      }
    ]
  },
  {
    id: "rebuttal",
    label: "가정 반박형",
    description:
      '훅 → 문제 → "그럼 ~하면 되냐구요? 아닙니다" → 진짜 원리 → 메커니즘 → 반전. 시청자 생각을 먼저 꺾는 구조.',
    blocks: [
      {
        id: "hook",
        label: "① 모순형 훅",
        guidance: "상식과 반대되는 사실을 첫 문장에 던진다."
      },
      {
        id: "problem",
        label: "② 문제 상황",
        guidance: "그대로 두면 무엇이 잘못되는지 말한다."
      },
      {
        id: "rebuttal",
        label: "③ 가정 반박",
        guidance:
          "시청자가 떠올릴 가장 뻔한 해법을 의문문으로 먼저 말하고 곧바로 부정한다. " +
          '반드시 "그럼 ~하면 되냐구요?" 형태의 질문 + "아닙니다" 형태의 부정 + ' +
          '"사실은 ~하면" 형태의 이유로 이어진다. ' +
          "부정하는 해법은 다음 블록에서 공개할 진짜 방법과 반드시 달라야 한다. " +
          "부정 이유는 물리적으로 무슨 일이 벌어지는지 한 가지만 구체적으로 든다. " +
          "앞에서 이미 틀렸다고 말한 통념을 다시 전제로 삼지 않는다."
      },
      {
        id: "principle",
        label: "④ 진짜 원리",
        guidance: "그래서 실제로는 어떤 방식을 쓰는지 공개한다."
      },
      {
        id: "mechanism",
        label: "⑤ 메커니즘",
        guidance: "그 방식이 작동하는 과정을 순서대로 설명한다."
      },
      {
        id: "twist",
        label: "⑥ 반전 결론",
        guidance: "훅으로 돌아와 한 문장으로 매듭짓는다."
      }
    ]
  },
  {
    id: "rebuttal_ladder",
    label: "반박 사다리형",
    description:
      "뻔한 해법을 두 번 연속으로 꺾은 뒤 정답을 준다. 호기심 유지가 가장 길지만 대본이 빡빡해진다.",
    blocks: [
      { id: "hook", label: "① 모순형 훅", guidance: "상식과 반대되는 사실을 던진다." },
      { id: "problem", label: "② 문제 상황", guidance: "무엇이 잘못되는지 말한다." },
      {
        id: "rebuttal",
        label: "③ 1차 반박",
        guidance:
          '가장 뻔한 해법을 "그럼 ~하면 되냐구요?"로 묻고 "아닙니다"로 꺾는다. ' +
          "꺾는 이유는 물리적으로 무슨 일이 벌어지는지 구체적으로 든다."
      },
      {
        id: "rebuttal2",
        label: "④ 2차 반박",
        guidance: '그 다음으로 떠오를 해법도 "그럼 ~는요?"로 묻고 꺾는다. 앞 반박과 이유가 달라야 한다.'
      },
      { id: "principle", label: "⑤ 진짜 원리", guidance: "실제로 쓰이는 방식을 공개한다." },
      { id: "twist", label: "⑥ 반전 결론", guidance: "훅으로 돌아와 매듭짓는다." }
    ]
  }
];

export const DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID = "rebuttal";

export function findCinematicScriptTemplate(id: string | undefined): CinematicScriptTemplate {
  return (
    CINEMATIC_SCRIPT_TEMPLATES.find((template) => template.id === id) ||
    CINEMATIC_SCRIPT_TEMPLATES.find(
      (template) => template.id === DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID
    ) ||
    CINEMATIC_SCRIPT_TEMPLATES[0]
  );
}

/** Empty block list for a template, used to seed the editor. */
export function emptyBlocksForTemplate(templateId: string): { id: string; text: string }[] {
  return findCinematicScriptTemplate(templateId).blocks.map((block) => ({
    id: block.id,
    text: ""
  }));
}
