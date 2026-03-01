import {
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
  const candidate = new Date(from);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
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
  const state = await getStateInternal(userId);
  if (!state.config.enabled) {
    return;
  }

  const now = new Date();
  const nextRun = state.nextRunAt ? new Date(state.nextRunAt) : undefined;
  if (nextRun && Number.isFinite(nextRun.getTime()) && now.getTime() + 500 < nextRun.getTime()) {
    await scheduleNextTimer(userId);
    return;
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

  const nextRunAt = computeNextRunAt(state.config, now).toISOString();
  await persistState(userId, {
    ...state,
    lastRunAt: now.toISOString(),
    lastResult,
    lastError,
    nextRunAt
  });
  await scheduleNextTimer(userId);
}

export async function ensureAutomationSchedulerStarted(userId?: string): Promise<void> {
  const key = getUserKey(userId);
  const initializedStore = getInitializedStore();
  if (initializedStore[key]) {
    return;
  }
  initializedStore[key] = true;
  await getStateInternal(userId);
  await scheduleNextTimer(userId);
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
  await scheduleNextTimer(userId);
  return next;
}

export async function disableAutomationSchedule(userId?: string): Promise<AutomationScheduleState> {
  return updateAutomationScheduleConfig(userId, { enabled: false });
}
