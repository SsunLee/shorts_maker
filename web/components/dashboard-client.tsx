"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VideoList } from "@/components/video-list";
import { AutomationRunState, AutomationScheduleState, VideoRow } from "@/lib/types";

interface RowsResponse {
  rows: VideoRow[];
}

interface AutomationResponse {
  state: AutomationRunState;
  error?: string;
}

interface AutomationScheduleResponse {
  schedule: AutomationScheduleState;
  error?: string;
}

function phaseLabel(phase: AutomationRunState["phase"] | undefined): string {
  if (phase === "running") {
    return "실행 중";
  }
  if (phase === "stopping") {
    return "중지 중";
  }
  if (phase === "completed") {
    return "완료";
  }
  if (phase === "failed") {
    return "실패";
  }
  return "대기";
}

function scheduleResultLabel(result: AutomationScheduleState["lastResult"] | undefined): string {
  if (result === "started") {
    return "실행 시작";
  }
  if (result === "skipped_running") {
    return "실행중이라 스킵";
  }
  if (result === "failed") {
    return "시작 실패";
  }
  return "-";
}

export function DashboardClient(): React.JSX.Element {
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [automation, setAutomation] = useState<AutomationRunState>();
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationSheetName, setAutomationSheetName] = useState("");
  const [automationUploadMode, setAutomationUploadMode] = useState<"youtube" | "pre_upload">(
    "youtube"
  );
  const [automationPrivacyStatus, setAutomationPrivacyStatus] = useState<
    "private" | "public" | "unlisted"
  >("private");
  const [automationError, setAutomationError] = useState<string>();
  const [schedule, setSchedule] = useState<AutomationScheduleState>();
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string>();
  const [scheduleDraftDirty, setScheduleDraftDirty] = useState(false);
  const scheduleDraftDirtyRef = useRef(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState<"interval_hours" | "daily">("daily");
  const [scheduleIntervalHours, setScheduleIntervalHours] = useState("24");
  const [scheduleDailyTime, setScheduleDailyTime] = useState("09:00");
  const [scheduleItemsPerRun, setScheduleItemsPerRun] = useState("1");
  const [scheduleSheetName, setScheduleSheetName] = useState("");
  const [scheduleUploadMode, setScheduleUploadMode] = useState<"youtube" | "pre_upload">("youtube");
  const [schedulePrivacyStatus, setSchedulePrivacyStatus] = useState<
    "private" | "public" | "unlisted"
  >("private");

  function hydrateScheduleForm(next: AutomationScheduleState): void {
    setScheduleEnabled(next.config.enabled);
    setScheduleCadence(next.config.cadence);
    setScheduleIntervalHours(String(next.config.intervalHours));
    setScheduleDailyTime(next.config.dailyTime);
    setScheduleItemsPerRun(String(next.config.itemsPerRun));
    setScheduleSheetName(next.config.sheetName || "");
    setScheduleUploadMode(next.config.uploadMode);
    setSchedulePrivacyStatus(next.config.privacyStatus);
    setScheduleDraftDirty(false);
  }

  useEffect(() => {
    scheduleDraftDirtyRef.current = scheduleDraftDirty;
  }, [scheduleDraftDirty]);

  async function refreshAutomation(): Promise<void> {
    const response = await fetch("/api/automation", { cache: "no-store" });
    const data = (await response.json()) as AutomationResponse;
    if (!response.ok) {
      throw new Error(data.error || "Failed to load automation status.");
    }
    setAutomation(data.state);
  }

  const refreshSchedule = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/automation/schedule", { cache: "no-store" });
    const data = (await response.json()) as AutomationScheduleResponse;
    if (!response.ok) {
      throw new Error(data.error || "Failed to load automation schedule.");
    }
    setSchedule(data.schedule);
    if (!scheduleDraftDirtyRef.current) {
      hydrateScheduleForm(data.schedule);
    }
  }, []);

  async function refresh(): Promise<void> {
    const response = await fetch("/api/rows", { cache: "no-store" });
    const data = (await response.json()) as RowsResponse;
    if (!response.ok) {
      throw new Error("Failed to load rows.");
    }
    setRows(data.rows);
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await Promise.all([refresh(), refreshAutomation(), refreshSchedule()]);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void load();

    const interval = setInterval(() => {
      void refresh();
      void refreshAutomation().catch(() => {
        // Keep dashboard polling resilient even if automation endpoint is temporarily unavailable.
      });
      void refreshSchedule().catch(() => {
        // Keep dashboard polling resilient even if schedule endpoint is temporarily unavailable.
      });
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refreshSchedule]);

  async function saveSchedule(): Promise<void> {
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const response = await fetch("/api/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scheduleEnabled,
          cadence: scheduleCadence,
          intervalHours: Number.parseInt(scheduleIntervalHours, 10) || 24,
          dailyTime: scheduleDailyTime || "09:00",
          itemsPerRun: Number.parseInt(scheduleItemsPerRun, 10) || 1,
          sheetName: scheduleSheetName.trim() || undefined,
          uploadMode: scheduleUploadMode,
          privacyStatus: schedulePrivacyStatus
        })
      });
      const data = (await response.json()) as AutomationScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to save schedule.");
      }
      setSchedule(data.schedule);
      hydrateScheduleForm(data.schedule);
    } catch (saveError) {
      setScheduleError(saveError instanceof Error ? saveError.message : "Unknown error");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function disableSchedule(): Promise<void> {
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const response = await fetch("/api/automation/schedule", {
        method: "DELETE"
      });
      const data = (await response.json()) as AutomationScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to disable schedule.");
      }
      setSchedule(data.schedule);
      hydrateScheduleForm(data.schedule);
    } catch (disableError) {
      setScheduleError(disableError instanceof Error ? disableError.message : "Unknown error");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function startAutomation(): Promise<void> {
    setAutomationBusy(true);
    setAutomationError(undefined);
    try {
      const response = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: automationSheetName.trim() || undefined,
          privacyStatus: automationPrivacyStatus,
          uploadMode: automationUploadMode
        })
      });
      const data = (await response.json()) as AutomationResponse;
      if (!response.ok) {
        throw new Error(data.error || "Automation start failed.");
      }
      setAutomation(data.state);
      await refresh();
    } catch (startError) {
      setAutomationError(startError instanceof Error ? startError.message : "Unknown error");
    } finally {
      setAutomationBusy(false);
    }
  }

  async function stopAutomation(): Promise<void> {
    setAutomationBusy(true);
    setAutomationError(undefined);
    try {
      const response = await fetch("/api/automation", {
        method: "DELETE"
      });
      const data = (await response.json()) as AutomationResponse;
      if (!response.ok) {
        throw new Error(data.error || "Automation stop failed.");
      }
      setAutomation(data.state);
    } catch (stopError) {
      setAutomationError(stopError instanceof Error ? stopError.message : "Unknown error");
    } finally {
      setAutomationBusy(false);
    }
  }

  async function regenerate(row: VideoRow): Promise<void> {
    await fetch("/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        title: row.title,
        topic: row.topic,
        narration: row.narration,
        imageStyle: row.imageStyle || "Cinematic photo-real",
        voice: row.voice || "alloy",
        useSfx: row.useSfx ?? true,
        videoLengthSec: row.videoLengthSec || 30,
        tags: row.tags
      })
    });
    await refresh();
  }

  async function upload(
    row: VideoRow,
    payload: {
      title: string;
      description: string;
      tags: string[];
      privacyStatus: "private" | "public" | "unlisted";
    }
  ): Promise<void> {
    const response = await fetch("/api/upload-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        videoUrl: row.videoUrl,
        ...payload
      })
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || "Upload failed.");
    }

    await refresh();
  }

  async function remove(row: VideoRow): Promise<void> {
    const confirmed = window.confirm(
      `Delete this item from dashboard?\n\nTitle: ${row.title || "Untitled"}`
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(row.id);
    setError(undefined);
    try {
      const response = await fetch(`/api/rows/${row.id}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Delete failed.");
      }
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unknown error");
    } finally {
      setDeletingId(undefined);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <h1 className="text-xl font-semibold">Generated Videos</h1>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">자동화 실행</h2>
          <span className="rounded-full border px-2 py-0.5 text-xs">
            {phaseLabel(automation?.phase)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          준비 상태 row를 순서대로 처리합니다. 마지막으로 사용한 옵션/최근 템플릿(renderOptions)을 기준으로
          반복하며, 기본 모드는 YouTube 업로드 포함입니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr,190px,190px,auto,auto]">
          <Input
            value={automationSheetName}
            onChange={(event) => setAutomationSheetName(event.target.value)}
            placeholder="시트 탭명(선택) - 비우면 Settings 기본값 사용"
          />
          <Select
            value={automationUploadMode}
            onValueChange={(value) =>
              setAutomationUploadMode(value === "pre_upload" ? "pre_upload" : "youtube")
            }
          >
            <SelectTrigger className="bg-card dark:bg-zinc-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube">유튜브 업로드(기본)</SelectItem>
              <SelectItem value="pre_upload">업로드 전 단계까지</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={automationPrivacyStatus}
            onValueChange={(value) =>
              setAutomationPrivacyStatus(
                value === "public" || value === "unlisted" ? value : "private"
              )
            }
            disabled={automationUploadMode === "pre_upload"}
          >
            <SelectTrigger className="bg-card dark:bg-zinc-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">공개(즉시 게시)</SelectItem>
              <SelectItem value="unlisted">일부 공개</SelectItem>
              <SelectItem value="private">비공개</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => void startAutomation()}
            disabled={
              automationBusy || automation?.phase === "running" || automation?.phase === "stopping"
            }
          >
            {automationBusy ? "처리 중..." : "자동화 시작"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void stopAutomation()}
            disabled={automationBusy || automation?.phase !== "running"}
          >
            중지 요청
          </Button>
        </div>
        {automation?.defaultsSummary ? (
          <p className="text-xs text-muted-foreground">
            기본값: {automation.defaultsSummary.imageStyle} / {automation.defaultsSummary.imageAspectRatio} /{" "}
            {automation.defaultsSummary.voice} ({automation.defaultsSummary.voiceSpeed}x) /{" "}
            {automation.defaultsSummary.videoLengthSec}s / {automation.defaultsSummary.sceneCount} scenes / 템플릿{" "}
            {automation.defaultsSummary.hasRecentTemplate ? "적용" : "없음"} / 모드{" "}
            {automation.uploadMode === "pre_upload" ? "업로드 전 단계" : "유튜브 업로드"}
          </p>
        ) : null}
        {automation ? (
          <div className="grid gap-2 text-xs sm:grid-cols-5">
            <div className="rounded-md border p-2">처리: {automation.processed}</div>
            <div className="rounded-md border p-2">업로드: {automation.uploaded}</div>
            <div className="rounded-md border p-2">실패: {automation.failed}</div>
            <div className="rounded-md border p-2">남은 준비: {automation.remaining}</div>
            <div className="rounded-md border p-2 truncate">
              현재: {automation.currentRowId || "-"}
            </div>
          </div>
        ) : null}
        {automationError ? <p className="text-sm text-destructive">{automationError}</p> : null}
        {automation?.lastError ? (
          <p className="text-xs text-destructive">최근 오류: {automation.lastError}</p>
        ) : null}
        {automation?.logs?.length ? (
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
            {automation.logs
              .slice(-10)
              .reverse()
              .map((log) => (
                <p key={`${log.at}:${log.message}`} className={log.level === "error" ? "text-destructive" : ""}>
                  [{new Date(log.at).toLocaleTimeString()}] {log.message}
                </p>
              ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">자동화 스케줄</h2>
          <span className="rounded-full border px-2 py-0.5 text-xs">
            {schedule?.config.enabled ? "활성" : "비활성"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          예: 하루에 1개씩, 하루에 2개씩, 혹은 N시간마다 N개를 직렬로 자동 업로드합니다.
        </p>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">스케줄 활성화</p>
            <p className="text-xs text-muted-foreground">활성화 시 서버 시간 기준으로 자동 실행됩니다.</p>
          </div>
          <Switch
            checked={scheduleEnabled}
            onCheckedChange={(checked) => {
              setScheduleEnabled(checked);
              setScheduleDraftDirty(true);
            }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">주기 타입</p>
            <Select
              value={scheduleCadence}
              onValueChange={(value) => {
                setScheduleCadence(value === "interval_hours" ? "interval_hours" : "daily");
                setScheduleDraftDirty(true);
              }}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">일자별(매일)</SelectItem>
                <SelectItem value="interval_hours">시간별(간격)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">시간 간격(시간)</p>
            <Select
              value={scheduleIntervalHours}
              onValueChange={(value) => {
                setScheduleIntervalHours(value);
                setScheduleDraftDirty(true);
              }}
              disabled={scheduleCadence !== "interval_hours"}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4", "6", "8", "12", "24"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}시간
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">일일 실행 시각</p>
            <Input
              type="time"
              value={scheduleDailyTime}
              onChange={(event) => {
                setScheduleDailyTime(event.target.value);
                setScheduleDraftDirty(true);
              }}
              disabled={scheduleCadence !== "daily"}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">회차당 처리 개수</p>
            <Select
              value={scheduleItemsPerRun}
              onValueChange={(value) => {
                setScheduleItemsPerRun(value);
                setScheduleDraftDirty(true);
              }}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}개
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">스케줄 업로드 모드</p>
            <Select
              value={scheduleUploadMode}
              onValueChange={(value) => {
                setScheduleUploadMode(value === "pre_upload" ? "pre_upload" : "youtube");
                setScheduleDraftDirty(true);
              }}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">유튜브 업로드</SelectItem>
                <SelectItem value="pre_upload">업로드 전 단계</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">유튜브 공개 범위</p>
            <Select
              value={schedulePrivacyStatus}
              onValueChange={(value) => {
                setSchedulePrivacyStatus(
                  value === "public" || value === "unlisted" ? value : "private"
                );
                setScheduleDraftDirty(true);
              }}
              disabled={scheduleUploadMode === "pre_upload"}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">공개(즉시 게시)</SelectItem>
                <SelectItem value="unlisted">일부 공개</SelectItem>
                <SelectItem value="private">비공개</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">시트 탭명(선택)</p>
            <Input
              value={scheduleSheetName}
              onChange={(event) => {
                setScheduleSheetName(event.target.value);
                setScheduleDraftDirty(true);
              }}
              placeholder="비우면 Settings 기본 탭 사용"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void saveSchedule()} disabled={scheduleBusy}>
            {scheduleBusy ? "저장 중..." : "스케줄 저장"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void disableSchedule()} disabled={scheduleBusy}>
            스케줄 비활성화
          </Button>
        </div>
        {schedule ? (
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md border p-2">
              다음 실행: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "-"}
            </div>
            <div className="rounded-md border p-2">
              마지막 실행: {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "-"}
            </div>
            <div className="rounded-md border p-2">마지막 결과: {scheduleResultLabel(schedule.lastResult)}</div>
            <div className="rounded-md border p-2">
              수정 시각: {schedule.updatedAt ? new Date(schedule.updatedAt).toLocaleString() : "-"}
            </div>
          </div>
        ) : null}
        {schedule?.lastError ? <p className="text-xs text-destructive">{schedule.lastError}</p> : null}
        {scheduleError ? <p className="text-sm text-destructive">{scheduleError}</p> : null}
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {deletingId ? (
        <p className="text-sm text-muted-foreground">Deleting selected item...</p>
      ) : null}
      <VideoList rows={rows} onRegenerate={regenerate} onDelete={remove} onUpload={upload} />
    </div>
  );
}
