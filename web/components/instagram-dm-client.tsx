"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Database,
  Download,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type DmRow = Record<string, string>;

type MetaCheck = {
  checkedAt: string;
  ready: boolean;
  message?: string;
  missing?: string[];
  account?: {
    id?: string;
    username?: string;
  };
};

type DmDeliveryLog = {
  id: string;
  rowIndex: number;
  rowId?: string;
  recipientId: string;
  recipientName?: string;
  status: "sent" | "failed" | "skipped";
  message: string;
  sentAt: string;
  error?: string;
  messageId?: string;
};

type DmRunLog = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  dryRun: boolean;
  logs: DmDeliveryLog[];
};

type DmStatusResponse = {
  ok?: boolean;
  error?: string;
  meta?: MetaCheck | null;
  runs?: DmRunLog[];
};

type DmSendResponse = {
  ok?: boolean;
  error?: string;
  run?: DmRunLog;
  updatedRows?: DmRow[];
  interrupted?: boolean;
  runs?: DmRunLog[];
  metaAccount?: {
    id?: string;
    username?: string;
  };
};

type CollectorMedia = {
  mediaId: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
  commentsCount?: number;
  fetchError?: string;
};

type CollectorComment = {
  commentId: string;
  mediaId: string;
  mediaCaption?: string;
  mediaPermalink?: string;
  username: string;
  igsid?: string;
  text: string;
  timestamp: string;
  parentId?: string;
};

type CollectorSnapshot = {
  collectedAt: string;
  selectedMediaIds: string[];
  mediaLimit: number;
  commentLimitPerMedia: number;
  includeReplies: boolean;
  media: CollectorMedia[];
  comments: CollectorComment[];
  errors?: string[];
  diagnostics?: {
    totalComments: number;
    directUsernameCount: number;
    enrichedUsernameCount: number;
    fallbackUsernameCount: number;
    usernameMissingCount: number;
    withIgsidCount: number;
  };
};

type CollectorGetResponse = {
  ok?: boolean;
  ready?: boolean;
  error?: string;
  message?: string;
  missing?: string[];
  account?: {
    id?: string;
    username?: string;
  } | null;
  media?: CollectorMedia[];
  snapshot?: CollectorSnapshot | null;
};

type CollectorCollectResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  snapshot?: CollectorSnapshot;
  summary?: {
    selectedMedia: number;
    totalComments: number;
    uniqueUsers: number;
    errorCount: number;
    directUsernameCount?: number;
    enrichedUsernameCount?: number;
    fallbackUsernameCount?: number;
  };
};

const DRAFT_KEY = "shorts-maker:instagram:dm:draft:v1";
const DEFAULT_COLUMNS = [
  "comment_id",
  "status",
  "ig_username",
  "dm_name",
  "coupons_name",
  "coupons_code",
  "custom_str"
];
const DEFAULT_TEMPLATE =
  "{dm_name}님!\n안녕하세요. 쑨에듀팀입니다.\n\n당첨 축하드립니다.\n아래 쿠폰코드를 이용하여 신청해주시면 됩니다.\n{coupons_code}";
const EXAMPLE_TEMPLATE = [
  "{dm_name}님!",
  "안녕하세요. 쑨에듀팀입니다.",
  "",
  "당첨 축하드립니다.",
  "아래 쿠폰코드를 이용하여 신청해주시면 됩니다.",
  "{coupons_code}"
].join("\n");
const SAMPLE_CSV_PATH = "/samples/instagram-dm-sample.csv";
const TABLE_MIN_COL_WIDTH = 120;
const TABLE_INDEX_COL_WIDTH = 52;
const TABLE_ACTION_COL_WIDTH = 64;
const LEGACY_DM_ID_COLUMNS = new Set(["id", "dmaccountid"]);
type DmSectionKey =
  | "collector"
  | "dataInput"
  | "editableTable"
  | "metaAccount"
  | "preview"
  | "template"
  | "history";
const DEFAULT_DM_SECTION_OPEN: Record<DmSectionKey, boolean> = {
  collector: true,
  dataInput: true,
  editableTable: true,
  metaAccount: true,
  preview: true,
  template: true,
  history: true
};

function normalizeHeader(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function ensurePreferredColumnsFirst(columns: string[]): string[] {
  const trimmed = columns.map((value) => String(value || "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  trimmed.forEach((column) => {
    const key = normalizeHeader(column);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(column);
  });
  const priority = ["commentid", "status"];
  priority
    .map((value) => value.replace(/[\s_-]+/g, ""))
    .forEach((key) => {
      if (!deduped.some((column) => normalizeHeader(column) === key)) {
        if (key === "commentid") deduped.unshift("comment_id");
        else if (key === "status") deduped.splice(Math.min(1, deduped.length), 0, "status");
      }
    });
  deduped.sort((left, right) => {
    const leftKey = normalizeHeader(left);
    const rightKey = normalizeHeader(right);
    const leftPriority = priority.indexOf(leftKey);
    const rightPriority = priority.indexOf(rightKey);
    if (leftPriority === -1 && rightPriority === -1) return 0;
    if (leftPriority === -1) return 1;
    if (rightPriority === -1) return -1;
    return leftPriority - rightPriority;
  });
  return deduped;
}

function stripLegacyDmIdColumns(columns: string[]): string[] {
  return columns.filter((column) => !LEGACY_DM_ID_COLUMNS.has(normalizeHeader(column)));
}

function stripLegacyDmIdFieldsFromRows(rows: DmRow[]): DmRow[] {
  return rows.map((row) => {
    const next: DmRow = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (LEGACY_DM_ID_COLUMNS.has(normalizeHeader(key))) return;
      next[key] = String(value || "");
    });
    return next;
  });
}

function findColumnKey(row: DmRow, columnName: string): string {
  const target = normalizeHeader(columnName);
  if (!target) return columnName;
  const matched = Object.keys(row).find((key) => normalizeHeader(key) === target);
  return matched || columnName;
}

function readCell(row: DmRow | undefined, columnName: string): string {
  if (!row) return "";
  const key = findColumnKey(row, columnName);
  return String(row[key] || "");
}

function writeCell(row: DmRow, columnName: string, value: string): DmRow {
  const next = { ...row };
  const key = findColumnKey(next, columnName);
  next[key] = value;
  return next;
}

function renderTemplate(template: string, row: DmRow): string {
  const source = String(template || "");
  const replacedDouble = source.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_match, token: string) =>
    readCell(row, token).trim()
  );
  return replacedDouble.replace(/\{(?!\{)\s*([^{}]+)\s*\}(?!\})/g, (_match, token: string) =>
    readCell(row, token).trim()
  );
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const output: string[] = [];
  let current = "";
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (char === delimiter && !inQuote) {
      output.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  output.push(current);
  return output.map((value) => value.trim());
}

function detectDelimiter(firstLine: string): string {
  const candidates = ["\t", ",", ";", "|"];
  let winner = ",";
  let maxScore = -1;
  candidates.forEach((delimiter) => {
    const score = firstLine.split(delimiter).length;
    if (score > maxScore) {
      maxScore = score;
      winner = delimiter;
    }
  });
  return winner;
}

function parseTabularText(raw: string): { columns: string[]; rows: DmRow[] } | undefined {
  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return undefined;
  }
  const delimiter = detectDelimiter(lines[0]);
  const sourceHeaders = parseDelimitedLine(lines[0], delimiter).map((value, index) => value || `column_${index + 1}`);
  const columns = ensurePreferredColumnsFirst(sourceHeaders);
  const rows = lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    const row: DmRow = {};
    sourceHeaders.forEach((header, index) => {
      row[header] = String(cells[index] || "");
    });
    if (!Object.keys(row).some((key) => normalizeHeader(key) === "status")) {
      row.status = "";
    }
    columns.forEach((column) => {
      if (!Object.keys(row).some((key) => normalizeHeader(key) === normalizeHeader(column))) {
        row[column] = "";
      }
    });
    return row;
  });
  return { columns, rows };
}

function deriveColumns(rows: DmRow[], fallbackColumns: string[]): string[] {
  const fromRows = rows.flatMap((row) => Object.keys(row));
  return ensurePreferredColumnsFirst([...fallbackColumns, ...fromRows]);
}

function detectBestColumn(columns: string[], aliases: string[], fallback: string): string {
  const lowerAliases = aliases.map((alias) => normalizeHeader(alias));
  const matched = columns.find((column) => lowerAliases.includes(normalizeHeader(column)));
  return matched || fallback;
}

function nowLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseMediaIdsInput(raw: string): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,\n]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function truncateText(value: string, max = 140): string {
  const normalized = String(value || "").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function normalizeUsername(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function getDefaultColumnWidth(column: string): number {
  const key = normalizeHeader(column);
  if (key === "status") return 130;
  if (key.includes("id")) return 180;
  if (key.includes("username")) return 190;
  if (key.includes("name")) return 170;
  if (key.includes("code")) return 200;
  if (key.includes("result")) return 220;
  if (key.includes("text") || key.includes("custom") || key.includes("caption")) return 320;
  return 180;
}

export function InstagramDmClient(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizeMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const resizeUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);

  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<DmRow[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [usernameColumn, setUsernameColumn] = useState("ig_username");
  const [nameColumn, setNameColumn] = useState("dm_name");
  const [rowIdColumn, setRowIdColumn] = useState("comment_id");
  const [statusColumn, setStatusColumn] = useState("status");
  const [sentAtColumn, setSentAtColumn] = useState("dm_sent_at");
  const [resultColumn, setResultColumn] = useState("dm_result");
  const [messageIdColumn, setMessageIdColumn] = useState("dm_message_id");
  const [delayMs, setDelayMs] = useState("1800");
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [wrapCells, setWrapCells] = useState(true);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [checkingMeta, setCheckingMeta] = useState(false);
  const [metaOAuthLoading, setMetaOAuthLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [meta, setMeta] = useState<MetaCheck>();
  const [runs, setRuns] = useState<DmRunLog[]>([]);
  const [collectorMediaLimit, setCollectorMediaLimit] = useState("12");
  const [collectorCommentLimit, setCollectorCommentLimit] = useState("80");
  const [includeCommentReplies, setIncludeCommentReplies] = useState(false);
  const [manualMediaIds, setManualMediaIds] = useState("");
  const [collectorImportMode, setCollectorImportMode] = useState<"append" | "replace">("append");
  const [collectorUniqueByUser, setCollectorUniqueByUser] = useState(true);
  const [collectorSkipExistingComment, setCollectorSkipExistingComment] = useState(true);
  const [loadingCollector, setLoadingCollector] = useState(false);
  const [collectingComments, setCollectingComments] = useState(false);
  const [recentMedia, setRecentMedia] = useState<CollectorMedia[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [collectorSnapshot, setCollectorSnapshot] = useState<CollectorSnapshot>();
  const [sectionOpen, setSectionOpen] = useState<Record<DmSectionKey, boolean>>(DEFAULT_DM_SECTION_OPEN);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        columns?: string[];
        columnWidths?: Record<string, number>;
        rows?: DmRow[];
        messageTemplate?: string;
        usernameColumn?: string;
        nameColumn?: string;
        rowIdColumn?: string;
        statusColumn?: string;
        sentAtColumn?: string;
        resultColumn?: string;
        messageIdColumn?: string;
        delayMs?: string;
        skipCompleted?: boolean;
        dryRun?: boolean;
        wrapCells?: boolean;
        collectorMediaLimit?: string;
        collectorCommentLimit?: string;
        includeCommentReplies?: boolean;
        manualMediaIds?: string;
        collectorImportMode?: "append" | "replace";
        collectorUniqueByUser?: boolean;
        collectorSkipExistingComment?: boolean;
      };
      const nextColumns = stripLegacyDmIdColumns(
        ensurePreferredColumnsFirst(Array.isArray(parsed.columns) ? parsed.columns : DEFAULT_COLUMNS)
      );
      const nextRows = stripLegacyDmIdFieldsFromRows(Array.isArray(parsed.rows) ? parsed.rows : []);
      setColumns(nextColumns);
      if (parsed.columnWidths && typeof parsed.columnWidths === "object") {
        const nextWidths: Record<string, number> = {};
        nextColumns.forEach((column) => {
          const rawWidth = parsed.columnWidths?.[column];
          const parsedWidth = Number.parseInt(String(rawWidth ?? ""), 10);
          nextWidths[column] = Number.isFinite(parsedWidth)
            ? Math.max(TABLE_MIN_COL_WIDTH, parsedWidth)
            : getDefaultColumnWidth(column);
        });
        setColumnWidths(nextWidths);
      }
      setRows(nextRows);
      setMessageTemplate(String(parsed.messageTemplate || DEFAULT_TEMPLATE));
      if (parsed.usernameColumn) setUsernameColumn(parsed.usernameColumn);
      if (parsed.nameColumn) setNameColumn(parsed.nameColumn);
      if (parsed.rowIdColumn) setRowIdColumn(parsed.rowIdColumn);
      if (parsed.statusColumn) setStatusColumn(parsed.statusColumn);
      if (parsed.sentAtColumn) setSentAtColumn(parsed.sentAtColumn);
      if (parsed.resultColumn) setResultColumn(parsed.resultColumn);
      if (parsed.messageIdColumn) setMessageIdColumn(parsed.messageIdColumn);
      if (parsed.delayMs) setDelayMs(String(parsed.delayMs));
      if (typeof parsed.skipCompleted === "boolean") setSkipCompleted(parsed.skipCompleted);
      if (typeof parsed.dryRun === "boolean") setDryRun(parsed.dryRun);
      if (typeof parsed.wrapCells === "boolean") setWrapCells(parsed.wrapCells);
      if (parsed.collectorMediaLimit) setCollectorMediaLimit(String(parsed.collectorMediaLimit));
      if (parsed.collectorCommentLimit) setCollectorCommentLimit(String(parsed.collectorCommentLimit));
      if (typeof parsed.includeCommentReplies === "boolean") setIncludeCommentReplies(parsed.includeCommentReplies);
      if (parsed.manualMediaIds) setManualMediaIds(String(parsed.manualMediaIds));
      if (parsed.collectorImportMode === "append" || parsed.collectorImportMode === "replace") {
        setCollectorImportMode(parsed.collectorImportMode);
      }
      if (typeof parsed.collectorUniqueByUser === "boolean") setCollectorUniqueByUser(parsed.collectorUniqueByUser);
      if (typeof parsed.collectorSkipExistingComment === "boolean") {
        setCollectorSkipExistingComment(parsed.collectorSkipExistingComment);
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          columns,
          columnWidths,
          rows,
          messageTemplate,
          usernameColumn,
          nameColumn,
          rowIdColumn,
          statusColumn,
          sentAtColumn,
          resultColumn,
          messageIdColumn,
          delayMs,
          skipCompleted,
          dryRun,
          wrapCells,
          collectorMediaLimit,
          collectorCommentLimit,
          includeCommentReplies,
          manualMediaIds,
          collectorImportMode,
          collectorUniqueByUser,
          collectorSkipExistingComment
        })
      );
    } catch {
      // noop
    }
  }, [
    usernameColumn,
    columns,
    delayMs,
    dryRun,
    messageIdColumn,
    messageTemplate,
    nameColumn,
    collectorCommentLimit,
    collectorImportMode,
    collectorMediaLimit,
    collectorSkipExistingComment,
    collectorUniqueByUser,
    columnWidths,
    resultColumn,
    rowIdColumn,
    rows,
    includeCommentReplies,
    manualMediaIds,
    sentAtColumn,
    skipCompleted,
    statusColumn,
    wrapCells
  ]);

  async function loadStatus(checkNow: boolean): Promise<void> {
    setCheckingMeta(checkNow);
    try {
      const response = await fetch(`/api/instagram/meta/dm/status${checkNow ? "?check=1" : ""}`, { cache: "no-store" });
      const data = (await response.json()) as DmStatusResponse;
      if (!response.ok) {
        throw new Error(data.error || "DM 상태 정보를 불러오지 못했습니다.");
      }
      setMeta(data.meta || undefined);
      setRuns(Array.isArray(data.runs) ? data.runs : []);
      if (checkNow) {
        if (data.meta?.ready) {
          setSuccess(
            `Meta 인증 통과 · 발송 계정 @${String(data.meta.account?.username || "").trim() || "unknown"}`
          );
          setError(undefined);
        } else {
          setError(data.meta?.message || "Meta 인증 상태가 준비되지 않았습니다.");
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "DM 상태 정보를 불러오지 못했습니다.");
    } finally {
      setCheckingMeta(false);
    }
  }

  useEffect(() => {
    void loadStatus(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const oauthState = String(params.get("meta_oauth") || "")
      .trim()
      .toLowerCase();
    if (!oauthState) {
      return;
    }
    const oauthMessage = String(params.get("meta_oauth_message") || "").trim();
    if (oauthState === "success") {
      setSuccess(oauthMessage || "Meta 원클릭 연동이 완료되었습니다.");
      setError(undefined);
      void loadStatus(false);
    } else {
      setError(oauthMessage || "Meta 원클릭 연동에 실패했습니다.");
      setSuccess(undefined);
    }
    const cleaned = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", cleaned);
  }, []);

  async function startMetaOAuth(): Promise<void> {
    setMetaOAuthLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/meta/oauth/start?return_to=/instagram/dm", {
        method: "GET",
        cache: "no-store"
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Meta 원클릭 연동 URL 생성에 실패했습니다.");
      }
      window.location.href = data.url;
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Meta 원클릭 연동 시작에 실패했습니다.");
      setMetaOAuthLoading(false);
    }
  }

  async function loadCommentCollector(args?: { refresh?: boolean; preserveSelection?: boolean }): Promise<void> {
    const refresh = args?.refresh !== false;
    const preserveSelection = args?.preserveSelection !== false;
    setLoadingCollector(true);
    try {
      const query = new URLSearchParams();
      query.set("mediaLimit", String(Number.parseInt(collectorMediaLimit, 10) || 12));
      query.set("refresh", refresh ? "1" : "0");
      const response = await fetch(`/api/instagram/meta/dm/comments?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as CollectorGetResponse;
      if (!response.ok) {
        throw new Error(data.error || "댓글 수집 초기 정보를 불러오지 못했습니다.");
      }
      const media = Array.isArray(data.media) ? data.media : [];
      const snapshot = data.snapshot || undefined;
      setRecentMedia(media);
      setCollectorSnapshot(snapshot);
      if (snapshot) {
        setCollectorCommentLimit(String(snapshot.commentLimitPerMedia || Number.parseInt(collectorCommentLimit, 10) || 80));
        setIncludeCommentReplies(Boolean(snapshot.includeReplies));
      }
      if (!preserveSelection) {
        const initialFromSnapshot = Array.isArray(snapshot?.selectedMediaIds) ? snapshot?.selectedMediaIds : [];
        const nextSelected = initialFromSnapshot.length > 0
          ? initialFromSnapshot
          : media.slice(0, Math.min(3, media.length)).map((item) => item.mediaId);
        setSelectedMediaIds(nextSelected);
      } else {
        setSelectedMediaIds((prev) => {
          if (prev.length > 0) {
            return prev;
          }
          const initialFromSnapshot = Array.isArray(snapshot?.selectedMediaIds) ? snapshot?.selectedMediaIds : [];
          if (initialFromSnapshot.length > 0) return initialFromSnapshot;
          return media.slice(0, Math.min(3, media.length)).map((item) => item.mediaId);
        });
      }
      if (data.ready === false) {
        setError(data.message || "Meta 인증 상태가 준비되지 않아 댓글 수집을 진행할 수 없습니다.");
      }
    } catch (collectorError) {
      setError(collectorError instanceof Error ? collectorError.message : "댓글 수집 초기 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingCollector(false);
    }
  }

  useEffect(() => {
    void loadCommentCollector({ refresh: true, preserveSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedRowIndex >= rows.length) {
      setSelectedRowIndex(Math.max(0, rows.length - 1));
    }
  }, [rows.length, selectedRowIndex]);

  useEffect(() => {
    const nextColumns = ensurePreferredColumnsFirst(columns);
    if (nextColumns.join("|") !== columns.join("|")) {
      setColumns(nextColumns);
      return;
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(usernameColumn))) {
      setUsernameColumn(detectBestColumn(nextColumns, ["ig_username", "username", "instagram_id", "insta_id"], "ig_username"));
    }
    const nameFallback = detectBestColumn(nextColumns, ["dm_name", "name", "username"], "dm_name");
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(nameColumn))) {
      setNameColumn(nameFallback);
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(statusColumn))) {
      setStatusColumn(detectBestColumn(nextColumns, ["status"], "status"));
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(sentAtColumn))) {
      setSentAtColumn(detectBestColumn(nextColumns, ["dm_sent_at", "sent_at"], "dm_sent_at"));
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(resultColumn))) {
      setResultColumn(detectBestColumn(nextColumns, ["dm_result", "result"], "dm_result"));
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(messageIdColumn))) {
      setMessageIdColumn(detectBestColumn(nextColumns, ["dm_message_id", "message_id"], "dm_message_id"));
    }
    if (!nextColumns.some((column) => normalizeHeader(column) === normalizeHeader(rowIdColumn))) {
      setRowIdColumn(detectBestColumn(nextColumns, ["comment_id", "commentid", "row_id"], "comment_id"));
    }
  }, [
    columns,
    messageIdColumn,
    nameColumn,
    resultColumn,
    rowIdColumn,
    sentAtColumn,
    statusColumn,
    usernameColumn
  ]);

  function detachResizeListeners(): void {
    if (resizeMoveHandlerRef.current && typeof window !== "undefined") {
      window.removeEventListener("mousemove", resizeMoveHandlerRef.current);
      resizeMoveHandlerRef.current = null;
    }
    if (resizeUpHandlerRef.current && typeof window !== "undefined") {
      window.removeEventListener("mouseup", resizeUpHandlerRef.current);
      resizeUpHandlerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      detachResizeListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setColumnWidths((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      columns.forEach((column) => {
        const prevWidth = Number.parseInt(String(prev[column] ?? ""), 10);
        if (Number.isFinite(prevWidth)) {
          next[column] = Math.max(TABLE_MIN_COL_WIDTH, prevWidth);
        } else {
          next[column] = getDefaultColumnWidth(column);
          changed = true;
        }
      });
      if (Object.keys(prev).length !== columns.length) {
        changed = true;
      }
      if (!changed) {
        return prev;
      }
      return next;
    });
  }, [columns]);

  function getColumnWidth(column: string): number {
    const rawWidth = Number.parseInt(String(columnWidths[column] ?? ""), 10);
    if (Number.isFinite(rawWidth)) {
      return Math.max(TABLE_MIN_COL_WIDTH, rawWidth);
    }
    return getDefaultColumnWidth(column);
  }

  function resetColumnWidths(): void {
    const next: Record<string, number> = {};
    columns.forEach((column) => {
      next[column] = getDefaultColumnWidth(column);
    });
    setColumnWidths(next);
  }

  function startColumnResize(event: React.MouseEvent<HTMLDivElement>, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    detachResizeListeners();
    const startX = event.clientX;
    const startWidth = getColumnWidth(column);

    const onMouseMove = (moveEvent: MouseEvent): void => {
      const deltaX = moveEvent.clientX - startX;
      const nextWidth = Math.max(TABLE_MIN_COL_WIDTH, Math.round(startWidth + deltaX));
      setColumnWidths((prev) => ({ ...prev, [column]: nextWidth }));
    };
    const onMouseUp = (): void => {
      detachResizeListeners();
    };

    resizeMoveHandlerRef.current = onMouseMove;
    resizeUpHandlerRef.current = onMouseUp;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function applyDataset(nextColumns: string[], nextRows: DmRow[]): void {
    const normalizedColumns = stripLegacyDmIdColumns(ensurePreferredColumnsFirst(nextColumns));
    const sanitizedRows = stripLegacyDmIdFieldsFromRows(nextRows);
    const materializedRows = sanitizedRows.map((row) => {
      const nextRow = { ...row };
      normalizedColumns.forEach((column) => {
        const key = findColumnKey(nextRow, column);
        if (!(key in nextRow)) {
          nextRow[column] = "";
        }
      });
      if (!Object.keys(nextRow).some((key) => normalizeHeader(key) === "status")) {
        nextRow.status = "";
      }
      return nextRow;
    });
    setColumns(normalizedColumns);
    setRows(materializedRows);
    setSelectedRowIndex(0);
  }

  function onParsePaste(): void {
    setError(undefined);
    setSuccess(undefined);
    const parsed = parseTabularText(pasteText);
    if (!parsed) {
      setError("붙여넣기 데이터가 비어 있거나 형식을 해석할 수 없습니다.");
      return;
    }
    applyDataset(parsed.columns, parsed.rows);
    setSuccess(`데이터 ${parsed.rows.length}행을 불러왔습니다.`);
  }

  async function onImportCsvFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseTabularText(text);
      if (!parsed) {
        throw new Error("CSV 내용이 비어 있거나 해석할 수 없습니다.");
      }
      applyDataset(parsed.columns, parsed.rows);
      setSuccess(`CSV ${parsed.rows.length}행을 불러왔습니다.`);
      setError(undefined);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSV 불러오기에 실패했습니다.");
    } finally {
      event.target.value = "";
    }
  }

  function onUpdateCell(rowIndex: number, column: string, value: string): void {
    setRows((prev) =>
      prev.map((row, index) => (index === rowIndex ? writeCell(row, column, value) : row))
    );
  }

  function onAddRow(): void {
    const base: DmRow = {};
    columns.forEach((column) => {
      base[column] = "";
    });
    setRows((prev) => [...prev, base]);
    setSelectedRowIndex(rows.length);
  }

  function onAddExampleRow(): void {
    const exampleRow: DmRow = {
      comment_id: "18419179417121433",
      status: "",
      ig_username: "sunbae89",
      dm_name: "홍길동",
      coupons_name: "쑨에듀 프리미엄 할인",
      coupons_code: "SSUNEDU-2026-WIN",
      custom_str: "당첨 안내 문자를 확인하셨다면 오늘 자정 전까지 등록해 주세요."
    };
    const mergedColumns = ensurePreferredColumnsFirst([...columns, ...Object.keys(exampleRow)]);
    setColumns(mergedColumns);
    setRows((prev) => [...prev, mergedColumns.reduce<DmRow>((acc, column) => ({ ...acc, [column]: exampleRow[column] || "" }), {})]);
    setSelectedRowIndex(rows.length);
    if (!messageTemplate.trim()) {
      setMessageTemplate(EXAMPLE_TEMPLATE);
    }
    setSuccess("예시 1행을 추가했습니다. 오른쪽 미리보기에서 문구를 바로 확인하세요.");
    setError(undefined);
  }

  function onRemoveRow(rowIndex: number): void {
    setRows((prev) => prev.filter((_row, index) => index !== rowIndex));
  }

  function onAddColumn(): void {
    const raw = String(newColumnName || "").trim();
    if (!raw) return;
    const existing = new Set(columns.map((column) => normalizeHeader(column)));
    let next = raw;
    let suffix = 2;
    while (existing.has(normalizeHeader(next))) {
      next = `${raw}_${suffix}`;
      suffix += 1;
    }
    const nextColumns = ensurePreferredColumnsFirst([...columns, next]);
    setColumns(nextColumns);
    setRows((prev) => prev.map((row) => ({ ...row, [next]: "" })));
    setNewColumnName("");
  }

  function toggleSelectedMedia(mediaId: string): void {
    const id = String(mediaId || "").trim();
    if (!id) return;
    setSelectedMediaIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }

  function selectAllRecentMedia(): void {
    setSelectedMediaIds(recentMedia.map((item) => item.mediaId));
  }

  function clearSelectedMedia(): void {
    setSelectedMediaIds([]);
  }

  async function onCollectComments(): Promise<void> {
    const selectedFromInput = parseMediaIdsInput(manualMediaIds);
    const mediaIds = Array.from(new Set([...selectedMediaIds, ...selectedFromInput]));
    if (mediaIds.length === 0) {
      setError("수집할 게시물을 먼저 선택하거나 media ID를 입력해 주세요.");
      return;
    }

    setCollectingComments(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/meta/dm/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaIds,
          mediaLimit: Number.parseInt(collectorMediaLimit, 10) || 12,
          commentLimitPerMedia: Number.parseInt(collectorCommentLimit, 10) || 80,
          includeReplies: includeCommentReplies
        })
      });
      const data = (await response.json()) as CollectorCollectResponse;
      if (!response.ok) {
        throw new Error(data.error || "댓글 수집에 실패했습니다.");
      }
      const snapshot = data.snapshot;
      if (!snapshot) {
        throw new Error("수집 결과가 비어 있습니다.");
      }
      setCollectorSnapshot(snapshot);
      setRecentMedia(snapshot.media || []);
      setSelectedMediaIds(snapshot.selectedMediaIds || mediaIds);
      const summary = data.summary;
      if (summary) {
        if (summary.totalComments === 0) {
          setSuccess(
            data.message ||
              `수집 완료 · 게시물 ${summary.selectedMedia}개를 확인했지만 수집 가능한 댓글이 0건입니다.`
          );
        } else {
          const direct = Number(summary.directUsernameCount || 0);
          const enriched = Number(summary.enrichedUsernameCount || 0);
          const fallback = Number(summary.fallbackUsernameCount || 0);
          setSuccess(
            `댓글 수집 완료 · 게시물 ${summary.selectedMedia}개 / 댓글 ${summary.totalComments}건 / 사용자 ${summary.uniqueUsers}명 (Meta username 직접 ${direct} / 2차복구 ${enriched} / fallback ${fallback})`
          );
        }
      } else {
        setSuccess(`댓글 수집 완료 · 댓글 ${snapshot.comments.length}건`);
      }
    } catch (collectorError) {
      setError(collectorError instanceof Error ? collectorError.message : "댓글 수집에 실패했습니다.");
    } finally {
      setCollectingComments(false);
    }
  }

  function buildRowsFromCollectedComments(comments: CollectorComment[], collectedAt: string): DmRow[] {
    const sorted = [...comments].sort((left, right) => {
      const leftTime = Date.parse(left.timestamp) || 0;
      const rightTime = Date.parse(right.timestamp) || 0;
      return rightTime - leftTime;
    });
    const seenUsers = new Set<string>();
    const rowsFromComments: DmRow[] = [];
    sorted.forEach((item) => {
      const userKey = item.igsid ? `id:${item.igsid}` : `u:${normalizeUsername(item.username)}`;
      if (collectorUniqueByUser && userKey && seenUsers.has(userKey)) {
        return;
      }
      if (collectorUniqueByUser && userKey) {
        seenUsers.add(userKey);
      }
      const normalizedCollectedUsername = normalizeUsername(item.username);
      const usernameValue = normalizedCollectedUsername === "unknown" ? "" : String(item.username || "").trim();
      rowsFromComments.push({
        comment_id: String(item.commentId || "").trim(),
        status: "",
        ig_username: usernameValue,
        dm_name: usernameValue,
        media_id: String(item.mediaId || "").trim(),
        comment_text: item.text,
        media_permalink: String(item.mediaPermalink || "").trim(),
        media_caption: String(item.mediaCaption || "").trim(),
        commented_at: item.timestamp,
        collected_at: collectedAt
      });
    });
    return rowsFromComments;
  }

  function onImportCollectedCommentsToRows(): void {
    if (!collectorSnapshot || !Array.isArray(collectorSnapshot.comments) || collectorSnapshot.comments.length === 0) {
      setError("가져올 댓글 수집 데이터가 없습니다. 먼저 댓글을 수집해 주세요.");
      return;
    }
    const builtRows = buildRowsFromCollectedComments(collectorSnapshot.comments, collectorSnapshot.collectedAt);
    let importRows = builtRows;
    if (collectorImportMode === "append" && collectorSkipExistingComment) {
      const existingCommentIds = new Set(
        rows
          .map((row) => readCell(row, "comment_id"))
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      importRows = builtRows.filter((row) => {
        const commentId = String(row.comment_id || "").trim();
        if (!commentId) return false;
        return !existingCommentIds.has(commentId);
      });
    }
    if (importRows.length === 0) {
      setError("반영할 신규 댓글 데이터가 없습니다. (중복 제거됨)");
      return;
    }

    const unresolvedCommentCount = importRows.filter((row) => !String(row.comment_id || "").trim()).length;
    const unresolvedHint = unresolvedCommentCount > 0 ? ` (comment_id 누락 ${unresolvedCommentCount}행 제외 필요)` : "";

    if (collectorImportMode === "replace") {
      const nextColumns = deriveColumns(importRows, columns);
      applyDataset(nextColumns, importRows);
      setSuccess(`댓글 기반 대상 데이터 ${importRows.length}행으로 테이블을 교체했습니다.${unresolvedHint}`);
      setError(undefined);
      return;
    }

    const mergedRows = [...rows, ...importRows];
    const nextColumns = deriveColumns(mergedRows, columns);
    applyDataset(nextColumns, mergedRows);
    setSuccess(`댓글 기반 대상 데이터 ${importRows.length}행을 기존 테이블에 추가했습니다.${unresolvedHint}`);
    setError(undefined);
  }

  const selectedRow = rows[selectedRowIndex];
  const previewFallbackRow = useMemo<DmRow>(
    () => ({
      comment_id: "18419179417121433",
      ig_username: "sunbae89",
      dm_name: "홍길동",
      coupons_name: "쑨에듀 프리미엄 할인",
      coupons_code: "SSUNEDU-2026-WIN",
      custom_str: "당첨 안내 문자를 확인하셨다면 오늘 자정 전까지 등록해 주세요."
    }),
    []
  );
  const previewRow = useMemo(() => ({ ...previewFallbackRow, ...(selectedRow || {}) }), [previewFallbackRow, selectedRow]);
  const renderedMessage = useMemo(() => renderTemplate(messageTemplate, previewRow), [messageTemplate, previewRow]);
  const previewCommentId = readCell(previewRow, "comment_id").trim();
  const previewNameRaw = readCell(previewRow, nameColumn).trim();
  const previewUsernameRaw = readCell(previewRow, usernameColumn).trim();
  const previewRecipientName =
    previewNameRaw && normalizeUsername(previewNameRaw) !== "unknown"
      ? previewNameRaw
      : previewUsernameRaw && normalizeUsername(previewUsernameRaw) !== "unknown"
        ? previewUsernameRaw
        : "";
  const collectorUniqueUsers = useMemo(() => {
    if (!collectorSnapshot?.comments?.length) return 0;
    return new Set(
      collectorSnapshot.comments.map((item) =>
        item.igsid ? `id:${item.igsid}` : `u:${normalizeUsername(item.username)}`
      )
    ).size;
  }, [collectorSnapshot]);
  const collectorSelectedFromInput = useMemo(() => parseMediaIdsInput(manualMediaIds), [manualMediaIds]);
  const tableMinWidth = useMemo(() => {
    const dataWidth = columns.reduce((sum, column) => {
      const rawWidth = Number.parseInt(String(columnWidths[column] ?? ""), 10);
      const width = Number.isFinite(rawWidth)
        ? Math.max(TABLE_MIN_COL_WIDTH, rawWidth)
        : getDefaultColumnWidth(column);
      return sum + width;
    }, 0);
    return Math.max(760, TABLE_INDEX_COL_WIDTH + TABLE_ACTION_COL_WIDTH + dataWidth);
  }, [columnWidths, columns]);

  function setSectionExpanded(section: DmSectionKey, expanded: boolean): void {
    setSectionOpen((prev) => {
      if (Boolean(prev[section]) === expanded) {
        return prev;
      }
      return {
        ...prev,
        [section]: expanded
      };
    });
  }

  function renderSectionControls(section: DmSectionKey): React.JSX.Element {
    const expanded = Boolean(sectionOpen[section]);
    return (
      <div className="ml-auto flex shrink-0 items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-md px-2 text-xs"
          onClick={() => setSectionExpanded(section, !expanded)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "접기" : "펼치기"}
        </Button>
      </div>
    );
  }

  function requestSend(): void {
    if (rows.length === 0) {
      setError("전송할 대상 데이터가 없습니다.");
      return;
    }
    if (!messageTemplate.trim()) {
      setError("DM 템플릿 문구를 입력해 주세요.");
      return;
    }
    setSendConfirmOpen(true);
  }

  async function onSendDm(): Promise<void> {
    setSendConfirmOpen(false);
    setSending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/instagram/meta/dm/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          messageTemplate,
          usernameColumn,
          nameColumn,
          rowIdColumn,
          statusColumn,
          sentAtColumn,
          resultColumn,
          messageIdColumn,
          skipCompleted,
          delayMs: Number.parseInt(delayMs, 10) || 1800,
          dryRun
        })
      });
      const data = (await response.json()) as DmSendResponse;
      if (!response.ok) {
        throw new Error(data.error || "DM 자동 전송에 실패했습니다.");
      }
      const updatedRows = Array.isArray(data.updatedRows) ? data.updatedRows : rows;
      const nextColumns = deriveColumns(updatedRows, columns);
      applyDataset(nextColumns, updatedRows);
      const nextRuns = Array.isArray(data.runs) ? data.runs : runs;
      setRuns(nextRuns);
      const run = data.run;
      if (run) {
        setSuccess(
          `${dryRun ? "테스트" : "실전"} 전송 완료 · 성공 ${run.sentCount}건 / 실패 ${run.failedCount}건 / 건너뜀 ${run.skippedCount}건`
        );
      } else {
        setSuccess("DM 전송 요청이 완료되었습니다.");
      }
      await loadStatus(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "DM 자동 전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-4 w-4" />
                  댓글 수집 파이프라인
                </CardTitle>
                <CardDescription>
                  게시물 댓글 작성자를 수집한 뒤 DM 대상 테이블로 반영합니다. 댓글 ID/작성자/본문/게시물 링크가 함께 저장됩니다.
                </CardDescription>
              </div>
              {renderSectionControls("collector")}
            </CardHeader>
            {sectionOpen.collector ? (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">최근 게시물 조회 개수</Label>
                  <Input
                    value={collectorMediaLimit}
                    onChange={(event) => setCollectorMediaLimit(event.target.value)}
                    inputMode="numeric"
                    placeholder="12"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">게시물당 댓글 수집 개수</Label>
                  <Input
                    value={collectorCommentLimit}
                    onChange={(event) => setCollectorCommentLimit(event.target.value)}
                    inputMode="numeric"
                    placeholder="80"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">옵션</Label>
                  <div className="flex h-10 items-center justify-between rounded-md border px-3">
                    <span className="text-xs text-muted-foreground">답글 포함</span>
                    <Switch checked={includeCommentReplies} onCheckedChange={setIncludeCommentReplies} />
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs">수동 media ID 추가 (선택, 쉼표/줄바꿈 구분)</Label>
                <Textarea
                  value={manualMediaIds}
                  onChange={(event) => setManualMediaIds(event.target.value)}
                  rows={2}
                  placeholder="17912345678901234, 18098765432109876"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadCommentCollector({ refresh: true, preserveSelection: true })}
                  disabled={loadingCollector}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingCollector ? "animate-spin" : ""}`} />
                  {loadingCollector ? "게시물 조회 중..." : "최근 게시물 불러오기"}
                </Button>
                <Button type="button" variant="outline" onClick={selectAllRecentMedia} disabled={recentMedia.length === 0}>
                  전체 선택
                </Button>
                <Button type="button" variant="outline" onClick={clearSelectedMedia} disabled={selectedMediaIds.length === 0}>
                  선택 해제
                </Button>
                <Button type="button" onClick={() => void onCollectComments()} disabled={collectingComments}>
                  {collectingComments ? "댓글 수집 중..." : "선택 게시물 댓글 수집"}
                </Button>
              </div>

              <div className="rounded-md border bg-muted/20 p-2">
                <p className="text-xs text-muted-foreground">
                  현재 선택: 게시물 {selectedMediaIds.length}개 + 수동 입력 {collectorSelectedFromInput.length}개
                </p>
              </div>

              <div className="grid max-h-[250px] grid-cols-1 gap-2 overflow-auto pr-1 md:grid-cols-2">
                {recentMedia.length === 0 ? (
                  <div className="col-span-full rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                    불러온 게시물이 없습니다. `최근 게시물 불러오기`를 눌러 주세요.
                  </div>
                ) : (
                  recentMedia.map((media) => {
                    const selected = selectedMediaIds.includes(media.mediaId);
                    const previewUrl = media.mediaUrl || media.thumbnailUrl || "";
                    return (
                      <button
                        key={`collector-media-${media.mediaId}`}
                        type="button"
                        className={`rounded-md border p-2 text-left transition ${
                          selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/30"
                        }`}
                        onClick={() => toggleSelectedMedia(media.mediaId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold">{truncateText(media.caption || "(캡션 없음)", 52)}</p>
                          <Badge variant={selected ? "default" : "muted"}>{selected ? "선택" : "미선택"}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{media.mediaId}</p>
                        <div className="mt-2 grid grid-cols-[72px_1fr] gap-2">
                          <div className="h-[72px] w-[72px] overflow-hidden rounded border bg-muted">
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt="post preview" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">NO IMG</div>
                            )}
                          </div>
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <p>유형: {media.mediaType || "-"}</p>
                            <p>댓글: {media.commentsCount ?? 0}</p>
                            <p>{media.timestamp ? nowLabel(media.timestamp) : "-"}</p>
                            {media.fetchError ? <p className="text-destructive">{truncateText(media.fetchError, 60)}</p> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {collectorSnapshot ? (
                <div className="space-y-3 rounded-md border bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">수집시각 {nowLabel(collectorSnapshot.collectedAt)}</Badge>
                    <Badge variant="muted">댓글 {collectorSnapshot.comments.length}건</Badge>
                    <Badge variant="muted">사용자 {collectorUniqueUsers}명</Badge>
                    <Badge variant={collectorSnapshot.errors?.length ? "destructive" : "muted"}>
                      오류 {collectorSnapshot.errors?.length || 0}건
                    </Badge>
                  </div>
                  {collectorSnapshot.diagnostics ? (
                    <div className="rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                      Meta username 진단: 직접 제공 {collectorSnapshot.diagnostics.directUsernameCount}건 / 2차 복구 {collectorSnapshot.diagnostics.enrichedUsernameCount}건 / fallback {collectorSnapshot.diagnostics.fallbackUsernameCount}건 / IGSID 존재 {collectorSnapshot.diagnostics.withIgsidCount}건
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">반영 방식</Label>
                      <Select value={collectorImportMode} onValueChange={(value: "append" | "replace") => setCollectorImportMode(value)}>
                        <SelectTrigger><SelectValue placeholder="방식 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="append">기존 테이블에 추가</SelectItem>
                          <SelectItem value="replace">테이블 교체</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">유저 중복 제거</Label>
                      <div className="flex h-10 items-center justify-between rounded-md border px-3">
                        <span className="text-xs text-muted-foreground">유저당 1행</span>
                        <Switch checked={collectorUniqueByUser} onCheckedChange={setCollectorUniqueByUser} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">중복 대상 제외</Label>
                      <div className="flex h-10 items-center justify-between rounded-md border px-3">
                        <span className="text-xs text-muted-foreground">기존 comment_id 제외</span>
                        <Switch checked={collectorSkipExistingComment} onCheckedChange={setCollectorSkipExistingComment} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={onImportCollectedCommentsToRows}>
                      <Database className="h-4 w-4" />
                      수집 결과를 대상 데이터에 반영
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      반영 컬럼: `comment_id`, `ig_username`, `dm_name`, `comment_text`, `media_permalink`, `media_caption`
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">대상 데이터 입력</CardTitle>
                <CardDescription>
                  CSV 파일 업로드 또는 표 데이터를 붙여넣어 발송 대상 테이블을 구성하세요.
                </CardDescription>
              </div>
              {renderSectionControls("dataInput")}
            </CardHeader>
            {sectionOpen.dataInput ? (
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Label>붙여넣기 데이터 (CSV/TSV)</Label>
                <Textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={"comment_id\tstatus\tdm_name\tcoupons_name\tcoupons_code\tcustom_str\n18419179417121433\t준비\t홍길동\t오픈이벤트\tWELCOME10\t오늘까지 사용 가능"}
                  rows={6}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={onParsePaste}>
                  붙여넣기 반영
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={SAMPLE_CSV_PATH} download>
                    <Download className="h-4 w-4" />
                    샘플 다운로드
                  </a>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain,.tsv"
                  onChange={(event) => void onImportCsvFile(event)}
                  className="hidden"
                />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  CSV 불러오기
                </Button>
                <Button type="button" variant="outline" onClick={onAddRow}>
                  <Plus className="h-4 w-4" /> 행 추가
                </Button>
                <Button type="button" variant="outline" onClick={onAddExampleRow}>
                  <Plus className="h-4 w-4" /> 예시 1행 추가
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  placeholder="새 컬럼명 (예: coupons_name)"
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" onClick={onAddColumn}>
                  <Plus className="h-4 w-4" /> 컬럼 추가
                </Button>
              </div>
            </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">수정 가능한 테이블</CardTitle>
                <CardDescription>
                  `comment_id` 컬럼을 전송 기준 키로 사용합니다. `status` 컬럼으로 발송 상태를 관리합니다.
                </CardDescription>
              </div>
              {renderSectionControls("editableTable")}
            </CardHeader>
            {sectionOpen.editableTable ? (
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">헤더 경계를 드래그하면 컬럼 너비를 조절할 수 있습니다.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={resetColumnWidths}>
                    컬럼 너비 초기화
                  </Button>
                  <Label htmlFor="dm-wrap-cells" className="text-xs">줄바꿈 편집</Label>
                  <Switch id="dm-wrap-cells" checked={wrapCells} onCheckedChange={setWrapCells} />
                </div>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-lg border">
                <table className="w-full text-sm" style={{ minWidth: tableMinWidth, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: TABLE_INDEX_COL_WIDTH }} />
                    {columns.map((column) => (
                      <col key={`dm-col-width-${column}`} style={{ width: getColumnWidth(column) }} />
                    ))}
                    <col style={{ width: TABLE_ACTION_COL_WIDTH }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                    <tr>
                      <th className="border-b px-2 py-2 text-left">#</th>
                      {columns.map((column) => {
                        const width = getColumnWidth(column);
                        return (
                          <th
                            key={`dm-col-${column}`}
                            className="relative border-b px-2 py-2 text-left font-semibold align-middle select-none"
                          >
                            <div className="flex items-center gap-2 pr-2">
                              <span className="truncate" title={column}>{column}</span>
                              <span className="text-[10px] font-normal text-muted-foreground">{width}px</span>
                            </div>
                            <div
                              role="separator"
                              aria-orientation="vertical"
                              className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none hover:bg-primary/20"
                              onMouseDown={(event) => startColumnResize(event, column)}
                              title="드래그하여 컬럼 너비 조절"
                            />
                          </th>
                        );
                      })}
                      <th className="border-b px-2 py-2 text-left">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 2} className="px-3 py-10 text-center text-muted-foreground">
                          데이터가 없습니다. CSV/붙여넣기로 대상 목록을 추가하세요.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, rowIndex) => (
                        <tr
                          key={`dm-row-${rowIndex}`}
                          className={rowIndex === selectedRowIndex ? "bg-primary/10" : "hover:bg-muted/40"}
                          onClick={() => setSelectedRowIndex(rowIndex)}
                        >
                          <td className="border-b px-2 py-1.5 align-top text-xs text-muted-foreground">{rowIndex + 1}</td>
                          {columns.map((column) => (
                            <td key={`dm-cell-${rowIndex}-${column}`} className="border-b px-1 py-1 align-top">
                              {wrapCells ? (
                                <Textarea
                                  value={readCell(row, column)}
                                  onChange={(event) => onUpdateCell(rowIndex, column, event.target.value)}
                                  rows={2}
                                  className="min-h-[72px] w-full resize-y border-0 bg-transparent px-2 py-1 text-sm leading-snug focus-visible:ring-1"
                                />
                              ) : (
                                <Input
                                  value={readCell(row, column)}
                                  onChange={(event) => onUpdateCell(rowIndex, column, event.target.value)}
                                  className="h-9 w-full border-0 bg-transparent px-2 focus-visible:ring-1"
                                />
                              )}
                            </td>
                          ))}
                          <td className="border-b px-1 py-1 align-top">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                onRemoveRow(rowIndex);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Meta 인증 / 발송 계정
                </CardTitle>
                <CardDescription>발송 전 메타 API 인증 상태와 현재 발송 계정을 확인합니다.</CardDescription>
              </div>
              {renderSectionControls("metaAccount")}
            </CardHeader>
            {sectionOpen.metaAccount ? (
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void startMetaOAuth()} disabled={metaOAuthLoading}>
                  <ShieldCheck className={`h-4 w-4 ${metaOAuthLoading ? "animate-pulse" : ""}`} />
                  {metaOAuthLoading ? "연동 이동 중..." : "Meta 원클릭 연동"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void loadStatus(true)} disabled={checkingMeta}>
                  <RefreshCw className={`h-4 w-4 ${checkingMeta ? "animate-spin" : ""}`} />
                  {checkingMeta ? "검사 중..." : "메타 API 인증 체크"}
                </Button>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p>
                  상태:{" "}
                  {meta?.ready ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-300">연결 완료</span>
                  ) : (
                    <span className="font-semibold text-amber-600 dark:text-amber-300">미확인 / 미준비</span>
                  )}
                </p>
                <p>계정: @{String(meta?.account?.username || "").trim() || "-"}</p>
                <p>계정 ID: {String(meta?.account?.id || "").trim() || "-"}</p>
                <p>마지막 검사: {meta?.checkedAt ? nowLabel(meta.checkedAt) : "-"}</p>
                {meta?.message ? <p className="mt-1 text-xs text-muted-foreground">{meta.message}</p> : null}
              </div>
            </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4" />
                  DM 미리보기
                </CardTitle>
                <CardDescription>선택한 행 기준으로 실제 전송될 문구를 아이폰형 UI로 확인합니다.</CardDescription>
              </div>
              {renderSectionControls("preview")}
            </CardHeader>
            {sectionOpen.preview ? (
            <CardContent className="space-y-3">
              <div className="mx-auto w-full max-w-[320px] rounded-[42px] border-8 border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 p-3 shadow-2xl dark:border-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
                <div className="mx-auto mb-2 h-5 w-28 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                <div className="rounded-[30px] bg-white p-3 shadow-inner dark:bg-zinc-950">
                  <div className="border-b pb-2 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">
                      {previewRecipientName || "수신자 이름"} <span className="font-normal text-muted-foreground">({previewCommentId || "comment_id"})</span>
                    </p>
                    <p>발송 계정: @{String(meta?.account?.username || "").trim() || "meta-account"}</p>
                  </div>
                  <div className="mt-3 min-h-[220px] rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 text-white shadow-lg">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderedMessage || "메시지 미리보기"}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                <p>매핑: 이름 컬럼 `{nameColumn}` / 핸들 컬럼 `{usernameColumn}` / 기준 키 `comment_id`</p>
                <p>현재 행 값: 이름 `{previewNameRaw || "-"}` / 핸들 `{previewUsernameRaw || "-"}` / comment_id `{previewCommentId || "-"}`</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">발송 간격(ms)</Label>
                  <Input value={delayMs} onChange={(event) => setDelayMs(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">행 식별 컬럼 (선택)</Label>
                  <Select value={rowIdColumn} onValueChange={setRowIdColumn}>
                    <SelectTrigger><SelectValue placeholder="컬럼 선택" /></SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={`id-col-${column}`} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between text-sm">
                  <Label htmlFor="skip-completed" className="text-xs">기존 완료 상태 건너뛰기</Label>
                  <Switch id="skip-completed" checked={skipCompleted} onCheckedChange={setSkipCompleted} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Label htmlFor="dry-run" className="text-xs">테스트 모드 (실제 전송 안함)</Label>
                  <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
                </div>
                <p className="text-xs text-muted-foreground">
                  발송 결과는 `status / dm_sent_at / dm_result / dm_message_id` 컬럼으로 즉시 추적됩니다.
                </p>
              </div>

              <Button type="button" className="w-full" onClick={requestSend} disabled={sending || rows.length === 0}>
                <Send className="h-4 w-4" />
                {sending ? "전송 중..." : "DM 자동 전송"}
              </Button>
            </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">DM 문구 템플릿</CardTitle>
                <CardDescription>
                  `{"{{컬럼명}}"}` 또는 `{"{컬럼명}"}` 형식으로 변수 치환됩니다. 예: <code>{"{dm_name}"}</code>
                </CardDescription>
              </div>
              {renderSectionControls("template")}
            </CardHeader>
            {sectionOpen.template ? (
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setMessageTemplate(EXAMPLE_TEMPLATE)}>
                  요청 양식 넣기
                </Button>
              </div>
              <Textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                rows={7}
                placeholder={"{dm_name}님!\n안녕하세요. 쑨에듀팀입니다.\n...\n{coupons_code}"}
              />
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto rounded-md border p-2">
                {columns.map((column) => (
                  <Button
                    key={`dm-token-${column}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setMessageTemplate((prev) => `${prev}${prev.endsWith("\n") || !prev ? "" : " "}{{${column}}}`)
                    }
                  >
                    {column}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">핸들(@) 컬럼 (선택)</Label>
                  <Select value={usernameColumn} onValueChange={setUsernameColumn}>
                    <SelectTrigger><SelectValue placeholder="컬럼 선택" /></SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={`username-col-${column}`} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">수신자 이름 컬럼</Label>
                  <Select value={nameColumn} onValueChange={setNameColumn}>
                    <SelectTrigger><SelectValue placeholder="컬럼 선택" /></SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={`name-col-${column}`} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                전송 키는 `comment_id` 고정입니다. 전송 시 comment_id에서 작성자 IGSID를 조회해 DM을 보냅니다.
              </p>
            </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">발송 이력 추적</CardTitle>
                <CardDescription>성공/실패/건너뜀 건수와 실행 시간을 기록합니다.</CardDescription>
              </div>
              {renderSectionControls("history")}
            </CardHeader>
            {sectionOpen.history ? (
            <CardContent className="space-y-2">
              {runs.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">아직 발송 이력이 없습니다.</p>
              ) : (
                runs.slice(0, 10).map((run) => (
                  <div key={run.runId} className="rounded-md border bg-muted/20 p-2 text-xs">
                    <p className="font-semibold">
                      {run.dryRun ? "테스트 실행" : "실전 전송"} · {nowLabel(run.startedAt)}
                    </p>
                    <p>성공 {run.sentCount} / 실패 {run.failedCount} / 건너뜀 {run.skippedCount} / 전체 {run.totalRows}</p>
                  </div>
                ))
              )}
            </CardContent>
            ) : null}
          </Card>
        </div>
      </div>

      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dryRun ? "DM 테스트 실행" : "DM 자동 전송 실행"}</DialogTitle>
            <DialogDescription>
              대상 {rows.length}건을 순차 처리합니다. {dryRun ? "실제 전송 없이 상태만 갱신됩니다." : "실제 전송이 진행됩니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p>전송 간격: {delayMs}ms</p>
            <p>완료 상태 건너뛰기: {skipCompleted ? "예" : "아니오"}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendConfirmOpen(false)}>취소</Button>
            <Button type="button" onClick={() => void onSendDm()} disabled={sending}>
              {sending ? "처리 중..." : dryRun ? "테스트 실행" : "실제 전송"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
