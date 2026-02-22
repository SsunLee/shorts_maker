import { listSheetContentRows } from "@/lib/sheet-content";
import { upsertRow } from "@/lib/repository";
import {
  runNextWorkflowStage,
  startStagedWorkflow,
  updateSceneSplit
} from "@/lib/staged-workflow";
import { listWorkflows } from "@/lib/workflow-store";
import { uploadVideoToYoutube } from "@/lib/youtube-service";
import { getAutomationTemplateSnapshot } from "@/lib/automation-template-store";
import {
  AutomationLogEntry,
  AutomationRunState,
  CreateVideoRequest,
  ImageAspectRatio,
  RenderOptions
} from "@/lib/types";

interface AutomationDefaults {
  imageStyle: string;
  imageAspectRatio: ImageAspectRatio;
  voice: string;
  voiceSpeed: number;
  useSfx: boolean;
  videoLengthSec: number;
  sceneCount: number;
  tags: string[];
  renderOptions?: RenderOptions;
  templateSourceTitle?: string;
  templateSourceTopic?: string;
}

export interface StartAutomationArgs {
  sheetName?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  uploadMode?: "youtube" | "pre_upload";
  maxItems?: number;
}

type StopReason = "requested" | "completed" | "failed";

const MAX_LOGS = 200;
const DEFAULTS: AutomationDefaults = {
  imageStyle: "Cinematic photo-real",
  imageAspectRatio: "9:16",
  voice: "alloy",
  voiceSpeed: 1,
  useSfx: true,
  videoLengthSec: 30,
  sceneCount: 5,
  tags: []
};

declare global {
  var __shortsAutomationState__: AutomationRunState | undefined;
  var __shortsAutomationPromise__: Promise<void> | undefined;
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

function getStateRef(): AutomationRunState {
  if (!globalThis.__shortsAutomationState__) {
    globalThis.__shortsAutomationState__ = createInitialState();
  }
  return globalThis.__shortsAutomationState__;
}

function snapshotState(): AutomationRunState {
  const state = getStateRef();
  return {
    ...state,
    logs: [...state.logs]
  };
}

function pushLog(level: "info" | "error", message: string): void {
  const state = getStateRef();
  const entry: AutomationLogEntry = {
    at: new Date().toISOString(),
    level,
    message
  };
  state.logs = [...state.logs, entry].slice(-MAX_LOGS);
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

async function resolveDefaultsFromLatestWorkflow(): Promise<AutomationDefaults> {
  const persistedTemplate = await getAutomationTemplateSnapshot();
  const workflows = await listWorkflows();
  const latestAny = workflows[0];
  if (!latestAny) {
    if (persistedTemplate) {
      return {
        ...DEFAULTS,
        renderOptions: persistedTemplate.renderOptions,
        templateSourceTitle: persistedTemplate.sourceTitle,
        templateSourceTopic: persistedTemplate.sourceTopic
      };
    }
    return { ...DEFAULTS };
  }
  const latestWithTemplate =
    workflows.find(
      (item) => (item.renderOptions?.overlay?.titleTemplates || []).length > 0
    ) || latestAny;
  const renderOptions =
    persistedTemplate?.renderOptions ||
    latestWithTemplate.renderOptions ||
    latestAny.renderOptions;
  const templateSourceTitle =
    persistedTemplate?.sourceTitle || latestWithTemplate.input.title;
  const templateSourceTopic =
    persistedTemplate?.sourceTopic || latestWithTemplate.input.topic;

  return {
    imageStyle: latestAny.input.imageStyle || DEFAULTS.imageStyle,
    imageAspectRatio: latestAny.input.imageAspectRatio === "16:9" ? "16:9" : "9:16",
    voice: latestAny.input.voice || DEFAULTS.voice,
    voiceSpeed:
      typeof latestAny.input.voiceSpeed === "number" ? latestAny.input.voiceSpeed : DEFAULTS.voiceSpeed,
    useSfx: typeof latestAny.input.useSfx === "boolean" ? latestAny.input.useSfx : DEFAULTS.useSfx,
    videoLengthSec:
      typeof latestAny.input.videoLengthSec === "number"
        ? latestAny.input.videoLengthSec
        : DEFAULTS.videoLengthSec,
    sceneCount:
      typeof latestAny.input.sceneCount === "number" ? latestAny.input.sceneCount : DEFAULTS.sceneCount,
    tags: latestAny.input.tags || [],
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

function requestStopInternal(reason: StopReason, errorMessage?: string): void {
  const state = getStateRef();
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
}

async function processOneRow(args: {
  row: Awaited<ReturnType<typeof listSheetContentRows>>[number];
  defaults: AutomationDefaults;
  privacyStatus: "private" | "public" | "unlisted";
  uploadMode: "youtube" | "pre_upload";
}): Promise<{ fatal: boolean }> {
  const state = getStateRef();
  const row = args.row;
  const tags = uniqueTags([
    ...args.defaults.tags,
    row.keyword || "",
    ...extractHashTags(row.description),
    ...extractHashTags(row.narration)
  ]);

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
    pushLog("info", `[${row.id}] 워크플로우 시작`);
    let workflow = await startStagedWorkflow(createPayload);

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
      workflow = await updateSceneSplit(workflow.id, {
        renderOptions: rowRenderOptions
      });
      pushLog("info", `[${row.id}] 최근 템플릿(renderOptions) 적용 + 제목/주제 텍스트 치환`);
    }

    let guard = 0;
    while (workflow.stage !== "final_ready" && workflow.status !== "failed" && guard < 6) {
      workflow = await runNextWorkflowStage(workflow.id);
      guard += 1;
      pushLog("info", `[${row.id}] 단계 진행 -> ${workflow.stage} (${workflow.status})`);
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
      pushLog("info", `[${row.id}] 업로드 전 단계까지 완료 (YouTube 업로드 생략)`);
      return { fatal: false };
    }

    const description = buildUploadDescription(workflow.input.topic, workflow.narration, tags);
    await upsertRow({
      id: workflow.id,
      status: "uploading",
      videoUrl
    });
    const youtubeUrl = await uploadVideoToYoutube({
      title: workflow.input.title,
      description,
      tags,
      videoUrl,
      privacyStatus: args.privacyStatus
    });
    await upsertRow({
      id: workflow.id,
      status: "uploaded",
      videoUrl,
      youtubeUrl,
      tags
    });

    state.uploaded += 1;
    pushLog("info", `[${row.id}] 업로드 완료: ${youtubeUrl}`);
    return { fatal: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation error";
    state.failed += 1;
    state.lastError = message;
    await upsertRow({
      id: row.id,
      status: "failed",
      error: message
    });
    pushLog("error", `[${row.id}] 실패: ${message}`);
    return { fatal: isFatalUploadError(message) };
  } finally {
    state.processed += 1;
    state.currentRowId = undefined;
    state.currentRowTitle = undefined;
  }
}

async function runAutomationLoop(args: {
  sheetName?: string;
  privacyStatus: "private" | "public" | "unlisted";
  uploadMode: "youtube" | "pre_upload";
  maxItems?: number;
}): Promise<void> {
  const state = getStateRef();
  try {
    const defaults = await resolveDefaultsFromLatestWorkflow();
    state.defaultsSummary = {
      imageStyle: defaults.imageStyle,
      imageAspectRatio: defaults.imageAspectRatio,
      voice: defaults.voice,
      voiceSpeed: defaults.voiceSpeed,
      useSfx: defaults.useSfx,
      videoLengthSec: defaults.videoLengthSec,
      sceneCount: defaults.sceneCount,
      hasRecentTemplate: Boolean(defaults.renderOptions)
    };

    pushLog(
      "info",
      `자동화 시작 (모드: ${args.uploadMode === "youtube" ? "유튜브 업로드" : "업로드 전 단계"}, 최근 옵션: ${defaults.imageStyle}, ${defaults.voice}, ${defaults.imageAspectRatio}, 템플릿 ${state.defaultsSummary.hasRecentTemplate ? "있음" : "없음"})`
    );
    if (defaults.templateSourceTitle) {
      pushLog("info", `템플릿 기준 워크플로우 제목: ${defaults.templateSourceTitle}`);
    }

    const maxItems = typeof args.maxItems === "number" && args.maxItems > 0 ? args.maxItems : undefined;
    let processedThisRun = 0;

    while (!state.stopRequested) {
      const rows = await listSheetContentRows(args.sheetName);
      state.remaining = rows.length;
      state.totalDiscovered = Math.max(state.totalDiscovered, state.processed + rows.length);

      if (rows.length === 0) {
        pushLog("info", "준비 상태 row가 없어 자동화를 종료합니다.");
        requestStopInternal("completed");
        return;
      }
      if (maxItems && processedThisRun >= maxItems) {
        pushLog("info", `maxItems(${maxItems})에 도달하여 자동화를 종료합니다.`);
        requestStopInternal("completed");
        return;
      }

      const row = rows[0];
      state.currentRowId = row.id;
      state.currentRowTitle = row.subject || row.keyword || row.id;
      pushLog("info", `[${row.id}] 처리 시작 (${state.currentRowTitle})`);

      const result = await processOneRow({
        row,
        defaults,
        privacyStatus: args.privacyStatus,
        uploadMode: args.uploadMode
      });
      processedThisRun += 1;
      if (result.fatal) {
        requestStopInternal("failed", state.lastError || "Fatal automation error");
        return;
      }
    }

    pushLog("info", "중지 요청으로 자동화를 종료합니다.");
    requestStopInternal("requested");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation failure";
    pushLog("error", `자동화 전체 실패: ${message}`);
    requestStopInternal("failed", message);
  }
}

export function getAutomationState(): AutomationRunState {
  return snapshotState();
}

export function requestAutomationStop(): AutomationRunState {
  const state = getStateRef();
  if (state.phase === "running") {
    state.stopRequested = true;
    state.phase = "stopping";
    pushLog("info", "사용자 중지 요청을 수신했습니다.");
  }
  return snapshotState();
}

export function startAutomationRun(args: StartAutomationArgs): AutomationRunState {
  const state = getStateRef();
  if (state.phase === "running" || state.phase === "stopping") {
    throw new Error("Automation is already running.");
  }

  const nextState: AutomationRunState = {
    phase: "running",
    runId: new Date().toISOString(),
    uploadMode: args.uploadMode === "pre_upload" ? "pre_upload" : "youtube",
    startedAt: new Date().toISOString(),
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
    logs: [],
    defaultsSummary: undefined
  };
  globalThis.__shortsAutomationState__ = nextState;
  pushLog("info", "자동화 작업을 생성했습니다.");

  globalThis.__shortsAutomationPromise__ = runAutomationLoop({
    sheetName: args.sheetName?.trim() || undefined,
    privacyStatus: args.privacyStatus || "private",
    uploadMode: args.uploadMode === "pre_upload" ? "pre_upload" : "youtube",
    maxItems: args.maxItems
  }).finally(() => {
    globalThis.__shortsAutomationPromise__ = undefined;
  });

  return snapshotState();
}
