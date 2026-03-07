"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppSettings } from "@/lib/types";
import { AppTheme, applyTheme, getStoredTheme, setStoredTheme, THEME_CHANGED_EVENT } from "@/lib/theme";

const emptySettings: AppSettings = {
  openaiApiKey: "",
  geminiApiKey: "",
  aiMode: "auto",
  aiTextProvider: "gemini",
  aiImageProvider: "gemini",
  aiTtsProvider: "openai",
  openaiTextModel: "gpt-4.1-mini",
  openaiImageModel: "gpt-image-1-mini",
  openaiTtsModel: "gpt-4o-mini-tts",
  geminiTextModel: "gemini-2.5-flash-lite",
  geminiImageModel: "gemini-2.5-flash-image",
  geminiTtsModel: "gemini-2.5-flash-preview-tts",
  gsheetSpreadsheetId: "",
  gsheetClientEmail: "",
  gsheetPrivateKey: "",
  gsheetSheetName: "Shorts",
  youtubeClientId: "",
  youtubeClientSecret: "",
  youtubeRedirectUri: "",
  youtubeRefreshToken: "",
  youtubeChannelName: ""
};

interface LocalCleanupTargetSummary {
  key: "web_generated" | "video_engine_outputs";
  label: string;
  absolutePath: string;
  exists: boolean;
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
}

interface LocalCleanupResponse {
  ok?: boolean;
  targets?: LocalCleanupTargetSummary[];
  totalFileCount?: number;
  totalDirectoryCount?: number;
  totalSizeBytes?: number;
  error?: string;
}

interface VideoEngineCheckSummary {
  url: string;
  status: "ok" | "error";
  latencyMs: number;
  httpStatus?: number;
  error?: string;
}

interface VideoEngineStatusResponse {
  primaryUrl?: string | null;
  fallbackUrl?: string | null;
  baseUrls?: string[];
  timeoutMs?: number;
  sharedSecretConfigured?: boolean;
  connectedUrl?: string | null;
  checks?: VideoEngineCheckSummary[];
  error?: string;
}

interface ModelOption {
  value: string;
  label: string;
}

const customModelOption = "__custom_model__";

const OPENAI_TEXT_MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini (추천 · 저비용)" },
  { value: "gpt-4.1", label: "gpt-4.1 (고품질)" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini (빠름)" }
];

const OPENAI_IMAGE_MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-image-1-mini", label: "gpt-image-1-mini (추천 · 저비용)" },
  { value: "gpt-image-1", label: "gpt-image-1 (고품질)" }
];

const OPENAI_TTS_MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts (추천 · 저비용)" },
  { value: "tts-1", label: "tts-1 (기본)" },
  { value: "tts-1-hd", label: "tts-1-hd (고음질)" }
];

const GEMINI_TEXT_MODEL_OPTIONS: ModelOption[] = [
  { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite (추천 · 저비용)" },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash (균형)" }
];

const GEMINI_IMAGE_MODEL_OPTIONS: ModelOption[] = [
  { value: "gemini-3-pro-image-preview", label: "gemini-3-pro-image-preview (최신 · Preview)" },
  { value: "gemini-2.5-flash-image", label: "gemini-2.5-flash-image (안정 · Nano Banana)" }
];

const GEMINI_TTS_MODEL_OPTIONS: ModelOption[] = [
  { value: "gemini-2.5-flash-preview-tts", label: "gemini-2.5-flash-preview-tts (권장)" }
];

function detectModelPreset(value: string | undefined, options: ModelOption[]): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return options[0]?.value || customModelOption;
  }
  return options.some((item) => item.value === normalized) ? normalized : customModelOption;
}

type ProviderChip = "openai" | "gemini" | "both" | "none";

function resolveProviderChip(settings: AppSettings, task: "text" | "image" | "tts"): ProviderChip {
  const mode = String(settings.aiMode || "auto").trim().toLowerCase();
  const hasOpenAi = Boolean(String(settings.openaiApiKey || "").trim());
  const hasGemini = Boolean(String(settings.geminiApiKey || "").trim());

  if (mode === "openai") {
    return "openai";
  }
  if (mode === "gemini") {
    return "gemini";
  }
  if (mode === "mixed") {
    const configured =
      task === "text"
        ? String(settings.aiTextProvider || "").trim().toLowerCase()
        : task === "image"
          ? String(settings.aiImageProvider || "").trim().toLowerCase()
          : String(settings.aiTtsProvider || "").trim().toLowerCase();
    if (configured === "openai" || configured === "gemini") {
      return configured;
    }
  }

  if (hasOpenAi && hasGemini) {
    return "both";
  }
  if (hasGemini) {
    return "gemini";
  }
  if (hasOpenAi) {
    return "openai";
  }
  return "none";
}

function providerChipLabel(provider: ProviderChip): string {
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "gemini") {
    return "Gemini";
  }
  if (provider === "both") {
    return "OpenAI + Gemini";
  }
  return "미설정";
}

function providerChipClass(provider: ProviderChip): string {
  if (provider === "openai") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200";
  }
  if (provider === "gemini") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (provider === "both") {
    return "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200";
}

function HelpLabel(props: {
  htmlFor: string;
  label: string;
  help: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      <span className="group relative inline-flex items-center justify-center">
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${props.label} 도움말`}
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
        <span className="pointer-events-none absolute left-1/2 top-[120%] z-30 hidden w-72 -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-2 text-[11px] leading-4 text-zinc-900 shadow-xl group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
          {props.help}
        </span>
      </span>
    </div>
  );
}

function formatBytes(bytes: number | undefined): string {
  const value = Number(bytes || 0);
  if (value <= 0) {
    return "0 B";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SettingsForm(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [localCleanup, setLocalCleanup] = useState<LocalCleanupResponse>();
  const [localCleanupLoading, setLocalCleanupLoading] = useState(false);
  const [localCleanupRunning, setLocalCleanupRunning] = useState(false);
  const [localCleanupError, setLocalCleanupError] = useState<string>();
  const [videoEngineStatus, setVideoEngineStatus] = useState<VideoEngineStatusResponse>();
  const [videoEngineStatusLoading, setVideoEngineStatusLoading] = useState(false);
  const [videoEngineStatusError, setVideoEngineStatusError] = useState<string>();
  const [theme, setTheme] = useState<AppTheme>("light");
  const currentTextProvider = useMemo(
    () => resolveProviderChip(settings, "text"),
    [settings]
  );
  const currentImageProvider = useMemo(
    () => resolveProviderChip(settings, "image"),
    [settings]
  );
  const currentTtsProvider = useMemo(
    () => resolveProviderChip(settings, "tts"),
    [settings]
  );
  const youtubeRedirectPlaceholder = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://your-domain.com/oauth2callback";
    }
    return `${window.location.origin}/oauth2callback`;
  }, []);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as AppSettings;
      const merged = { ...emptySettings, ...data };
      if (!String(merged.youtubeRedirectUri || "").trim() && typeof window !== "undefined") {
        merged.youtubeRedirectUri = `${window.location.origin}/oauth2callback`;
      }
      setSettings(merged);
    };
    void load();

    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  useEffect(() => {
    const onThemeChanged = (event: Event) => {
      const custom = event as CustomEvent<{ theme?: AppTheme }>;
      const next = custom.detail?.theme === "dark" ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };
    window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
  }, []);

  useEffect(() => {
    void refreshLocalCleanupSummary();
  }, []);

  useEffect(() => {
    void refreshVideoEngineStatus();
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function refreshVideoEngineStatus(): Promise<void> {
    setVideoEngineStatusLoading(true);
    setVideoEngineStatusError(undefined);
    try {
      const response = await fetch("/api/video-engine/status", { cache: "no-store" });
      const data = (await response.json()) as VideoEngineStatusResponse;
      if (!response.ok) {
        throw new Error(data.error || "비디오 엔진 상태를 불러오지 못했습니다.");
      }
      setVideoEngineStatus(data);
    } catch (error) {
      setVideoEngineStatusError(
        error instanceof Error ? error.message : "비디오 엔진 상태를 불러오지 못했습니다."
      );
    } finally {
      setVideoEngineStatusLoading(false);
    }
  }

  async function refreshLocalCleanupSummary(): Promise<void> {
    setLocalCleanupLoading(true);
    setLocalCleanupError(undefined);
    try {
      const response = await fetch("/api/local-assets/cleanup", { cache: "no-store" });
      const data = (await response.json()) as LocalCleanupResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "로컬 파일 현황을 불러오지 못했습니다.");
      }
      setLocalCleanup(data);
    } catch (error) {
      setLocalCleanupError(
        error instanceof Error ? error.message : "로컬 파일 현황을 불러오지 못했습니다."
      );
    } finally {
      setLocalCleanupLoading(false);
    }
  }

  async function cleanupLocalAssets(): Promise<void> {
    const confirmed = window.confirm(
      "로컬 생성 파일을 정리할까요?\n\n" +
        "- web/public/generated\n" +
        "- ../video-engine/outputs\n\n" +
        "S3/실섭 버킷에는 영향을 주지 않습니다."
    );
    if (!confirmed) {
      return;
    }

    setLocalCleanupRunning(true);
    setLocalCleanupError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch("/api/local-assets/cleanup", {
        method: "DELETE"
      });
      const data = (await response.json()) as LocalCleanupResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "로컬 파일 정리에 실패했습니다.");
      }
      setLocalCleanup(data);
      setMessage("로컬 생성 파일 정리가 완료되었습니다.");
    } catch (error) {
      setLocalCleanupError(
        error instanceof Error ? error.message : "로컬 파일 정리에 실패했습니다."
      );
    } finally {
      setLocalCleanupRunning(false);
    }
  }

  function onThemeToggle(checked: boolean): void {
    const next: AppTheme = checked ? "dark" : "light";
    setTheme(next);
    setStoredTheme(next);
  }

  function applyLowCostModelDefaults(): void {
    setSettings((prev) => ({
      ...prev,
      openaiTextModel: "gpt-4.1-mini",
      openaiImageModel: "gpt-image-1-mini",
      openaiTtsModel: "gpt-4o-mini-tts",
      geminiTextModel: "gemini-2.5-flash-lite",
      geminiImageModel: "gemini-2.5-flash-image",
      geminiTtsModel: "gemini-2.5-flash-preview-tts"
    }));
    setMessage("저비용 추천 모델값을 적용했습니다. 저장 버튼을 눌러 반영하세요.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error || "Failed to save settings.");
      }

      setMessage("Settings saved.");
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            다크 모드에서는 정보 텍스트에 <span className="text-info">#34d399</span> 포인트 색상을 사용합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Dark Mode / Light Mode</p>
          <Switch checked={theme === "dark"} onCheckedChange={onThemeToggle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Video Engine 연결 상태</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshVideoEngineStatus()}
              disabled={videoEngineStatusLoading}
            >
              {videoEngineStatusLoading ? "확인 중..." : "상태 새로고침"}
            </Button>
          </CardTitle>
          <CardDescription>
            현재 서버가 사용하는 비디오 엔진 우선순위와 헬스 체크 결과를 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Primary URL</p>
              <p className="break-all text-sm font-medium">{videoEngineStatus?.primaryUrl || "-"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Fallback URL</p>
              <p className="break-all text-sm font-medium">{videoEngineStatus?.fallbackUrl || "-"}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">현재 연결 대상</p>
              <p className="break-all text-sm font-medium">{videoEngineStatus?.connectedUrl || "연결 실패"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">요청 타임아웃</p>
              <p className="text-sm font-medium">
                {Number(videoEngineStatus?.timeoutMs || 0) > 0
                  ? `${Math.round(Number(videoEngineStatus?.timeoutMs) / 1000)}초`
                  : "-"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">공유 시크릿 설정</p>
              <Badge variant={videoEngineStatus?.sharedSecretConfigured ? "default" : "destructive"}>
                {videoEngineStatus?.sharedSecretConfigured ? "설정됨" : "미설정"}
              </Badge>
            </div>
          </div>

          {(videoEngineStatus?.baseUrls || []).length > 0 ? (
            <div className="rounded-lg border">
              <div className="divide-y">
                {(videoEngineStatus?.baseUrls || []).map((url, index) => {
                  const check = (videoEngineStatus?.checks || []).find((item) => item.url === url);
                  return (
                    <div key={url} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {index === 0 ? "1순위" : `${index + 1}순위`} · {url}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {check
                            ? `응답 ${check.latencyMs}ms${check.httpStatus ? ` · HTTP ${check.httpStatus}` : ""}${check.error ? ` · ${check.error}` : ""}`
                            : "상태 정보 없음"}
                        </p>
                      </div>
                      <Badge variant={check?.status === "ok" ? "default" : "destructive"}>
                        {check?.status === "ok" ? "정상" : "오류"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">설정된 비디오 엔진 URL이 없습니다.</p>
          )}

          {videoEngineStatusError ? (
            <p className="text-sm text-destructive">{videoEngineStatusError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>AI Keys</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted" className={`text-xs ${providerChipClass(currentTextProvider)}`}>
                텍스트: {providerChipLabel(currentTextProvider)}
              </Badge>
              <Badge variant="muted" className={`text-xs ${providerChipClass(currentImageProvider)}`}>
                이미지: {providerChipLabel(currentImageProvider)}
              </Badge>
              <Badge variant="muted" className={`text-xs ${providerChipClass(currentTtsProvider)}`}>
                TTS: {providerChipLabel(currentTtsProvider)}
              </Badge>
            </div>
          </CardTitle>
          <CardDescription>
            명시적 모드(단일/혼합)와 모델을 설정해 API 사용처를 직접 제어합니다.
            {" "}
            이 값에 따라 Create/템플릿 화면의 보이스 목록이 자동으로 바뀝니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <HelpLabel
                htmlFor="aiMode"
                label="AI 사용 모드"
                help="auto: 키 기준 자동 선택, openai/gemini: 단일 고정, mixed: 텍스트/이미지/음성을 각각 선택합니다."
              />
              <Select
                value={settings.aiMode || "auto"}
                onValueChange={(value) => update("aiMode", value as AppSettings["aiMode"])}
              >
                <SelectTrigger id="aiMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">자동 선택 (기존 동작)</SelectItem>
                  <SelectItem value="openai">OpenAI만 사용</SelectItem>
                  <SelectItem value="gemini">Gemini만 사용</SelectItem>
                  <SelectItem value="mixed">혼합 사용 (작업별 선택)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {settings.aiMode === "mixed" ? (
            <div className="grid gap-3 md:grid-cols-3 rounded-lg border p-3">
              <div className="space-y-2">
                <Label>텍스트 생성 Provider</Label>
                <Select
                  value={settings.aiTextProvider || "gemini"}
                  onValueChange={(value) =>
                    update("aiTextProvider", value as AppSettings["aiTextProvider"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>이미지 생성 Provider</Label>
                <Select
                  value={settings.aiImageProvider || "gemini"}
                  onValueChange={(value) =>
                    update("aiImageProvider", value as AppSettings["aiImageProvider"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>음성(TTS) Provider</Label>
                <Select
                  value={settings.aiTtsProvider || "openai"}
                  onValueChange={(value) =>
                    update("aiTtsProvider", value as AppSettings["aiTtsProvider"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <HelpLabel
              htmlFor="openaiApiKey"
              label="OpenAI API Key"
              help="OpenAI 대시보드에서 API Keys를 생성해 입력하세요. 형식은 보통 `sk-...` 입니다."
            />
            <Input
              id="openaiApiKey"
              type="password"
              value={settings.openaiApiKey}
              onChange={(e) => update("openaiApiKey", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="geminiApiKey"
              label="Gemini API Key"
              help="Google AI Studio에서 API Key를 생성해 입력하세요. 값이 있으면 이미지/텍스트 생성에 우선 사용됩니다."
            />
            <Input
              id="geminiApiKey"
              type="password"
              value={settings.geminiApiKey}
              onChange={(e) => update("geminiApiKey", e.target.value)}
            />
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                모델명을 몰라도 프리셋으로 선택할 수 있습니다. 제일 저렴하게 쓰려면 추천(저비용) 항목을 사용하세요.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={applyLowCostModelDefaults}>
                저비용 추천값 적용
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="openaiTextModel">OpenAI Text Model</Label>
                <Select
                  value={detectModelPreset(settings.openaiTextModel, OPENAI_TEXT_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("openaiTextModel", value === customModelOption ? settings.openaiTextModel || "" : value)
                  }
                >
                  <SelectTrigger id="openaiTextModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_TEXT_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.openaiTextModel, OPENAI_TEXT_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.openaiTextModel || ""}
                    onChange={(e) => update("openaiTextModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="geminiTextModel">Gemini Text Model</Label>
                <Select
                  value={detectModelPreset(settings.geminiTextModel, GEMINI_TEXT_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("geminiTextModel", value === customModelOption ? settings.geminiTextModel || "" : value)
                  }
                >
                  <SelectTrigger id="geminiTextModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEMINI_TEXT_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.geminiTextModel, GEMINI_TEXT_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.geminiTextModel || ""}
                    onChange={(e) => update("geminiTextModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="openaiImageModel">OpenAI Image Model</Label>
                <Select
                  value={detectModelPreset(settings.openaiImageModel, OPENAI_IMAGE_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("openaiImageModel", value === customModelOption ? settings.openaiImageModel || "" : value)
                  }
                >
                  <SelectTrigger id="openaiImageModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.openaiImageModel, OPENAI_IMAGE_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.openaiImageModel || ""}
                    onChange={(e) => update("openaiImageModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="geminiImageModel">Gemini Image Model</Label>
                <Select
                  value={detectModelPreset(settings.geminiImageModel, GEMINI_IMAGE_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("geminiImageModel", value === customModelOption ? settings.geminiImageModel || "" : value)
                  }
                >
                  <SelectTrigger id="geminiImageModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEMINI_IMAGE_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.geminiImageModel, GEMINI_IMAGE_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.geminiImageModel || ""}
                    onChange={(e) => update("geminiImageModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="openaiTtsModel">OpenAI TTS Model</Label>
                <Select
                  value={detectModelPreset(settings.openaiTtsModel, OPENAI_TTS_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("openaiTtsModel", value === customModelOption ? settings.openaiTtsModel || "" : value)
                  }
                >
                  <SelectTrigger id="openaiTtsModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_TTS_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.openaiTtsModel, OPENAI_TTS_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.openaiTtsModel || ""}
                    onChange={(e) => update("openaiTtsModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="geminiTtsModel">Gemini TTS Model</Label>
                <Select
                  value={detectModelPreset(settings.geminiTtsModel, GEMINI_TTS_MODEL_OPTIONS)}
                  onValueChange={(value) =>
                    update("geminiTtsModel", value === customModelOption ? settings.geminiTtsModel || "" : value)
                  }
                >
                  <SelectTrigger id="geminiTtsModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEMINI_TTS_MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={customModelOption}>직접 입력</SelectItem>
                  </SelectContent>
                </Select>
                {detectModelPreset(settings.geminiTtsModel, GEMINI_TTS_MODEL_OPTIONS) === customModelOption ? (
                  <Input
                    value={settings.geminiTtsModel || ""}
                    onChange={(e) => update("geminiTtsModel", e.target.value)}
                    placeholder="직접 모델명 입력"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Google Sheets</span>
            <a
              href="https://www.notion.so/sunbae-profile/Setting-for-Google-Sheets-31955b83c366801180e7cb9cc8a0df3f?source=copy_link"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Google Sheets 설정 가이드 열기"
              title="Google Sheets 설정 가이드"
            >
              <CircleHelp className="h-4 w-4" />
            </a>
          </CardTitle>
          <CardDescription>워크플로우 결과를 시트에 저장할 때 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <HelpLabel
              htmlFor="gsheetSpreadsheetId"
              label="Spreadsheet ID"
              help="시트 URL `.../spreadsheets/d/{여기}/edit` 의 `{여기}` 값입니다."
            />
            <Input
              id="gsheetSpreadsheetId"
              value={settings.gsheetSpreadsheetId}
              onChange={(e) => update("gsheetSpreadsheetId", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="gsheetClientEmail"
              label="Client Email"
              help="Google Cloud 서비스 계정의 client_email 값을 입력하세요. 시트 공유 대상에도 이 이메일을 추가해야 합니다."
            />
            <Input
              id="gsheetClientEmail"
              value={settings.gsheetClientEmail}
              onChange={(e) => update("gsheetClientEmail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="gsheetPrivateKey"
              label="Private Key"
              help="서비스 계정 JSON의 private_key 전체를 붙여넣으세요. 줄바꿈 포함 그대로 입력합니다."
            />
            <Textarea
              id="gsheetPrivateKey"
              rows={6}
              value={settings.gsheetPrivateKey}
              onChange={(e) => update("gsheetPrivateKey", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="gsheetSheetName"
              label="Sheet Name"
              help="실제로 읽고 쓸 탭 이름입니다. 기본값은 `Shorts` 입니다."
            />
            <Input
              id="gsheetSheetName"
              value={settings.gsheetSheetName}
              onChange={(e) => update("gsheetSheetName", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local File Cleanup</CardTitle>
          <CardDescription>
            테스트 환경용 로컬 생성 파일 정리입니다. S3/실섭 버킷과 무관하게 `web/public/generated`,
            `video-engine/outputs`만 정리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshLocalCleanupSummary()}
              disabled={localCleanupLoading}
            >
              {localCleanupLoading ? "확인 중..." : "로컬 파일 현황 새로고침"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void cleanupLocalAssets()}
              disabled={localCleanupRunning}
            >
              {localCleanupRunning ? "정리 중..." : "로컬 파일 정리"}
            </Button>
          </div>

          {localCleanup ? (
            <div className="rounded-lg border">
              <div className="grid gap-3 border-b p-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">총 파일 수</p>
                  <p className="text-sm font-medium">{localCleanup.totalFileCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">총 디렉터리 수</p>
                  <p className="text-sm font-medium">{localCleanup.totalDirectoryCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">총 용량</p>
                  <p className="text-sm font-medium">{formatBytes(localCleanup.totalSizeBytes)}</p>
                </div>
              </div>
              <div className="divide-y">
                {(localCleanup.targets || []).map((target) => (
                  <div key={target.key} className="space-y-1 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{target.label}</p>
                      <Badge variant={target.exists ? "muted" : "default"}>
                        {target.exists ? "존재" : "없음"}
                      </Badge>
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{target.absolutePath}</p>
                    <p className="text-xs text-muted-foreground">
                      파일 {target.fileCount}개 | 폴더 {target.directoryCount}개 | 용량 {formatBytes(target.totalSizeBytes)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {localCleanupError ? (
            <p className="text-sm text-destructive">{localCleanupError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>YouTube API OAuth</span>
            <a
              href="https://www.notion.so/sunbae-profile/Youtute-token-31555b83c3668065a83ee0a0570ad1e2?source=copy_link"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="YouTube API OAuth 설정 가이드 열기"
              title="YouTube API OAuth 설정 가이드"
            >
              <CircleHelp className="h-4 w-4" />
            </a>
          </CardTitle>
          <CardDescription>업로드 기능(`POST /api/upload-youtube`)에 필요합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <HelpLabel
              htmlFor="youtubeClientId"
              label="Client ID"
              help="Google Cloud OAuth 2.0 Client ID 값을 입력하세요. 웹 앱 타입으로 생성해야 합니다."
            />
            <Input
              id="youtubeClientId"
              value={settings.youtubeClientId}
              onChange={(e) => update("youtubeClientId", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="youtubeClientSecret"
              label="Client Secret"
              help="위 Client ID와 동일한 OAuth 클라이언트의 Secret 값입니다."
            />
            <Input
              id="youtubeClientSecret"
              type="password"
              value={settings.youtubeClientSecret}
              onChange={(e) => update("youtubeClientSecret", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="youtubeRedirectUri"
              label="Redirect URI"
              help="Google Cloud OAuth 승인된 redirect URI와 정확히 일치해야 합니다."
            />
            <Input
              id="youtubeRedirectUri"
              value={settings.youtubeRedirectUri}
              onChange={(e) => update("youtubeRedirectUri", e.target.value)}
              placeholder={youtubeRedirectPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="youtubeRefreshToken"
              label="Refresh Token"
              help="offline access로 발급한 refresh token입니다. 배포 환경에서 별도로 재발급이 필요할 수 있습니다."
            />
            <Input
              id="youtubeRefreshToken"
              type="password"
              value={settings.youtubeRefreshToken}
              onChange={(e) => update("youtubeRefreshToken", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="youtubeChannelName"
              label="채널명(표시용)"
              help="여러 계정을 함께 관리할 때, Settings 화면에서 식별하기 위한 표시용 이름입니다."
            />
            <Input
              id="youtubeChannelName"
              value={settings.youtubeChannelName}
              onChange={(e) => update("youtubeChannelName", e.target.value)}
              placeholder="예: Sunbae Shorts Main"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </form>
  );
}
