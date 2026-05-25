"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clipboard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  extractPromptVariables,
  type InstagramIdeaPromptMode,
  INSTAGRAM_IDEA_DEFAULT_PROMPT,
  INSTAGRAM_IDEA_SHEET_HEADERS,
  INSTAGRAM_SENTENCE_READING_IDEA_PROMPT,
  INSTAGRAM_SENTENCE_READING_SHEET_HEADERS
} from "@/lib/instagram-ideas-prompt";
import {
  readInstagramLastSheetName,
  resolveInstagramPreferredSheetName,
  resolveInstagramSettingsSheetName,
  saveInstagramLastSheetName
} from "@/lib/instagram-sheet-name-storage";
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
const JLPT_LEVEL_OPTIONS = ["N5", "N4", "N3", "N2", "N1"] as const;

function formatJlptLevelRange(levels: string[]): string {
  const selected = JLPT_LEVEL_OPTIONS.filter((level) => levels.includes(level));
  return selected.length > 0 ? selected.join("~") : "N5~N4";
}

function formatJlptHashtags(levels: string[]): string {
  const selected = JLPT_LEVEL_OPTIONS.filter((level) => levels.includes(level));
  return selected.map((level) => `#JLPT${level}`).join(" ") || "#JLPTN5 #JLPTN4";
}

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

function isInstagramUploadCompletedStatus(status: string): boolean {
  const normalized = String(status || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
  return normalized === "업로드완료";
}

function uniqueHeaders(headers: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  headers.forEach((header) => {
    const value = String(header || "").trim();
    if (!value) return;
    const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
    if (seen.has(normalized)) return;
    seen.add(normalized);
    output.push(value);
  });
  return output;
}

function isSentenceReadingPromptTemplate(value: string): boolean {
  const text = String(value || "");
  return (
    text.includes("일기형 인스타그램 카드 세트") &&
    text.includes("audioScript") &&
    text.includes("rubyFrontLines") &&
    text.includes("bilingualFront") &&
    text.includes("kanjiGlossary")
  );
}

function isQuizPromptTemplate(value: string): boolean {
  const text = String(value || "");
  return text.includes("일본어 학습 데이터를 생성") && text.includes("example_1_title");
}

export function InstagramIdeasClient(): React.JSX.Element {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [language, setLanguage] = useState<IdeaLanguage>("ja");
  const [ideaMode, setIdeaMode] = useState<InstagramIdeaPromptMode>("default");
  const [sentenceReadingJlptLevels, setSentenceReadingJlptLevels] = useState<string[]>(["N5", "N4"]);
  const [sheetName, setSheetName] = useState("");
  const [settingsSheetName, setSettingsSheetName] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");

  const [loadingSheet, setLoadingSheet] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [nextActionState, setNextActionState] = useState<"generated" | "applied">();

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
  const recommendedHeaders = useMemo(
    () => uniqueHeaders(ideaMode === "sentence_reading" ? INSTAGRAM_SENTENCE_READING_SHEET_HEADERS : INSTAGRAM_IDEA_SHEET_HEADERS),
    [ideaMode]
  );
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
  const sentenceReadingJlptLabel = useMemo(
    () => formatJlptLevelRange(sentenceReadingJlptLevels),
    [sentenceReadingJlptLevels]
  );
  const sentenceReadingJlptHashtags = useMemo(
    () => formatJlptHashtags(sentenceReadingJlptLevels),
    [sentenceReadingJlptLevels]
  );

  const sheetShortcutUrl = useMemo(() => {
    const id = spreadsheetId.trim();
    if (!id) return "";
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }, [spreadsheetId]);

  const visibleSheetRows = useMemo(
    () => sheetRows.filter((row) => !isInstagramUploadCompletedStatus(getCellValue(row, "status"))),
    [sheetRows]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        topic?: string;
        count?: string;
        language?: IdeaLanguage;
        ideaMode?: InstagramIdeaPromptMode;
        sentenceReadingJlptLevels?: string[];
        sheetName?: string;
        promptVariables?: Record<string, string>;
      };
      if (typeof parsed.topic === "string") setTopic(parsed.topic);
      if (typeof parsed.count === "string" && parsed.count) setCount(parsed.count);
      if (typeof parsed.sheetName === "string") {
        setSheetName(parsed.sheetName);
        if (!readInstagramLastSheetName()) {
          saveInstagramLastSheetName(parsed.sheetName);
        }
      }
      if (parsed.language) setLanguage(normalizeLanguage(parsed.language));
      if (parsed.ideaMode === "sentence_reading" || parsed.ideaMode === "default") {
        setIdeaMode(parsed.ideaMode);
      }
      if (Array.isArray(parsed.sentenceReadingJlptLevels)) {
        const levels = JLPT_LEVEL_OPTIONS.filter((level) => parsed.sentenceReadingJlptLevels?.includes(level));
        if (levels.length > 0) {
          setSentenceReadingJlptLevels(levels);
        }
      }
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
        ideaMode,
        sentenceReadingJlptLevels,
        sheetName,
        promptVariables
      })
    );
  }, [topic, count, language, ideaMode, sentenceReadingJlptLevels, sheetName, promptVariables]);

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
          const settingsResolvedSheetName = resolveInstagramSettingsSheetName(settings);
          setSettingsSheetName(settingsResolvedSheetName);
          preferredSheetName = resolveInstagramPreferredSheetName(settingsResolvedSheetName);
          if (preferredSheetName) {
            setSheetName(preferredSheetName);
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

  useEffect(() => {
    if (
      ideaMode === "sentence_reading" &&
      !isSentenceReadingPromptTemplate(promptTemplate) &&
      isQuizPromptTemplate(promptTemplate)
    ) {
      setPromptTemplate(INSTAGRAM_SENTENCE_READING_IDEA_PROMPT);
    }
  }, [ideaMode, promptTemplate]);

  useEffect(() => {
    if (ideaMode !== "sentence_reading") {
      return;
    }
    setPromptVariables((prev) => ({
      ...prev,
      num: sentenceReadingJlptLabel,
      jlptLevels: sentenceReadingJlptLabel,
      jlptHashtags: sentenceReadingJlptHashtags
    }));
  }, [ideaMode, sentenceReadingJlptHashtags, sentenceReadingJlptLabel]);

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
      setSheetHeaders(uniqueHeaders(data.headers || []));
      setSheetRows(data.rows || []);
      const resolvedSheetName = String(data.sheetName || effectiveSheetName || "").trim();
      if (resolvedSheetName) {
        setSheetName(resolvedSheetName);
        saveInstagramLastSheetName(resolvedSheetName);
      }
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
      const templateForRequest =
        ideaMode === "sentence_reading" && !isSentenceReadingPromptTemplate(promptTemplate)
          ? INSTAGRAM_SENTENCE_READING_IDEA_PROMPT
          : promptTemplate;
      const response = await fetch("/api/instagram/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          count: Number.parseInt(count, 10) || 5,
          sheetName: sheetName.trim() || undefined,
          idBase: topic.trim() || undefined,
          language,
          mode: ideaMode,
          template: templateForRequest,
          variables:
            ideaMode === "sentence_reading"
              ? {
                  ...promptVariables,
                  num: sentenceReadingJlptLabel,
                  jlptLevels: sentenceReadingJlptLabel,
                  jlptHashtags: sentenceReadingJlptHashtags
                }
              : promptVariables
        })
      });
      const data = (await response.json()) as GenerateResponse;
      if (!response.ok) {
        throw new Error(data.error || "인스타 아이디어 생성에 실패했습니다.");
      }
      const items = data.items || [];
      setGeneratedRows(items);
      setGeneratedHeaders(uniqueHeaders(data.headers || []));
      setSelectedPreviewKeys(items.map((_, index) => `row-${index}`));
      setNextActionState("generated");
      setSuccess(`${items.length}개 아이디어를 생성했습니다.`);
    } catch (generateError) {
      setGeneratedRows([]);
      setGeneratedHeaders([]);
      setSelectedPreviewKeys([]);
      setNextActionState(undefined);
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
          mode: ideaMode,
          items: rowsToApply
        })
      });
      const data = (await response.json()) as ApplyResponse;
      if (!response.ok) {
        throw new Error(data.error || "시트 반영에 실패했습니다.");
      }
      setSuccess(`${data.inserted}개 row를 '${data.sheetName}' 시트에 반영했습니다.`);
      setNextActionState("applied");
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

  function toggleSentenceReadingJlptLevel(level: string): void {
    setSentenceReadingJlptLevels((prev) => {
      const next = prev.includes(level) ? prev.filter((item) => item !== level) : [...prev, level];
      const normalized = JLPT_LEVEL_OPTIONS.filter((item) => next.includes(item));
      return normalized.length > 0 ? normalized : [level];
    });
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

  async function copyRecommendedHeaders(): Promise<void> {
    try {
      await navigator.clipboard.writeText(recommendedHeaders.join("\t"));
      setSuccess("권장 헤더를 복사했습니다. Google Sheet 1행에 붙여넣어 주세요.");
    } catch {
      setError("헤더 복사에 실패했습니다. 브라우저 클립보드 권한을 확인해 주세요.");
    }
  }

  function applyIdeaMode(nextMode: InstagramIdeaPromptMode): void {
    setIdeaMode(nextMode);
    if (nextMode === "sentence_reading") {
      setPromptTemplate(INSTAGRAM_SENTENCE_READING_IDEA_PROMPT);
      setPromptVariables((prev) => ({ ...prev, num: sentenceReadingJlptLabel, jlptLevels: sentenceReadingJlptLabel }));
      return;
    }
    setPromptTemplate(INSTAGRAM_IDEA_DEFAULT_PROMPT);
  }

  function updateSheetName(value: string): void {
    setSheetName(value);
    saveInstagramLastSheetName(value);
  }

  function resetSheetNameToSettings(): string {
    const nextSheetName = saveInstagramLastSheetName(settingsSheetName);
    setSheetName(nextSheetName);
    return nextSheetName;
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
          <div className="grid gap-3 md:grid-cols-[180px,minmax(0,1fr),140px,160px,minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>아이디어 유형</Label>
              <Select value={ideaMode} onValueChange={(value) => applyIdeaMode(value === "sentence_reading" ? "sentence_reading" : "default")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">일본어 예문</SelectItem>
                  <SelectItem value="sentence_reading">문장 읽기</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                onChange={(event) => updateSheetName(event.target.value)}
                placeholder="비우면 Settings의 Instagram Sheet Name"
              />
            </div>
          </div>

          {ideaMode === "sentence_reading" ? (
            <div className="rounded-lg border bg-muted/10 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">문장 읽기 JLPT 급수</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    선택한 급수 기준으로 어휘/문법 난이도를 제한하고, 제목/캡션의 JLPT 표기도 함께 맞춥니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {JLPT_LEVEL_OPTIONS.map((level) => {
                    const selected = sentenceReadingJlptLevels.includes(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleSentenceReadingJlptLevel(level)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                        aria-pressed={selected}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground lg:grid-cols-3">
                <div className="rounded-md border bg-background p-2">
                  <p className="font-semibold text-foreground">카드 상단 제목</p>
                  <p className="mt-1">오늘의 일본어 일기｜날씨 좋은 날, 직장인 현지인 느낌</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="font-semibold text-foreground">업로드 제목</p>
                  <p className="mt-1">JLPT {sentenceReadingJlptLabel} 일본어 일기｜날씨 좋은 날의 직장인 하루</p>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <p className="font-semibold text-foreground">설명 시작</p>
                  <p className="mt-1">JLPT {sentenceReadingJlptLabel} 수준의 일본어 읽기 콘텐츠입니다.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generateIdeas()} disabled={generating || !topic.trim()}>
              {generating ? "생성 중..." : "생성"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshSheetTable(sheetName)} disabled={loadingSheet}>
              {loadingSheet ? "불러오는 중..." : "시트 불러오기"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshSheetTable(resetSheetNameToSettings())} disabled={loadingSheet}>
              설정값 새로고침
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
                    variant={ideaMode === "sentence_reading" ? "default" : "outline"}
                    onClick={() => applyIdeaMode("sentence_reading")}
                  >
                    문장 읽기 프롬프트
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => applyIdeaMode("default")}
                  >
                    예문 프롬프트
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

      {nextActionState ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                {nextActionState === "applied"
                  ? "시트에 반영됐습니다. 방금 만든 아이디어로 피드를 작성해볼까요?"
                  : "아이디어가 준비됐습니다. 다음 단계로 이어가볼까요?"}
              </p>
              <p className="text-sm text-muted-foreground">
                {nextActionState === "applied"
                  ? "피드 탭에서 방금 추가한 준비 row를 선택하고 템플릿을 적용해 컨테이너를 만들 수 있습니다."
                  : "선택한 아이디어를 시트에 반영하면 피드 탭에서 바로 카드 컨테이너 생성으로 이어집니다."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {nextActionState === "generated" ? (
                <Button
                  type="button"
                  onClick={() => void applyToSheet()}
                  disabled={selectedPreviewKeys.length === 0 || applying}
                >
                  {applying ? "반영 중..." : `선택 아이디어 시트에 반영 (${selectedPreviewKeys.length})`}
                </Button>
              ) : null}
              <Button type="button" variant={nextActionState === "applied" ? "default" : "outline"} asChild>
                <Link href="/instagram/feed">
                  피드 작성으로 이동
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
            <div className="app-table-scrollbar overflow-x-auto rounded-lg border">
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
                    {previewHeaders.map((header, headerIndex) => (
                      <th key={`ig-preview-head-${headerIndex}-${header}`} className="px-3 py-2 text-left font-medium">
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
                        {previewHeaders.map((header, headerIndex) => (
                          <td key={`ig-preview-cell-${rowKey}-${headerIndex}-${header}`} className="px-3 py-2 whitespace-pre-wrap break-words">
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
                현재 시트 데이터를 표시하며, status가 &quot;업로드 완료&quot;인 행은 숨깁니다.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void copyRecommendedHeaders()}>
                <Clipboard className="h-4 w-4" />
                권장 헤더 복사
              </Button>
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
          </div>
        </CardHeader>
        <CardContent>
          {sheetHeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              시트 헤더를 불러오지 못했습니다. 시트 연결 정보와 탭명을 확인해 주세요.
            </p>
          ) : (
            <div className="app-table-scrollbar max-h-[56vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    {sheetHeaders.map((header, headerIndex) => (
                      <th key={`ig-sheet-head-${headerIndex}-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleSheetRows.length === 0 ? (
                    <tr className="border-t">
                      <td className="px-3 py-4 text-muted-foreground" colSpan={sheetHeaders.length}>
                        표시할 행이 없습니다. (업로드 완료 상태는 숨김)
                      </td>
                    </tr>
                  ) : (
                    visibleSheetRows.map((row, rowIndex) => (
                    <tr key={`ig-sheet-row-${rowIndex}`} className="border-t align-top">
                      {sheetHeaders.map((header, headerIndex) => (
                        <td key={`ig-sheet-cell-${rowIndex}-${headerIndex}-${header}`} className="px-3 py-2 whitespace-pre-wrap break-words">
                          {row[header] || ""}
                        </td>
                      ))}
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
