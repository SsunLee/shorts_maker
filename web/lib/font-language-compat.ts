import { SheetContentRow } from "@/lib/types";

type ScriptKind = "ko" | "ja" | "cjk" | "hi" | "ar" | "latin";

function normalizeFontName(fontName: string): string {
  return String(fontName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectScripts(text: string): Set<ScriptKind> {
  const value = String(text || "");
  const scripts = new Set<ScriptKind>();
  if (!value) {
    return scripts;
  }

  if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/.test(value)) {
    scripts.add("ko");
  }
  if (/[\u3040-\u30FF]/.test(value)) {
    scripts.add("ja");
  }
  if (/[\u4E00-\u9FFF]/.test(value)) {
    scripts.add("cjk");
  }
  if (/[\u0900-\u097F]/.test(value)) {
    scripts.add("hi");
  }
  if (/[\u0600-\u06FF]/.test(value)) {
    scripts.add("ar");
  }
  if (/[A-Za-z\u00C0-\u024F]/.test(value)) {
    scripts.add("latin");
  }
  return scripts;
}

function resolveSupportedScripts(fontName: string): Set<ScriptKind> {
  const normalized = normalizeFontName(fontName);
  if (!normalized) {
    return new Set<ScriptKind>(["latin"]);
  }

  if (normalized.includes("noto sans cjk jp")) {
    return new Set<ScriptKind>(["latin", "ko", "ja", "cjk"]);
  }
  if (normalized.includes("noto sans jp")) {
    return new Set<ScriptKind>(["latin", "ja", "cjk"]);
  }
  if (normalized.includes("noto sans devanagari")) {
    return new Set<ScriptKind>(["latin", "hi"]);
  }
  if (normalized.includes("noto sans arabic")) {
    return new Set<ScriptKind>(["latin", "ar"]);
  }
  if (normalized.includes("noto sans kr")) {
    return new Set<ScriptKind>(["latin", "ko", "cjk"]);
  }
  if (
    normalized.includes("malgun gothic") ||
    normalized.includes("nanum gothic") ||
    normalized.includes("nanumgothic") ||
    normalized.includes("pretendard")
  ) {
    return new Set<ScriptKind>(["latin", "ko"]);
  }
  if (
    normalized.includes("arial") ||
    normalized.includes("segoe ui") ||
    normalized.includes("roboto") ||
    normalized.includes("inter")
  ) {
    return new Set<ScriptKind>(["latin"]);
  }

  // Unknown custom font: be conservative.
  return new Set<ScriptKind>(["latin"]);
}

function scriptLabel(script: ScriptKind): string {
  if (script === "ko") {
    return "한국어";
  }
  if (script === "ja") {
    return "일본어";
  }
  if (script === "hi") {
    return "힌디어";
  }
  if (script === "ar") {
    return "아랍어";
  }
  if (script === "cjk") {
    return "한자권(CJK)";
  }
  return "영문";
}

export function buildFontUnsupportedLanguageNotice(
  fontName: string,
  rows: SheetContentRow[]
): string | undefined {
  const safeRows = rows || [];
  if (safeRows.length === 0) {
    return undefined;
  }

  const presentScripts = new Set<ScriptKind>();
  safeRows.forEach((row) => {
    const combined = `${row.keyword}\n${row.subject}\n${row.description}\n${row.narration}`;
    detectScripts(combined).forEach((script) => {
      if (script !== "latin") {
        presentScripts.add(script);
      }
    });
  });

  if (presentScripts.size === 0) {
    return undefined;
  }

  const supported = resolveSupportedScripts(fontName);
  const unsupported = Array.from(presentScripts).filter((script) => !supported.has(script));
  if (unsupported.length === 0) {
    return undefined;
  }

  const unsupportedText = unsupported.map(scriptLabel).join(", ");
  const recommendation = new Set<string>();
  if (unsupported.includes("ja") || unsupported.includes("cjk")) {
    recommendation.add("Noto Sans CJK JP");
  }
  if (unsupported.includes("hi")) {
    recommendation.add("Noto Sans Devanagari");
  }
  if (unsupported.includes("ar")) {
    recommendation.add("Noto Sans Arabic");
  }
  if (unsupported.includes("ko")) {
    recommendation.add("Noto Sans KR");
  }

  const recommendText =
    recommendation.size > 0 ? ` 권장 폰트: ${Array.from(recommendation).join(" / ")}.` : "";
  return `준비 상태 아이디어에 ${unsupportedText}가 포함되어 현재 폰트에서 깨질 수 있습니다.${recommendText}`;
}

