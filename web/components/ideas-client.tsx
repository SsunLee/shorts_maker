"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AppSettings, IdeaDraftRow, IdeaLanguage } from "@/lib/types";

const IDEA_DRAFT_KEY = "shorts-maker:ideas-draft:v1";
const defaultHeaders = ["id", "status", "keyword", "subject", "description", "narration", "publish"];

interface SheetTableResponse {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
}

interface GenerateIdeasResponse {
  items: IdeaDraftRow[];
  error?: string;
}

interface ApplyIdeasResponse {
  inserted: number;
  sheetName: string;
  error?: string;
}

function toPreviewRow(row: IdeaDraftRow): Record<string, string> {
  return {
    id: row.id || "",
    Status: row.Status,
    Keyword: row.Keyword,
    Subject: row.Subject,
    Description: row.Description,
    Narration: row.Narration,
    publish: row.publish
  };
}

function getColumnValue(row: Record<string, string>, column: string): string {
  const target = column.trim().toLowerCase();
  const foundKey = Object.keys(row).find((key) => key.trim().toLowerCase() === target);
  return foundKey ? String(row[foundKey] || "").trim() : "";
}

function getPreviewRowKey(row: IdeaDraftRow, index: number): string {
  const id = String(row.id || "").trim();
  if (id) {
    return id;
  }
  const keyword = String(row.Keyword || "").trim();
  return `${keyword || "row"}-${index}`;
}

export function IdeasClient(): React.JSX.Element {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("1");
  const [language, setLanguage] = useState<IdeaLanguage>("ko");
  const [sheetName, setSheetName] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Record<string, string>[]>([]);
  const [generatedRows, setGeneratedRows] = useState<IdeaDraftRow[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [wrapSheetCells, setWrapSheetCells] = useState(true);
  const [wrapPreviewCells, setWrapPreviewCells] = useState(true);
  const [selectedPreviewRowKeys, setSelectedPreviewRowKeys] = useState<string[]>([]);

  const effectiveHeaders = useMemo(() => {
    return sheetHeaders.length > 0 ? sheetHeaders : defaultHeaders;
  }, [sheetHeaders]);

  const sheetShortcutUrl = useMemo(() => {
    const id = spreadsheetId.trim();
    if (!id) {
      return "";
    }
    return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }, [spreadsheetId]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];
    sheetRows.forEach((row) => {
      const statusValue = getColumnValue(row, "status");
      if (!statusValue) {
        return;
      }
      const key = statusValue.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      values.push(statusValue);
    });
    return values;
  }, [sheetRows]);

  const keywordOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: string[] = [];
    sheetRows.forEach((row) => {
      const keywordValue = getColumnValue(row, "keyword");
      if (!keywordValue) {
        return;
      }
      const key = keywordValue.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      values.push(keywordValue);
    });
    return values;
  }, [sheetRows]);

  const filteredSheetRows = useMemo(() => {
    return sheetRows.filter((row) => {
      const statusValue = getColumnValue(row, "status");
      const keywordValue = getColumnValue(row, "keyword");
      const statusMatches =
        statusFilter === "all" || statusValue.toLowerCase() === statusFilter.toLowerCase();
      const keywordMatches =
        selectedKeywords.length === 0 ||
        selectedKeywords.some((item) => item.toLowerCase() === keywordValue.toLowerCase());
      return statusMatches && keywordMatches;
    });
  }, [sheetRows, statusFilter, selectedKeywords]);

  const allPreviewRowKeys = useMemo(
    () => generatedRows.map((row, index) => getPreviewRowKey(row, index)),
    [generatedRows]
  );

  const allPreviewRowsSelected =
    allPreviewRowKeys.length > 0 &&
    allPreviewRowKeys.every((key) => selectedPreviewRowKeys.includes(key));

  useEffect(() => {
    if (statusFilter === "all") {
      return;
    }
    const stillExists = statusOptions.some((value) => value.toLowerCase() === statusFilter.toLowerCase());
    if (!stillExists) {
      setStatusFilter("all");
    }
  }, [statusFilter, statusOptions]);

  useEffect(() => {
    if (selectedKeywords.length === 0) {
      return;
    }
    const available = new Set(keywordOptions.map((value) => value.toLowerCase()));
    const next = selectedKeywords.filter((value) => available.has(value.toLowerCase()));
    if (next.length !== selectedKeywords.length) {
      setSelectedKeywords(next);
    }
  }, [keywordOptions, selectedKeywords]);

  useEffect(() => {
    const keySet = new Set(allPreviewRowKeys);
    setSelectedPreviewRowKeys((prev) => prev.filter((key) => keySet.has(key)));
  }, [allPreviewRowKeys]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IDEA_DRAFT_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        topic?: string;
        count?: string;
        sheetName?: string;
        language?: IdeaLanguage;
      };
      if (typeof parsed.topic === "string") {
        setTopic(parsed.topic);
      }
      if (typeof parsed.count === "string" && parsed.count) {
        setCount(parsed.count);
      }
      if (typeof parsed.sheetName === "string") {
        setSheetName(parsed.sheetName);
      }
      if (
        parsed.language === "ko" ||
        parsed.language === "en" ||
        parsed.language === "ja" ||
        parsed.language === "es"
      ) {
        setLanguage(parsed.language);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      IDEA_DRAFT_KEY,
      JSON.stringify({
        topic,
        count,
        sheetName,
        language
      })
    );
  }, [topic, count, sheetName, language]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as AppSettings;
        setSpreadsheetId(String(data.gsheetSpreadsheetId || ""));
      } catch {
        // ignore
      }
    };
    void loadSettings();
  }, []);

  async function refreshSheetTable(): Promise<void> {
    setLoadingSheet(true);
    setError(undefined);
    try {
      const query = sheetName.trim()
        ? `?sheetName=${encodeURIComponent(sheetName.trim())}`
        : "";
      const response = await fetch(`/api/ideas/sheet${query}`, { cache: "no-store" });
      const data = (await response.json()) as SheetTableResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to load sheet table.");
      }
      setSheetHeaders(data.headers || []);
      setSheetRows(data.rows || []);
      setSuccess(`시트 '${data.sheetName}'을(를) 불러왔습니다.`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setLoadingSheet(false);
    }
  }

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          count: Number.parseInt(count, 10) || 1,
          sheetName: sheetName.trim() || undefined,
          idBase: topic.trim() || undefined,
          language
        })
      });
      const data = (await response.json()) as GenerateIdeasResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate ideas.");
      }
      const nextRows = data.items || [];
      setGeneratedRows(nextRows);
      setSelectedPreviewRowKeys(nextRows.map((row, index) => getPreviewRowKey(row, index)));
      setSuccess(`${nextRows.length}개 주제를 생성했습니다. 미리보기에서 체크 후 시트에 반영하세요.`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function applyToSheet(): Promise<void> {
    if (generatedRows.length === 0 || selectedPreviewRowKeys.length === 0) {
      return;
    }
    const selectedSet = new Set(selectedPreviewRowKeys);
    const selectedRows = generatedRows.filter((row, index) =>
      selectedSet.has(getPreviewRowKey(row, index))
    );
    if (selectedRows.length === 0) {
      return;
    }
    setApplying(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/ideas/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: sheetName.trim() || undefined,
          idBase: topic.trim() || undefined,
          items: selectedRows
        })
      });
      const data = (await response.json()) as ApplyIdeasResponse;
      if (!response.ok) {
        throw new Error(data.error || "Failed to apply rows to sheet.");
      }
      setSuccess(`${data.inserted}개 row를 '${data.sheetName}' 시트에 반영했습니다.`);
      setGeneratedRows((prev) =>
        prev.filter((row, index) => !selectedSet.has(getPreviewRowKey(row, index)))
      );
      setSelectedPreviewRowKeys([]);
      await refreshSheetTable();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unknown error");
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    void refreshSheetTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleKeyword(value: string): void {
    setSelectedKeywords((prev) => {
      const exists = prev.some((item) => item.toLowerCase() === value.toLowerCase());
      if (exists) {
        return prev.filter((item) => item.toLowerCase() !== value.toLowerCase());
      }
      return [...prev, value];
    });
  }

  function togglePreviewRowChecked(key: string, checked: boolean): void {
    setSelectedPreviewRowKeys((prev) => {
      if (checked) {
        if (prev.includes(key)) {
          return prev;
        }
        return [...prev, key];
      }
      return prev.filter((item) => item !== key);
    });
  }

  function toggleAllPreviewRows(checked: boolean): void {
    if (checked) {
      setSelectedPreviewRowKeys(allPreviewRowKeys);
      return;
    }
    setSelectedPreviewRowKeys([]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>아이디어 생성</CardTitle>
          <CardDescription>
            주제를 입력하면 시트 row 템플릿 구조(Status/Keyword/Subject/Description/Narration/publish)에 맞는
            아이디어를 생성합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),140px,160px,minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="ideas-topic">원하는 주제를 입력해보세요</Label>
              <Input
                id="ideas-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="ex) 고대 이집트 역사"
              />
            </div>
            <div className="space-y-2">
              <Label>생성할 컨텐츠 개수</Label>
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
              <Select value={language} onValueChange={(value) => setLanguage(value as IdeaLanguage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ideas-sheet-name">시트 탭명(선택)</Label>
              <Input
                id="ideas-sheet-name"
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
                placeholder="비우면 Settings 기본 탭 사용"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generate()} disabled={generating || !topic.trim()}>
              {generating ? "생성 중..." : "생성"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshSheetTable()} disabled={loadingSheet}>
              {loadingSheet ? "로딩 중..." : "시트 새로고침"}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>생성 미리보기</CardTitle>
              <CardDescription>
                생성된 주제를 시트 템플릿 구조로 먼저 확인한 뒤 반영하세요.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <span className="text-xs text-muted-foreground">줄바꿈</span>
              <Switch checked={wrapPreviewCells} onCheckedChange={setWrapPreviewCells} />
              <span className="text-xs">{wrapPreviewCells ? "있음" : "없음"}</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void applyToSheet()}
              disabled={selectedPreviewRowKeys.length === 0 || applying}
            >
              {applying ? "반영 중..." : `시트에 반영하기 (${selectedPreviewRowKeys.length})`}
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
                        checked={allPreviewRowsSelected}
                        onChange={(event) => toggleAllPreviewRows(event.target.checked)}
                        aria-label="생성 미리보기 전체 선택"
                      />
                    </th>
                    {effectiveHeaders.map((header) => (
                      <th key={`preview-head-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generatedRows.map((row, index) => {
                    const objectRow = toPreviewRow(row);
                    const rowKey = getPreviewRowKey(row, index);
                    const checked = selectedPreviewRowKeys.includes(rowKey);
                    return (
                      <tr key={`preview-row-${rowKey}`} className="border-t align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => togglePreviewRowChecked(rowKey, event.target.checked)}
                            aria-label={`생성 미리보기 ${index + 1}행 선택`}
                          />
                        </td>
                        {effectiveHeaders.map((header) => (
                          <td
                            key={`preview-cell-${index}-${header}`}
                            className={`px-3 py-2 ${wrapPreviewCells ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}
                          >
                            {getColumnValue(objectRow, header)}
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Google Sheet 테이블 뷰</CardTitle>
              <CardDescription>
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
        <CardContent className="space-y-3">
          {sheetHeaders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              시트 헤더를 불러오지 못했습니다. 시트 연결 정보와 탭명을 확인해 주세요.
            </p>
          ) : (
            <>
              <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[180px,1fr,auto]">
                <div className="space-y-1">
                  <Label>status 필터</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-card dark:bg-zinc-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {statusOptions.map((value) => (
                        <SelectItem key={`status-option-${value}`} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>keyword 멀티 선택</Label>
                  <details className="rounded-md border bg-background">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm text-foreground">
                      {selectedKeywords.length > 0
                        ? `${selectedKeywords.length}개 선택됨`
                        : "전체 keyword"}
                    </summary>
                    <div className="space-y-2 border-t px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => setSelectedKeywords(keywordOptions)}
                        >
                          전체 선택
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => setSelectedKeywords([])}
                        >
                          선택 해제
                        </Button>
                      </div>
                      <div className="max-h-40 space-y-1 overflow-auto pr-1">
                        {keywordOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">keyword 데이터가 없습니다.</p>
                        ) : (
                          keywordOptions.map((value) => {
                            const checked = selectedKeywords.some(
                              (item) => item.toLowerCase() === value.toLowerCase()
                            );
                            return (
                              <label
                                key={`keyword-option-${value}`}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleKeyword(value)}
                                />
                                <span>{value}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <span className="text-xs text-muted-foreground">줄바꿈</span>
                    <Switch checked={wrapSheetCells} onCheckedChange={setWrapSheetCells} />
                    <span className="text-xs">{wrapSheetCells ? "있음" : "없음"}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                표시 행: {filteredSheetRows.length} / 전체 {sheetRows.length}
              </p>
              <div className="max-h-[56vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    {sheetHeaders.map((header) => (
                      <th key={`sheet-head-${header}`} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSheetRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-muted-foreground" colSpan={sheetHeaders.length}>
                        필터 조건에 맞는 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredSheetRows.map((row, rowIndex) => (
                      <tr key={`sheet-row-${rowIndex}`} className="border-t align-top">
                        {sheetHeaders.map((header) => (
                          <td
                            key={`sheet-cell-${rowIndex}-${header}`}
                            className={`px-3 py-2 ${wrapSheetCells ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}
                          >
                            {row[header] || ""}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
