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
  youtubeRedirectUri: "http://localhost:3000/oauth2callback",
  youtubeRefreshToken: ""
};

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

export function SettingsForm(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
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

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as AppSettings;
      setSettings({ ...emptySettings, ...data });
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

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Dark Mode / Light Mode</p>
          <Switch checked={theme === "dark"} onCheckedChange={onThemeToggle} />
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
          <CardTitle>Google Sheets</CardTitle>
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
          <CardTitle>YouTube API OAuth</CardTitle>
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
