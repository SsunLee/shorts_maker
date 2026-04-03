import fs from "fs";
import process from "process";
import path from "path";
import kuromoji from "kuromoji";
import { toHiragana } from "wanakana";

const KANJI_REGEX = /[一-龯々〆ヶヵ]/;
const RUBY_TOKEN_REGEX = /\[([^\]\|]+)\|([^\]]+)\]/g;
const PLACEHOLDER_REGEX = /^\{\{\s*[^}]+\s*\}\}$/;

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function resolveDictPath(): string {
  const pkgRoot = path.dirname(require.resolve("kuromoji/package.json"));
  const resolvedFromPackage = path.join(pkgRoot, "dict");
  const sanitizedResolvedPath = resolvedFromPackage.replace(`${path.sep}(rsc)${path.sep}`, path.sep);
  const cwd = process.cwd();
  const candidates = [
    resolvedFromPackage,
    sanitizedResolvedPath,
    path.join(cwd, "node_modules", "kuromoji", "dict"),
    path.join(cwd, "web", "node_modules", "kuromoji", "dict"),
    path.join(path.resolve(cwd, ".."), "node_modules", "kuromoji", "dict")
  ];

  const tried: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || tried.includes(candidate)) continue;
    tried.push(candidate);
    if (fs.existsSync(path.join(candidate, "base.dat.gz"))) {
      return candidate;
    }
  }
  throw new Error(`kuromoji dict not found. Tried: ${tried.join(" | ")}`);
}

async function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: resolveDictPath() })
        .build((error, tokenizer) => {
          if (error || !tokenizer) {
            reject(error || new Error("Failed to initialize kuromoji tokenizer"));
            return;
          }
          resolve(tokenizer);
        });
    });
  }
  return tokenizerPromise;
}

function stripRubyMarkers(text: string): string {
  return String(text || "").replace(RUBY_TOKEN_REGEX, "$1");
}

function shouldApplyRuby(surface: string, readingHiragana: string): boolean {
  if (!surface || !readingHiragana) return false;
  if (!KANJI_REGEX.test(surface)) return false;
  const normalizedSurface = toHiragana(surface, { convertLongVowelMark: true });
  const normalizedReading = toHiragana(readingHiragana, { convertLongVowelMark: true });
  return normalizedSurface !== normalizedReading;
}

async function applyFuriganaToSegment(text: string): Promise<string> {
  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(text);
  return tokens
    .map((token) => {
      const surface = String(token.surface_form || "");
      const reading = String(token.reading || "");
      if (!reading) {
        return surface;
      }
      const readingHiragana = toHiragana(reading, { convertLongVowelMark: true });
      if (!shouldApplyRuby(surface, readingHiragana)) {
        return surface;
      }
      return `[${surface}|${readingHiragana}]`;
    })
    .join("");
}

export async function generateFuriganaMarkup(inputText: string): Promise<string> {
  const source = stripRubyMarkers(String(inputText || ""));
  if (!source.trim()) {
    return "";
  }
  const parts = source.split(/(\{\{\s*[^}]+\s*\}\})/g);
  const convertedParts = await Promise.all(
    parts.map(async (part) => {
      if (!part) return part;
      if (PLACEHOLDER_REGEX.test(part)) {
        return part;
      }
      return applyFuriganaToSegment(part);
    })
  );
  return convertedParts.join("");
}
