import { getOpenAiClient, unwrapJsonFence } from "@/lib/openai-service";
import { resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import { CinematicResearch } from "@/lib/cinematic-types";
import { findCinematicStylePreset } from "@/lib/cinematic-style-presets";

/**
 * Look the topic up before writing anything.
 *
 * Without this the script is only as good as the model's recall, which tends to
 * produce a plausible-but-secondary cause dressed up as the main one — exactly
 * the failure the reference channels avoid by researching first.
 */
export async function researchTopic(args: {
  topic: string;
  stylePresetId: string;
  userId?: string;
}): Promise<CinematicResearch> {
  const provider = await resolveProviderForTask("text", args.userId);
  if (provider !== "openai") {
    throw new Error(
      "자료 조사는 OpenAI 웹 검색을 사용합니다. 설정에서 OpenAI 키를 사용하도록 바꿔주세요."
    );
  }

  const preset = findCinematicStylePreset(args.stylePresetId);
  const client = await getOpenAiClient(args.userId);
  const model = await resolveModelForTask("openai", "text", args.userId);

  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    input: [
      {
        role: "system",
        content:
          "당신은 지식 숏폼의 자료 조사 담당입니다. 웹 검색으로 사실을 확인한 뒤 요약합니다. " +
          "추측과 확인된 사실을 구분하고, 확인 못 한 내용은 넣지 않습니다. JSON만 출력하세요."
      },
      {
        role: "user",
        content:
          `주제: ${args.topic}\n` +
          `영상 스타일: ${preset.label} — ${preset.directionHint}\n\n` +
          "웹에서 확인한 뒤 다음 JSON 객체 하나만 출력하세요.\n" +
          '{"mainCause":"이 현상의 실제 주된 원인 한 문장","findings":[{"claim":"확인된 사실 한 줄","detail":"보충 설명 한두 문장"}],"misconceptions":["흔히 잘못 알려진 내용"],"sources":[{"title":"출처 제목","url":"주소"}]}\n' +
          "규칙:\n" +
          "- mainCause는 부차적 요인이 아니라 가장 큰 원인이어야 합니다.\n" +
          "- findings는 4~7개. 숫자나 연도는 출처로 확인된 것만 씁니다.\n" +
          "- misconceptions에는 이 주제에서 사람들이 흔히 틀리게 아는 내용을 넣습니다.\n" +
          "- sources는 실제로 참고한 페이지만 넣습니다."
      }
    ]
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("자료 조사 결과를 받지 못했습니다.");
  }

  const parsed = parseResearchJson(text);
  return {
    topic: args.topic,
    mainCause: String(parsed.mainCause || "").trim(),
    findings: toFindings(parsed.findings),
    misconceptions: toStringList(parsed.misconceptions),
    // The search runs, but the API attaches no citation annotations, so the
    // model writes the URL list from memory and regularly invents one. Every
    // link is fetched before it is kept.
    sources: await keepReachableSources(toSources(parsed.sources)),
    createdAt: new Date().toISOString()
  };
}

async function isReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; shorts-maker/1.0)" }
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function keepReachableSources(
  sources: CinematicResearch["sources"]
): Promise<CinematicResearch["sources"]> {
  const checked = await Promise.all(
    sources.map(async (source) => ((await isReachable(source.url)) ? source : undefined))
  );
  return checked.filter((source): source is CinematicResearch["sources"][number] =>
    Boolean(source)
  );
}

function parseResearchJson(raw: string): Record<string, unknown> {
  const normalized = unwrapJsonFence(raw).trim();
  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("자료 조사 결과가 JSON 형식이 아닙니다.");
  }
}

function toFindings(value: unknown): CinematicResearch["findings"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        claim: String(row.claim || "").trim(),
        detail: String(row.detail || "").trim()
      };
    })
    .filter((item) => item.claim.length > 0)
    .slice(0, 10);
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function toSources(value: unknown): CinematicResearch["sources"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        title: String(row.title || "").trim(),
        url: String(row.url || "").trim()
      };
    })
    .filter((item) => item.url.startsWith("http"))
    .slice(0, 10);
}

/** Render research as prompt context for the hook and script passes. */
export function researchAsPromptContext(research?: CinematicResearch): string {
  if (!research) {
    return "";
  }
  const parts: string[] = ["[확인된 자료]"];
  if (research.mainCause) {
    parts.push(`주된 원인: ${research.mainCause}`);
  }
  research.findings.forEach((item) => {
    parts.push(`- ${item.claim}${item.detail ? ` (${item.detail})` : ""}`);
  });
  if (research.misconceptions.length > 0) {
    parts.push(`흔한 오해: ${research.misconceptions.join(" / ")}`);
  }
  parts.push("위 자료에 없는 내용은 추측해서 쓰지 마세요.");
  return `${parts.join("\n")}\n\n`;
}
