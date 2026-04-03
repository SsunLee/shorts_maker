import {
  listEnabledInstagramScheduleUsers,
  readInstagramAutomationScheduleState,
  writeInstagramAutomationScheduleState
} from "@/lib/instagram-automation-schedule-store";
import type {
  InstagramAutomationScheduleConfig,
  InstagramAutomationScheduleState
} from "@/lib/instagram-automation-types";
import type { IdeaLanguage } from "@/lib/types";
import { getSettings } from "@/lib/settings-store";
import { loadIdeasSheetTable } from "@/lib/ideas-sheet";
import {
  extractPromptVariables,
  INSTAGRAM_IDEA_DEFAULT_PROMPT,
  renderPromptTemplate
} from "@/lib/instagram-ideas-prompt";
import { generateInstagramIdeaRows } from "@/lib/instagram-ideas-generator";
import { appendInstagramIdeasToSheet } from "@/lib/instagram-sheet";

const DEFAULT_CONFIG: InstagramAutomationScheduleConfig = {
  enabled: false,
  cadence: "daily",
  intervalHours: 24,
  dailyTime: "09:00",
  timeZone: "Asia/Seoul",
  itemsPerRun: 3,
  autoIdeaEnabled: false,
  autoIdeaKeywords: "",
  autoIdeaLanguage: "ja"
};

declare global {
  var __shortsInstagramAutomationScheduleTimers__:
    | Record<string, ReturnType<typeof setTimeout> | undefined>
    | undefined;
  var __shortsInstagramAutomationScheduleInitializedUsers__:
    | Record<string, boolean>
    | undefined;
  var __shortsInstagramAutomationScheduleCacheByUser__:
    | Record<string, InstagramAutomationScheduleState>
    | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getUserKey(userId?: string): string {
  const value = String(userId || "").trim();
  return value || "__default__";
}

function getTimerStore(): Record<string, ReturnType<typeof setTimeout> | undefined> {
  if (!globalThis.__shortsInstagramAutomationScheduleTimers__) {
    globalThis.__shortsInstagramAutomationScheduleTimers__ = {};
  }
  return globalThis.__shortsInstagramAutomationScheduleTimers__;
}

function getInitializedStore(): Record<string, boolean> {
  if (!globalThis.__shortsInstagramAutomationScheduleInitializedUsers__) {
    globalThis.__shortsInstagramAutomationScheduleInitializedUsers__ = {};
  }
  return globalThis.__shortsInstagramAutomationScheduleInitializedUsers__;
}

function getScheduleCacheStore(): Record<string, InstagramAutomationScheduleState> {
  if (!globalThis.__shortsInstagramAutomationScheduleCacheByUser__) {
    globalThis.__shortsInstagramAutomationScheduleCacheByUser__ = {};
  }
  return globalThis.__shortsInstagramAutomationScheduleCacheByUser__;
}

function supportsInProcessTimers(): boolean {
  return !(
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NEXT_RUNTIME === "edge"
  );
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeDailyTime(raw: string | undefined): string {
  const value = String(raw || "").trim();
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return DEFAULT_CONFIG.dailyTime;
  }
  const [h, m] = value.split(":").map((item) => Number.parseInt(item, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return DEFAULT_CONFIG.dailyTime;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTimeZone(raw: string | undefined): string {
  const value = String(raw || "").trim();
  if (!value || value.toUpperCase() === "UTC") {
    return DEFAULT_CONFIG.timeZone || "Asia/Seoul";
  }
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone ||
      "Asia/Seoul"
    );
  } catch {
    return DEFAULT_CONFIG.timeZone || "Asia/Seoul";
  }
}

function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string): number =>
    Number.parseInt(parts.find((item) => item.type === type)?.value || "0", 10);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second")
  };
}

function zonedDateTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}): Date {
  let guess = new Date(
    Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, args.second || 0, 0)
  );
  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(guess, args.timeZone);
    const desiredAsUtc = Date.UTC(
      args.year,
      args.month - 1,
      args.day,
      args.hour,
      args.minute,
      args.second || 0,
      0
    );
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const deltaMs = desiredAsUtc - actualAsUtc;
    if (Math.abs(deltaMs) < 1000) {
      break;
    }
    guess = new Date(guess.getTime() + deltaMs);
  }
  return guess;
}

function normalizeLanguage(raw: string | undefined): IdeaLanguage {
  if (raw === "ko" || raw === "en" || raw === "ja" || raw === "es" || raw === "hi") {
    return raw;
  }
  return "ja";
}

function normalizeConfig(
  input?: Partial<InstagramAutomationScheduleConfig>
): InstagramAutomationScheduleConfig {
  return {
    enabled: Boolean(input?.enabled),
    cadence: input?.cadence === "interval_hours" ? "interval_hours" : "daily",
    intervalHours: clampInt(Number(input?.intervalHours), 1, 168, DEFAULT_CONFIG.intervalHours),
    dailyTime: normalizeDailyTime(input?.dailyTime),
    timeZone: normalizeTimeZone(input?.timeZone),
    itemsPerRun: clampInt(Number(input?.itemsPerRun), 1, 10, DEFAULT_CONFIG.itemsPerRun),
    sheetName: String(input?.sheetName || "").trim() || undefined,
    autoIdeaEnabled: Boolean(input?.autoIdeaEnabled),
    autoIdeaKeywords: String(input?.autoIdeaKeywords || "").trim(),
    autoIdeaLanguage: normalizeLanguage(input?.autoIdeaLanguage)
  };
}

function normalizeState(input?: Partial<InstagramAutomationScheduleState>): InstagramAutomationScheduleState {
  return {
    config: normalizeConfig(input?.config),
    nextRunAt:
      typeof input?.nextRunAt === "string" && Number.isFinite(Date.parse(input.nextRunAt))
        ? input.nextRunAt
        : undefined,
    lastRunAt:
      typeof input?.lastRunAt === "string" && Number.isFinite(Date.parse(input.lastRunAt))
        ? input.lastRunAt
        : undefined,
    lastResult:
      input?.lastResult === "started" ||
      input?.lastResult === "skipped_running" ||
      input?.lastResult === "failed"
        ? input.lastResult
        : undefined,
    lastError: typeof input?.lastError === "string" ? input.lastError : undefined,
    updatedAt:
      typeof input?.updatedAt === "string" && Number.isFinite(Date.parse(input.updatedAt))
        ? input.updatedAt
        : nowIso()
  };
}

function computeNextRunAt(config: InstagramAutomationScheduleConfig, from = new Date()): Date {
  if (config.cadence === "interval_hours") {
    return new Date(from.getTime() + config.intervalHours * 60 * 60 * 1000);
  }
  const [hour, minute] = normalizeDailyTime(config.dailyTime)
    .split(":")
    .map((item) => Number.parseInt(item, 10));
  const timeZone = normalizeTimeZone(config.timeZone);
  const nowLocal = getZonedParts(from, timeZone);
  const todayCandidate = zonedDateTimeToUtc({
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
    hour,
    minute,
    second: 0,
    timeZone
  });
  if (todayCandidate.getTime() > from.getTime()) {
    return todayCandidate;
  }
  const nextDayUtcAnchor = new Date(
    Date.UTC(nowLocal.year, nowLocal.month - 1, nowLocal.day, 12, 0, 0, 0) + 24 * 60 * 60 * 1000
  );
  const nextDayLocal = getZonedParts(nextDayUtcAnchor, timeZone);
  return zonedDateTimeToUtc({
    year: nextDayLocal.year,
    month: nextDayLocal.month,
    day: nextDayLocal.day,
    hour,
    minute,
    second: 0,
    timeZone
  });
}

async function persistState(
  userId: string | undefined,
  next: InstagramAutomationScheduleState
): Promise<InstagramAutomationScheduleState> {
  const state = {
    ...next,
    updatedAt: nowIso()
  };
  const key = getUserKey(userId);
  getScheduleCacheStore()[key] = state;
  return writeInstagramAutomationScheduleState(state, userId);
}

async function getStateInternal(userId?: string): Promise<InstagramAutomationScheduleState> {
  const key = getUserKey(userId);
  const cacheStore = getScheduleCacheStore();
  if (cacheStore[key]) {
    return cacheStore[key];
  }
  const loaded = normalizeState(await readInstagramAutomationScheduleState(userId));
  cacheStore[key] = loaded;
  return loaded;
}

function clearTimer(userId?: string): void {
  const key = getUserKey(userId);
  const timerStore = getTimerStore();
  if (timerStore[key]) {
    clearTimeout(timerStore[key]);
    delete timerStore[key];
  }
}

async function scheduleNextTimer(userId?: string): Promise<void> {
  if (!supportsInProcessTimers()) {
    return;
  }
  clearTimer(userId);
  const state = await getStateInternal(userId);
  if (!state.config.enabled) {
    return;
  }

  let nextRunAt = state.nextRunAt ? new Date(state.nextRunAt) : undefined;
  const now = new Date();
  if (!nextRunAt || !Number.isFinite(nextRunAt.getTime()) || nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = computeNextRunAt(state.config, now);
    await persistState(userId, {
      ...state,
      nextRunAt: nextRunAt.toISOString()
    });
  }

  const delayMs = Math.max(1000, nextRunAt.getTime() - now.getTime());
  const key = getUserKey(userId);
  getTimerStore()[key] = setTimeout(() => {
    void runInstagramAutomationScheduleTick(userId);
  }, delayMs);
}

function isScheduleDue(state: InstagramAutomationScheduleState, now = new Date()): boolean {
  const nextRun = state.nextRunAt ? new Date(state.nextRunAt) : undefined;
  if (!nextRun || !Number.isFinite(nextRun.getTime())) {
    return true;
  }
  return now.getTime() + 500 >= nextRun.getTime();
}

function normalizeExpression(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function parseKeywordList(raw: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  String(raw || "")
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      output.push(value);
    });
  return output;
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeIdBase(raw: string | undefined): string {
  const text = String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
  return text || "idea";
}

function buildIdeaId(base: string, seq: number): string {
  return `${base}-${String(seq).padStart(3, "0")}`;
}

function resolveNextSequence(base: string, existingIds: string[]): number {
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  let max = 0;
  existingIds.forEach((id) => {
    const match = String(id || "").trim().match(pattern);
    if (!match) return;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  });
  return max + 1;
}

function attachIdeaIds(args: {
  rows: Array<Record<string, string>>;
  idBase: string;
  existingIds: string[];
}): Array<Record<string, string>> {
  const usedIds = new Set(args.existingIds.map((value) => value.trim().toLowerCase()).filter(Boolean));
  let seq = resolveNextSequence(args.idBase, args.existingIds);
  return args.rows.map((row) => {
    const preferred = String(row.id || "").trim();
    if (preferred && !usedIds.has(preferred.toLowerCase())) {
      usedIds.add(preferred.toLowerCase());
      return {
        ...row,
        id: preferred
      };
    }
    let next = buildIdeaId(args.idBase, seq);
    seq += 1;
    while (usedIds.has(next.toLowerCase())) {
      next = buildIdeaId(args.idBase, seq);
      seq += 1;
    }
    usedIds.add(next.toLowerCase());
    return {
      ...row,
      id: next
    };
  });
}

function buildPrompt(args: {
  template: string;
  topic: string;
  count: number;
  language: IdeaLanguage;
  variables?: Record<string, string>;
}): string {
  const requiredFields =
    "id, status, type, jlpt, Subject, kr_intonation, romaji_intonation, kr_mean, " +
    "example_1_title, example_1_hira, example_1_romaji, example_1_mean, example_1_kanji, " +
    "example_2_title, example_2_hira, example_2_romaji, example_2_mean, example_2_kanji, Caption";
  const variableMap: Record<string, string | number | undefined> = {
    ...args.variables,
    cnt: String(args.count),
    topic: args.topic,
    language: args.language
  };
  const rendered = renderPromptTemplate(args.template, variableMap).trim();
  const unresolved = extractPromptVariables(rendered);
  const unresolvedNote =
    unresolved.length > 0
      ? `\n\n[주의] 아래 변수는 값이 비어 있었습니다: ${unresolved.join(", ")}\n비어 있는 경우에도 JSON 구조는 반드시 유지하세요.`
      : "";

  return (
    `${rendered}\n\n` +
    `[사용자 요청]\n` +
    `- topic: ${args.topic}\n` +
    `- language: ${args.language}\n` +
    `- count: ${args.count}\n` +
    `- 각 object는 다음 필드를 모두 포함: ${requiredFields}\n` +
    `- status는 반드시 "준비"\n` +
    `- type은 문법/표현 유형 문자열(예: 과거부정형)\n` +
    `- 출력은 JSON 배열만 허용\n` +
    unresolvedNote
  );
}

function pickFirst(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalized = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const foundKey = Object.keys(row).find(
      (item) => item.trim().toLowerCase().replace(/[\s_-]+/g, "") === normalized
    );
    if (!foundKey) continue;
    const value = String(row[foundKey] || "").trim();
    if (value) return value;
  }
  return "";
}

async function runInstagramAutoIdeaGeneration(
  userId: string,
  config: InstagramAutomationScheduleConfig
): Promise<{ inserted: number; attempts: number }> {
  if (!config.autoIdeaEnabled) {
    return { inserted: 0, attempts: 0 };
  }
  const keywords = parseKeywordList(config.autoIdeaKeywords || "");
  if (keywords.length === 0) {
    throw new Error("인스타 자동 아이디어 생성이 켜져 있지만 키워드가 비어 있습니다.");
  }

  const settings = await getSettings(userId);
  const resolvedSheetName =
    String(config.sheetName || "").trim() ||
    String(settings.gsheetInstagramSheetName || "").trim() ||
    String(settings.gsheetSheetName || "").trim() ||
    undefined;
  if (!resolvedSheetName) {
    throw new Error("인스타 시트 탭명을 찾을 수 없습니다. Settings를 확인해 주세요.");
  }

  const promptTemplate = String(settings.instagramIdeaPromptTemplate || "").trim() || INSTAGRAM_IDEA_DEFAULT_PROMPT;
  const language = normalizeLanguage(config.autoIdeaLanguage);
  const targetCount = Math.max(1, Math.min(10, Number(config.itemsPerRun) || 3));

  const sheetTable = await loadIdeasSheetTable(resolvedSheetName, userId);
  const existingIds = (sheetTable.rows || [])
    .map((row) => pickFirst(row, ["id", "row_id", "rowid"]))
    .filter(Boolean);
  const existingSubjects = new Set<string>();
  (sheetTable.rows || []).forEach((row) => {
    const key = normalizeExpression(pickFirst(row, ["subject", "Subject", "kr_intonation", "example_1_title"]));
    if (key) existingSubjects.add(key);
  });

  let insertedTotal = 0;
  let attempts = 0;
  const maxAttempts = Math.max(6, keywords.length * 4);

  while (insertedTotal < targetCount && attempts < maxAttempts) {
    const keyword = keywords[attempts % keywords.length];
    const remaining = Math.max(1, targetCount - insertedTotal);
    const batchCount = Math.min(5, remaining);
    attempts += 1;

    const prompt = buildPrompt({
      template: promptTemplate,
      topic: keyword,
      count: batchCount,
      language
    });
    const generated = await generateInstagramIdeaRows({
      prompt,
      count: batchCount,
      language,
      userId
    });

    const itemsWithIds = attachIdeaIds({
      rows: generated.rows,
      idBase: normalizeIdBase(keyword),
      existingIds
    });
    itemsWithIds.forEach((item) => {
      if (item.id) {
        existingIds.push(String(item.id).trim());
      }
    });

    const deduped = itemsWithIds.filter((item) => {
      const subject = pickFirst(item, ["subject", "Subject", "kr_intonation", "example_1_title"]);
      const key = normalizeExpression(subject);
      if (!key) return false;
      if (existingSubjects.has(key)) return false;
      existingSubjects.add(key);
      return true;
    });

    if (deduped.length === 0) {
      continue;
    }

    const appended = await appendInstagramIdeasToSheet({
      sheetName: resolvedSheetName,
      userId,
      items: deduped
    });
    insertedTotal += Number(appended.inserted || 0);
  }

  return { inserted: insertedTotal, attempts };
}

export async function runInstagramAutomationScheduleTick(
  userId?: string,
  options?: { force?: boolean }
): Promise<InstagramAutomationScheduleState> {
  const state = await getStateInternal(userId);
  if (!state.config.enabled) {
    return state;
  }

  const now = new Date();
  const force = Boolean(options?.force);
  if (!force && !isScheduleDue(state, now)) {
    if (supportsInProcessTimers()) {
      await scheduleNextTimer(userId);
    }
    return state;
  }

  let lastResult: InstagramAutomationScheduleState["lastResult"] = "started";
  let lastError: string | undefined;
  try {
    if (state.config.autoIdeaEnabled) {
      const actorUserId = String(userId || "").trim();
      if (!actorUserId) {
        throw new Error("스케줄 실행 사용자 정보를 찾을 수 없습니다.");
      }
      await runInstagramAutoIdeaGeneration(actorUserId, state.config);
    }
    lastResult = "started";
    lastError = undefined;
  } catch (error) {
    lastResult = "failed";
    lastError = error instanceof Error ? error.message : "인스타 자동화 스케줄 실행 실패";
  }

  const nextState = await persistState(userId, {
    ...state,
    lastRunAt: now.toISOString(),
    lastResult,
    lastError,
    nextRunAt: computeNextRunAt(state.config, now).toISOString()
  });
  if (supportsInProcessTimers()) {
    await scheduleNextTimer(userId);
  }
  return nextState;
}

export async function runDueInstagramAutomationSchedules(options?: {
  force?: boolean;
  userIds?: string[];
}): Promise<{
  scanned: number;
  attempted: number;
  started: number;
  failed: number;
  users: string[];
}> {
  const userIds = options?.userIds?.length ? options.userIds : await listEnabledInstagramScheduleUsers();
  let attempted = 0;
  let started = 0;
  let failed = 0;

  for (const userId of userIds) {
    const state = await runInstagramAutomationScheduleTick(userId, {
      force: options?.force
    });
    const ranNow = state.lastRunAt ? Date.now() - Date.parse(state.lastRunAt) < 60_000 : false;
    if (!ranNow && !options?.force) {
      continue;
    }
    attempted += 1;
    if (state.lastResult === "failed") {
      failed += 1;
    } else {
      started += 1;
    }
  }

  return {
    scanned: userIds.length,
    attempted,
    started,
    failed,
    users: userIds
  };
}

export async function ensureInstagramAutomationSchedulerStarted(userId?: string): Promise<void> {
  const key = getUserKey(userId);
  const initialized = getInitializedStore();
  if (initialized[key]) {
    return;
  }
  initialized[key] = true;
  await getStateInternal(userId);
  if (supportsInProcessTimers()) {
    await scheduleNextTimer(userId);
  }
}

export async function getInstagramAutomationScheduleState(
  userId?: string
): Promise<InstagramAutomationScheduleState> {
  await ensureInstagramAutomationSchedulerStarted(userId);
  return getStateInternal(userId);
}

export async function updateInstagramAutomationScheduleConfig(
  userId: string | undefined,
  patch: Partial<InstagramAutomationScheduleConfig>
): Promise<InstagramAutomationScheduleState> {
  await ensureInstagramAutomationSchedulerStarted(userId);
  const state = await getStateInternal(userId);
  const config = normalizeConfig({
    ...state.config,
    ...patch
  });
  if (config.enabled && config.autoIdeaEnabled && !String(config.autoIdeaKeywords || "").trim()) {
    throw new Error("자동 아이디어 키워드를 입력해 주세요.");
  }
  const nextRunAt = config.enabled ? computeNextRunAt(config, new Date()).toISOString() : undefined;
  const next = await persistState(userId, {
    ...state,
    config,
    nextRunAt,
    lastError: undefined
  });
  if (supportsInProcessTimers()) {
    await scheduleNextTimer(userId);
  }
  return next;
}

export async function disableInstagramAutomationSchedule(
  userId?: string
): Promise<InstagramAutomationScheduleState> {
  return updateInstagramAutomationScheduleConfig(userId, { enabled: false });
}

