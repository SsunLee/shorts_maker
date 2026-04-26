"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VideoList } from "@/components/video-list";
import { AutomationRunState, AutomationScheduleState, VideoRow } from "@/lib/types";
import { wrapTemplateTextLikeEngine } from "@/lib/template-text-wrap";

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

interface StorageAssetsResponse {
  id: string;
  enabled: boolean;
  bucket?: string;
  totalSizeBytes?: number;
  assets?: Array<{
    key: string;
    publicUrl: string;
    size: number;
    lastModified?: string;
  }>;
  error?: string;
}

interface AutomationTemplateItem {
  id: string;
  templateName?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  updatedAt: string;
  renderOptions?: {
    subtitle?: {
      fontName?: string;
      fontSize?: number;
      fontBold?: boolean;
      primaryColor?: string;
      outlineColor?: string;
      outline?: number;
      shadow?: number;
      shadowOpacity?: number;
      fontThickness?: number;
      position?: "top" | "middle" | "bottom";
      subtitleYPercent?: number;
    };
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
        fontBold?: boolean;
        fontItalic?: boolean;
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
  if (!raw.trim()) {
    return {} as T;
  }
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

function subtitleAssScaleForCanvas(canvasScale: number): number {
  const safeCanvasScale = clampNumber(canvasScale, 0.1, 1, 0.26);
  const assToOutputScale = 1920 / 288;
  return clampNumber(safeCanvasScale * assToOutputScale, 0.6, 3, 1.25);
}

function materializeSnapshotText(args: {
  text: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): string {
  const sourceTitle = String(args.sourceTitle || "").trim() || "제목 샘플";
  const sourceTopic = String(args.sourceTopic || "").trim() || "주제 샘플";
  return String(args.text || "")
    .replace(/\{\{\s*title\s*\}\}/gi, sourceTitle)
    .replace(/\{\{\s*topic\s*\}\}/gi, sourceTopic)
    .trim();
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
  const [automationMaxItems, setAutomationMaxItems] = useState<string>("all");
  const [automationTemplateMode, setAutomationTemplateMode] = useState<
    "applied_template" | "latest_workflow" | "none"
  >("applied_template");
  const [automationPrivacyStatus, setAutomationPrivacyStatus] = useState<
    "private" | "public" | "unlisted"
  >("private");
  const [automationAutoIdeaEnabled, setAutomationAutoIdeaEnabled] = useState(false);
  const [automationAutoIdeaTopic, setAutomationAutoIdeaTopic] = useState("");
  const [automationAutoIdeaLanguage, setAutomationAutoIdeaLanguage] = useState<
    "ko" | "en" | "ja" | "es" | "hi"
  >("ko");
  const [automationAutoIdeaIdBase, setAutomationAutoIdeaIdBase] = useState("");
  const [automationError, setAutomationError] = useState<string>();
  const [automationTemplateError, setAutomationTemplateError] = useState<string>();
  const [automationTemplates, setAutomationTemplates] = useState<AutomationTemplateItem[]>([]);
  const [activeAutomationTemplateId, setActiveAutomationTemplateId] = useState<string>(ACTIVE_TEMPLATE_VALUE);
  const [automationTemplateBusy, setAutomationTemplateBusy] = useState(false);
  const [showAutomationTemplateSnapshot, setShowAutomationTemplateSnapshot] = useState(true);
  const [showAutomationRunSection, setShowAutomationRunSection] = useState(true);
  const [showAutomationScheduleSection, setShowAutomationScheduleSection] = useState(true);
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
  const [scheduleTimeZone, setScheduleTimeZone] = useState("Asia/Seoul");
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
  const [scheduleAutoIdeaEnabled, setScheduleAutoIdeaEnabled] = useState(false);
  const [scheduleAutoIdeaTopic, setScheduleAutoIdeaTopic] = useState("");
  const [scheduleAutoIdeaLanguage, setScheduleAutoIdeaLanguage] = useState<
    "ko" | "en" | "ja" | "es" | "hi"
  >("ko");
  const [scheduleAutoIdeaIdBase, setScheduleAutoIdeaIdBase] = useState("");
  const pollTickRef = useRef(0);

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
  const usesLatestWorkflowTemplateMode = useMemo(
    () => automationTemplateMode === "latest_workflow" || scheduleTemplateMode === "latest_workflow",
    [automationTemplateMode, scheduleTemplateMode]
  );
  const deletableScheduleTemplateId = useMemo(() => {
    if (!scheduleTemplateId || scheduleTemplateId === ACTIVE_TEMPLATE_VALUE) {
      return undefined;
    }
    return automationTemplates.some((item) => item.id === scheduleTemplateId)
      ? scheduleTemplateId
      : undefined;
  }, [automationTemplates, scheduleTemplateId]);

  function hydrateScheduleForm(next: AutomationScheduleState): void {
    setScheduleEnabled(next.config.enabled);
    setScheduleCadence(next.config.cadence);
    setScheduleIntervalHours(String(next.config.intervalHours));
    setScheduleDailyTime(next.config.dailyTime);
    setScheduleTimeZone("Asia/Seoul");
    setScheduleItemsPerRun(String(next.config.itemsPerRun));
    setScheduleSheetName(next.config.sheetName || "");
    setScheduleUploadMode(next.config.uploadMode);
    setScheduleTemplateMode(next.config.templateMode);
    setScheduleTemplateId(next.config.templateId || ACTIVE_TEMPLATE_VALUE);
    setSchedulePrivacyStatus(next.config.privacyStatus);
    setScheduleAutoIdeaEnabled(Boolean(next.config.autoIdeaEnabled));
    setScheduleAutoIdeaTopic(next.config.autoIdeaTopic || "");
    setScheduleAutoIdeaLanguage(next.config.autoIdeaLanguage || "ko");
    setScheduleAutoIdeaIdBase(next.config.autoIdeaIdBase || "");
    setScheduleDraftDirty(false);
  }

  useEffect(() => {
    scheduleDraftDirtyRef.current = scheduleDraftDirty;
  }, [scheduleDraftDirty]);

  useEffect(() => {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz && browserTz.trim()) {
        setScheduleTimeZone("Asia/Seoul");
      }
    } catch {
      setScheduleTimeZone("Asia/Seoul");
    }
  }, []);

  async function refreshAutomation(): Promise<void> {
    const response = await fetch("/api/automation", { cache: "no-store" });
    const data = await readJsonResponse<AutomationResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || `Failed to load automation status (HTTP ${response.status}).`);
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
    setActiveAutomationTemplateId(data.activeTemplateId || ACTIVE_TEMPLATE_VALUE);
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
    const data = await readJsonResponse<AutomationScheduleResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || `Failed to load automation schedule (HTTP ${response.status}).`);
    }
    setSchedule(data.schedule);
    if (!scheduleDraftDirtyRef.current) {
      hydrateScheduleForm(data.schedule);
    }
  }, []);

  const refreshLatestWorkflowTemplateInfo = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    const data = await readJsonResponse<WorkflowListResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || `Failed to load workflows (HTTP ${response.status}).`);
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

  async function refresh(withWorkflowHydration = false): Promise<void> {
    const response = await fetch(
      withWorkflowHydration ? "/api/rows?withWorkflow=1" : "/api/rows",
      { cache: "no-store" }
    );
    const data = await readJsonResponse<RowsResponse>(response);
    if (!response.ok) {
      throw new Error(`Failed to load rows (HTTP ${response.status}).`);
    }
    setRows(data.rows);
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await Promise.all([
          refresh(true),
          refreshAutomation(),
          refreshSchedule(),
          refreshAutomationTemplates()
        ]);
        if (usesLatestWorkflowTemplateMode) {
          await refreshLatestWorkflowTemplateInfo();
        } else if (mounted) {
          setLatestWorkflowTemplateInfo(undefined);
        }
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

    const isAutomationActive = automation?.phase === "running" || automation?.phase === "stopping";
    const pollMs = isAutomationActive ? 8000 : 45000;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      pollTickRef.current += 1;
      const shouldRefreshHydratedRows = isAutomationActive
        ? pollTickRef.current % 6 === 0
        : pollTickRef.current % 4 === 0;
      void refresh(shouldRefreshHydratedRows);
      void refreshAutomation().catch(() => {
        // Keep dashboard polling resilient even if automation endpoint is temporarily unavailable.
      });

      // Schedule/workflow metadata are expensive and change less often.
      // Poll these only every 3 ticks while automation is active, else every 2 ticks.
      const shouldRefreshMeta = isAutomationActive
        ? pollTickRef.current % 3 === 0
        : pollTickRef.current % 2 === 0;
      if (shouldRefreshMeta) {
        void refreshSchedule().catch(() => {
          // Keep dashboard polling resilient even if schedule endpoint is temporarily unavailable.
        });
      }
      const shouldRefreshWorkflowMeta =
        usesLatestWorkflowTemplateMode &&
        (isAutomationActive ? pollTickRef.current % 6 === 0 : pollTickRef.current % 4 === 0);
      if (shouldRefreshWorkflowMeta) {
        void refreshLatestWorkflowTemplateInfo().catch(() => {
          // Keep dashboard polling resilient even if workflow endpoint is temporarily unavailable.
        });
      }
    }, pollMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [
    refreshAutomationTemplates,
    refreshLatestWorkflowTemplateInfo,
    refreshSchedule,
    automation?.phase,
    usesLatestWorkflowTemplateMode
  ]);

  useEffect(() => {
    if (!usesLatestWorkflowTemplateMode) {
      setLatestWorkflowTemplateInfo(undefined);
      return;
    }
    void refreshLatestWorkflowTemplateInfo().catch(() => undefined);
  }, [usesLatestWorkflowTemplateMode, refreshLatestWorkflowTemplateInfo]);

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
      setActiveAutomationTemplateId(data.activeTemplateId || ACTIVE_TEMPLATE_VALUE);
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
      const nextTemplates = data.templates || [];
      const nextActiveTemplateId = data.activeTemplateId || ACTIVE_TEMPLATE_VALUE;
      setAutomationTemplates(nextTemplates);
      setActiveAutomationTemplateId(nextActiveTemplateId);
      setScheduleTemplateId((prev) => {
        if (!prev || prev === ACTIVE_TEMPLATE_VALUE) {
          return prev || ACTIVE_TEMPLATE_VALUE;
        }
        return nextTemplates.some((item) => item.id === prev)
          ? prev
          : nextActiveTemplateId;
      });
      if (scheduleTemplateId === templateId) {
        setScheduleDraftDirty(true);
      }
    } catch (templateError) {
      setAutomationTemplateError(
        templateError instanceof Error ? templateError.message : "Unknown error"
      );
    } finally {
      setAutomationTemplateBusy(false);
    }
  }

  async function saveSchedule(
    overrides?: Partial<{
      enabled: boolean;
      cadence: "interval_hours" | "daily";
      intervalHours: string;
      dailyTime: string;
      timeZone: string;
      itemsPerRun: string;
      sheetName: string;
      uploadMode: "youtube" | "pre_upload";
      templateMode: "applied_template" | "latest_workflow" | "none";
      templateId: string;
      privacyStatus: "private" | "public" | "unlisted";
      autoIdeaEnabled: boolean;
      autoIdeaTopic: string;
      autoIdeaLanguage: "ko" | "en" | "ja" | "es" | "hi";
      autoIdeaIdBase: string;
    }>
  ): Promise<void> {
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const enabled = overrides?.enabled ?? scheduleEnabled;
      const cadence = overrides?.cadence ?? scheduleCadence;
      const intervalHours = overrides?.intervalHours ?? scheduleIntervalHours;
      const dailyTime = overrides?.dailyTime ?? scheduleDailyTime;
      const timeZone = overrides?.timeZone ?? scheduleTimeZone;
      const itemsPerRun = overrides?.itemsPerRun ?? scheduleItemsPerRun;
      const sheetName = overrides?.sheetName ?? scheduleSheetName;
      const uploadMode = overrides?.uploadMode ?? scheduleUploadMode;
      const templateMode = overrides?.templateMode ?? scheduleTemplateMode;
      const templateId = overrides?.templateId ?? scheduleTemplateId;
      const privacyStatus = overrides?.privacyStatus ?? schedulePrivacyStatus;
      const autoIdeaEnabled = overrides?.autoIdeaEnabled ?? scheduleAutoIdeaEnabled;
      const autoIdeaTopic = overrides?.autoIdeaTopic ?? scheduleAutoIdeaTopic;
      const autoIdeaLanguage = overrides?.autoIdeaLanguage ?? scheduleAutoIdeaLanguage;
      const autoIdeaIdBase = overrides?.autoIdeaIdBase ?? scheduleAutoIdeaIdBase;
      if (enabled && autoIdeaEnabled && !autoIdeaTopic.trim()) {
        throw new Error("스케줄 자동 아이디어 생성 키워드를 입력해 주세요.");
      }

      const response = await fetch("/api/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          cadence,
          intervalHours: Number.parseInt(intervalHours, 10) || 24,
          dailyTime: dailyTime || "09:00",
          timeZone: timeZone || "Asia/Seoul",
          itemsPerRun: Number.parseInt(itemsPerRun, 10) || 1,
          sheetName: sheetName.trim() || undefined,
          uploadMode,
          templateMode,
          templateId:
            templateMode === "applied_template" &&
            templateId !== ACTIVE_TEMPLATE_VALUE
              ? templateId
              : undefined,
          privacyStatus,
          autoIdeaEnabled,
          autoIdeaTopic: autoIdeaTopic.trim() || undefined,
          autoIdeaLanguage,
          autoIdeaIdBase: autoIdeaIdBase.trim() || undefined
        })
      });
      const data = await readJsonResponse<AutomationScheduleResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || `Failed to save schedule (HTTP ${response.status}).`);
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
      const data = await readJsonResponse<AutomationScheduleResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || `Failed to disable schedule (HTTP ${response.status}).`);
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
    setAutomation((prev) => ({
      ...(prev || {
        stopRequested: false,
        totalDiscovered: 0,
        processed: 0,
        uploaded: 0,
        failed: 0,
        remaining: 0,
        logs: []
      }),
      phase: "running",
      startedAt: new Date().toISOString()
    }));
    try {
      if (automationAutoIdeaEnabled && !automationAutoIdeaTopic.trim()) {
        throw new Error("자동 아이디어 생성 키워드를 입력해 주세요.");
      }
      const response = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: automationSheetName.trim() || undefined,
          privacyStatus: automationPrivacyStatus,
          templateMode: automationTemplateMode,
          uploadMode: automationUploadMode,
          maxItems:
            automationMaxItems === "all"
              ? undefined
              : Math.max(1, Number.parseInt(automationMaxItems, 10) || 1),
          autoIdeaEnabled: automationAutoIdeaEnabled,
          autoIdeaTopic: automationAutoIdeaTopic.trim() || undefined,
          autoIdeaLanguage: automationAutoIdeaLanguage,
          autoIdeaIdBase: automationAutoIdeaIdBase.trim() || undefined
        })
      });
      const data = await readJsonResponse<AutomationResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || `Automation start failed (HTTP ${response.status}).`);
      }
      setAutomation(data.state);
      await Promise.all([refresh(true), refreshAutomation(), refreshSchedule()]);
    } catch (startError) {
      setAutomationError(startError instanceof Error ? startError.message : "Unknown error");
      await refreshAutomation().catch(() => {
        // Keep UI stable even if status refresh fails immediately after start error.
      });
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
      const data = await readJsonResponse<AutomationResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || `Automation stop failed (HTTP ${response.status}).`);
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
      const data = await readJsonResponse<{ error?: string }>(response);
      throw new Error(data.error || "Upload failed.");
    }

    await refresh();
  }

  async function inspectStorage(row: VideoRow): Promise<void> {
    try {
      const response = await fetch(`/api/storage/assets?id=${encodeURIComponent(row.id)}`, {
        cache: "no-store"
      });
      const data = await readJsonResponse<StorageAssetsResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "S3 자산 조회에 실패했습니다.");
      }
      if (!data.enabled) {
        window.alert("S3 스토리지가 활성화되어 있지 않습니다.");
        return;
      }
      const assetCount = data.assets?.length || 0;
      const totalMb = ((data.totalSizeBytes || 0) / (1024 * 1024)).toFixed(2);
      const samples = (data.assets || [])
        .slice(0, 5)
        .map((item) => `- ${item.key}`)
        .join("\n");
      window.alert(
        [
          `Bucket: ${data.bucket || "-"}`,
          `Objects: ${assetCount}`,
          `Total size: ${totalMb} MB`,
          samples ? `\n샘플 키(최대 5개):\n${samples}` : ""
        ].join("\n")
      );
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "S3 조회 실패");
    }
  }

  async function cleanupStorage(row: VideoRow): Promise<void> {
    try {
      const confirmed = window.confirm(
        `이 row(${row.id}) 관련 S3 파일을 정리할까요?\n` +
          `generated/rendered 하위 prefix가 삭제됩니다.`
      );
      if (!confirmed) {
        return;
      }
      const response = await fetch(`/api/storage/assets?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE"
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "S3 정리에 실패했습니다.");
      }
      window.alert(`S3 정리 완료: ${row.id}`);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : "S3 정리 실패");
    }
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
      const response = await fetch(`/api/rows/${encodeURIComponent(row.id)}`, {
        method: "DELETE"
      });
      const data = await readJsonResponse<{ error?: string }>(response);
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
    const subtitle = template.renderOptions?.subtitle;
    const templates = overlay?.titleTemplates || [];
    const layout = overlay?.videoLayout === "panel_16_9" ? "panel_16_9" : "fill_9_16";
    const panelTop = clampNumber(Number(overlay?.panelTopPercent), 0, 85, 34);
    const panelWidth = clampNumber(Number(overlay?.panelWidthPercent), 60, 100, 100);
    const previewWidth = 320;
    const previewScale = clampNumber(previewWidth / 1080, 0.12, 1, 0.2);
    const titlePreviewRenderScale = previewScale;
    const subtitleScale = subtitleAssScaleForCanvas(previewScale);
    const subtitleY = clampNumber(Number(subtitle?.subtitleYPercent), 0, 100, 86);
    const subtitleFontSize = clampNumber(
      Number(subtitle?.fontSize) * subtitleScale,
      8,
      120,
      20
    );
    const subtitleText = "자막 샘플 텍스트";
    const subtitleOutline = clampNumber(Number(subtitle?.outline), 0, 8, 2);
    const subtitleShadow = clampNumber(Number(subtitle?.shadow), 0, 8, 1);
    const subtitleShadowOpacity = clampNumber(Number(subtitle?.shadowOpacity), 0, 1, 1);
    const subtitleThickness = clampNumber(Number(subtitle?.fontThickness), 0, 8, 0);

    return (
      <div className="rounded-md border bg-muted/30 p-2">
        <div className="mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md border bg-black">
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
            {templates.slice(0, 6).map((item) => {
              const baseText = materializeSnapshotText({
                text: item.text || "",
                sourceTitle: template.sourceTitle,
                sourceTopic: template.sourceTopic
              });
              const text = wrapTemplateTextLikeEngine({
                text: baseText,
                widthPercent: clampNumber(Number(item.width), 20, 100, 70),
                fontSize: clampNumber(Number(item.fontSize), 12, 120, 28)
              });
              return (
              <div
                key={`snapshot-${item.id}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-400/30 bg-black/20 px-1 py-0.5 text-center leading-tight whitespace-pre-wrap"
                style={{
                  left: `${clampNumber(Number(item.x), 0, 100, 50)}%`,
                  top: `${clampNumber(Number(item.y), 0, 100, 50)}%`,
                  width: `${clampNumber(Number(item.width), 20, 100, 70)}%`,
                  color: normalizeHexColor(item.color, "#FFFFFF"),
                  fontSize: `${
                    clampNumber(Number(item.fontSize), 12, 120, 28) * titlePreviewRenderScale
                  }px`,
                  fontFamily: item.fontName || "Noto Sans KR",
                  fontWeight: item.fontBold ? 700 : 400,
                  fontStyle: item.fontItalic ? "italic" : "normal",
                  whiteSpace: "pre-line",
                  overflowWrap: "normal",
                  wordBreak: "normal",
                  textShadow: "0 1px 2px rgba(0,0,0,0.75)",
                  WebkitTextStrokeWidth: `${
                    clampNumber(Number(item.fontThickness), 0, 8, 0) *
                    (0.2 * (titlePreviewRenderScale / 0.42))
                  }px`,
                  WebkitTextStrokeColor: "rgba(0,0,0,0.85)"
                }}
                title={text}
              >
                {text}
              </div>
            )})}
            <div
              className="pointer-events-none absolute left-1/2 z-10 w-[86%] -translate-x-1/2 -translate-y-1/2 rounded border border-emerald-400/70 bg-black/35 px-1 py-0.5 text-center leading-tight whitespace-pre-wrap"
              style={{
                top: `${subtitleY}%`,
                color: normalizeHexColor(subtitle?.primaryColor, "#FFFFFF"),
                fontFamily: subtitle?.fontName || "Arial",
                fontWeight: subtitle?.fontBold ? 700 : 400,
                fontSize: `${subtitleFontSize}px`,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                textShadow: [
                  ...(
                    subtitleThickness > 0
                      ? [
                          `${subtitleThickness * 0.24}px 0 rgba(0,0,0,0.9)`,
                          `${-subtitleThickness * 0.24}px 0 rgba(0,0,0,0.9)`,
                          `0 ${subtitleThickness * 0.24}px rgba(0,0,0,0.9)`,
                          `0 ${-subtitleThickness * 0.24}px rgba(0,0,0,0.9)`
                        ]
                      : []
                  ),
                  `${subtitleOutline * 0.24}px 0 ${normalizeHexColor(subtitle?.outlineColor, "#000000")}`,
                  `${-subtitleOutline * 0.24}px 0 ${normalizeHexColor(subtitle?.outlineColor, "#000000")}`,
                  `0 ${subtitleOutline * 0.24}px ${normalizeHexColor(subtitle?.outlineColor, "#000000")}`,
                  `0 ${-subtitleOutline * 0.24}px ${normalizeHexColor(subtitle?.outlineColor, "#000000")}`,
                  `${subtitleShadow * 0.4}px ${subtitleShadow * 0.4}px rgba(0,0,0,${subtitleShadowOpacity})`
                ].join(", ")
              }}
            >
              {subtitleText}
            </div>
            <p className="pointer-events-none absolute left-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-emerald-200">
              자막 Y {Math.round(subtitleY)}% / {Math.round(Number(subtitle?.fontSize) || 16)}pt
            </p>
          </div>
        </div>
      </div>
    );
  }

  const recentAutomationLogs = automation?.logs?.slice(-50).reverse() || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
        <h1 className="min-w-0 break-words text-xl font-semibold">Generated Videos</h1>
        <Button variant="outline" onClick={() => void refresh(true)}>
          Refresh
        </Button>
      </div>
      <div className="sticky top-4 z-20 space-y-3 rounded-xl border bg-card/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="min-w-0 break-words text-base font-semibold">로그</h2>
            <p className="text-xs text-muted-foreground">
              최근 자동화 로그를 상단에서 바로 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {phaseLabel(automation?.phase)}
            </span>
            <span className="rounded-full border px-2 py-0.5 text-xs">
              최근 {recentAutomationLogs.length}건
            </span>
          </div>
        </div>
        {automation?.lastError ? (
          <p className="text-xs text-destructive">최근 오류: {automation.lastError}</p>
        ) : null}
        {recentAutomationLogs.length ? (
          <div className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
            {recentAutomationLogs.map((log) => (
              <p key={`${log.at}:${log.message}`} className={log.level === "error" ? "text-destructive" : ""}>
                [{new Date(log.at).toLocaleTimeString()}] {log.message}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            표시할 자동화 로그가 없습니다.
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-base font-semibold">자동화 실행</h2>
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {phaseLabel(automation?.phase)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAutomationRunSection((prev) => !prev)}
          >
            {showAutomationRunSection ? (
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
            )}
            {showAutomationRunSection ? "접기" : "펼치기"}
          </Button>
        </div>
        {showAutomationRunSection ? (
          <>
        <p className="text-xs text-muted-foreground">
          준비 상태 row를 순서대로 처리합니다. 기본 모드는 YouTube 업로드 포함이며, 아래 선택한 템플릿 모드
          기준으로 렌더 옵션을 적용합니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
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
          <Select value={automationMaxItems} onValueChange={setAutomationMaxItems}>
            <SelectTrigger className="bg-card dark:bg-zinc-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">처리 개수: 전체</SelectItem>
              {Array.from({ length: 20 }, (_, index) => String(index + 1)).map((value) => (
                <SelectItem key={value} value={value}>
                  처리 개수: {value}개
                </SelectItem>
              ))}
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
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">자동 아이디어 생성</p>
              <p className="text-xs text-muted-foreground">
                실행 직전에 키워드 기반 아이디어를 먼저 생성한 뒤, 생성된 row를 우선 처리합니다.
              </p>
            </div>
            <Switch checked={automationAutoIdeaEnabled} onCheckedChange={setAutomationAutoIdeaEnabled} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={automationAutoIdeaTopic}
              onChange={(event) => setAutomationAutoIdeaTopic(event.target.value)}
              placeholder="자동 생성 키워드 (예: 일본 WBC 최신뉴스)"
              disabled={!automationAutoIdeaEnabled}
            />
            <Select
              value={automationAutoIdeaLanguage}
              onValueChange={(value) =>
                setAutomationAutoIdeaLanguage(
                  value === "en" || value === "ja" || value === "es" || value === "hi" ? value : "ko"
                )
              }
              disabled={!automationAutoIdeaEnabled}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어</SelectItem>
                <SelectItem value="ja">일본어</SelectItem>
                <SelectItem value="en">영어</SelectItem>
                <SelectItem value="es">스페인어</SelectItem>
                <SelectItem value="hi">힌디어</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={automationAutoIdeaIdBase}
              onChange={(event) => setAutomationAutoIdeaIdBase(event.target.value)}
              placeholder="ID 접두어(선택) 예: wbc-news"
              disabled={!automationAutoIdeaEnabled}
            />
            <p className="self-center text-xs text-muted-foreground">
              생성 개수는 처리 개수 설정과 동일하게 적용됩니다.
            </p>
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium">자동화 템플릿 선택/미리보기</p>
            <div className="flex flex-wrap items-center gap-2">
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
              value={activeAutomationTemplateId || ACTIVE_TEMPLATE_VALUE}
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
              disabled={
                automationTemplateBusy ||
                !activeAutomationTemplateId ||
                activeAutomationTemplateId === ACTIVE_TEMPLATE_VALUE
              }
            >
              템플릿 적용
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                activeAutomationTemplateId ? void deleteTemplate(activeAutomationTemplateId) : undefined
              }
              disabled={
                automationTemplateBusy ||
                !activeAutomationTemplateId ||
                activeAutomationTemplateId === ACTIVE_TEMPLATE_VALUE
              }
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
          </>
        ) : (
          <p className="text-xs text-muted-foreground">자동화 실행 섹션이 접혀 있습니다.</p>
        )}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-base font-semibold">자동화 스케줄</h2>
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {schedule?.config.enabled ? "활성" : "비활성"}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAutomationScheduleSection((prev) => !prev)}
          >
            {showAutomationScheduleSection ? (
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
            )}
            {showAutomationScheduleSection ? "접기" : "펼치기"}
          </Button>
        </div>
        {showAutomationScheduleSection ? (
          <>
        <p className="text-xs text-muted-foreground">
          예: 하루에 1개씩, 하루에 2개씩, 혹은 N시간마다 N개를 직렬로 자동 업로드합니다.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">스케줄 활성화</p>
            <p className="break-words text-xs text-muted-foreground">활성화 시 서버 시간 기준으로 자동 실행됩니다.</p>
          </div>
          <Switch
            checked={scheduleEnabled}
            onCheckedChange={(checked) => {
              setScheduleEnabled(checked);
              setScheduleDraftDirty(true);
              void saveSchedule({ enabled: checked });
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
            <p className="text-[11px] text-muted-foreground">기준 시간대: KST (Asia/Seoul)</p>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                deletableScheduleTemplateId ? void deleteTemplate(deletableScheduleTemplateId) : undefined
              }
              disabled={
                scheduleTemplateMode !== "applied_template" ||
                automationTemplateBusy ||
                !deletableScheduleTemplateId
              }
            >
              선택 템플릿 삭제
            </Button>
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
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">자동 아이디어 생성 (스케줄)</p>
              <p className="text-xs text-muted-foreground">
                스케줄 실행 직전에 키워드로 아이디어를 생성해 시트에 추가합니다.
              </p>
            </div>
            <Switch
              checked={scheduleAutoIdeaEnabled}
              onCheckedChange={(checked) => {
                setScheduleAutoIdeaEnabled(checked);
                setScheduleDraftDirty(true);
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={scheduleAutoIdeaTopic}
              onChange={(event) => {
                setScheduleAutoIdeaTopic(event.target.value);
                setScheduleDraftDirty(true);
              }}
              placeholder="자동 생성 키워드"
              disabled={!scheduleAutoIdeaEnabled}
            />
            <Select
              value={scheduleAutoIdeaLanguage}
              onValueChange={(value) => {
                setScheduleAutoIdeaLanguage(
                  value === "en" || value === "ja" || value === "es" || value === "hi" ? value : "ko"
                );
                setScheduleDraftDirty(true);
              }}
              disabled={!scheduleAutoIdeaEnabled}
            >
              <SelectTrigger className="bg-card dark:bg-zinc-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">한국어</SelectItem>
                <SelectItem value="ja">일본어</SelectItem>
                <SelectItem value="en">영어</SelectItem>
                <SelectItem value="es">스페인어</SelectItem>
                <SelectItem value="hi">힌디어</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={scheduleAutoIdeaIdBase}
              onChange={(event) => {
                setScheduleAutoIdeaIdBase(event.target.value);
                setScheduleDraftDirty(true);
              }}
              placeholder="ID 접두어(선택)"
              disabled={!scheduleAutoIdeaEnabled}
            />
            <p className="self-center text-xs text-muted-foreground">
              생성 개수는 회차당 처리 개수와 동일합니다.
            </p>
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
        {scheduleDraftDirty ? (
          <p className="text-xs text-amber-500">저장되지 않은 스케줄 변경 사항이 있습니다.</p>
        ) : null}
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
          </>
        ) : (
          <p className="text-xs text-muted-foreground">자동화 스케줄 섹션이 접혀 있습니다.</p>
        )}
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {deletingId ? (
        <p className="text-sm text-muted-foreground">Deleting selected item...</p>
      ) : null}
      <VideoList
        rows={rows}
        onRegenerate={regenerate}
        onDelete={remove}
        onUpload={upload}
        onInspectStorage={inspectStorage}
        onCleanupStorage={cleanupStorage}
      />
    </div>
  );
}
