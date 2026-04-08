import type { InstagramCustomFont } from "@/lib/instagram-types";

declare global {
  interface Window {
    __shortsMakerLocalFontAliasMap?: Record<string, string>;
  }
}

const inFlightByKey = new Map<string, Promise<void>>();

function normalizeFontName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function stableHash(value: string): string {
  let hash = 0;
  const source = String(value || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildAlias(font: InstagramCustomFont): string {
  return `SM_CUSTOM_${stableHash(`${font.id}:${font.family}:${font.sourceUrl}`)}`;
}

function buildStyleId(font: InstagramCustomFont): string {
  return `sm-custom-font-${stableHash(font.id || font.family)}`;
}

function isDomAvailable(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getFormatHint(fileName: string): string {
  const ext = String(fileName || "").toLowerCase().split(".").pop() || "";
  if (ext === "ttf") return "truetype";
  if (ext === "otf") return "opentype";
  if (ext === "woff") return "woff";
  if (ext === "woff2") return "woff2";
  if (ext === "ttc") return "truetype";
  return "";
}

function ensureGlobalAliasMap(): Record<string, string> {
  if (!window.__shortsMakerLocalFontAliasMap) {
    window.__shortsMakerLocalFontAliasMap = {};
  }
  return window.__shortsMakerLocalFontAliasMap;
}

async function registerOneCustomFont(font: InstagramCustomFont): Promise<void> {
  if (!isDomAvailable()) return;
  const family = normalizeFontName(font.family);
  const sourceUrl = String(font.sourceUrl || "").trim();
  if (!family || !sourceUrl) return;

  const aliasMap = ensureGlobalAliasMap();
  const key = family.toLowerCase();
  if (aliasMap[key]) {
    return;
  }

  const alias = buildAlias(font);
  const styleId = buildStyleId(font);
  if (!document.getElementById(styleId)) {
    const fontProxyUrl = `/api/instagram/fonts/file?source=${encodeURIComponent(sourceUrl)}`;
    const formatHint = getFormatHint(font.fileName);
    const formatPart = formatHint ? ` format("${formatHint}")` : "";
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@font-face { font-family: "${alias}"; src: url("${fontProxyUrl}")${formatPart}; font-display: swap; }`;
    document.head.appendChild(style);
  }

  try {
    if (document.fonts) {
      await document.fonts.load(`400 16px "${alias}"`, "가나다abcあいう漢字");
    }
  } catch {
    // fallback fonts may still render.
  }
  aliasMap[key] = alias;
}

export async function ensureInstagramCustomFontsLoaded(fonts: InstagramCustomFont[]): Promise<void> {
  if (!isDomAvailable()) return;
  const normalizedFonts = Array.isArray(fonts)
    ? fonts
        .map((font) => ({
          ...font,
          family: normalizeFontName(font.family)
        }))
        .filter((font) => font.family && String(font.sourceUrl || "").trim())
    : [];
  if (normalizedFonts.length === 0) return;

  const promises = normalizedFonts.map((font) => {
    const key = `${font.id}:${font.family.toLowerCase()}:${font.sourceUrl}`;
    const existing = inFlightByKey.get(key);
    if (existing) return existing;
    const runner = registerOneCustomFont(font).finally(() => {
      inFlightByKey.delete(key);
    });
    inFlightByKey.set(key, runner);
    return runner;
  });
  await Promise.all(promises);
}

