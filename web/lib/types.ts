export type VideoStatus =
  | "queued"
  | "generating_script"
  | "generating_images"
  | "generating_tts"
  | "video_rendering"
  | "ready"
  | "uploading"
  | "uploaded"
  | "failed";

export type ImageAspectRatio = "9:16" | "16:9";
export type VideoCanvasLayout = "fill_9_16" | "panel_16_9";

export interface CreateVideoRequest {
  id?: string;
  title: string;
  topic?: string;
  narration?: string;
  imageStyle: string;
  imageAspectRatio?: ImageAspectRatio;
  voice: string;
  voiceSpeed?: number;
  useSfx: boolean;
  videoLengthSec: number;
  sceneCount?: number;
  tags?: string[];
}

export interface VideoRow {
  id: string;
  title: string;
  narration: string;
  imagePrompts: string[];
  status: VideoStatus;
  progress: number;
  videoUrl?: string;
  youtubeUrl?: string;
  tags: string[];
  topic?: string;
  imageStyle?: string;
  voice?: string;
  voiceSpeed?: number;
  useSfx?: boolean;
  videoLengthSec?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  openaiApiKey?: string;
  geminiApiKey?: string;
  aiMode?: "auto" | "openai" | "gemini" | "mixed";
  aiTextProvider?: "openai" | "gemini";
  aiImageProvider?: "openai" | "gemini";
  aiTtsProvider?: "openai" | "gemini";
  openaiTextModel?: string;
  openaiImageModel?: string;
  openaiTtsModel?: string;
  geminiTextModel?: string;
  geminiImageModel?: string;
  geminiTtsModel?: string;
  gsheetSpreadsheetId?: string;
  gsheetClientEmail?: string;
  gsheetPrivateKey?: string;
  gsheetSheetName?: string;
  youtubeClientId?: string;
  youtubeClientSecret?: string;
  youtubeRedirectUri?: string;
  youtubeRefreshToken?: string;
}

export interface BuildVideoPayload {
  jobId: string;
  imageUrls: string[];
  ttsPath: string;
  subtitlesText: string;
  titleText: string;
  useSfx: boolean;
  targetDurationSec?: number;
  renderOptions?: RenderOptions;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SubtitleStyleOptions {
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  outline: number;
  shadow: number;
  shadowOpacity: number;
  fontThickness: number;
  subtitleDelayMs: number;
  position: "top" | "middle" | "bottom";
  subtitleYPercent: number;
  wordsPerCaption: number;
  manualCues?: SubtitleCue[];
}

export interface TitleTemplateItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  paddingX?: number;
  paddingY?: number;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  fontThickness?: number;
  fontName?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontFile?: string;
}

export interface OverlayStyleOptions {
  showTitle: boolean;
  titleText?: string;
  titlePosition: "top" | "bottom";
  titleFontSize: number;
  titleColor: string;
  titleFontName: string;
  titleFontBold?: boolean;
  titleFontItalic?: boolean;
  titleFontFile?: string;
  sceneMotionPreset?: "gentle_zoom" | "up_down" | "left_right" | "random" | "focus_smooth";
  motionSpeedPercent?: number;
  focusXPercent?: number;
  focusYPercent?: number;
  focusDriftPercent?: number;
  focusZoomPercent?: number;
  outputFps?: 30 | 60;
  videoLayout?: VideoCanvasLayout;
  usePreviewAsFinal?: boolean;
  panelTopPercent?: number;
  panelWidthPercent?: number;
  titleTemplates?: TitleTemplateItem[];
}

export interface RenderOptions {
  subtitle: SubtitleStyleOptions;
  overlay: OverlayStyleOptions;
}

export interface SheetContentRow {
  id: string;
  rowNumber: number;
  status: string;
  keyword: string;
  subject: string;
  description: string;
  narration: string;
  raw: Record<string, string>;
}

export type WorkflowStage =
  | "scene_split_review"
  | "assets_review"
  | "video_review"
  | "final_ready";

export interface WorkflowScene {
  index: number;
  sceneTitle: string;
  narrationText: string;
  imagePrompt: string;
  imageUrl?: string;
}

export interface VideoWorkflow {
  id: string;
  stage: WorkflowStage;
  status: "idle" | "processing" | "failed";
  error?: string;
  input: CreateVideoRequest;
  narration: string;
  scenes: WorkflowScene[];
  ttsUrl?: string;
  previewVideoUrl?: string;
  finalVideoUrl?: string;
  renderOptions?: RenderOptions;
  createdAt: string;
  updatedAt: string;
}

export type AutomationPhase =
  | "idle"
  | "running"
  | "stopping"
  | "completed"
  | "failed";

export interface AutomationLogEntry {
  at: string;
  level: "info" | "error";
  message: string;
}

export interface AutomationRunState {
  phase: AutomationPhase;
  runId?: string;
  uploadMode?: "youtube" | "pre_upload";
  templateMode?: AutomationTemplateMode;
  startedAt?: string;
  finishedAt?: string;
  stopRequested: boolean;
  currentRowId?: string;
  currentRowTitle?: string;
  totalDiscovered: number;
  processed: number;
  uploaded: number;
  failed: number;
  remaining: number;
  lastError?: string;
  logs: AutomationLogEntry[];
  defaultsSummary?: {
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
  };
}

export interface IdeaDraftRow {
  id?: string;
  Status: string;
  Keyword: string;
  Subject: string;
  Description: string;
  Narration: string;
  publish: string;
}

export type IdeaLanguage = "ko" | "en" | "ja" | "es" | "hi";

export type AutomationScheduleCadence = "interval_hours" | "daily";
export type AutomationTemplateMode = "applied_template" | "latest_workflow" | "none";

export interface AutomationScheduleConfig {
  enabled: boolean;
  cadence: AutomationScheduleCadence;
  intervalHours: number;
  dailyTime: string;
  itemsPerRun: number;
  sheetName?: string;
  uploadMode: "youtube" | "pre_upload";
  privacyStatus: "private" | "public" | "unlisted";
  templateMode: AutomationTemplateMode;
  templateId?: string;
}

export interface AutomationScheduleState {
  config: AutomationScheduleConfig;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: "started" | "skipped_running" | "failed";
  lastError?: string;
  updatedAt: string;
}
