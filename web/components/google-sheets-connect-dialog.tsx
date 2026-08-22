"use client";

import { useEffect, useState } from "react";
import { CircleHelp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AppSettings } from "@/lib/types";

type ConnectMode = "service_account" | "google_oauth";

const SHEETS_GUIDE_URL =
  "https://www.notion.so/sunbae-profile/Setting-for-Google-Sheets-31955b83c366801180e7cb9cc8a0df3f?source=copy_link";

/** 시트 URL 또는 ID 문자열에서 스프레드시트 ID만 뽑아냅니다. */
export function extractSpreadsheetId(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }
  return value.replace(/^\/+|\/+$/g, "");
}

/** 서비스 계정 JSON 전체를 붙여넣은 경우 client_email/private_key를 뽑아냅니다. */
function parseServiceAccountJson(raw: string): { clientEmail: string; privateKey: string } | undefined {
  const value = String(raw || "").trim();
  if (!value.startsWith("{")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as { client_email?: string; private_key?: string };
    const clientEmail = String(parsed.client_email || "").trim();
    const privateKey = String(parsed.private_key || "").trim();
    if (!clientEmail || !privateKey) {
      return undefined;
    }
    return { clientEmail, privateKey };
  } catch {
    return undefined;
  }
}

export function GoogleSheetsConnectDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 연동 저장이 끝난 뒤 호출됩니다. 호출 측에서 시트를 다시 조회하세요. */
  onConnected?: () => void | Promise<void>;
  /** 모달을 열게 만든 원본 오류 메시지 */
  reason?: string;
}): React.JSX.Element {
  const { open, onOpenChange, onConnected, reason } = props;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [mode, setMode] = useState<ConnectMode>("service_account");
  const [settings, setSettings] = useState<AppSettings>();

  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [instagramSheetName, setInstagramSheetName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(undefined);
    setMessage(undefined);
    void (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("설정을 불러오지 못했습니다.");
        }
        const data = (await response.json()) as AppSettings;
        if (!mounted) {
          return;
        }
        setSettings(data);
        setSpreadsheetInput(String(data.gsheetSpreadsheetId || ""));
        setSheetName(String(data.gsheetSheetName || "Shorts"));
        setInstagramSheetName(String(data.gsheetInstagramSheetName || ""));
        setClientEmail(String(data.gsheetClientEmail || ""));
        setPrivateKey(String(data.gsheetPrivateKey || ""));
        setOauthClientId(String(data.youtubeClientId || ""));
        setOauthClientSecret(String(data.youtubeClientSecret || ""));
        setMode(data.gsheetClientEmail || !data.youtubeRefreshToken ? "service_account" : "google_oauth");
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "설정을 불러오지 못했습니다.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  function handlePrivateKeyChange(value: string): void {
    const serviceAccount = parseServiceAccountJson(value);
    if (serviceAccount) {
      setClientEmail(serviceAccount.clientEmail);
      setPrivateKey(serviceAccount.privateKey);
      setMessage("서비스 계정 JSON에서 client_email과 private_key를 채웠습니다.");
      return;
    }
    setPrivateKey(value);
  }

  /** 현재 폼 값을 기존 설정 위에 덮어써서 저장합니다. (설정 API는 전체 객체를 대체합니다) */
  async function persistSettings(): Promise<AppSettings> {
    const spreadsheetId = extractSpreadsheetId(spreadsheetInput);
    if (!spreadsheetId) {
      throw new Error("Spreadsheet ID 또는 시트 URL을 입력해 주세요.");
    }
    const merged: AppSettings = {
      ...(settings || {}),
      gsheetSpreadsheetId: spreadsheetId,
      gsheetSheetName: String(sheetName || "Shorts").trim() || "Shorts",
      gsheetInstagramSheetName: String(instagramSheetName || "").trim(),
      gsheetClientEmail: mode === "service_account" ? clientEmail.trim() : String(settings?.gsheetClientEmail || ""),
      gsheetPrivateKey: mode === "service_account" ? privateKey.trim() : String(settings?.gsheetPrivateKey || ""),
      youtubeClientId: oauthClientId.trim(),
      youtubeClientSecret: oauthClientSecret.trim()
    };
    if (!String(merged.youtubeRedirectUri || "").trim() && typeof window !== "undefined") {
      merged.youtubeRedirectUri = `${window.location.origin}/oauth2callback`;
    }
    if (mode === "service_account" && (!merged.gsheetClientEmail || !merged.gsheetPrivateKey)) {
      throw new Error("서비스 계정 Client Email과 Private Key를 모두 입력해 주세요.");
    }

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged)
    });
    const data = (await response.json()) as AppSettings & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "설정 저장에 실패했습니다.");
    }
    setSettings(data);
    return data;
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await persistSettings();
      setMessage("Google Sheets 연동 정보를 저장했습니다.");
      await onConnected?.();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGoogleOAuth(): Promise<void> {
    setOauthStarting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await persistSettings();
      const response = await fetch("/api/google/oauth/start?scope=sheets", { cache: "no-store" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Google 동의 화면 주소를 만들지 못했습니다.");
      }
      window.location.href = data.url;
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Google 연동을 시작하지 못했습니다.");
      setOauthStarting(false);
    }
  }

  const busy = loading || saving || oauthStarting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Google Sheets 연동
            <a
              href={SHEETS_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              title="Google Sheets 설정 가이드"
            >
              <CircleHelp className="h-4 w-4" />
            </a>
          </DialogTitle>
          <DialogDescription>
            아이디어/피드 자동화는 Google Sheets를 소스로 사용합니다. 여기서 바로 연결하면 Settings 화면으로 이동하지 않아도 됩니다.
          </DialogDescription>
        </DialogHeader>

        {reason ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            {reason}
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sheets-connect-spreadsheet">시트 URL 또는 Spreadsheet ID</Label>
            <Input
              id="sheets-connect-spreadsheet"
              value={spreadsheetInput}
              onChange={(event) => setSpreadsheetInput(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..../edit"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              시트 주소를 그대로 붙여넣으면 ID만 자동으로 추출합니다.
              {extractSpreadsheetId(spreadsheetInput) ? ` (ID: ${extractSpreadsheetId(spreadsheetInput)})` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sheets-connect-sheet-name">기본 탭 이름</Label>
              <Input
                id="sheets-connect-sheet-name"
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
                placeholder="Shorts"
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sheets-connect-instagram-sheet-name">인스타그램 탭 이름</Label>
              <Input
                id="sheets-connect-instagram-sheet-name"
                value={instagramSheetName}
                onChange={(event) => setInstagramSheetName(event.target.value)}
                placeholder="예: insta_post (비우면 기본 탭 사용)"
                disabled={busy}
              />
            </div>
          </div>

          <div className="flex gap-1 rounded-lg border p-1">
            {(
              [
                { id: "service_account" as ConnectMode, label: "서비스 계정 키" },
                { id: "google_oauth" as ConnectMode, label: "Google 계정 연동" }
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  mode === item.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
                onClick={() => setMode(item.id)}
                disabled={busy}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === "service_account" ? (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Google Cloud 서비스 계정 JSON을 아래 Private Key 칸에 통째로 붙여넣으면 Client Email까지 자동으로 채워집니다.
                시트는 해당 client_email 계정에 편집자로 공유되어 있어야 합니다.
              </p>
              <div className="space-y-1">
                <Label htmlFor="sheets-connect-client-email">Client Email</Label>
                <Input
                  id="sheets-connect-client-email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="xxx@yyy.iam.gserviceaccount.com"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheets-connect-private-key">Private Key (또는 서비스 계정 JSON 전체)</Label>
                <Textarea
                  id="sheets-connect-private-key"
                  rows={5}
                  value={privateKey}
                  onChange={(event) => handlePrivateKeyChange(event.target.value)}
                  placeholder={"-----BEGIN PRIVATE KEY-----\n..."}
                  disabled={busy}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Google 동의 화면으로 이동해 Sheets 권한을 부여합니다. Google Cloud 콘솔에서 만든 OAuth 클라이언트 정보가 필요합니다.
              </p>
              <div className="space-y-1">
                <Label htmlFor="sheets-connect-oauth-client-id">OAuth Client ID</Label>
                <Input
                  id="sheets-connect-oauth-client-id"
                  value={oauthClientId}
                  onChange={(event) => setOauthClientId(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheets-connect-oauth-client-secret">OAuth Client Secret</Label>
                <Input
                  id="sheets-connect-oauth-client-secret"
                  type="password"
                  value={oauthClientSecret}
                  onChange={(event) => setOauthClientSecret(event.target.value)}
                  disabled={busy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                리디렉션 URI:{" "}
                <code>{typeof window === "undefined" ? "/oauth2callback" : `${window.location.origin}/oauth2callback`}</code>
              </p>
              <Button type="button" variant="outline" onClick={() => void handleGoogleOAuth()} disabled={busy}>
                {oauthStarting ? "연동 준비 중..." : "Google 동의 화면 열기"}
                <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-500">{message}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving || oauthStarting}>
              나중에 하기
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={busy}>
              {saving ? "저장 중..." : "저장하고 다시 불러오기"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
