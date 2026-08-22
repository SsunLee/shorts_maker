"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AppSettings, IdeaLanguage } from "@/lib/types";

type InstagramScheduleResponse = {
  schedule?: {
    config: {
      enabled: boolean;
      cadence: "daily" | "interval_hours";
      intervalHours: number;
      dailyTime: string;
      timeZone?: string;
      itemsPerRun: number;
      sheetName?: string;
      autoIdeaEnabled: boolean;
      autoIdeaKeywords?: string;
      autoIdeaLanguage?: IdeaLanguage;
      autoUploadEnabled?: boolean;
    };
    nextRunAt?: string;
    lastRunAt?: string;
    lastResult?: "started" | "skipped_running" | "skipped_noop" | "failed";
    lastError?: string;
    updatedAt: string;
  };
  error?: string;
};

const SCHEDULE_PANEL_OPEN_KEY = "shorts-maker:instagram:schedule-panel-open:v1";

function normalizeLanguage(value: string | undefined, fallback: IdeaLanguage = "ko"): IdeaLanguage {
  if (value === "ko" || value === "en" || value === "ja" || value === "es" || value === "hi") {
    return value;
  }
  return fallback;
}

function normalizeItemsPerRun(value: string | number | undefined, fallback = "3"): string {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return String(Math.max(1, Math.min(10, numeric)));
}

function normalizeIntervalHours(value: string | number | undefined, fallback = "24"): string {
  const numeric = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return String(Math.max(1, Math.min(168, numeric)));
}

function scheduleResultLabel(
  value: "started" | "skipped_running" | "skipped_noop" | "failed" | undefined
): string {
  if (value === "started") return "실행됨";
  if (value === "skipped_running") return "실행중이라 스킵";
  if (value === "skipped_noop") return "실행 없음(작업 비활성)";
  if (value === "failed") return "실패";
  return "-";
}

/**
 * 인스타 자동화 스케줄 설정 패널.
 * 서버 Cron이 실행하는 스케줄을 켜고/끄고 조정하는 유일한 화면입니다.
 */
export function InstagramSchedulePanel(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [settingsSheetName, setSettingsSheetName] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<"daily" | "interval_hours">("daily");
  const [dailyTime, setDailyTime] = useState("09:00");
  const [everyHours, setEveryHours] = useState("24");
  const [itemsPerRun, setItemsPerRun] = useState("3");
  const [sheetName, setSheetName] = useState("");
  const [autoIdeaEnabled, setAutoIdeaEnabled] = useState(false);
  const [autoIdeaLanguage, setAutoIdeaLanguage] = useState<IdeaLanguage>("ja");
  const [autoIdeaKeywords, setAutoIdeaKeywords] = useState("");
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string>();
  const [nextRunAt, setNextRunAt] = useState<string>();
  const [lastResult, setLastResult] = useState<
    "started" | "skipped_running" | "skipped_noop" | "failed" | undefined
  >();
  const [lastError, setLastError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  function applyScheduleState(schedule: InstagramScheduleResponse["schedule"] | undefined): void {
    const config = schedule?.config;
    setEnabled(Boolean(config?.enabled));
    setCadence(config?.cadence === "interval_hours" ? "interval_hours" : "daily");
    setDailyTime(String(config?.dailyTime || "09:00"));
    setEveryHours(normalizeIntervalHours(config?.intervalHours ?? 24));
    setItemsPerRun(normalizeItemsPerRun(config?.itemsPerRun ?? 3));
    setSheetName(String(config?.sheetName || "").trim());
    setAutoIdeaEnabled(Boolean(config?.autoIdeaEnabled));
    setAutoIdeaLanguage(normalizeLanguage(config?.autoIdeaLanguage, "ja"));
    setAutoIdeaKeywords(String(config?.autoIdeaKeywords || "").trim());
    setAutoUploadEnabled(Boolean(config?.autoUploadEnabled));
    setLastRunAt(schedule?.lastRunAt);
    setNextRunAt(schedule?.nextRunAt);
    setLastResult(schedule?.lastResult);
    setLastError(schedule?.lastError);
    setUpdatedAt(schedule?.updatedAt);
  }

  async function refreshSchedule(showBusy = false): Promise<void> {
    if (showBusy) {
      setBusy(true);
    }
    try {
      setError(undefined);
      const response = await fetch("/api/instagram/automation/schedule", { cache: "no-store" });
      const data = (await response.json()) as InstagramScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 자동화 스케줄을 불러오지 못했습니다.");
      }
      applyScheduleState(data.schedule);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "인스타 자동화 스케줄을 불러오지 못했습니다."
      );
    } finally {
      if (showBusy) {
        setBusy(false);
      }
    }
  }

  async function saveSchedule(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch("/api/instagram/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          cadence,
          dailyTime,
          intervalHours: Number.parseInt(everyHours, 10) || 24,
          itemsPerRun: Number.parseInt(itemsPerRun, 10) || 3,
          sheetName: String(sheetName || settingsSheetName || "").trim() || undefined,
          autoIdeaEnabled,
          autoIdeaKeywords: String(autoIdeaKeywords || "").trim(),
          autoIdeaLanguage,
          autoUploadEnabled
        })
      });
      const data = (await response.json()) as InstagramScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 자동화 스케줄 저장에 실패했습니다.");
      }
      applyScheduleState(data.schedule);
      setMessage("스케줄을 저장했습니다.");
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "인스타 자동화 스케줄 저장에 실패했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  async function runScheduleNow(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch("/api/instagram/automation/schedule/run", {
        method: "POST"
      });
      const data = (await response.json()) as InstagramScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 자동화 스케줄 즉시 실행에 실패했습니다.");
      }
      if (!data.schedule?.config?.enabled) {
        throw new Error("스케줄이 비활성화 상태입니다. 먼저 스케줄을 저장해 주세요.");
      }
      applyScheduleState(data.schedule);
      setMessage(`스케줄 즉시 실행 완료 · ${scheduleResultLabel(data.schedule?.lastResult)}`);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "인스타 자동화 스케줄 즉시 실행에 실패했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOpen(window.localStorage.getItem(SCHEDULE_PANEL_OPEN_KEY) === "1");
    }
    void (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (response.ok) {
          const settings = (await response.json()) as AppSettings;
          setSettingsSheetName(
            String(settings.gsheetInstagramSheetName || "").trim() ||
              String(settings.gsheetSheetName || "").trim()
          );
        }
      } catch {
        // 설정 조회 실패는 스케줄 조회를 막지 않습니다.
      }
      await refreshSchedule(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleOpen(): void {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SCHEDULE_PANEL_OPEN_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">인스타 자동화 스케줄</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? `사용 중 · 다음 실행 ${nextRunAt ? new Date(nextRunAt).toLocaleString() : "-"}`
              : "사용 안 함"}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={toggleOpen}>
          {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
          {open ? "접기" : "펼치기"}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>활성화</Label>
              <div className="flex h-10 items-center rounded-md border px-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>주기</Label>
              <Select
                value={cadence}
                onValueChange={(value) => setCadence(value === "interval_hours" ? "interval_hours" : "daily")}
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">daily</SelectItem>
                  <SelectItem value="interval_hours">interval_hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>매일 실행 시각</Label>
              <Input
                type="time"
                value={dailyTime}
                onChange={(event) => setDailyTime(event.target.value)}
                disabled={cadence !== "daily"}
              />
            </div>
            <div className="space-y-1">
              <Label>간격(시간)</Label>
              <Input
                value={everyHours}
                onChange={(event) => setEveryHours(normalizeIntervalHours(event.target.value))}
                disabled={cadence !== "interval_hours"}
              />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>처리할 row 수</Label>
              <Select value={normalizeItemsPerRun(itemsPerRun)} onValueChange={setItemsPerRun}>
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                    <SelectItem key={`ig-schedule-items-${value}`} value={value}>
                      {value}개
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>스케줄 대상 시트</Label>
              <Input
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
                placeholder={settingsSheetName || "예: insta_post"}
              />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">스케줄 자동 아이디어 생성</p>
              <Switch checked={autoIdeaEnabled} onCheckedChange={setAutoIdeaEnabled} />
            </div>
            <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-1">
                <Label>아이디어 언어</Label>
                <Select
                  value={autoIdeaLanguage}
                  onValueChange={(value) => setAutoIdeaLanguage(normalizeLanguage(value, "ja"))}
                >
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>키워드 목록(줄바꿈/쉼표)</Label>
                <Textarea
                  value={autoIdeaKeywords}
                  onChange={(event) => setAutoIdeaKeywords(event.target.value)}
                  rows={3}
                  placeholder={"예) JLPT N5 동사\n과거 부정형\n일상 회화"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">스케줄 Meta 자동 업로드</p>
              <Switch checked={autoUploadEnabled} onCheckedChange={setAutoUploadEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              켜면 스케줄 실행 시 활성 템플릿 기준으로 준비 row를 렌더링한 뒤 Meta 업로드까지 수행합니다.
            </p>
          </div>

          <div className="rounded-md border p-2 text-xs text-muted-foreground">
            <p>다음 실행: {nextRunAt ? new Date(nextRunAt).toLocaleString() : "-"}</p>
            <p>최근 실행: {lastRunAt ? new Date(lastRunAt).toLocaleString() : "-"}</p>
            <p>최근 결과: {scheduleResultLabel(lastResult)}</p>
            <p>마지막 저장: {updatedAt ? new Date(updatedAt).toLocaleString() : "-"}</p>
            {lastError ? <p className="mt-1 text-destructive">최근 오류: {lastError}</p> : null}
            <p className="mt-1">스케줄은 서버 Cron으로 동작합니다. 브라우저 탭 유지가 필요 없습니다.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveSchedule()} disabled={busy}>
              스케줄 저장
            </Button>
            <Button type="button" variant="outline" onClick={() => void runScheduleNow()} disabled={busy}>
              지금 실행(테스트)
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshSchedule(true)} disabled={busy}>
              스케줄 새로고침
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-500">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
