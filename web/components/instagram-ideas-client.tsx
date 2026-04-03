"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractPromptVariables, INSTAGRAM_IDEA_DEFAULT_PROMPT } from "@/lib/instagram-ideas-prompt";
import { AppSettings, IdeaLanguage } from "@/lib/types";

type PromptResponse = {
  template?: string;
  error?: string;
};

type GenerateResponse = {
  headers?: string[];
  items?: Array<Record<string, string>>;
  error?: string;
};

type SheetTableResponse = {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
};

type ApplyResponse = {
  inserted: number;
  sheetName: string;
  error?: string;
};

const DRAFT_KEY = "shorts-maker:instagram:ideas:draft:v1";

function normalizeLanguage(value: string): IdeaLanguage {
  if (value === "en" || value === "ja" || value === "es" || value === "hi") {
    return value;
  }
  return "ko";
}

function getCellValue(row: Record<string, string>, header: string): string {
  const key = Object.keys(row).find(
    (item) =>
      item.trim().toLowerCase().replace(/[\s_-]+/g, "") ===
      header.trim().toLowerCase().replace(/[\s_-]+/g, "")
  );
  return key ? String(row[key] || "") : "";
}

export function InstagramIdeasClient(): React.JSX.Element {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [language, setLanguage] = useState<IdeaLanguage>("ja");
  const [sheetName, setSheetName] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");

  const [loadingSheet, setLoadingSheet] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Record<string, string>[]>([]);

  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState(INSTAGRAM_IDEA_DEFAULT_PROMPT);
  const [promptVariables, setPromptVariables] = useState<Record<string, string>>({
    num: "N5"
  });

  const [generatedHeaders, setGeneratedHeaders] = useState<string[]>([]);
  const [generatedRows, setGeneratedRows] = useState<Array<Record<string, string>>>([]);
  const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<string[]>([]);

  const promptKeys = useMemo(() => extractPromptVariables(promptTemplate), [promptTemplate]);
  const previewHeaders = useMemo(() => {
    if (generatedHeaders.length > 0) return generatedHeaders;
    const seen = new Set<string>();
    const output: string[] = [];
    generatedRows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        const normalized = key.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        output.push(key);
      });
    });
    return output;
  }, [generatedHeaders, generatedRows]);
  const allPreviewKeys = useMemo(
    () => generatedRows.map((_, index) => `row-${index}`),
    [generatedRows]
  );
  const allPreviewSelected =
    allPreviewKeys.length > 0 && allPreviewKeys.every((key) => selectedPreviewKeys.includes(key));

  const sheetShortcutUrl = useMemo(() => {
    const id = spreadsheetId.trim();
    if (!id) return "";
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }, [spreadsheetId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        topic?: string;
        count?: string;
        language?: IdeaLanguage;
        sheetName?: string;
        promptVariables?: Record<string, string>;
      };
      if (typeof parsed.topic === "string") setTopic(parsed.topic);
      if (typeof parsed.count === "string" && parsed.count) setCount(parsed.count);
      if (typeof parsed.sheetName === "string") setSheetName(parsed.sheetName);
      if (parsed.language) setLanguage(normalizeLanguage(parsed.language));
      if (parsed.promptVariables && typeof parsed.promptVariables === "object") {
        setPromptVariables(parsed.promptVariables);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        topic,
        count,
        language,
        sheetName,
        promptVariables
      })
    );
  }, [topic, count, language, sheetName, promptVariables]);

  useEffect(() => {
    const load = async () => {
      let preferredSheetName = "";
      try {
        const [settingsRes, promptRes] = await Promise.all([
          fetch("/api/settings", { cache: "no-store" }),
          fetch("/api/instagram/ideas/prompt", { cache: "no-store" })
        ]);

        if (settingsRes.ok) {
          const settings = (await settingsRes.json()) as AppSettings;
          setSpreadsheetId(String(settings.gsheetSpreadsheetId || ""));
          preferredSheetName =
            String(settings.gsheetInstagramSheetName || "").trim() ||
            String(settings.gsheetSheetName || "").trim();
          if (preferredSheetName) {
            setSheetName((prev) => (prev.trim() ? prev : preferredSheetName));
          }
        }

        if (promptRes.ok) {
          const promptData = (await promptRes.json()) as PromptResponse;
          const template = String(promptData.template || "").trim();
          if (template) {
            setPromptTemplate(template);
          }
        }
      } catch {
        // noop
      } finally {
        void refreshSheetTable(preferredSheetName || undefined);
      }
    };
    void load();
  }, []);

  async function refreshSheetTable(overrideSheetName?: string): Promise<void> {
    setLoadingSheet(true);
    setError(undefined);
    try {
      const effectiveSheetName = String(overrideSheetName ?? sheetName).trim();
      const search = new URLSearchParams();
      search.set("mode", "instagram");
      if (effectiveSheetName) {
        search.set("sheetName", effectiveSheetName);
      }
      const response = await fetch(`/api/ideas/sheet?${search.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as SheetTableResponse;
      if (!response.ok) {
        throw new Error(data.error || "시트 조회에 실패했습니다.");
      }
      setSheetHeaders(data.headers || []);
      setSheetRows(data.rows || []);
      setSuccess(`시트 '${data.sheetName}'을(를) 불러왔습니다.`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "시트 조회에 실패했습니다.");
    } finally {
      setLoadingSheet(false);
    }
  }

  async function savePromptTemplate(): Promise<void> {
    setSavingPrompt(true);
    setError(undefined);
    try {
      const response = await fetch("/api/instagram/ideas/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: promptTemplate
        })
      });
      const data = (await response.json()) as PromptResponse;
      if (!response.ok) {
        throw new Error(data.error || "프롬프트 저장에 실패했습니다.");
      }
      setSuccess("인스타 아이디어 프롬프트를 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "프롬프트 저장에 실패했습니다.");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function generateIdeas(): Promise<void> {
    setGenerating(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          count: Number.parseInt(count, 10) || 5,
          sheetName: sheetName.trim() || undefined,
          idBase: topic.trim() || undefined,
          language,
          template: promptTemplate,
          variables: promptVariables
        })
      });
      const data = (await response.json()) as GenerateResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 아이디어 생성에 실패했습니다.");
      }
      const items = data.items || [];
      setGeneratedRows(items);
      setGeneratedHeaders(data.headers || []);
      setSelectedPreviewKeys(items.map((_, index) => `row-${index}`));
      setSuccess(`${items.length}개 아이디어를 생성했습니다.`);
    } catch (generateError) {
      setGeneratedRows([]);
      setGeneratedHeaders([]);
      setSelectedPreviewKeys([]);
      setError(generateError instanceof Error ? generateError.message : "인스타 아이디어 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  async function applyToSheet(): Promise<void> {
    if (selectedPreviewKeys.length === 0) return;
    const selectedSet = new Set(selectedPreviewKeys);
    const rowsToApply = generatedRows.filter((_, index) => selectedSet.has(`row-${index}`));
    if (rowsToApply.length === 0) return;

    setApplying(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/ideas/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: sheetName.trim() || undefined,
          items: rowsToApply
        })
      });
      const data = (await response.json()) as ApplyResponse;
      if (!response.ok) {
        throw new Error(data.error || "시트 반영에 실패했습니다.");
      }
      setSuccess(`${data.inserted}개 row를 '${data.sheetName}' 시트에 반영했습니다.`);
      setGeneratedRows((prev) => prev.filter((_, index) => !selectedSet.has(`row-${index}`)));
      setSelectedPreviewKeys([]);
      await refreshSheetTable();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "시트 반영에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  }

  function setPromptVariable(key: string, value: string): void {
    setPromptVariables((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function togglePreviewRow(key: string, checked: boolean): void {
    setSelectedPreviewKeys((prev) => {
      if (checked) {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      }
      return prev.filter((item) => item !== key);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Instagram 아이디어 생성</CardTitle>
          <CardDescription>
            인스타 아이디어 탭은 유튜브와 분리된 전용 프롬프트를 사용합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),140px,160px,minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="ig-ideas-topic">요청 기준</Label>
              <Input
                id="ig-ideas-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder='ex) "동사, 형용사 5개 생성", "JLPT N4 여행 표현"'
              />
            </div>
            <div className="space-y-2">
              <Label>생성 개수</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>생성 언어</Label>
              <Select value={language} onValueChange={(value) => setLanguage(normalizeLanguage(value))}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="ig-ideas-sheet-name">시트 탭명(선택)</Label>
              <Input
                id="ig-ideas-sheet-name"
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
                placeholder="비우면 Settings의 Instagram Sheet Name"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generateIdeas()} disabled={generating || !topic.trim()}>
              {generating ? "생성 중..." : "생성"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshSheetTable()} disabled={loadingSheet}>
              {loadingSheet ? "불러오는 중..." : "시트 새로고침"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPromptEditorOpen((prev) => !prev)}>
              {promptEditorOpen ? "프롬프트 닫기" : "프롬프트 보기/수정"}
            </Button>
          </div>

          {promptEditorOpen ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">인스타 아이디어 프롬프트</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPromptTemplate(INSTAGRAM_IDEA_DEFAULT_PROMPT)}
                  >
                    디폴트로 복원
                  </Button>
                  <Button type="button" onClick={() => void savePromptTemplate()} disabled={savingPrompt}>
                    {savingPrompt ? "저장 중..." : "프롬프트 저장"}
                  </Button>
                </div>
              </div>
              <Textarea
                value={promptTemplate}
                onChange={(event) => setPromptTemplate(event.target.value)}
                rows={18}
                className="font-mono text-xs"
              />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  프롬프트 변수 입력 ({promptKeys.length > 0 ? promptKeys.join(", ") : "없음"})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {promptKeys.map((key) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`prompt-var-${key}`}>{`{${key}}`}</Label>
                      <Input
                        id={`prompt-var-${key}`}
                        value={key === "cnt" ? count : promptVariables[key] || ""}
                        onChange={(event) => setPromptVariable(key, event.target.value)}
                        disabled={key === "cnt"}
                        placeholder={key === "num" ? "예: N5" : ""}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  `{"{cnt}"}` 값은 생성 개수와 자동 동기화됩니다. `{"{num}"}` 는 JLPT 등급값으로 자유 입력하세요.
                </p>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p> : null}
          {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate">생성 미리보기</CardTitle>
              <CardDescription className="break-words">
                체크한 행만 시트에 반영됩니다. status는 항상 &quot;준비&quot;로 고정됩니다.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void applyToSheet()}
              disabled={selectedPreviewKeys.length === 0 || applying}
            >
              {applying ? "반영 중..." : `시트에 반영하기 (${selectedPreviewKeys.length})`}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {generatedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 생성된 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={allPreviewSelected}
                        onChange={(event) =>
                          setSelectedPreviewKeys(event.target.checked ? allPreviewKeys : [])
                        }
                        aria-label="전체 선택"
                      />
                    </th>
                    {previewHeaders.map((header) => (
                      <th key={`ig-preview-head-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generatedRows.map((row, index) => {
                    const rowKey = `row-${index}`;
                    const checked = selectedPreviewKeys.includes(rowKey);
                    return (
                      <tr key={rowKey} className="border-t align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => togglePreviewRow(rowKey, event.target.checked)}
                            aria-label={`${index + 1}행 선택`}
                          />
                        </td>
                        {previewHeaders.map((header) => (
                          <td key={`ig-preview-cell-${rowKey}-${header}`} className="px-3 py-2 whitespace-pre-wrap break-words">
                            {getCellValue(row, header)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate">Google Sheet 테이블 뷰</CardTitle>
              <CardDescription className="break-words">
                현재 시트의 실제 헤더/행 구조를 그대로 표시합니다.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              asChild
              className={!sheetShortcutUrl ? "pointer-events-none opacity-50" : ""}
            >
              <a
                href={sheetShortcutUrl || "#"}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!sheetShortcutUrl}
                tabIndex={sheetShortcutUrl ? 0 : -1}
              >
                <ExternalLink className="h-4 w-4" />
                시트 바로가기
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sheetHeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              시트 헤더를 불러오지 못했습니다. 시트 연결 정보와 탭명을 확인해 주세요.
            </p>
          ) : (
            <div className="max-h-[56vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    {sheetHeaders.map((header) => (
                      <th key={`ig-sheet-head-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetRows.map((row, rowIndex) => (
                    <tr key={`ig-sheet-row-${rowIndex}`} className="border-t align-top">
                      {sheetHeaders.map((header) => (
                        <td key={`ig-sheet-cell-${rowIndex}-${header}`} className="px-3 py-2 whitespace-pre-wrap break-words">
                          {row[header] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
