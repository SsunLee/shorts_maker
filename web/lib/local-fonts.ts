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

export function isLocalFontAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
}

export async function queryInstalledFontNames(): Promise<string[]> {
  if (!isLocalFontAccessSupported()) {
    return [];
  }
  const records = await window.queryLocalFonts!();
  const names = new Set<string>();
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

