"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { InstagramGeneratedFeedItem, InstagramTemplate } from "@/lib/instagram-types";
import type { AppSettings, IdeaLanguage } from "@/lib/types";

type TemplateResponse = {
  templates?: InstagramTemplate[];
  activeTemplateId?: string;
  error?: string;
};

type InstagramSheetRow = {
  id: string;
  status: string;
  keyword: string;
  subject: string;
  description: string;
  narration: string;
  raw: Record<string, string>;
};

type SheetRowsResponse = {
  rows?: InstagramSheetRow[];
  count?: number;
  readyOnly?: boolean;
  sheetName?: string;
  error?: string;
};

type GenerateIdeasResponse = {
  headers?: string[];
  items?: Array<Record<string, string>>;
  error?: string;
};

type ApplyIdeasResponse = {
  inserted?: number;
  sheetName?: string;
  error?: string;
};

type DashboardPersistState = {
  maxRows?: string;
  selectedTemplateIds?: string[];
  showRun?: boolean;
  showSchedule?: boolean;
  autoIdeaEnabled?: boolean;
  autoIdeaLanguage?: IdeaLanguage;
  autoIdeaKeywords?: string;
};

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
    };
    nextRunAt?: string;
    lastRunAt?: string;
    lastResult?: "started" | "skipped_running" | "failed";
    lastError?: string;
    updatedAt: string;
  };
  error?: string;
};

const FEED_STORAGE_KEY = "shorts-maker:instagram:generated-feed:v1";
const DASHBOARD_STATE_KEY = "shorts-maker:instagram:dashboard:state:v2";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ig_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function normalizeLanguage(value: string | undefined, fallback: IdeaLanguage = "ko"): IdeaLanguage {
  if (value === "ko" || value === "en" || value === "ja" || value === "es" || value === "hi") {
    return value;
  }
  return fallback;
}

function normalizeMaxRows(value: string | number | undefined, fallback = "3"): string {
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

function normalizeExpression(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function firstNonEmpty(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(record).find(
      (item) =>
        item.trim().toLowerCase().replace(/[\s_-]+/g, "") ===
        key.trim().toLowerCase().replace(/[\s_-]+/g, "")
    );
    if (!found) continue;
    const value = String(record[found] || "").trim();
    if (value) return value;
  }
  return "";
}

function ideaSubject(item: Record<string, string>): string {
  return firstNonEmpty(item, ["subject", "Subject", "kr_intonation", "example_1_title"]);
}

function rowExpressionKey(row: InstagramSheetRow): string {
  const primary = String(row.subject || "").trim();
  if (primary) return normalizeExpression(primary);
  return normalizeExpression(
    firstNonEmpty(row.raw || {}, ["subject", "Subject", "kr_intonation", "example_1_title"])
  );
}

function materialize(text: string, row: Record<string, string>): string {
  let out = String(text || "");
  for (const [key, value] of Object.entries(row || {})) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), String(value || ""));
  }
  return out;
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

function scheduleResultLabel(value: "started" | "skipped_running" | "failed" | undefined): string {
  if (value === "started") return "실행됨";
  if (value === "skipped_running") return "실행중이라 스킵";
  if (value === "failed") return "실패";
  return "-";
}

async function fetchReadyRows(sheetName?: string): Promise<{ rows: InstagramSheetRow[]; sheetName: string }> {
  const query = new URLSearchParams();
  if (sheetName && sheetName.trim()) {
    query.set("sheetName", sheetName.trim());
  }
  const response = await fetch(
    `/api/instagram/sheet-rows${query.toString() ? `?${query.toString()}` : ""}`,
    { cache: "no-store" }
  );
  const data = (await response.json()) as SheetRowsResponse;
  if (!response.ok) {
    throw new Error(data.error || "인스타 시트 row를 불러오지 못했습니다.");
  }
  return {
    rows: data.rows || [],
    sheetName: String(data.sheetName || sheetName || "").trim()
  };
}

export function InstagramDashboardClient(): React.JSX.Element {
  const [templates, setTemplates] = useState<InstagramTemplate[]>([]);
  const [rows, setRows] = useState<InstagramSheetRow[]>([]);
  const [sourceSheetName, setSourceSheetName] = useState("");

  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState("3");

  const [phase, setPhase] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<InstagramGeneratedFeedItem[]>([]);
  const [runError, setRunError] = useState<string>();

  const [showRun, setShowRun] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);

  const [autoIdeaEnabled, setAutoIdeaEnabled] = useState(false);
  const [autoIdeaLanguage, setAutoIdeaLanguage] = useState<IdeaLanguage>("ja");
  const [autoIdeaKeywords, setAutoIdeaKeywords] = useState("");

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState<"daily" | "interval_hours">("daily");
  const [scheduleDailyTime, setScheduleDailyTime] = useState("09:00");
  const [scheduleEveryHours, setScheduleEveryHours] = useState("24");
  const [scheduleItemsPerRun, setScheduleItemsPerRun] = useState("3");
  const [scheduleSheetName, setScheduleSheetName] = useState("");
  const [scheduleAutoIdeaEnabled, setScheduleAutoIdeaEnabled] = useState(false);
  const [scheduleAutoIdeaLanguage, setScheduleAutoIdeaLanguage] = useState<IdeaLanguage>("ja");
  const [scheduleAutoIdeaKeywords, setScheduleAutoIdeaKeywords] = useState("");
  const [scheduleLastRunAt, setScheduleLastRunAt] = useState<string>();
  const [scheduleNextRunAt, setScheduleNextRunAt] = useState<string>();
  const [scheduleLastResult, setScheduleLastResult] = useState<
    "started" | "skipped_running" | "failed" | undefined
  >();
  const [scheduleLastError, setScheduleLastError] = useState<string>();
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState<string>();
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string>();

  const runLockRef = useRef(false);
  const readyRows = useMemo(() => rows, [rows]);

  function pushLog(message: string): void {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogs((prev) => [line, ...prev].slice(0, 200));
  }

  function saveFeedResults(items: InstagramGeneratedFeedItem[]): void {
    setResults(items);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(items));
    }
  }

  function applyScheduleState(schedule: InstagramScheduleResponse["schedule"] | undefined): void {
    const config = schedule?.config;
    setScheduleEnabled(Boolean(config?.enabled));
    setScheduleCadence(config?.cadence === "interval_hours" ? "interval_hours" : "daily");
    setScheduleDailyTime(String(config?.dailyTime || "09:00"));
    setScheduleEveryHours(normalizeIntervalHours(config?.intervalHours ?? 24));
    setScheduleItemsPerRun(normalizeMaxRows(config?.itemsPerRun ?? 3));
    setScheduleSheetName(String(config?.sheetName || sourceSheetName || "").trim());
    setScheduleAutoIdeaEnabled(Boolean(config?.autoIdeaEnabled));
    setScheduleAutoIdeaLanguage(normalizeLanguage(config?.autoIdeaLanguage, "ja"));
    setScheduleAutoIdeaKeywords(String(config?.autoIdeaKeywords || "").trim());
    setScheduleLastRunAt(schedule?.lastRunAt);
    setScheduleNextRunAt(schedule?.nextRunAt);
    setScheduleLastResult(schedule?.lastResult);
    setScheduleLastError(schedule?.lastError);
    setScheduleUpdatedAt(schedule?.updatedAt);
  }

  async function refreshSchedule(showBusy = false): Promise<void> {
    if (showBusy) {
      setScheduleBusy(true);
    }
    try {
      setScheduleError(undefined);
      const response = await fetch("/api/instagram/automation/schedule", { cache: "no-store" });
      const data = (await response.json()) as InstagramScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 자동화 스케줄을 불러오지 못했습니다.");
      }
      applyScheduleState(data.schedule);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "인스타 자동화 스케줄을 불러오지 못했습니다.";
      setScheduleError(message);
      pushLog(`스케줄 조회 실패: ${message}`);
    } finally {
      if (showBusy) {
        setScheduleBusy(false);
      }
    }
  }

  async function saveSchedule(): Promise<void> {
    setScheduleBusy(true);
    setScheduleError(undefined);
    try {
      const response = await fetch("/api/instagram/automation/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scheduleEnabled,
          cadence: scheduleCadence,
          dailyTime: scheduleDailyTime,
          intervalHours: Number.parseInt(scheduleEveryHours, 10) || 24,
          itemsPerRun: Number.parseInt(scheduleItemsPerRun, 10) || 3,
          sheetName: String(scheduleSheetName || sourceSheetName || "").trim() || undefined,
          autoIdeaEnabled: scheduleAutoIdeaEnabled,
          autoIdeaKeywords: String(scheduleAutoIdeaKeywords || "").trim(),
          autoIdeaLanguage: scheduleAutoIdeaLanguage
        })
      });
      const data = (await response.json()) as InstagramScheduleResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 자동화 스케줄 저장에 실패했습니다.");
      }
      applyScheduleState(data.schedule);
      pushLog("스케줄 저장 완료");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "인스타 자동화 스케줄 저장에 실패했습니다.";
      setScheduleError(message);
      pushLog(`스케줄 저장 실패: ${message}`);
    } finally {
      setScheduleBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    const [settingsRes, templateRes] = await Promise.all([
      fetch("/api/settings", { cache: "no-store" }),
      fetch("/api/instagram/templates", { cache: "no-store" })
    ]);

    const settings = (await settingsRes.json()) as AppSettings;
    const templateData = (await templateRes.json()) as TemplateResponse;
    const sheetFromSettings =
      String(settings.gsheetInstagramSheetName || "").trim() ||
      String(settings.gsheetSheetName || "").trim();

    if (!templateRes.ok) {
      throw new Error(templateData.error || "인스타 템플릿을 불러오지 못했습니다.");
    }
    const templateList = templateData.templates || [];
    setTemplates(templateList);
    setSelectedTemplateIds((prev) => {
      const kept = prev.filter((id) => templateList.some((item) => item.id === id));
      if (kept.length > 0) return kept;
      return templateList.slice(0, 1).map((item) => item.id);
    });

    const rowContext = await fetchReadyRows(sheetFromSettings || undefined);
    setRows(rowContext.rows);
    setSourceSheetName(rowContext.sheetName || sheetFromSettings || "");
  }

  function toggleTemplate(templateId: string): void {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  }

  async function generateAndApplyIdeas(args: {
    neededRows: number;
    sheetName?: string;
    existingRows: InstagramSheetRow[];
  }): Promise<number> {
    if (!autoIdeaEnabled) {
      return 0;
    }
    const keywords = parseKeywordList(autoIdeaKeywords);
    if (keywords.length === 0) {
      throw new Error("자동 아이디어가 켜져 있습니다. 키워드를 1개 이상 입력해 주세요.");
    }

    const existingKeys = new Set<string>();
    args.existingRows.forEach((row) => {
      const key = rowExpressionKey(row);
      if (key) existingKeys.add(key);
    });

    let insertedTotal = 0;
    const maxAttempts = Math.max(6, keywords.length * 4);
    let attempt = 0;

    pushLog(
      `아이디어 자동 생성 시작 · 키워드 ${keywords.length}개 · 목표 ${args.neededRows}개 · 중복 회피 활성`
    );

    while (insertedTotal < args.neededRows && attempt < maxAttempts) {
      const keyword = keywords[attempt % keywords.length];
      const remaining = Math.max(1, args.neededRows - insertedTotal);
      const batchCount = Math.min(5, remaining);
      attempt += 1;

      const generateRes = await fetch("/api/instagram/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: keyword,
          count: batchCount,
          sheetName: args.sheetName || undefined,
          idBase: keyword,
          language: autoIdeaLanguage
        })
      });
      const generateData = (await generateRes.json()) as GenerateIdeasResponse;
      if (!generateRes.ok) {
        pushLog(`아이디어 생성 실패(${keyword}): ${generateData.error || "unknown error"}`);
        continue;
      }

      const generatedItems = generateData.items || [];
      const uniqueItems = generatedItems.filter((item) => {
        const subject = ideaSubject(item);
        const key = normalizeExpression(subject);
        if (!key) return false;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      if (uniqueItems.length === 0) {
        pushLog(`중복으로 모두 제외됨(${keyword}) · 재시도`);
        continue;
      }

      const applyRes = await fetch("/api/instagram/ideas/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: args.sheetName || undefined,
          items: uniqueItems
        })
      });
      const applyData = (await applyRes.json()) as ApplyIdeasResponse;
      if (!applyRes.ok) {
        pushLog(`아이디어 시트 반영 실패(${keyword}): ${applyData.error || "unknown error"}`);
        continue;
      }
      const inserted = Number(applyData.inserted || uniqueItems.length || 0);
      insertedTotal += inserted;
      pushLog(`아이디어 반영 성공(${keyword}) · +${inserted}개 (누적 ${insertedTotal})`);
    }

    if (insertedTotal < args.neededRows) {
      pushLog(`아이디어 자동 생성 종료 · 목표 미달(${insertedTotal}/${args.neededRows})`);
    } else {
      pushLog(`아이디어 자동 생성 완료 · ${insertedTotal}개 반영`);
    }
    return insertedTotal;
  }

  async function runAutomation(): Promise<void> {
    if (runLockRef.current) {
      return;
    }
    runLockRef.current = true;
    setRunError(undefined);

    try {
      if (selectedTemplateIds.length === 0) {
        throw new Error("템플릿을 1개 이상 선택해 주세요.");
      }

      const max = Number.parseInt(maxRows, 10) || 3;
      const normalizedMax = Math.max(1, Math.min(10, max));
      setPhase("running");
      pushLog(`수동 자동화 시작 · row ${normalizedMax}개`);

      let currentRows = readyRows;
      let currentSheetName = sourceSheetName;

      if (autoIdeaEnabled) {
        await generateAndApplyIdeas({
          neededRows: normalizedMax,
          sheetName: currentSheetName || undefined,
          existingRows: currentRows
        });
        const refreshed = await fetchReadyRows(currentSheetName || undefined);
        currentRows = refreshed.rows;
        currentSheetName = refreshed.sheetName || currentSheetName;
        setRows(currentRows);
        setSourceSheetName(currentSheetName);
      }

      const expressionSeen = new Set<string>();
      const dedupedRows = currentRows.filter((row) => {
        const key = rowExpressionKey(row);
        if (!key) return false;
        if (expressionSeen.has(key)) return false;
        expressionSeen.add(key);
        return true;
      });

      if (dedupedRows.length === 0) {
        throw new Error("준비 row가 없습니다. 인스타 아이디어를 먼저 생성해 주세요.");
      }

      const pickedRows = dedupedRows.slice(0, normalizedMax);
      if (pickedRows.length < normalizedMax) {
        pushLog(`준비 row 부족: 요청 ${normalizedMax}개 / 사용 ${pickedRows.length}개`);
      }

      const templateMap = new Map(templates.map((item) => [item.id, item]));
      const generated: InstagramGeneratedFeedItem[] = [];

      for (const row of pickedRows) {
        const payload = {
          id: row.id,
          status: row.status,
          keyword: row.keyword,
          subject: row.subject,
          description: row.description,
          narration: row.narration,
          ...(row.raw || {})
        };

        for (const templateId of selectedTemplateIds) {
          const template = templateMap.get(templateId);
          if (!template) continue;
          const pages = template.pages.map((page) => ({
            ...page,
            elements: page.elements.map((element) =>
              element.type === "text"
                ? { ...element, text: materialize(element.text, payload) }
                : element
            )
          }));
          generated.push({
            id: uid(),
            templateId: template.id,
            templateName: template.templateName,
            rowId: row.id,
            subject: row.subject,
            keyword: row.keyword,
            generatedAt: new Date().toISOString(),
            pages
          });
        }
      }

      saveFeedResults(generated);
      setPhase("completed");
      pushLog(`자동화 완료 · 결과 ${generated.length}개 생성`);
    } catch (error) {
      setPhase("failed");
      const message = error instanceof Error ? error.message : "인스타 자동화 실행에 실패했습니다.";
      setRunError(message);
      pushLog(`자동화 실패: ${message}`);
    } finally {
      runLockRef.current = false;
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(FEED_STORAGE_KEY);
    if (raw) {
      try {
        setResults(JSON.parse(raw) as InstagramGeneratedFeedItem[]);
      } catch {
        setResults([]);
      }
    }
    const savedRaw = window.localStorage.getItem(DASHBOARD_STATE_KEY);
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw) as DashboardPersistState;
        if (saved.selectedTemplateIds) setSelectedTemplateIds(saved.selectedTemplateIds);
        if (saved.maxRows) setMaxRows(normalizeMaxRows(saved.maxRows));
        if (typeof saved.showRun === "boolean") setShowRun(saved.showRun);
        if (typeof saved.showSchedule === "boolean") setShowSchedule(saved.showSchedule);
        if (typeof saved.autoIdeaEnabled === "boolean") setAutoIdeaEnabled(saved.autoIdeaEnabled);
        if (saved.autoIdeaLanguage) setAutoIdeaLanguage(normalizeLanguage(saved.autoIdeaLanguage, "ja"));
        if (typeof saved.autoIdeaKeywords === "string") setAutoIdeaKeywords(saved.autoIdeaKeywords);
      } catch {
        // ignore parse error
      }
    }
    void Promise.all([refresh(), refreshSchedule(false)]).catch((error) => {
      const message = error instanceof Error ? error.message : "인스타 대시보드 초기화에 실패했습니다.";
      setRunError(message);
      pushLog(`초기화 실패: ${message}`);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state: DashboardPersistState = {
      maxRows: normalizeMaxRows(maxRows),
      selectedTemplateIds,
      showRun,
      showSchedule,
      autoIdeaEnabled,
      autoIdeaLanguage,
      autoIdeaKeywords
    };
    window.localStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify(state));
  }, [maxRows, selectedTemplateIds, showRun, showSchedule, autoIdeaEnabled, autoIdeaLanguage, autoIdeaKeywords]);

  useEffect(() => {
    if (!scheduleSheetName.trim() && sourceSheetName.trim()) {
      setScheduleSheetName(sourceSheetName.trim());
    }
  }, [sourceSheetName, scheduleSheetName]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Instagram Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          저장된 키워드 기반 아이디어 생성 + 중복 회피 + 피드 자동화를 실행합니다.
        </p>
      </header>

      <div className="sticky top-4 z-20 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">로그</p>
          <p className="text-xs text-muted-foreground">상태: {phase}</p>
        </div>
        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border bg-black/90 p-2 text-xs text-zinc-200">
          {logs.length === 0 ? (
            <p className="text-zinc-400">아직 로그가 없습니다.</p>
          ) : (
            logs.map((line) => <p key={line}>{line}</p>)
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">자동화 실행</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowRun((prev) => !prev)}>
            {showRun ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {showRun ? "접기" : "펼치기"}
          </Button>
        </div>
        {showRun ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>처리할 row 수</Label>
                <Select value={normalizeMaxRows(maxRows)} onValueChange={setMaxRows}>
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                      <SelectItem key={`ig-dashboard-max-${value}`} value={value}>
                        {value}개
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>준비 row</Label>
                <Input value={String(readyRows.length)} disabled />
                <p className="text-xs text-muted-foreground">
                  소스 시트: {sourceSheetName || "(미설정)"}
                </p>
              </div>
            </div>

            <div className="rounded-md border p-2">
              <p className="text-sm font-medium">템플릿 선택(복수)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {templates.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant={selectedTemplateIds.includes(template.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleTemplate(template.id)}
                  >
                    {template.templateName}
                  </Button>
                ))}
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">템플릿이 없습니다.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">자동 아이디어 생성 (키워드 기반)</p>
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
              <p className="mt-2 text-xs text-muted-foreground">
                시트의 기존 표현(Subject)과 중복되면 제외하고 재생성 시도합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runAutomation()} disabled={phase === "running"}>
                자동화 실행
              </Button>
              <Button type="button" variant="outline" onClick={() => void refresh()}>
                새로고침
              </Button>
            </div>
            {runError ? <p className="text-sm text-destructive">{runError}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">자동화 스케줄</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowSchedule((prev) => !prev)}>
            {showSchedule ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            {showSchedule ? "접기" : "펼치기"}
          </Button>
        </div>
        {showSchedule ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>활성화</Label>
                <div className="flex h-10 items-center rounded-md border px-3">
                  <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>주기</Label>
                <Select
                  value={scheduleCadence}
                  onValueChange={(value) =>
                    setScheduleCadence(value === "interval_hours" ? "interval_hours" : "daily")
                  }
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
                  value={scheduleDailyTime}
                  onChange={(event) => setScheduleDailyTime(event.target.value)}
                  disabled={scheduleCadence !== "daily"}
                />
              </div>
              <div className="space-y-1">
                <Label>간격(시간)</Label>
                <Input
                  value={scheduleEveryHours}
                  onChange={(event) => setScheduleEveryHours(normalizeIntervalHours(event.target.value))}
                  disabled={scheduleCadence !== "interval_hours"}
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>처리할 row 수</Label>
                <Select value={normalizeMaxRows(scheduleItemsPerRun)} onValueChange={setScheduleItemsPerRun}>
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, index) => String(index + 1)).map((value) => (
                      <SelectItem key={`ig-dashboard-schedule-max-${value}`} value={value}>
                        {value}개
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>스케줄 대상 시트</Label>
                <Input
                  value={scheduleSheetName}
                  onChange={(event) => setScheduleSheetName(event.target.value)}
                  placeholder={sourceSheetName || "예: insta_post"}
                />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">스케줄 자동 아이디어 생성</p>
                <Switch checked={scheduleAutoIdeaEnabled} onCheckedChange={setScheduleAutoIdeaEnabled} />
              </div>
              <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                <div className="space-y-1">
                  <Label>아이디어 언어</Label>
                  <Select
                    value={scheduleAutoIdeaLanguage}
                    onValueChange={(value) => setScheduleAutoIdeaLanguage(normalizeLanguage(value, "ja"))}
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
                    value={scheduleAutoIdeaKeywords}
                    onChange={(event) => setScheduleAutoIdeaKeywords(event.target.value)}
                    rows={3}
                    placeholder={"예) JLPT N5 동사\n과거 부정형\n일상 회화"}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border p-2 text-xs text-muted-foreground">
              <p>다음 실행: {scheduleNextRunAt ? new Date(scheduleNextRunAt).toLocaleString() : "-"}</p>
              <p>최근 실행: {scheduleLastRunAt ? new Date(scheduleLastRunAt).toLocaleString() : "-"}</p>
              <p>최근 결과: {scheduleResultLabel(scheduleLastResult)}</p>
              <p>마지막 저장: {scheduleUpdatedAt ? new Date(scheduleUpdatedAt).toLocaleString() : "-"}</p>
              {scheduleLastError ? <p className="mt-1 text-destructive">최근 오류: {scheduleLastError}</p> : null}
              <p className="mt-1">스케줄은 서버 Cron으로 동작합니다. 브라우저 탭 유지가 필요 없습니다.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveSchedule()} disabled={scheduleBusy}>
                스케줄 저장
              </Button>
              <Button type="button" variant="outline" onClick={() => void refreshSchedule(true)} disabled={scheduleBusy}>
                스케줄 새로고침
              </Button>
            </div>
            {scheduleError ? <p className="text-sm text-destructive">{scheduleError}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-base font-semibold">완성 결과 미리보기</h2>
        <p className="mt-1 text-xs text-muted-foreground">생성 결과는 [피드] 메뉴와 동일합니다.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => (
            <article key={item.id} className="rounded-lg border p-2">
              <p className="text-xs text-muted-foreground">{item.templateName}</p>
              <p className="truncate text-sm font-medium">{item.subject}</p>
              <p className="text-xs text-muted-foreground">row: {item.rowId}</p>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {item.pages.slice(0, 3).map((page) => (
                  <div key={page.id} className="aspect-[4/5] rounded border" style={{ background: page.backgroundColor }} />
                ))}
              </div>
            </article>
          ))}
          {results.length === 0 ? <p className="text-sm text-muted-foreground">아직 생성된 피드가 없습니다.</p> : null}
        </div>
      </div>
    </section>
  );
}
