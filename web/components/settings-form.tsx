"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppSettings } from "@/lib/types";
import { AppTheme, applyTheme, getStoredTheme, setStoredTheme, THEME_CHANGED_EVENT } from "@/lib/theme";

const emptySettings: AppSettings = {
  openaiApiKey: "",
  geminiApiKey: "",
  gsheetSpreadsheetId: "",
  gsheetClientEmail: "",
  gsheetPrivateKey: "",
  gsheetSheetName: "Shorts",
  youtubeClientId: "",
  youtubeClientSecret: "",
  youtubeRedirectUri: "http://localhost:3000/oauth2callback",
  youtubeRefreshToken: ""
};

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
          <CardTitle>AI Keys</CardTitle>
          <CardDescription>Gemini 키가 있으면 Gemini 우선, 없으면 OpenAI를 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
