import { listSheetContentRows } from "@/lib/sheet-content";
import { generateIdeas } from "@/lib/idea-generator";
import { appendIdeaRowsToSheet, loadIdeasSheetTable } from "@/lib/ideas-sheet";
import { listRows, upsertRow } from "@/lib/repository";
import {
  runNextWorkflowStage,
  startStagedWorkflow
} from "@/lib/staged-workflow";
import { listWorkflows, upsertWorkflow } from "@/lib/workflow-store";
import { uploadVideoToYoutube } from "@/lib/youtube-service";
import {
  getAutomationTemplateEntryById,
  getAutomationTemplateSnapshot
} from "@/lib/automation-template-store";
import {
  readAutomationRunState,
  writeAutomationRunState
} from "@/lib/automation-run-state-store";
import { resolveModelForTask, resolveProviderForTask } from "@/lib/ai-provider";
import {
  AutomationLogEntry,
  AutomationRunState,
  AutomationTemplateMode,
  CreateVideoRequest,
  IdeaLanguage,
  ImageAspectRatio,
  RenderOptions,
  VideoRow
} from "@/lib/types";
import { appBaseUrl } from "@/lib/utils";

interface AutomationDefaults {
  imageStyle: string;
  imageAspectRatio: ImageAspectRatio;
  voice: string;
  voiceSpeed: number;
  useSfx: boolean;
  videoLengthSec: number;
  sceneCount: number;
  templateMode: AutomationTemplateMode;
  templateApplied: boolean;
  templateName?: string;
  renderOptions?: RenderOptions;
  templateSourceTitle?: string;
  templateSourceTopic?: string;
}

export interface StartAutomationArgs {
  sheetName?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  uploadMode?: "youtube" | "pre_upload";
  templateMode?: AutomationTemplateMode;
  templateId?: string;
  maxItems?: number;
  autoIdeaEnabled?: boolean;
  autoIdeaTopic?: string;
  autoIdeaLanguage?: IdeaLanguage;
  autoIdeaIdBase?: string;
}

type StopReason = "requested" | "completed" | "failed";
type SheetReadyRow = Awaited<ReturnType<typeof listSheetContentRows>>[number];

type ContentSignature = {
  rowId: string;
  title: string;
  body: string;
  titleNorm: string;
  bodyNorm: string;
  titleTokens: string[];
  bodyTokens: string[];
  createdAtMs: number;
  source: "history" | "run" | "ready";
};

type DuplicateCheckResult = {
  duplicate: boolean;
  reason?: string;
  matched?: ContentSignature;
  titleScore?: number;
  bodyScore?: number;
  commonBodyTokens?: number;
};

const MAX_LOGS = 200;
const DEFAULTS: AutomationDefaults = {
  imageStyle: "Cinematic photo-real",
  imageAspectRatio: "9:16",
  voice: "alloy",
  voiceSpeed: 1,
  useSfx: true,
  videoLengthSec: 30,
  sceneCount: 5,
  templateMode: "applied_template",
  templateApplied: false
};

declare global {
  var __shortsAutomationStates__: Record<string, AutomationRunState> | undefined;
  var __shortsAutomationPromises__: Record<string, Promise<void> | undefined> | undefined;
  var __shortsAutomationStatePersistTimers__: Record<string, ReturnType<typeof setTimeout> | undefined> | undefined;
}

function createInitialState(): AutomationRunState {
  return {
    phase: "idle",
    stopRequested: false,
    totalDiscovered: 0,
    processed: 0,
    uploaded: 0,
    failed: 0,
    remaining: 0,
    logs: []
  };
}

function getUserKey(userId?: string): string {
  const value = String(userId || "").trim();
  return value || "__default__";
}

function getStateStore(): Record<string, AutomationRunState> {
  if (!globalThis.__shortsAutomationStates__) {
    globalThis.__shortsAutomationStates__ = {};
  }
  return globalThis.__shortsAutomationStates__;
}

function getPromiseStore(): Record<string, Promise<void> | undefined> {
  if (!globalThis.__shortsAutomationPromises__) {
    globalThis.__shortsAutomationPromises__ = {};
  }
  return globalThis.__shortsAutomationPromises__;
}

function getPersistTimerStore(): Record<string, ReturnType<typeof setTimeout> | undefined> {
  if (!globalThis.__shortsAutomationStatePersistTimers__) {
    globalThis.__shortsAutomationStatePersistTimers__ = {};
  }
  return globalThis.__shortsAutomationStatePersistTimers__;
}

function getStateRef(userId?: string): AutomationRunState {
  const key = getUserKey(userId);
  const store = getStateStore();
  if (!store[key]) {
    store[key] = createInitialState();
  }
  return store[key];
}

function snapshotState(userId?: string): AutomationRunState {
  const state = getStateRef(userId);
  return {
    ...state,
    logs: [...state.logs]
  };
}

function pushLog(userId: string | undefined, level: "info" | "error", message: string): void {
  const state = getStateRef(userId);
  const entry: AutomationLogEntry = {
    at: new Date().toISOString(),
    level,
    message
  };
  state.logs = [...state.logs, entry].slice(-MAX_LOGS);
  schedulePersistState(userId);
}

function logServer(
  level: "info" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;
  if (level === "error") {
    console.error(`[automation-runner] ${payload}`);
    return;
  }
  console.log(`[automation-runner] ${payload}`);
}

function normalizeAutoIdeaLanguage(value: IdeaLanguage | undefined): IdeaLanguage {
  if (value === "en" || value === "ja" || value === "es" || value === "hi") {
    return value;
  }
  return "ko";
}

function normalizeAutoIdeaCount(raw: number | undefined, fallback: number): number {
  const value = Number.isFinite(raw) ? Math.floor(Number(raw)) : fallback;
  return Math.max(1, Math.min(10, Number.isFinite(value) ? value : fallback));
}

function findRowValue(row: Record<string, string>, aliases: string[]): string {
  const aliasSet = new Set(aliases.map((item) => item.trim().toLowerCase()));
  const key = Object.keys(row).find((item) => aliasSet.has(item.trim().toLowerCase()));
  return key ? String(row[key] || "").trim() : "";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseRatio(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(String(value || "").trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSimilarityText(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSimilarityText(value: string | undefined): string[] {
  const normalized = normalizeSimilarityText(value);
  if (!normalized) {
    return [];
  }
  const words = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const wordSet = new Set(words);
  if (wordSet.size >= 6) {
    return Array.from(wordSet).slice(0, 200);
  }

  const compact = normalized.replace(/\s+/g, "");
  const ngrams: string[] = [];
  if (compact.length >= 4) {
    const gramSize = compact.length > 40 ? 3 : 2;
    for (let index = 0; index <= compact.length - gramSize && ngrams.length < 200; index += 1) {
      ngrams.push(compact.slice(index, index + gramSize));
    }
  }
  return Array.from(new Set([...words, ...ngrams])).slice(0, 200);
}

function computeJaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  });
  const union = leftSet.size + rightSet.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function countCommonTokens(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  let count = 0;
  left.forEach((token) => {
    if (rightSet.has(token)) {
      count += 1;
    }
  });
  return count;
}

function parseIsoMillis(value: string | undefined): number {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildSignatureFromReadyRow(row: SheetReadyRow): ContentSignature {
  const title = String(row.subject || row.keyword || "").trim();
  const body = [row.keyword, row.subject, row.description, row.narration]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  const titleNorm = normalizeSimilarityText(title);
  const bodyNorm = normalizeSimilarityText(body);
  return {
    rowId: row.id,
    title,
    body,
    titleNorm,
    bodyNorm,
    titleTokens: tokenizeSimilarityText(title),
    bodyTokens: tokenizeSimilarityText(body),
    createdAtMs: Date.now(),
    source: "ready"
  };
}

function normalizeLoadedState(input: Partial<AutomationRunState> | undefined): AutomationRunState {
  const base = createInitialState();
  if (!input || typeof input !== "object") {
    return base;
  }
  return {
    ...base,
    ...input,
    logs: Array.isArray(input.logs) ? input.logs.slice(-MAX_LOGS) : []
  };
}

function hasMeaningfulState(state: AutomationRunState | undefined): boolean {
  if (!state) {
    return false;
  }
  return Boolean(
    state.phase !== "idle" ||
      state.logs.length > 0 ||
      state.startedAt ||
      state.finishedAt ||
      state.processed ||
      state.totalDiscovered ||
      state.lastError
  );
}

async function hydrateStateFromStore(userId?: string): Promise<AutomationRunState> {
  const key = getUserKey(userId);
  const store = getStateStore();
  const current = store[key];
  if (hasMeaningfulState(current)) {
    return current;
  }

  const loaded = normalizeLoadedState(await readAutomationRunState(userId));
  store[key] = loaded;
  return loaded;
}

function schedulePersistState(userId?: string): void {
  const key = getUserKey(userId);
  const timers = getPersistTimerStore();
  if (timers[key]) {
    clearTimeout(timers[key]);
  }
  timers[key] = setTimeout(() => {
    const snapshot = snapshotState(userId);
    void writeAutomationRunState(snapshot, userId).catch((error) => {
      console.error("[automation-runner] failed to persist state", {
        userId: userId || "",
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }, 120);
}

async function persistStateNow(userId?: string): Promise<void> {
  const key = getUserKey(userId);
  const timers = getPersistTimerStore();
  if (timers[key]) {
    clearTimeout(timers[key]);
    delete timers[key];
  }
  await writeAutomationRunState(snapshotState(userId), userId);
}

function isRunningLikePhase(phase: AutomationRunState["phase"] | undefined): boolean {
  return phase === "running" || phase === "stopping";
}

async function hasRunOwnership(userId: string | undefined, runId: string | undefined): Promise<boolean> {
  if (!runId) {
    return true;
  }
  const persisted = normalizeLoadedState(await readAutomationRunState(userId));
  return persisted.runId === runId && isRunningLikePhase(persisted.phase);
}

function buildSignatureFromVideoRow(row: VideoRow): ContentSignature {
  const title = String(row.title || "").trim();
  const body = [row.title, row.topic, row.narration]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
  const titleNorm = normalizeSimilarityText(title);
  const bodyNorm = normalizeSimilarityText(body);
  const createdAtMs = parseIsoMillis(row.updatedAt) || parseIsoMillis(row.createdAt) || 0;
  return {
    rowId: row.id,
    title,
    body,
    titleNorm,
    bodyNorm,
    titleTokens: tokenizeSimilarityText(title),
    bodyTokens: tokenizeSimilarityText(body),
    createdAtMs,
    source: "history"
  };
}

function getDuplicateThresholds(): {
  titleJaccard: number;
  bodyJaccard: number;
  bodyOnlyJaccard: number;
  minCommonTokens: number;
} {
  return {
    titleJaccard: parseRatio(process.env.AUTOMATION_DUP_TITLE_JACCARD, 0.84, 0.4, 0.99),
    bodyJaccard: parseRatio(process.env.AUTOMATION_DUP_BODY_JACCARD, 0.74, 0.35, 0.99),
    bodyOnlyJaccard: parseRatio(process.env.AUTOMATION_DUP_BODY_ONLY_JACCARD, 0.9, 0.5, 0.999),
    minCommonTokens: parsePositiveInt(process.env.AUTOMATION_DUP_MIN_COMMON_TOKENS, 7)
  };
}

function checkDuplicateContent(
  candidate: ContentSignature,
  references: ContentSignature[]
): DuplicateCheckResult {
  const thresholds = getDuplicateThresholds();
  let best: DuplicateCheckResult | undefined;

  for (const reference of references) {
    if (!reference || reference.rowId === candidate.rowId) {
      continue;
    }
    if (!reference.titleNorm && !reference.bodyNorm) {
      continue;
    }

    if (candidate.titleNorm && reference.titleNorm && candidate.titleNorm === reference.titleNorm) {
      return {
        duplicate: true,
        reason: "제목이 기존 업로드와 동일",
        matched: reference,
        titleScore: 1,
        bodyScore: computeJaccard(candidate.bodyTokens, reference.bodyTokens),
        commonBodyTokens: countCommonTokens(candidate.bodyTokens, reference.bodyTokens)
      };
    }

    const titleScore = computeJaccard(candidate.titleTokens, reference.titleTokens);
    const bodyScore = computeJaccard(candidate.bodyTokens, reference.bodyTokens);
    const commonBodyTokens = countCommonTokens(candidate.bodyTokens, reference.bodyTokens);
    const isNearDuplicate =
      (titleScore >= thresholds.titleJaccard &&
        bodyScore >= thresholds.bodyJaccard &&
        commonBodyTokens >= thresholds.minCommonTokens) ||
      (bodyScore >= thresholds.bodyOnlyJaccard && commonBodyTokens >= thresholds.minCommonTokens + 2);
    if (!isNearDuplicate) {
      continue;
    }

    const reason = `유사 콘텐츠 감지 (title ${(titleScore * 100).toFixed(0)}%, body ${(bodyScore * 100).toFixed(0)}%)`;
    const current: DuplicateCheckResult = {
      duplicate: true,
      reason,
      matched: reference,
      titleScore,
      bodyScore,
      commonBodyTokens
    };
    if (!best || (current.bodyScore || 0) > (best.bodyScore || 0)) {
      best = current;
    }
  }

  return best || { duplicate: false };
}

async function loadRecentUploadedSignatures(userId?: string): Promise<ContentSignature[]> {
  const lookbackDays = parsePositiveInt(process.env.AUTOMATION_DUP_LOOKBACK_DAYS, 21);
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - lookbackMs;
  const rows = await listRows(userId);
  const candidates = rows.filter((row) => {
    const isPublishedLike =
      Boolean(row.youtubeUrl) ||
      row.status === "uploaded" ||
      row.status === "uploading" ||
      (row.status === "ready" && Boolean(row.videoUrl));
    if (!isPublishedLike) {
      return false;
    }
    const when = parseIsoMillis(row.updatedAt) || parseIsoMillis(row.createdAt);
    return when >= cutoff;
  });
  return candidates
    .map((row) => buildSignatureFromVideoRow(row))
    .filter((signature) => signature.titleTokens.length > 0 || signature.bodyTokens.length > 0)
    .slice(0, 500);
}

async function generateIdeasForAutomation(args: {
  userId?: string;
  sheetName?: string;
  topic: string;
  language: IdeaLanguage;
  idBase?: string;
  count: number;
}): Promise<string[]> {
  const sheetTable = await loadIdeasSheetTable(args.sheetName, args.userId);
  const existingKeywords = sheetTable.rows
    .map((row) => findRowValue(row, ["keyword"]))
    .filter(Boolean);
  const existingSubjects = sheetTable.rows
    .map((row) => findRowValue(row, ["subject"]))
    .filter(Boolean);
  const existingNarrations = sheetTable.rows
    .map((row) => findRowValue(row, ["narration"]))
    .filter(Boolean);
  const items = await generateIdeas({
    topic: args.topic,
    count: args.count,
    existingKeywords,
    existingSubjects,
    existingNarrations,
    language: args.language,
    userId: args.userId
  });
  const result = await appendIdeaRowsToSheet({
    sheetName: args.sheetName,
    idBase: args.idBase || args.topic,
    items,
    userId: args.userId
  });
  return result.insertedIds;
}

function extractHashTags(text: string | undefined): string[] {
  if (!text) {
    return [];
  }
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return matches
    .map((item) => item.replace(/^#/, "").trim())
    .filter(Boolean);
}

function isServerlessRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function resolveInternalApiSecret(): string {
  return String(
    process.env.AUTOMATION_INTERNAL_SECRET ||
      process.env.CRON_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      process.env.AUTH_SECRET ||
      ""
  ).trim();
}

async function enqueueDeferredYoutubeUpload(args: {
  userId?: string;
  id: string;
  title: string;
  description: string;
  tags: string[];
  videoUrl: string;
  privacyStatus: "private" | "public" | "unlisted";
}): Promise<void> {
  const secret = resolveInternalApiSecret();
  if (!secret) {
    throw new Error("Internal upload secret is missing.");
  }

  const response = await fetch(new URL("/api/upload-youtube", appBaseUrl()), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`
    },
    body: JSON.stringify({
      id: args.id,
      title: args.title,
      description: args.description,
      tags: args.tags,
      videoUrl: args.videoUrl,
      privacyStatus: args.privacyStatus,
      userId: args.userId,
      defer: true
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw.trim() || `Deferred upload enqueue failed with HTTP ${response.status}.`);
  }
}

function uniqueTags(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  values.forEach((raw) => {
    const value = raw.trim().replace(/^#/, "");
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(value);
  });
  return output;
}

function extractRowTags(
  row: Awaited<ReturnType<typeof listSheetContentRows>>[number]
): string[] {
  // Do not inherit sheet tags column here.
  // The cell can contain stale tags from previous themes when rows are reused/updated.
  // Build tags only from current row semantic fields.
  return uniqueTags([
    row.keyword || "",
    ...extractHashTags(row.description),
    ...extractHashTags(row.narration)
  ]);
}

function normalizeComparableText(value: string | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replaceAllUnsafe(source: string, from: string, to: string): string {
  if (!from) {
    return source;
  }
  return source.split(from).join(to);
}

function materializeTemplateText(args: {
  original: string;
  isPrimary: boolean;
  currentTitle: string;
  currentTopic?: string;
  currentNarration?: string;
  currentKeyword?: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): string {
  const normalizedOriginal = String(args.original || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
  const currentTitle = String(args.currentTitle || "").trim();
  const currentTopic = String(args.currentTopic || "").trim();
  const currentNarration = String(args.currentNarration || "").trim();
  const currentKeyword = String(args.currentKeyword || "").trim();

  if (args.isPrimary) {
    return currentTitle || normalizedOriginal;
  }

  let output = normalizedOriginal;
  output = output
    .replace(/\{\{\s*title\s*\}\}|\{title\}/gi, currentTitle)
    .replace(/\{\{\s*topic\s*\}\}|\{topic\}/gi, currentTopic)
    .replace(/\{\{\s*narration\s*\}\}|\{narration\}/gi, currentNarration)
    .replace(/\{\{\s*keyword\s*\}\}|\{keyword\}/gi, currentKeyword);
  if (output !== normalizedOriginal) {
    return output;
  }

  const normalizedSourceTitle = normalizeComparableText(args.sourceTitle);
  const normalizedSourceTopic = normalizeComparableText(args.sourceTopic);
  const normalizedCurrent = normalizeComparableText(normalizedOriginal);
  if (normalizedSourceTitle && normalizedCurrent === normalizedSourceTitle) {
    return currentTitle || normalizedOriginal;
  }
  if (normalizedSourceTopic && normalizedCurrent === normalizedSourceTopic) {
    return currentTopic || currentTitle || normalizedOriginal;
  }

  if (args.sourceTitle && currentTitle) {
    output = replaceAllUnsafe(output, args.sourceTitle, currentTitle);
  }
  if (args.sourceTopic && currentTopic) {
    output = replaceAllUnsafe(output, args.sourceTopic, currentTopic);
  }
  return output;
}

function materializeRenderOptionsForRow(args: {
  base: RenderOptions | undefined;
  currentTitle: string;
  currentTopic?: string;
  currentNarration?: string;
  currentKeyword?: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): RenderOptions | undefined {
  const base = args.base;
  if (!base) {
    return undefined;
  }

  const templates = base.overlay.titleTemplates || [];
  const nextTemplates = templates.map((item) => ({
    ...item,
    text: materializeTemplateText({
      original: item.text,
      isPrimary: item.id === "__primary_title__",
      currentTitle: args.currentTitle,
      currentTopic: args.currentTopic,
      currentNarration: args.currentNarration,
      currentKeyword: args.currentKeyword,
      sourceTitle: args.sourceTitle,
      sourceTopic: args.sourceTopic
    })
  }));

  return {
    ...base,
    overlay: {
      ...base.overlay,
      titleText: args.currentTitle,
      titleTemplates: nextTemplates
    }
  };
}

function buildUploadDescription(topic: string | undefined, narration: string | undefined, tags: string[]): string {
  const body = (topic || narration || "").trim();
  const hashTags = tags.map((tag) => `#${tag}`).join(" ");
  if (body && hashTags) {
    return `${body}\n\n${hashTags}`;
  }
  return body || hashTags;
}

async function resolveDefaultsFromLatestWorkflow(
  userId: string | undefined,
  templateMode: AutomationTemplateMode,
  templateId?: string
): Promise<AutomationDefaults> {
  const selectedTemplate =
    templateMode === "applied_template" && templateId
      ? await getAutomationTemplateEntryById(templateId, userId)
      : undefined;
  if (templateMode === "applied_template" && templateId && !selectedTemplate) {
    throw new Error("선택한 자동화 템플릿을 찾지 못했습니다. 템플릿을 다시 선택해 주세요.");
  }

  const persistedTemplate = selectedTemplate
    ? {
        renderOptions: selectedTemplate.renderOptions,
        imageStyle: selectedTemplate.imageStyle,
        sourceTitle: selectedTemplate.sourceTitle,
        sourceTopic: selectedTemplate.sourceTopic,
        templateName: selectedTemplate.templateName,
        voice: selectedTemplate.voice,
        voiceSpeed: selectedTemplate.voiceSpeed,
        updatedAt: selectedTemplate.updatedAt
      }
    : await getAutomationTemplateSnapshot(userId);
  const workflows = await listWorkflows(userId);
  const latestAny = workflows[0];

  if (templateMode === "applied_template" && !persistedTemplate) {
    throw new Error(
      "자동화 템플릿이 없습니다. Create 화면에서 [템플릿 적용]을 먼저 실행해 주세요."
    );
  }

  if (!latestAny) {
    if (templateMode === "applied_template" && persistedTemplate) {
      return {
        ...DEFAULTS,
        templateMode,
        templateApplied: true,
        templateName: persistedTemplate.templateName,
        imageStyle: persistedTemplate.imageStyle || DEFAULTS.imageStyle,
        voice: persistedTemplate.voice || DEFAULTS.voice,
        voiceSpeed:
          typeof persistedTemplate.voiceSpeed === "number"
            ? persistedTemplate.voiceSpeed
            : DEFAULTS.voiceSpeed,
        videoLengthSec:
          typeof persistedTemplate.videoLengthSec === "number"
            ? persistedTemplate.videoLengthSec
            : DEFAULTS.videoLengthSec,
        sceneCount:
          typeof persistedTemplate.sceneCount === "number"
            ? persistedTemplate.sceneCount
            : DEFAULTS.sceneCount,
        renderOptions: persistedTemplate.renderOptions,
        templateSourceTitle: persistedTemplate.sourceTitle,
        templateSourceTopic: persistedTemplate.sourceTopic
      };
    }
    return {
      ...DEFAULTS,
      templateMode,
      templateApplied: false
    };
  }

  const latestWithTemplate =
    workflows.find(
      (item) => (item.renderOptions?.overlay?.titleTemplates || []).length > 0
    ) || latestAny;

  let renderOptions: RenderOptions | undefined;
  let templateSourceTitle: string | undefined;
  let templateSourceTopic: string | undefined;
  let templateApplied = false;
  let templateName: string | undefined;

  if (templateMode === "applied_template") {
    renderOptions = persistedTemplate?.renderOptions;
    templateSourceTitle = persistedTemplate?.sourceTitle;
    templateSourceTopic = persistedTemplate?.sourceTopic;
    templateApplied = Boolean(renderOptions);
    templateName = persistedTemplate?.templateName;
  } else if (templateMode === "latest_workflow") {
    renderOptions = latestWithTemplate.renderOptions || latestAny.renderOptions;
    templateSourceTitle = latestWithTemplate.input.title;
    templateSourceTopic = latestWithTemplate.input.topic;
    templateApplied = Boolean(renderOptions);
    templateName = templateApplied ? "latest_workflow" : undefined;
  }

  return {
    imageStyle:
      templateMode === "applied_template" && persistedTemplate?.imageStyle
        ? persistedTemplate.imageStyle
        : latestAny.input.imageStyle || DEFAULTS.imageStyle,
    imageAspectRatio: latestAny.input.imageAspectRatio === "16:9" ? "16:9" : "9:16",
    voice:
      templateMode === "applied_template" && persistedTemplate?.voice
        ? persistedTemplate.voice
        : latestAny.input.voice || DEFAULTS.voice,
    voiceSpeed:
      templateMode === "applied_template" && typeof persistedTemplate?.voiceSpeed === "number"
        ? persistedTemplate.voiceSpeed
        : typeof latestAny.input.voiceSpeed === "number"
          ? latestAny.input.voiceSpeed
          : DEFAULTS.voiceSpeed,
    useSfx: typeof latestAny.input.useSfx === "boolean" ? latestAny.input.useSfx : DEFAULTS.useSfx,
    videoLengthSec:
      templateMode === "applied_template" && typeof persistedTemplate?.videoLengthSec === "number"
        ? persistedTemplate.videoLengthSec
        : typeof latestAny.input.videoLengthSec === "number"
          ? latestAny.input.videoLengthSec
          : DEFAULTS.videoLengthSec,
    sceneCount:
      templateMode === "applied_template" && typeof persistedTemplate?.sceneCount === "number"
        ? persistedTemplate.sceneCount
        : typeof latestAny.input.sceneCount === "number"
          ? latestAny.input.sceneCount
          : DEFAULTS.sceneCount,
    templateMode,
    templateApplied,
    templateName,
    renderOptions,
    templateSourceTitle,
    templateSourceTopic
  };
}

function isFatalUploadError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("credentials are missing") ||
    lower.includes("unauthorized_client") ||
    lower.includes("invalid_client") ||
    lower.includes("invalid_grant")
  );
}

function requestStopInternal(userId: string | undefined, reason: StopReason, errorMessage?: string): void {
  const state = getStateRef(userId);
  state.currentRowId = undefined;
  state.currentRowTitle = undefined;
  state.finishedAt = new Date().toISOString();
  state.stopRequested = reason === "requested" ? true : state.stopRequested;
  if (reason === "completed") {
    state.phase = "completed";
  } else if (reason === "failed") {
    state.phase = "failed";
    state.lastError = errorMessage;
  } else {
    state.phase = "idle";
  }
  void persistStateNow(userId).catch((error) => {
    console.error("[automation-runner] failed to persist stop state", {
      userId: userId || "",
      message: error instanceof Error ? error.message : String(error)
    });
  });
}

async function processOneRow(args: {
  userId?: string;
  row: SheetReadyRow;
  defaults: AutomationDefaults;
  privacyStatus: "private" | "public" | "unlisted";
  uploadMode: "youtube" | "pre_upload";
}): Promise<{ fatal: boolean; completed: boolean }> {
  const state = getStateRef(args.userId);
  const row = args.row;
  const tags = extractRowTags(row);

  const createPayload: CreateVideoRequest = {
    id: row.id,
    title: row.subject || row.keyword || `Row ${row.rowNumber}`,
    topic: row.description || undefined,
    narration: row.narration || undefined,
    imageStyle: args.defaults.imageStyle,
    imageAspectRatio: args.defaults.imageAspectRatio,
    voice: args.defaults.voice,
    voiceSpeed: args.defaults.voiceSpeed,
    useSfx: args.defaults.useSfx,
    videoLengthSec: args.defaults.videoLengthSec,
    sceneCount: args.defaults.sceneCount,
    tags
  };

  try {
    logServer("info", "row:start", {
      userId: args.userId || "",
      rowId: row.id,
      uploadMode: args.uploadMode
    });
    pushLog(args.userId, "info", `[${row.id}] 워크플로우 시작`);
    let workflow = await startStagedWorkflow(createPayload, args.userId);

    const rowRenderOptions = materializeRenderOptionsForRow({
      base: args.defaults.renderOptions,
      currentTitle: createPayload.title,
      currentTopic: createPayload.topic,
      currentNarration: createPayload.narration,
      currentKeyword: row.keyword,
      sourceTitle: args.defaults.templateSourceTitle,
      sourceTopic: args.defaults.templateSourceTopic
    });

    if (rowRenderOptions) {
      workflow = {
        ...workflow,
        renderOptions: rowRenderOptions,
        status: "idle",
        error: undefined,
        updatedAt: new Date().toISOString()
      };
      await upsertWorkflow(workflow, args.userId);
      pushLog(args.userId, "info", `[${row.id}] 최근 템플릿(renderOptions) 적용 + 제목/주제 텍스트 치환`);
    }

    let guard = 0;
    while (workflow.stage !== "final_ready" && workflow.status !== "failed" && guard < 6) {
      const beforeStage = workflow.stage;
      const beforeStatus = workflow.status;
      if (workflow.stage === "scene_split_review") {
        const imageProvider = await resolveProviderForTask("image", args.userId);
        const imageModel = await resolveModelForTask(imageProvider, "image", args.userId);
        pushLog(
          args.userId,
          "info",
          `[${row.id}] image_generate 대기중 (${imageProvider}:${imageModel})`
        );
      } else if (workflow.stage === "assets_review") {
        pushLog(args.userId, "info", `[${row.id}] video_rendering 대기중 (video-engine 요청 준비)`);
      } else if (workflow.stage === "video_review") {
        pushLog(args.userId, "info", `[${row.id}] final_render 대기중 (최종 렌더 요청 준비)`);
      }
      pushLog(
        args.userId,
        "info",
        `[${row.id}] 단계 실행 시작: ${beforeStage} (${beforeStatus})`
      );
      workflow = await runNextWorkflowStage(workflow.id, args.userId);
      guard += 1;
      pushLog(
        args.userId,
        "info",
        `[${row.id}] 단계 진행 ${beforeStage}(${beforeStatus}) -> ${workflow.stage}(${workflow.status}) [${guard}/6]`
      );
    }

    if (workflow.status === "failed") {
      throw new Error(workflow.error || "Workflow failed while running automation.");
    }
    if (workflow.stage !== "final_ready") {
      throw new Error(`Unexpected workflow stage after automation: ${workflow.stage}`);
    }
    const videoUrl = workflow.finalVideoUrl || workflow.previewVideoUrl;
    if (!videoUrl) {
      throw new Error("Final video URL is missing.");
    }

    if (args.uploadMode === "pre_upload") {
      pushLog(args.userId, "info", `[${row.id}] 업로드 전 단계까지 완료 (YouTube 업로드 생략)`);
      return { fatal: false, completed: true };
    }

    const description = buildUploadDescription(workflow.input.topic, workflow.narration, tags);
    await upsertRow({
      id: workflow.id,
      status: "uploading",
      videoUrl
    }, args.userId);

    if (isServerlessRuntime()) {
      await enqueueDeferredYoutubeUpload({
        userId: args.userId,
        id: workflow.id,
        title: workflow.input.title,
        description,
        tags,
        videoUrl,
        privacyStatus: args.privacyStatus
      });
      pushLog(args.userId, "info", `[${row.id}] 업로드 요청을 백그라운드 큐로 전달했습니다.`);
      return { fatal: false, completed: true };
    }

    const youtubeUrl = await uploadVideoToYoutube({
      title: workflow.input.title,
      description,
      tags,
      videoUrl,
      privacyStatus: args.privacyStatus,
      trace: {
        source: "automation-runner",
        userId: args.userId,
        rowId: row.id,
        workflowId: workflow.id
      }
    });
    await upsertRow({
      id: workflow.id,
      status: "uploaded",
      videoUrl,
      youtubeUrl,
      tags
    }, args.userId);

    state.uploaded += 1;
    logServer("info", "row:uploaded", {
      userId: args.userId || "",
      rowId: row.id,
      youtubeUrl
    });
    pushLog(args.userId, "info", `[${row.id}] 업로드 완료: ${youtubeUrl}`);
    return { fatal: false, completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation error";
    logServer("error", "row:failed", {
      userId: args.userId || "",
      rowId: row.id,
      message
    });
    state.failed += 1;
    state.lastError = message;
    await upsertRow({
      id: row.id,
      status: "failed",
      error: message
    }, args.userId);
    pushLog(args.userId, "error", `[${row.id}] 실패: ${message}`);
    return { fatal: isFatalUploadError(message), completed: false };
  } finally {
    state.processed += 1;
    state.currentRowId = undefined;
    state.currentRowTitle = undefined;
  }
}

async function runAutomationLoop(args: {
  userId?: string;
  runId?: string;
  sheetName?: string;
  privacyStatus: "private" | "public" | "unlisted";
  uploadMode: "youtube" | "pre_upload";
  templateMode: AutomationTemplateMode;
  templateId?: string;
  maxItems?: number;
  autoIdeaEnabled?: boolean;
  autoIdeaTopic?: string;
  autoIdeaLanguage?: IdeaLanguage;
  autoIdeaIdBase?: string;
}): Promise<void> {
  const state = getStateRef(args.userId);
  const ownedRunId = args.runId || state.runId;
  try {
    if (!(await hasRunOwnership(args.userId, ownedRunId))) {
      logServer("info", "run:ownership-lost-before-start", {
        userId: args.userId || "",
        runId: ownedRunId || ""
      });
      return;
    }
    logServer("info", "run:start", {
      userId: args.userId || "",
      sheetName: args.sheetName || "",
      uploadMode: args.uploadMode,
      templateMode: args.templateMode,
      templateId: args.templateId || "",
      maxItems: args.maxItems || null,
      autoIdeaEnabled: Boolean(args.autoIdeaEnabled)
    });
    const defaults = await resolveDefaultsFromLatestWorkflow(
      args.userId,
      args.templateMode,
      args.templateId
    );
    state.defaultsSummary = {
      imageStyle: defaults.imageStyle,
      imageAspectRatio: defaults.imageAspectRatio,
      voice: defaults.voice,
      voiceSpeed: defaults.voiceSpeed,
      useSfx: defaults.useSfx,
      videoLengthSec: defaults.videoLengthSec,
      sceneCount: defaults.sceneCount,
      templateMode: defaults.templateMode,
      templateApplied: defaults.templateApplied,
      templateName: defaults.templateName
    };

    const templateModeLabel =
      args.templateMode === "applied_template"
        ? "적용된 템플릿"
        : args.templateMode === "latest_workflow"
          ? "최신 워크플로우 템플릿"
          : "템플릿 미사용";
    pushLog(
      args.userId,
      "info",
      `자동화 시작 (모드: ${args.uploadMode === "youtube" ? "유튜브 업로드" : "업로드 전 단계"}, 템플릿 모드: ${templateModeLabel}, 옵션: ${defaults.imageStyle}, ${defaults.voice}, ${defaults.imageAspectRatio}, 템플릿 ${defaults.templateApplied ? "적용" : "미적용"})`
    );
    if (defaults.templateSourceTitle) {
      pushLog(args.userId, "info", `템플릿 기준 워크플로우 제목: ${defaults.templateSourceTitle}`);
    }

    const maxItems = typeof args.maxItems === "number" && args.maxItems > 0 ? args.maxItems : undefined;
    let autoIdeaRunLimit: number | undefined;
    let processedThisRun = 0;
    const prioritizedRowIds = new Set<string>();
    const recentUploadedSignatures = await loadRecentUploadedSignatures(args.userId);
    const runGeneratedSignatures: ContentSignature[] = [];
    if (recentUploadedSignatures.length > 0) {
      pushLog(
        args.userId,
        "info",
        `[중복 방지] 최근 ${recentUploadedSignatures.length}개 업로드 이력을 기준으로 유사 콘텐츠를 자동 차단합니다.`
      );
    }

    if (args.autoIdeaEnabled) {
      const topic = String(args.autoIdeaTopic || "").trim();
      if (!topic) {
        throw new Error("자동 아이디어 생성이 켜져 있지만 키워드가 비어 있습니다.");
      }
      const generationCount = normalizeAutoIdeaCount(args.maxItems, maxItems || 1);
      const language = normalizeAutoIdeaLanguage(args.autoIdeaLanguage);
      pushLog(
        args.userId,
        "info",
        `[자동 아이디어] 키워드 '${topic}' 기반으로 ${generationCount}개 생성 시작 (${language})`
      );
      const insertedIds = await generateIdeasForAutomation({
        userId: args.userId,
        sheetName: args.sheetName,
        topic,
        language,
        idBase: args.autoIdeaIdBase,
        count: generationCount
      });
      autoIdeaRunLimit = insertedIds.length;
      insertedIds.forEach((id) => prioritizedRowIds.add(id));
      pushLog(
        args.userId,
        "info",
        `[자동 아이디어] ${insertedIds.length}개 생성/적용 완료 (${insertedIds.join(", ")})`
      );
    }

    while (!state.stopRequested) {
      if (!(await hasRunOwnership(args.userId, ownedRunId))) {
        logServer("info", "run:ownership-lost", {
          userId: args.userId || "",
          runId: ownedRunId || ""
        });
        return;
      }
      const effectiveMaxItems = args.autoIdeaEnabled ? autoIdeaRunLimit : maxItems;
      const rows = await listSheetContentRows(args.sheetName, args.userId);
      state.remaining = rows.length;
      state.totalDiscovered = Math.max(state.totalDiscovered, state.processed + rows.length);

      if (rows.length === 0) {
        logServer("info", "run:completed-no-ready-rows", { userId: args.userId || "" });
        pushLog(args.userId, "info", "준비 상태 row가 없어 자동화를 종료합니다.");
        requestStopInternal(args.userId, "completed");
        return;
      }
      if (effectiveMaxItems && processedThisRun >= effectiveMaxItems) {
        logServer("info", "run:completed-max-items", {
          userId: args.userId || "",
          maxItems: effectiveMaxItems
        });
        pushLog(args.userId, "info", `maxItems(${effectiveMaxItems})에 도달하여 자동화를 종료합니다.`);
        requestStopInternal(args.userId, "completed");
        return;
      }

      const prioritizedRow = rows.find((item) => prioritizedRowIds.has(item.id));
      const orderedCandidates = prioritizedRow
        ? [prioritizedRow, ...rows.filter((item) => item.id !== prioritizedRow.id)]
        : rows;
      let row: SheetReadyRow | undefined;
      let selectedSignature: ContentSignature | undefined;
      for (const candidate of orderedCandidates) {
        const candidateSignature = buildSignatureFromReadyRow(candidate);
        const duplicateCheck = checkDuplicateContent(candidateSignature, [
          ...recentUploadedSignatures,
          ...runGeneratedSignatures
        ]);
        if (!duplicateCheck.duplicate) {
          row = candidate;
          selectedSignature = candidateSignature;
          break;
        }
        const matchedLabel = duplicateCheck.matched
          ? `${duplicateCheck.matched.rowId} (${duplicateCheck.matched.source})`
          : "기존 업로드";
        const duplicateReason = `${duplicateCheck.reason || "중복 콘텐츠"} · 기준 ${matchedLabel}`;
        pushLog(args.userId, "error", `[${candidate.id}] 자동 스킵: ${duplicateReason}`);
        state.failed += 1;
        state.lastError = `중복 콘텐츠 자동 차단: ${duplicateReason}`;
        state.processed += 1;
        await upsertRow(
          {
            id: candidate.id,
            status: "failed",
            error: `중복 콘텐츠 자동 차단: ${duplicateReason}`
          },
          args.userId
        );
        prioritizedRowIds.delete(candidate.id);
      }

      if (!row || !selectedSignature) {
        pushLog(args.userId, "info", "준비 상태 row가 모두 중복으로 분류되어 다음 후보를 재탐색합니다.");
        continue;
      }

      state.currentRowId = row.id;
      state.currentRowTitle = row.subject || row.keyword || row.id;
      pushLog(args.userId, "info", `[${row.id}] 처리 시작 (${state.currentRowTitle})`);

      if (!(await hasRunOwnership(args.userId, ownedRunId))) {
        logServer("info", "run:ownership-lost-before-row", {
          userId: args.userId || "",
          runId: ownedRunId || "",
          rowId: row.id
        });
        return;
      }

      const result = await processOneRow({
        userId: args.userId,
        row,
        defaults,
        privacyStatus: args.privacyStatus,
        uploadMode: args.uploadMode
      });
      prioritizedRowIds.delete(row.id);
      if (result.completed) {
        runGeneratedSignatures.unshift({
          ...selectedSignature,
          source: "run",
          createdAtMs: Date.now()
        });
        if (runGeneratedSignatures.length > 500) {
          runGeneratedSignatures.length = 500;
        }
      }
      processedThisRun += 1;
      if (result.fatal) {
        requestStopInternal(args.userId, "failed", state.lastError || "Fatal automation error");
        return;
      }
    }

    pushLog(args.userId, "info", "중지 요청으로 자동화를 종료합니다.");
    logServer("info", "run:stopped", { userId: args.userId || "" });
    requestStopInternal(args.userId, "requested");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation failure";
    logServer("error", "run:failed", {
      userId: args.userId || "",
      message
    });
    pushLog(args.userId, "error", `자동화 전체 실패: ${message}`);
    requestStopInternal(args.userId, "failed", message);
  }
}

export async function getAutomationState(userId?: string): Promise<AutomationRunState> {
  await hydrateStateFromStore(userId);
  return snapshotState(userId);
}

export async function requestAutomationStop(userId?: string): Promise<AutomationRunState> {
  await hydrateStateFromStore(userId);
  const state = getStateRef(userId);
  if (state.phase === "running") {
    state.stopRequested = true;
    state.phase = "stopping";
    pushLog(userId, "info", "사용자 중지 요청을 수신했습니다.");
    await persistStateNow(userId);
  }
  return snapshotState(userId);
}

export async function startAutomationRun(
  userId: string | undefined,
  args: StartAutomationArgs
): Promise<AutomationRunState> {
  await hydrateStateFromStore(userId);
  const persisted = normalizeLoadedState(await readAutomationRunState(userId));
  if (isRunningLikePhase(persisted.phase)) {
    throw new Error("Automation is already running.");
  }
  const key = getUserKey(userId);
  const state = getStateRef(userId);
  if (isRunningLikePhase(state.phase)) {
    throw new Error("Automation is already running.");
  }
  const startedAt = new Date().toISOString();
  const runId = startedAt;
  const previousLogs = Array.isArray(persisted.logs) ? persisted.logs.slice(-MAX_LOGS) : [];

  const nextState: AutomationRunState = {
    phase: "running",
    runId,
    uploadMode: args.uploadMode === "pre_upload" ? "pre_upload" : "youtube",
    templateMode:
      args.templateMode === "none" || args.templateMode === "latest_workflow"
        ? args.templateMode
        : "applied_template",
    startedAt,
    finishedAt: undefined,
    stopRequested: false,
    currentRowId: undefined,
    currentRowTitle: undefined,
    totalDiscovered: 0,
    processed: 0,
    uploaded: 0,
    failed: 0,
    remaining: 0,
    lastError: undefined,
    logs: previousLogs,
    defaultsSummary: undefined
  };
  getStateStore()[key] = nextState;
  await persistStateNow(userId);
  const confirmed = normalizeLoadedState(await readAutomationRunState(userId));
  if (confirmed.runId !== runId || !isRunningLikePhase(confirmed.phase)) {
    getStateStore()[key] = confirmed;
    throw new Error("Automation is already running.");
  }
  pushLog(userId, "info", "자동화 작업을 생성했습니다.");
  logServer("info", "run:queued", {
    userId: userId || "",
    uploadMode: nextState.uploadMode,
    templateMode: nextState.templateMode
  });

  getPromiseStore()[key] = runAutomationLoop({
    userId,
    runId,
    sheetName: args.sheetName?.trim() || undefined,
    privacyStatus: args.privacyStatus || "private",
    uploadMode: args.uploadMode === "pre_upload" ? "pre_upload" : "youtube",
    templateMode:
      args.templateMode === "none" || args.templateMode === "latest_workflow"
        ? args.templateMode
        : "applied_template",
    templateId: args.templateId?.trim() || undefined,
    maxItems: args.maxItems,
    autoIdeaEnabled: Boolean(args.autoIdeaEnabled),
    autoIdeaTopic: args.autoIdeaTopic?.trim() || undefined,
    autoIdeaLanguage: normalizeAutoIdeaLanguage(args.autoIdeaLanguage),
    autoIdeaIdBase: args.autoIdeaIdBase?.trim() || undefined
  }).finally(() => {
    delete getPromiseStore()[key];
  });

  return snapshotState(userId);
}

export async function waitForAutomationRunCompletion(
  userId?: string
): Promise<AutomationRunState> {
  await hydrateStateFromStore(userId);
  const key = getUserKey(userId);
  const running = getPromiseStore()[key];
  if (!running) {
    return snapshotState(userId);
  }
  await running;
  return snapshotState(userId);
}
