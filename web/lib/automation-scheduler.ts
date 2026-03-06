import {
  listEnabledAutomationScheduleUsers,
  readAutomationScheduleState,
  writeAutomationScheduleState
} from "@/lib/automation-schedule-store";
import {
  getAutomationState,
  startAutomationRun
} from "@/lib/automation-runner";
import {
  AutomationScheduleConfig,
  AutomationScheduleState
} from "@/lib/types";

const DEFAULT_CONFIG: AutomationScheduleConfig = {
  enabled: false,
  cadence: "daily",
  intervalHours: 24,
  dailyTime: "09:00",
  timeZone: "UTC",
  itemsPerRun: 1,
  uploadMode: "youtube",
  privacyStatus: "private",
  templateMode: "applied_template",
  templateId: undefined
};

declare global {
  var __shortsAutomationScheduleTimers__:
    | Record<string, ReturnType<typeof setTimeout> | undefined>
    | undefined;
  var __shortsAutomationSchedulerInitializedUsers__: Record<string, boolean> | undefined;
  var __shortsAutomationScheduleCacheByUser__: Record<string, AutomationScheduleState> | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getUserKey(userId?: string): string {
  const value = String(userId || "").trim();
  return value || "__default__";
}

function getTimerStore(): Record<string, ReturnType<typeof setTimeout> | undefined> {
  if (!globalThis.__shortsAutomationScheduleTimers__) {
    globalThis.__shortsAutomationScheduleTimers__ = {};
  }
  return globalThis.__shortsAutomationScheduleTimers__;
}

function getInitializedStore(): Record<string, boolean> {
  if (!globalThis.__shortsAutomationSchedulerInitializedUsers__) {
    globalThis.__shortsAutomationSchedulerInitializedUsers__ = {};
  }
  return globalThis.__shortsAutomationSchedulerInitializedUsers__;
}

function getScheduleCacheStore(): Record<string, AutomationScheduleState> {
  if (!globalThis.__shortsAutomationScheduleCacheByUser__) {
    globalThis.__shortsAutomationScheduleCacheByUser__ = {};
  }
  return globalThis.__shortsAutomationScheduleCacheByUser__;
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
  if (!value) {
    return DEFAULT_CONFIG.timeZone || "UTC";
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone || "UTC";
  } catch {
    return DEFAULT_CONFIG.timeZone || "UTC";
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
  // Iterative refinement for timezone offset and DST transitions.
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

function normalizeConfig(input?: Partial<AutomationScheduleConfig>): AutomationScheduleConfig {
  const templateMode =
    input?.templateMode === "none" || input?.templateMode === "latest_workflow"
      ? input.templateMode
      : "applied_template";
  return {
    enabled: Boolean(input?.enabled),
    cadence: input?.cadence === "interval_hours" ? "interval_hours" : "daily",
    intervalHours: clampInt(
      Number(input?.intervalHours),
      1,
      168,
      DEFAULT_CONFIG.intervalHours
    ),
    dailyTime: normalizeDailyTime(input?.dailyTime),
    timeZone: normalizeTimeZone(input?.timeZone),
    itemsPerRun: clampInt(Number(input?.itemsPerRun), 1, 20, DEFAULT_CONFIG.itemsPerRun),
    sheetName: input?.sheetName?.trim() || undefined,
    uploadMode: input?.uploadMode === "pre_upload" ? "pre_upload" : "youtube",
    privacyStatus:
      input?.privacyStatus === "public" || input?.privacyStatus === "unlisted"
        ? input.privacyStatus
        : "private",
    templateMode,
    templateId: templateMode === "applied_template" ? input?.templateId?.trim() || undefined : undefined
  };
}

function normalizeState(input?: Partial<AutomationScheduleState>): AutomationScheduleState {
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

function computeNextRunAt(config: AutomationScheduleConfig, from = new Date()): Date {
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
  next: AutomationScheduleState
): Promise<AutomationScheduleState> {
  const state = {
    ...next,
    updatedAt: nowIso()
  };
  const key = getUserKey(userId);
  getScheduleCacheStore()[key] = state;
  return writeAutomationScheduleState(state, userId);
}

async function getStateInternal(userId?: string): Promise<AutomationScheduleState> {
  const key = getUserKey(userId);
  const cacheStore = getScheduleCacheStore();
  if (cacheStore[key]) {
    return cacheStore[key];
  }
  const loaded = normalizeState(await readAutomationScheduleState(userId));
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
    void runScheduledTick(userId);
  }, delayMs);
}

async function runScheduledTick(userId?: string): Promise<void> {
  await runAutomationScheduleTick(userId);
}

function isScheduleDue(state: AutomationScheduleState, now = new Date()): boolean {
  const nextRun = state.nextRunAt ? new Date(state.nextRunAt) : undefined;
  if (!nextRun || !Number.isFinite(nextRun.getTime())) {
    return true;
  }
  return now.getTime() + 500 >= nextRun.getTime();
}

export async function runAutomationScheduleTick(
  userId?: string,
  options?: { force?: boolean }
): Promise<AutomationScheduleState> {
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

  const automationState = getAutomationState(userId);
  let lastResult: AutomationScheduleState["lastResult"] = "started";
  let lastError: string | undefined;
  try {
    if (automationState.phase === "running" || automationState.phase === "stopping") {
      lastResult = "skipped_running";
      lastError = "기존 자동화가 실행 중이라 이번 스케줄은 건너뛰었습니다.";
    } else {
      startAutomationRun(userId, {
        sheetName: state.config.sheetName,
        privacyStatus: state.config.privacyStatus,
        uploadMode: state.config.uploadMode,
        templateMode: state.config.templateMode,
        templateId: state.config.templateId,
        maxItems: state.config.itemsPerRun
      });
      lastResult = "started";
      lastError = undefined;
    }
  } catch (error) {
    lastResult = "failed";
    lastError = error instanceof Error ? error.message : "Failed to start scheduled automation.";
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

export async function runDueAutomationSchedules(
  options?: { force?: boolean; userIds?: string[] }
): Promise<{
  scanned: number;
  attempted: number;
  started: number;
  skippedRunning: number;
  failed: number;
  users: string[];
}> {
  const userIds = options?.userIds?.length
    ? options.userIds
    : await listEnabledAutomationScheduleUsers();

  let attempted = 0;
  let started = 0;
  let skippedRunning = 0;
  let failed = 0;
  for (const userId of userIds) {
    const state = await runAutomationScheduleTick(userId, { force: options?.force });
    const ranNow = state.lastRunAt ? Date.now() - Date.parse(state.lastRunAt) < 60_000 : false;
    if (!ranNow && !options?.force) {
      continue;
    }
    attempted += 1;
    if (state.lastResult === "started") {
      started += 1;
    } else if (state.lastResult === "skipped_running") {
      skippedRunning += 1;
    } else if (state.lastResult === "failed") {
      failed += 1;
    }
  }

  return {
    scanned: userIds.length,
    attempted,
    started,
    skippedRunning,
    failed,
    users: userIds
  };
}

export async function ensureAutomationSchedulerStarted(userId?: string): Promise<void> {
  const key = getUserKey(userId);
  const initializedStore = getInitializedStore();
  if (initializedStore[key]) {
    return;
  }
  initializedStore[key] = true;
  await getStateInternal(userId);
  if (supportsInProcessTimers()) {
    await scheduleNextTimer(userId);
  }
}

export async function getAutomationScheduleState(userId?: string): Promise<AutomationScheduleState> {
  await ensureAutomationSchedulerStarted(userId);
  return getStateInternal(userId);
}

export async function updateAutomationScheduleConfig(
  userId: string | undefined,
  patch: Partial<AutomationScheduleConfig>
): Promise<AutomationScheduleState> {
  await ensureAutomationSchedulerStarted(userId);
  const state = await getStateInternal(userId);
  const config = normalizeConfig({
    ...state.config,
    ...patch
  });
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

export async function disableAutomationSchedule(userId?: string): Promise<AutomationScheduleState> {
  return updateAutomationScheduleConfig(userId, { enabled: false });
}
