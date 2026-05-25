"use client";

import type { AppSettings } from "@/lib/types";

const INSTAGRAM_LAST_SHEET_NAME_KEY = "shorts-maker:instagram:last-sheet-name:v1";

export function resolveInstagramSettingsSheetName(settings: Pick<AppSettings, "gsheetInstagramSheetName" | "gsheetSheetName">): string {
  return String(settings.gsheetInstagramSheetName || "").trim() || String(settings.gsheetSheetName || "").trim();
}

export function readInstagramLastSheetName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return String(window.localStorage.getItem(INSTAGRAM_LAST_SHEET_NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function saveInstagramLastSheetName(value: string): string {
  const normalized = String(value || "").trim();
  if (typeof window === "undefined") {
    return normalized;
  }
  try {
    if (normalized) {
      window.localStorage.setItem(INSTAGRAM_LAST_SHEET_NAME_KEY, normalized);
    } else {
      window.localStorage.removeItem(INSTAGRAM_LAST_SHEET_NAME_KEY);
    }
  } catch {
    // localStorage가 차단된 환경에서는 현재 세션 상태만 유지합니다.
  }
  return normalized;
}

export function resolveInstagramPreferredSheetName(settingsSheetName: string, currentSheetName = ""): string {
  return readInstagramLastSheetName() || String(currentSheetName || "").trim() || String(settingsSheetName || "").trim();
}
