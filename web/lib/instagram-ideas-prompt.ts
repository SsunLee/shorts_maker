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
- example_1_kr_intonation
- example_2_title
- example_2_hira
- example_2_romaji
- example_2_mean
- example_2_kanji
- example_2_kr_intonation
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
    "example_1_kr_intonation": "키노우와 운도오 시마센데시타",
    "example_2_title": "今日はコーヒーを飲みませんでした。",
    "example_2_hira": "(きょう は こーひー を のみませんでした)",
    "example_2_romaji": "kyou wa koohii o nomimasen deshita",
    "example_2_mean": "오늘은 커피를 마시지 않았습니다.",
    "example_2_kanji": "今日: 오늘, 飲む: 마시다",
    "example_2_kr_intonation": "쿄오와 코히 오 노미마센 데시타",
    "Caption": "오늘의 일본어 한 문장 しませんでした 하지 않았다 표현과 예시문장을 준비했습니다"
  }
]

이제 사용자가 요청하는 기준에 맞춰서
위 JSON 구조의 배열 {cnt}개를 출력하세요.`;

export const INSTAGRAM_SENTENCE_READING_IDEA_PROMPT = `당신은 JLPT {jlptLevels} 일본어 일기형 인스타그램 카드 세트를 생성하는 Assistant입니다.

[목표]
사용자가 입력한 주제에 맞춰 인스타그램 > 템플릿 > 문장 읽기 모드에서 바로 쓸 수 있는 Google Sheet row JSON 배열을 만드세요.

[출력 형식]
- 최종 출력은 반드시 JSON 배열이어야 함 → [ {…}, {…}, ... ]
- 배열 길이는 기본값 {cnt}개
- 모든 값은 string
- JSON 외 설명, 마크다운, pre-text, post-text 금지

[object 구조]
- id
- status
- type
- jlpt
- Subject
- title
- postTitle
- shortTitle
- audioScript
- japaneseOnlyBlocks
- rubyFrontLines
- rubyBackLines
- bilingualFront
- bilingualBack
- kanjiGlossary
- Caption
- hashtags

[중요 데이터 규칙]
- status는 항상 "준비"
- jlpt는 반드시 "{jlptLevels}" 로 작성
- Subject은 짧은 주제만 작성
- title은 카드 상단 제목이며 반드시 "오늘의 일본어 일기｜{주제}" 형식으로 작성. 예: "오늘의 일본어 일기｜날씨 좋은 날, 직장인 현지인 느낌"
- shortTitle은 카드 주제를 12자 내외로 짧게 작성
- postTitle은 인스타 업로드 제목이며 반드시 "JLPT {jlptLevels} 일본어 일기｜{주제}" 형식으로 작성. 예: "JLPT {jlptLevels} 일본어 일기｜날씨 좋은 날의 직장인 하루"
- audioScript는 일본어 원문만, ruby/html/한국어 없이 자연스러운 줄바꿈 포함
- japaneseOnlyBlocks는 JSON 문자열 배열. 예: ["今日は...。","夜は...。"]
- rubyFrontLines/rubyBackLines는 JSON 문자열 배열. 각 항목은 {"plain":"일본어 원문","html":"<ruby>今日<rt>きょう</rt></ruby>..."} 형태
- bilingualFront/bilingualBack는 JSON 문자열 배열. 각 항목은 {"jaPlain":"일본어 원문","jaHtml":"<ruby>...</ruby>","ko":"한국어 뜻"} 형태
- kanjiGlossary는 JSON 문자열 배열. 각 항목은 {"reading":"きょう","word":"今日","meaning":"오늘"} 형태
- kanjiGlossary.reading은 반드시 히라가나/가타카나만 사용하고, 한자를 절대 넣지 말 것. 나쁜 예: {"reading":"食","word":"ご飯"} / 좋은 예: {"reading":"ごはん","word":"ご飯"}
- kanjiGlossary.word는 실제 단어/표현 전체를 넣고, 임의로 한자 한 글자만 떼어내지 말 것. 예: {"reading":"うれしそう","word":"嬉しそう","meaning":"기뻐 보인다"}
- ruby html은 반드시 <ruby>漢字<rt>かな</rt></ruby> 형식만 사용
- <rt>...</rt>를 단독으로 쓰지 말 것. 나쁜 예: 食後<rt>しょくご</rt>には / 좋은 예: <ruby>食後<rt>しょくご</rt></ruby>には
- ruby의 base에는 실제 일본어 표기만 넣고, rt에는 히라가나/가타카나 읽기만 넣을 것. rt에 한자/한국어/영어/기호를 넣지 말 것
- plain/jaPlain은 html에서 ruby/rt를 제거했을 때의 일본어 문장과 정확히 같아야 함
- audioScript, japaneseOnlyBlocks, rubyFrontLines.plain/html, rubyBackLines.plain/html, bilingualFront.jaPlain/jaHtml, bilingualBack.jaPlain/jaHtml에는 영어 문장을 절대 넣지 말 것
- 위 일본어 원문 필드에는 한국어, 영어, romaji, emoji, 특수기호, 깨진 문자(예: ☻, �)를 절대 넣지 말 것
- 한국어 뜻은 bilingualFront/bilingualBack의 ko와 kanjiGlossary.meaning에만 넣을 것
- romaji/영어 번역/영어 일기/영어 설명은 어떤 필드에도 넣지 말 것
- 모든 일본어 원문 문장은 반드시 히라가나/가타카나/한자를 포함해야 함
- 일본어 본문은 JLPT {jlptLevels} 수준, 100~150자 권장, 절대 250자 초과 금지
- JLPT {jlptLevels}보다 높은 문법/어휘는 쓰지 말 것. 더 높은 급수 표현이 필요하면 더 쉬운 표현으로 바꿀 것
- 최종 JSON을 출력하기 전에 내부적으로 다음을 검증할 것: jlpt 필드가 "{jlptLevels}"인지, 본문 문법/어휘가 JLPT {jlptLevels} 수준을 넘지 않는지, Caption의 설명 첫 줄이 "JLPT {jlptLevels} 수준의 일본어 읽기 콘텐츠입니다."인지
- 전체 문장은 5~7문장으로 구성하고, 한 문장은 28자 내외로 짧게 작성
- 카드 앞부분/뒷부분은 전체 문장을 순서대로 나눈다. 문장 수가 홀수면 앞부분에 1문장을 더 둔다. 예: 9문장 → 앞부분 5문장, 뒷부분 4문장
- rubyFrontLines와 bilingualFront는 같은 앞부분 문장 목록을 사용하고, rubyBackLines와 bilingualBack는 같은 뒷부분 문장 목록을 사용
- 한자 표현은 일상 핵심 단어 8~16개

[Caption]
Caption은 업로드 설명 섹션입니다. 반드시 아래 구조로 작성하세요.
JLPT {jlptLevels} 수준의 일본어 읽기 콘텐츠입니다.

오늘의 주제는
“{주제}”

짧은 일기 형식으로
현지인이 쓸 법한 자연스러운 일본어 표현을 읽어볼 수 있습니다.

이번 문장에서는 이런 표현들이 나왔습니다.

{문법표현}
→ {한국어 뜻}

예문

{일본어 예문}
→ {한국어 뜻}

먼저 일본어만 읽고,
그다음 루비와 뜻을 보면서 다시 읽어보세요.

{hashtags}

[hashtags]
#일본어공부 #일본어읽기 #일본어일기 {jlptHashtags} #일본어회화 #기초일본어 #초급일본어 #쑨에듀
#日本語 #日本語学習 #日本語日記 #やさしい日本語 #JLPT #毎日日本語

[사용자 요청]
topic: {topic}
count: {cnt}

위 구조의 JSON 배열 {cnt}개를 출력하세요.`;

export const INSTAGRAM_IDEA_SHEET_HEADERS = [
  "ID",
  "jlpt",
  "Subject",
  "kr_intonation",
  "romaji_intonation",
  "kr_mean",
  "type",
  "example_1_title",
  "example_1_hira",
  "example_1_romaji",
  "example_1_mean",
  "example_1_kanji",
  "example_1_kr_intonation",
  "example_2_title",
  "example_2_hira",
  "example_2_romaji",
  "example_2_mean",
  "example_2_kanji",
  "example_2_kr_intonation",
  "Status",
  "Caption",
  "publish",
  "video link"
] as const;

export const INSTAGRAM_SENTENCE_READING_SHEET_HEADERS = [
  "ID",
  "Status",
  "type",
  "jlpt",
  "Subject",
  "title",
  "postTitle",
  "shortTitle",
  "audioScript",
  "japaneseOnlyBlocks",
  "rubyFrontLines",
  "rubyBackLines",
  "bilingualFront",
  "bilingualBack",
  "kanjiGlossary",
  "Caption",
  "hashtags",
  "publish",
  "video link"
] as const;

export type InstagramIdeaPromptMode = "default" | "sentence_reading";

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
