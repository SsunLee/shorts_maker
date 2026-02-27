"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
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

interface AutomationTemplateItem {
  id: string;
  templateName?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  updatedAt: string;
  renderOptions?: {
    overlay?: {
      videoLayout?: "fill_9_16" | "panel_16_9";
      panelTopPercent?: number;
      panelWidthPercent?: number;
      titleTemplates?: Array<{
        id: string;
        text?: string;
        x?: number;
        y?: number;
        width?: number;
        fontSize?: number;
        color?: string;
        fontName?: string;
        fontThickness?: number;
      }>;
    };
  };
}

interface AutomationTemplateResponse {
  snapshot?: AutomationTemplateItem;
  templates?: AutomationTemplateItem[];
  activeTemplateId?: string;
  error?: string;
}

interface WorkflowListResponse {
  workflows?: Array<{
    id: string;
    updatedAt: string;
    input?: {
      title?: string;
    };
    renderOptions?: {
      overlay?: {
        titleTemplates?: Array<{
          id?: string;
          text?: string;
        }>;
      };
    };
  }>;
  error?: string;
}

const ACTIVE_TEMPLATE_VALUE = "__active__";

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`서버 응답이 JSON 형식이 아닙니다 (HTTP ${response.status}).`);
  }
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

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const raw = String(value || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(raw)) {
    return raw.toUpperCase();
  }
  return fallback;
}

function templateModeLabel(mode: "applied_template" | "latest_workflow" | "none"): string {
  if (mode === "applied_template") {
    return "활성 템플릿 사용";
  }
  if (mode === "latest_workflow") {
    return "최신 워크플로우 템플릿 사용";
  }
  return "템플릿 미사용";
}

function formatTemplateDisplayName(item: AutomationTemplateItem): string {
  const name = item.templateName || "(이름 없음)";
  return `${name} · ${new Date(item.updatedAt).toLocaleString()}`;
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
  const [automationTemplateMode, setAutomationTemplateMode] = useState<
    "applied_template" | "latest_workflow" | "none"
  >("applied_template");
  const [automationPrivacyStatus, setAutomationPrivacyStatus] = useState<
    "private" | "public" | "unlisted"
  >("private");
  const [automationError, setAutomationError] = useState<string>();
  const [automationTemplateError, setAutomationTemplateError] = useState<string>();
  const [automationTemplates, setAutomationTemplates] = useState<AutomationTemplateItem[]>([]);
  const [activeAutomationTemplateId, setActiveAutomationTemplateId] = useState<string>();
  const [automationTemplateBusy, setAutomationTemplateBusy] = useState(false);
  const [showAutomationTemplateSnapshot, setShowAutomationTemplateSnapshot] = useState(true);
  const [latestWorkflowTemplateInfo, setLatestWorkflowTemplateInfo] = useState<{
    workflowId: string;
    title: string;
    updatedAt: string;
    layerCount: number;
  }>();
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
  const [scheduleTemplateMode, setScheduleTemplateMode] = useState<
    "applied_template" | "latest_workflow" | "none"
  >("applied_template");
  const [scheduleTemplateId, setScheduleTemplateId] = useState<string>(ACTIVE_TEMPLATE_VALUE);
  const [schedulePrivacyStatus, setSchedulePrivacyStatus] = useState<
    "private" | "public" | "unlisted"
  >("private");

  const activeTemplate = useMemo(
    () => automationTemplates.find((item) => item.id === activeAutomationTemplateId),
    [automationTemplates, activeAutomationTemplateId]
  );
  const scheduleSelectedTemplate = useMemo(() => {
    if (scheduleTemplateId === ACTIVE_TEMPLATE_VALUE) {
      return activeTemplate;
    }
    return automationTemplates.find((item) => item.id === scheduleTemplateId);
  }, [automationTemplates, scheduleTemplateId, activeTemplate]);

  function hydrateScheduleForm(next: AutomationScheduleState): void {
    setScheduleEnabled(next.config.enabled);
    setScheduleCadence(next.config.cadence);
    setScheduleIntervalHours(String(next.config.intervalHours));
    setScheduleDailyTime(next.config.dailyTime);
    setScheduleItemsPerRun(String(next.config.itemsPerRun));
    setScheduleSheetName(next.config.sheetName || "");
    setScheduleUploadMode(next.config.uploadMode);
    setScheduleTemplateMode(next.config.templateMode);
    setScheduleTemplateId(next.config.templateId || ACTIVE_TEMPLATE_VALUE);
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

  const refreshAutomationTemplates = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/automation-template", { cache: "no-store" });
    const data = await readJsonResponse<AutomationTemplateResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || "Failed to load automation templates.");
    }
    const list = data.templates || [];
    setAutomationTemplates(list);
    setActiveAutomationTemplateId(data.activeTemplateId);
    setScheduleTemplateId((prev) => {
      if (prev === ACTIVE_TEMPLATE_VALUE) {
        return prev;
      }
      if (!prev) {
        return data.activeTemplateId || ACTIVE_TEMPLATE_VALUE;
      }
      return list.some((item) => item.id === prev) ? prev : data.activeTemplateId || ACTIVE_TEMPLATE_VALUE;
    });
  }, []);

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

  const refreshLatestWorkflowTemplateInfo = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    const data = (await response.json()) as WorkflowListResponse;
    if (!response.ok) {
      throw new Error(data.error || "Failed to load workflows.");
    }
    const workflows = data.workflows || [];
    const latest = workflows.find(
      (item) => (item.renderOptions?.overlay?.titleTemplates || []).length > 0
    );
    if (!latest) {
      setLatestWorkflowTemplateInfo(undefined);
      return;
    }
    setLatestWorkflowTemplateInfo({
      workflowId: latest.id,
      title: latest.input?.title || latest.id,
      updatedAt: latest.updatedAt,
      layerCount: latest.renderOptions?.overlay?.titleTemplates?.length || 0
    });
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
        await Promise.all([
          refresh(),
          refreshAutomation(),
          refreshSchedule(),
          refreshAutomationTemplates(),
          refreshLatestWorkflowTemplateInfo()
        ]);
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
      void refreshLatestWorkflowTemplateInfo().catch(() => {
        // Keep dashboard polling resilient even if workflow endpoint is temporarily unavailable.
      });
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [refreshAutomationTemplates, refreshLatestWorkflowTemplateInfo, refreshSchedule]);

  async function setActiveTemplate(templateId: string): Promise<void> {
    setAutomationTemplateBusy(true);
    setAutomationTemplateError(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "템플릿 선택에 실패했습니다.");
      }
      setAutomationTemplates(data.templates || []);
      setActiveAutomationTemplateId(data.activeTemplateId);
    } catch (templateError) {
      setAutomationTemplateError(
        templateError instanceof Error ? templateError.message : "Unknown error"
      );
    } finally {
      setAutomationTemplateBusy(false);
    }
  }

  async function deleteTemplate(templateId: string): Promise<void> {
    const confirmed = window.confirm("선택한 자동화 템플릿을 삭제할까요?");
    if (!confirmed) {
      return;
    }
    setAutomationTemplateBusy(true);
    setAutomationTemplateError(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "템플릿 삭제에 실패했습니다.");
      }
      setAutomationTemplates(data.templates || []);
      setActiveAutomationTemplateId(data.activeTemplateId);
    } catch (templateError) {
      setAutomationTemplateError(
        templateError instanceof Error ? templateError.message : "Unknown error"
      );
    } finally {
      setAutomationTemplateBusy(false);
    }
  }

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
          templateMode: scheduleTemplateMode,
          templateId:
            scheduleTemplateMode === "applied_template" &&
            scheduleTemplateId !== ACTIVE_TEMPLATE_VALUE
              ? scheduleTemplateId
              : undefined,
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
          templateMode: automationTemplateMode,
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

  function renderTemplateSnapshot(template: AutomationTemplateItem): React.JSX.Element {
    const overlay = template.renderOptions?.overlay;
    const templates = overlay?.titleTemplates || [];
    const layout = overlay?.videoLayout === "panel_16_9" ? "panel_16_9" : "fill_9_16";
    const panelTop = clampNumber(Number(overlay?.panelTopPercent), 0, 85, 34);
    const panelWidth = clampNumber(Number(overlay?.panelWidthPercent), 60, 100, 100);

    return (
      <div className="rounded-md border bg-muted/30 p-2">
        <div className="mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-md border bg-black">
          <div className="relative h-full w-full">
            {layout === "panel_16_9" ? (
              <div className="absolute inset-0">
                <div
                  className="absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-sm border border-white/30 bg-zinc-900"
                  style={{
                    top: `${panelTop}%`,
                    width: `${panelWidth}%`,
                    aspectRatio: "16 / 9"
                  }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(145deg,#2d3e50_0%,#55708b_45%,#c88f5e_100%)]" />
                  <p className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-amber-200">
                    16:9
                  </p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(175deg,#253446_0%,#3b5a77_38%,#bd8455_100%)]" />
            )}
            {templates.slice(0, 6).map((item) => (
              <div
                key={`snapshot-${item.id}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-400/30 bg-black/20 px-1 py-0.5 text-center leading-tight whitespace-pre-wrap"
                style={{
                  left: `${clampNumber(Number(item.x), 0, 100, 50)}%`,
                  top: `${clampNumber(Number(item.y), 0, 100, 50)}%`,
                  width: `${clampNumber(Number(item.width), 20, 100, 70)}%`,
                  color: normalizeHexColor(item.color, "#FFFFFF"),
                  fontSize: `${Math.max(7, clampNumber(Number(item.fontSize), 10, 120, 28) * 0.2)}px`,
                  fontFamily: item.fontName || "Noto Sans KR",
                  textShadow: "0 1px 2px rgba(0,0,0,0.75)",
                  WebkitTextStrokeWidth: `${clampNumber(Number(item.fontThickness), 0, 8, 0) * 0.16}px`,
                  WebkitTextStrokeColor: "rgba(0,0,0,0.85)"
                }}
                title={item.text || ""}
              >
                {String(item.text || "").slice(0, 70)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
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
          준비 상태 row를 순서대로 처리합니다. 기본 모드는 YouTube 업로드 포함이며, 아래 선택한 템플릿 모드
          기준으로 렌더 옵션을 적용합니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
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
            value={automationTemplateMode}
            onValueChange={(value) =>
              setAutomationTemplateMode(
                value === "latest_workflow" || value === "none" ? value : "applied_template"
              )
            }
          >
            <SelectTrigger className="bg-card dark:bg-zinc-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="applied_template">활성 템플릿 사용(권장)</SelectItem>
              <SelectItem value="latest_workflow">최근 완료 워크플로우 템플릿 사용</SelectItem>
              <SelectItem value="none">템플릿 미사용</SelectItem>
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
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          <p className="font-medium">현재 템플릿 모드: {templateModeLabel(automationTemplateMode)}</p>
          {automationTemplateMode === "applied_template" ? (
            <p className="text-muted-foreground">
              적용 대상:{" "}
              {activeTemplate
                ? formatTemplateDisplayName(activeTemplate)
                : "활성 템플릿 없음 (템플릿 탭에서 [자동화에 적용] 필요)"}
            </p>
          ) : null}
          {automationTemplateMode === "latest_workflow" ? (
            <p className="text-muted-foreground">
              적용 대상:{" "}
              {latestWorkflowTemplateInfo
                ? `${latestWorkflowTemplateInfo.title} · ${new Date(latestWorkflowTemplateInfo.updatedAt).toLocaleString()} · 레이어 ${latestWorkflowTemplateInfo.layerCount}개`
                : "템플릿이 포함된 워크플로우를 찾지 못했습니다."}
            </p>
          ) : null}
          {automationTemplateMode === "none" ? (
            <p className="text-muted-foreground">템플릿을 적용하지 않고 기본 렌더 옵션으로 실행합니다.</p>
          ) : null}
        </div>
        {automation?.defaultsSummary ? (
          <p className="text-xs text-muted-foreground">
            기본값: {automation.defaultsSummary.imageStyle} / {automation.defaultsSummary.imageAspectRatio} /{" "}
            {automation.defaultsSummary.voice} ({automation.defaultsSummary.voiceSpeed}x) /{" "}
            {automation.defaultsSummary.videoLengthSec}s / {automation.defaultsSummary.sceneCount} scenes / 템플릿{" "}
            {automation.defaultsSummary.templateApplied
              ? `적용 (${automation.defaultsSummary.templateName || "custom"})`
              : "미적용"}{" "}
            / 템플릿 모드{" "}
            {automation.defaultsSummary.templateMode === "applied_template"
              ? "활성 템플릿"
              : automation.defaultsSummary.templateMode === "latest_workflow"
                ? "최근 워크플로우"
                : "미사용"}{" "}
            / 모드{" "}
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
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">자동화 템플릿 선택/미리보기</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAutomationTemplateSnapshot((prev) => !prev)}
                disabled={!activeTemplate}
              >
                {showAutomationTemplateSnapshot ? (
                  <ChevronUp className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="mr-1 h-3.5 w-3.5" />
                )}
                스냅샷 {showAutomationTemplateSnapshot ? "접기" : "펼치기"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshAutomationTemplates()}
                disabled={automationTemplateBusy}
              >
                새로고침
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr,auto,auto]">
            <Select
              value={activeAutomationTemplateId}
              onValueChange={(value) => void setActiveTemplate(value)}
              disabled={automationTemplateBusy || automationTemplates.length === 0}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue placeholder="자동화 템플릿 선택" />
              </SelectTrigger>
              <SelectContent>
                {automationTemplates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {formatTemplateDisplayName(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                activeAutomationTemplateId ? void setActiveTemplate(activeAutomationTemplateId) : undefined
              }
              disabled={automationTemplateBusy || !activeAutomationTemplateId}
            >
              템플릿 적용
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                activeAutomationTemplateId ? void deleteTemplate(activeAutomationTemplateId) : undefined
              }
              disabled={automationTemplateBusy || !activeAutomationTemplateId}
            >
              삭제
            </Button>
          </div>
          {(() => {
            const active = automationTemplates.find((item) => item.id === activeAutomationTemplateId);
            if (!active) {
              return (
                <p className="text-xs text-muted-foreground">
                  저장된 자동화 템플릿이 없습니다. Create 화면에서 [템플릿 적용]을 실행하면 목록에 추가됩니다.
                </p>
              );
            }
            const titleTemplates = active.renderOptions?.overlay?.titleTemplates || [];
            const previewLines = titleTemplates
              .map((item) => String(item.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
              .filter((text) => text.trim().length > 0)
              .slice(0, 2);
            return (
              <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                <p>
                  선택됨: <span className="font-medium">{formatTemplateDisplayName(active)}</span>
                </p>
                <p className="text-muted-foreground">템플릿 ID: {active.id}</p>
                <p className="text-muted-foreground">
                  기준 제목: {active.sourceTitle || "-"} / 기준 주제: {active.sourceTopic || "-"}
                </p>
                <p className="text-muted-foreground">
                  타이틀 레이어 {titleTemplates.length}개
                  {previewLines.length > 0 ? " · 아래 텍스트가 생성 주제에 맞게 바뀝니다." : ""}
                </p>
                {showAutomationTemplateSnapshot ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      <span>스크린샷형 레이아웃 스냅샷</span>
                    </div>
                    {renderTemplateSnapshot(active)}
                  </div>
                ) : null}
                {previewLines.length > 0 ? (
                  <div className="rounded border bg-background/60 p-2 whitespace-pre-wrap">
                    {previewLines.join("\n---\n")}
                  </div>
                ) : null}
              </div>
            );
          })()}
          {automationTemplateError ? (
            <p className="text-xs text-destructive">{automationTemplateError}</p>
          ) : null}
        </div>
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
            <p className="text-xs text-muted-foreground">템플릿 선택 모드</p>
            <Select
              value={scheduleTemplateMode}
              onValueChange={(value) => {
                setScheduleTemplateMode(
                  value === "latest_workflow" || value === "none" ? value : "applied_template"
                );
                setScheduleDraftDirty(true);
              }}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="applied_template">활성/선택 템플릿 사용(권장)</SelectItem>
                <SelectItem value="latest_workflow">최근 완료 워크플로우 템플릿 사용</SelectItem>
                <SelectItem value="none">템플릿 미사용</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">스케줄 템플릿(명시 선택)</p>
            <Select
              value={scheduleTemplateId}
              onValueChange={(value) => {
                setScheduleTemplateId(value);
                setScheduleDraftDirty(true);
              }}
              disabled={scheduleTemplateMode !== "applied_template"}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ACTIVE_TEMPLATE_VALUE}>
                  활성 템플릿 자동 사용 ({activeTemplate ? activeTemplate.templateName || "(이름 없음)" : "없음"})
                </SelectItem>
                {automationTemplates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {formatTemplateDisplayName(item)}
                  </SelectItem>
                ))}
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
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          <p className="font-medium">스케줄 템플릿 적용 기준: {templateModeLabel(scheduleTemplateMode)}</p>
          {scheduleTemplateMode === "applied_template" ? (
            <p className="text-muted-foreground">
              적용 대상:{" "}
              {scheduleSelectedTemplate
                ? `${formatTemplateDisplayName(scheduleSelectedTemplate)} (ID: ${scheduleSelectedTemplate.id})`
                : "선택 가능한 템플릿이 없습니다."}
            </p>
          ) : null}
          {scheduleTemplateMode === "latest_workflow" ? (
            <p className="text-muted-foreground">
              적용 대상:{" "}
              {latestWorkflowTemplateInfo
                ? `${latestWorkflowTemplateInfo.title} · ${new Date(latestWorkflowTemplateInfo.updatedAt).toLocaleString()} · 레이어 ${latestWorkflowTemplateInfo.layerCount}개`
                : "템플릿이 포함된 워크플로우를 찾지 못했습니다."}
            </p>
          ) : null}
          {scheduleTemplateMode === "none" ? (
            <p className="text-muted-foreground">스케줄 실행 시 템플릿을 적용하지 않습니다.</p>
          ) : null}
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
