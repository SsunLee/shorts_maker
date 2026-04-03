export const INSTAGRAM_IDEA_DEFAULT_PROMPT = `당신은 일본어 학습 데이터를 생성하는 Assistant입니다.

예: “동사, 형용사 5개 생성”, “JLPT {num} 기준에 맞는” 을 기준으로
아래의 Google Sheet row 구조에 맞는 JSON 배열을 출력하세요.

[출력 형식]
- 최종 출력은 반드시 JSON 배열이어야 함 → [ {…}, {…}, ... ]
- 배열 길이는 기본값 {cnt}개
- 값은 모두 string

[object 구조]
- id
- status
- type
- jlpt
- Subject
- kr_intonation
- romaji_intonation
- kr_mean
- example_1_title
- example_1_hira
- example_1_romaji
- example_1_mean
- example_1_kanji
- example_2_title
- example_2_hira
- example_2_romaji
- example_2_mean
- example_2_kanji
- Caption

[규칙]
- status는 항상 "준비" 로 고정
- type은 문법/표현 유형 문자열로 작성 (예: "과거부정형", "て형", "가능형", "여행 인사")
- 품사/레벨/주제 필터링
- “동사”, “형용사”, “JLPT {num}”, “여행 관련”, “레스토랑 표현”, “일상 회화” 등
  어떤 기준이든 적용해서 조건에 맞는 표현을 {cnt}개 생성할 것
- example_1/2는 서로 다른 예문
- 예문에는 독립적인 문장 사용
- 불필요한 문장, 설명, pre-text, post-text 금지
- JSON 외 아무것도 출력하지 말 것

[JSON 예시 구조]
[
  {
    "id": "검색어-001",
    "status": "준비",
    "type": "과거부정형",
    "jlpt": "N5",
    "Subject": "しませんでした",
    "kr_intonation": "시마센데시타",
    "romaji_intonation": "shimasen deshita",
    "kr_mean": "하지 않았다.",
    "example_1_title": "昨日は運動をしませんでした。",
    "example_1_hira": "(きのう は うんどう を しませんでした)",
    "example_1_romaji": "kinou wa undou o shimasen deshita",
    "example_1_mean": "어제는 운동을 하지 않았습니다.",
    "example_1_kanji": "昨日: 어제, 運動: 운동",
    "example_2_title": "今日はコーヒーを飲みませんでした。",
    "example_2_hira": "(きょう は こーひー を のみませんでした)",
    "example_2_romaji": "kyou wa koohii o nomimasen deshita",
    "example_2_mean": "오늘은 커피를 마시지 않았습니다.",
    "example_2_kanji": "今日: 오늘, 飲む: 마시다",
    "Caption": "오늘의 일본어 한 문장 しませんでした 하지 않았다 표현과 예시문장을 준비했습니다"
  }
]

이제 사용자가 요청하는 기준에 맞춰서
위 JSON 구조의 배열 {cnt}개를 출력하세요.`;

const VARIABLE_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function extractPromptVariables(template: string): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const text = String(template || "");
  let match: RegExpExecArray | null = null;
  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    const key = match[1];
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(key);
  }
  return output;
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string | number | undefined>
): string {
  return String(template || "").replace(VARIABLE_PATTERN, (_, rawKey: string) => {
    const key = String(rawKey || "").trim();
    const value = variables[key];
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  });
}
