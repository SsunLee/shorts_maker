interface LocalFontRecord {
  family?: string;
  fullName?: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontRecord[]>;
  }
}

function normalizeName(value: string): string {
  return String(value || "").trim();
}

function isLikelyLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function queryFontNamesFromLocalApi(): Promise<string[]> {
  if (typeof window === "undefined" || !isLikelyLocalhost()) {
    return [];
  }
  const response = await fetch("/api/local-fonts", { cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { fonts?: string[] };
  if (!Array.isArray(data.fonts)) {
    return [];
  }
  return data.fonts.map((item) => normalizeName(String(item || ""))).filter(Boolean);
}

export function isLocalFontAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
}

export async function queryInstalledFontNames(): Promise<string[]> {
  // On localhost, use only server-side font discovery (registry/filesystem).
  // Browser Local Font Access may return mojibake for some CJK families.
  if (isLikelyLocalhost()) {
    const localApiNames = await queryFontNamesFromLocalApi();
    return Array.from(new Set(localApiNames)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  const names = new Set<string>();
  if (isLocalFontAccessSupported()) {
    try {
      const records = await window.queryLocalFonts!();
      for (const record of records) {
        const family = normalizeName(record.family || "");
        const fullName = normalizeName(record.fullName || "");
        if (family) {
          names.add(family);
        }
        if (fullName) {
          names.add(fullName);
        }
      }
    } catch {
      // Ignore permission/runtime issues.
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function mergeFontOptions(base: string[], extra: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const append = (name: string): void => {
    const normalized = normalizeName(name);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(normalized);
  };
  base.forEach(append);
  extra.forEach(append);
  return merged;
}
