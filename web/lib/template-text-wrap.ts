function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function charVisualUnits(char: string): number {
  if (!char) {
    return 0;
  }
  if (/\s/.test(char)) {
    return 0.5;
  }

  const code = char.codePointAt(0) || 0;
  const isWide =
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x2eff) ||
    (code >= 0x2f00 && code <= 0x2fdf) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x31f0 && code <= 0x31ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff);
  if (isWide) {
    return 2;
  }

  if (code < 128) {
    if ("ilI.,'`!|:;".includes(char)) {
      return 0.5;
    }
    if ("mwMW@#%&".includes(char)) {
      return 1.1;
    }
    return 0.8;
  }

  return 1;
}

function textWrapSafetyMultiplier(text: string): number {
  if (!text) {
    return 1;
  }
  let hasDevanagari = false;
  let hasArabic = false;
  let hasEmojiOrSymbol = false;
  let hasNonAscii = false;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code > 127) {
      hasNonAscii = true;
    }
    if (code >= 0x0900 && code <= 0x097f) {
      hasDevanagari = true;
    } else if (code >= 0x0600 && code <= 0x06ff) {
      hasArabic = true;
    } else if (/\p{So}/u.test(ch)) {
      hasEmojiOrSymbol = true;
    }
  }

  if (hasDevanagari) {
    return 1.38;
  }
  if (hasArabic) {
    return 1.28;
  }
  if (hasEmojiOrSymbol) {
    return 1.22;
  }
  if (hasNonAscii) {
    return 1.08;
  }
  return 1;
}

function wrapTextByVisualWidth(text: string, maxUnits: number): string[] {
  const safeMaxUnits = Math.max(6, maxUnits);
  const wrappedLines: string[] = [];

  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      wrappedLines.push("");
      continue;
    }

    const tokens = paragraph.match(/\S+|\s+/g) || [paragraph];
    let current = "";
    let currentUnits = 0;

    const flush = (): void => {
      const line = current.replace(/\s+$/g, "");
      if (line || wrappedLines.length === 0) {
        wrappedLines.push(line);
      }
      current = "";
      currentUnits = 0;
    };

    for (const token of tokens) {
      const tokenUnits = Array.from(token).reduce((sum, ch) => sum + charVisualUnits(ch), 0);

      if (current && currentUnits + tokenUnits > safeMaxUnits) {
        flush();
      }

      if (!current && /^\s+$/.test(token)) {
        continue;
      }

      if (!/^\s+$/.test(token) && tokenUnits > safeMaxUnits) {
        for (const ch of Array.from(token)) {
          const charUnits = charVisualUnits(ch);
          if (current && currentUnits + charUnits > safeMaxUnits) {
            flush();
          }
          current += ch;
          currentUnits += charUnits;
        }
        continue;
      }

      current += token;
      currentUnits += tokenUnits;
    }

    if (current) {
      flush();
    } else if (tokens.length > 0) {
      wrappedLines.push("");
    }
  }

  return wrappedLines.length > 0 ? wrappedLines : [text];
}

export function normalizeTemplateText(value: string | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
}

export function wrapTemplateTextLikeEngine(args: {
  text: string | undefined;
  widthPercent: number;
  fontSize: number;
}): string {
  const text = normalizeTemplateText(args.text);
  if (!text.trim()) {
    return "";
  }

  const widthPercent = clampNumber(args.widthPercent, 10, 100, 60);
  const fontSize = clampNumber(args.fontSize, 12, 250, 48);
  const widthPx = 1080 * (widthPercent / 100);
  const effectiveWidthPx = widthPx * 0.94;
  const wrapMultiplier = textWrapSafetyMultiplier(text);
  const unitPx = Math.max(4, fontSize * 0.54 * wrapMultiplier);
  const maxUnits = clampNumber(effectiveWidthPx / unitPx, 6, 220, 18);

  return wrapTextByVisualWidth(text, maxUnits).join("\n");
}
