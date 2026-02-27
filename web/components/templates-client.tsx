"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppSettings, RenderOptions } from "@/lib/types";
import { ALL_VOICE_OPTIONS, filterVoiceOptions, resolveTtsVoiceProvider } from "@/lib/voice-options";

interface AutomationTemplateItem {
  id: string;
  templateName?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  voice?: string;
  voiceSpeed?: number;
  updatedAt: string;
  renderOptions: RenderOptions;
}

interface AutomationTemplateResponse {
  snapshot?: AutomationTemplateItem;
  templates?: AutomationTemplateItem[];
  activeTemplateId?: string;
  error?: string;
}

type MotionPreset = NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]>;
type VideoLayout = NonNullable<RenderOptions["overlay"]["videoLayout"]>;
type OutputFps = NonNullable<RenderOptions["overlay"]["outputFps"]>;

type CustomTextLayerEditor = {
  id: string;
  text: string;
  x: string;
  y: string;
  width: string;
  fontSize: string;
  fontThickness: string;
  color: string;
};

type TemplateEditorState = {
  templateName: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: string;
  primaryText: string;
  secondaryText: string;
  secondaryEnabled: boolean;
  badgeText: string;
  fontName: string;
  fontBold: boolean;
  fontItalic: boolean;
  primaryX: string;
  primaryY: string;
  primaryWidth: string;
  primaryFontSize: string;
  primaryFontThickness: string;
  secondaryX: string;
  secondaryY: string;
  secondaryWidth: string;
  secondaryFontSize: string;
  secondaryFontThickness: string;
  badgeX: string;
  badgeY: string;
  badgeWidth: string;
  badgeFontSize: string;
  badgeFontThickness: string;
  primaryColor: string;
  secondaryColor: string;
  badgeColor: string;
  subtitlePosition: RenderOptions["subtitle"]["position"];
  subtitleFontSize: string;
  subtitleYPercent: string;
  subtitleSampleText: string;
  videoLayout: VideoLayout;
  panelTopPercent: string;
  panelWidthPercent: string;
  motionPreset: MotionPreset;
  motionSpeedPercent: string;
  outputFps: OutputFps;
  customLayers: CustomTextLayerEditor[];
};

const SAMPLE_TITLE = "클레오파트라의 숨겨진 비밀!";
const SAMPLE_TOPIC = "로마 정치의 중심에 선 마지막 파라오 이야기";
const SAMPLE_NARRATION = "고대 이집트 문명 속에서 잊힌 진실이 드러납니다.";
const SAMPLE_KEYWORD = "클레오파트라";
const VOICE_PREVIEW_DEFAULT_TEXT = "This is a voice preview for your short-form content.";
const voiceSpeedOptions = ["0.75", "0.9", "1", "1.1", "1.25", "1.5"];
const templateFontOptions = [
  "Noto Sans KR",
  "Malgun Gothic",
  "Pretendard",
  "Spoqa Han Sans Neo",
  "Nanum Gothic",
  "Arial",
  "Arial Black",
  "Segoe UI"
];
const customTemplateFontOption = "__custom__";

const BASE_SUBTITLE: RenderOptions["subtitle"] = {
  fontName: "Arial",
  fontSize: 16,
  primaryColor: "#FFFFFF",
  outlineColor: "#000000",
  outline: 2,
  shadow: 1,
  shadowOpacity: 1,
  fontThickness: 0,
  subtitleDelayMs: 180,
  position: "bottom",
  subtitleYPercent: 86,
  wordsPerCaption: 5,
  manualCues: []
};

const BASE_OVERLAY: RenderOptions["overlay"] = {
  showTitle: true,
  titleText: "{{title}}",
  titlePosition: "top",
  titleFontSize: 48,
  titleColor: "#FFFFFF",
  titleFontName: "Noto Sans KR",
  titleFontBold: false,
  titleFontItalic: false,
  titleFontFile: "",
  sceneMotionPreset: "gentle_zoom",
  motionSpeedPercent: 135,
  focusXPercent: 50,
  focusYPercent: 50,
  focusDriftPercent: 6,
  focusZoomPercent: 9,
  outputFps: 30,
  videoLayout: "fill_9_16",
  usePreviewAsFinal: false,
  panelTopPercent: 34,
  panelWidthPercent: 100,
  titleTemplates: []
};

function createInitialEditor(): TemplateEditorState {
  return {
    templateName: "",
    sourceTitle: "{{title}}",
    sourceTopic: "{{topic}}",
    voice: "alloy",
    voiceSpeed: "1",
    primaryText: "{{title}}",
    secondaryText: "{{topic}}",
    secondaryEnabled: true,
    badgeText: "AI로 재구성된 콘텐츠입니다.",
    fontName: "Noto Sans KR",
    fontBold: false,
    fontItalic: false,
    primaryX: "50",
    primaryY: "20",
    primaryWidth: "80",
    primaryFontSize: "52",
    primaryFontThickness: "0",
    secondaryX: "50",
    secondaryY: "33",
    secondaryWidth: "76",
    secondaryFontSize: "40",
    secondaryFontThickness: "0",
    badgeX: "72",
    badgeY: "10",
    badgeWidth: "40",
    badgeFontSize: "16",
    badgeFontThickness: "0",
    primaryColor: "#FFFFFF",
    secondaryColor: "#FFF200",
    badgeColor: "#FFFFFF",
    subtitlePosition: "bottom",
    subtitleFontSize: "16",
    subtitleYPercent: "86",
    subtitleSampleText: "신비한 고대 이집트 문자의 비밀을 지금 공개합니다.",
    videoLayout: "fill_9_16",
    panelTopPercent: "34",
    panelWidthPercent: "100",
    motionPreset: "gentle_zoom",
    motionSpeedPercent: "135",
    outputFps: 30,
    customLayers: []
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeHex(value: string, fallback: string): string {
  const trimmed = String(value || "").trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return fallback;
}

function detectTemplateFontPreset(fontName: string | undefined): string {
  const normalized = String(fontName || "").trim();
  if (!normalized) {
    return customTemplateFontOption;
  }
  return templateFontOptions.includes(normalized) ? normalized : customTemplateFontOption;
}

function buildRenderOptionsFromEditor(editor: TemplateEditorState): RenderOptions {
  const fontName = editor.fontName.trim() || "Noto Sans KR";
  const fontBold = Boolean(editor.fontBold);
  const fontItalic = Boolean(editor.fontItalic);
  const primaryText = normalizeText(editor.primaryText);
  const secondaryText = normalizeText(editor.secondaryText);
  const badgeText = normalizeText(editor.badgeText || "");

  const titleTemplates: NonNullable<RenderOptions["overlay"]["titleTemplates"]> = [
    {
      id: "__primary_title__",
      text: primaryText,
      x: clampNumber(Number(editor.primaryX), 0, 100, 50),
      y: clampNumber(Number(editor.primaryY), 0, 100, 20),
      width: clampNumber(Number(editor.primaryWidth), 20, 100, 80),
      fontSize: clampNumber(Number(editor.primaryFontSize), 12, 120, 52),
      color: normalizeHex(editor.primaryColor, "#FFFFFF"),
      paddingX: 8,
      paddingY: 4,
      shadowX: 2,
      shadowY: 2,
      shadowColor: "#000000",
      shadowOpacity: 1,
      fontThickness: clampNumber(Number(editor.primaryFontThickness), 0, 8, 0),
      fontName,
      fontBold,
      fontItalic
    },
    ...(editor.secondaryEnabled
      ? [
          {
            id: "__secondary_title__",
            text: secondaryText,
            x: clampNumber(Number(editor.secondaryX), 0, 100, 50),
            y: clampNumber(Number(editor.secondaryY), 0, 100, 33),
            width: clampNumber(Number(editor.secondaryWidth), 20, 100, 76),
            fontSize: clampNumber(Number(editor.secondaryFontSize), 12, 120, 40),
            color: normalizeHex(editor.secondaryColor, "#FFF200"),
            paddingX: 8,
            paddingY: 4,
            shadowX: 2,
            shadowY: 2,
            shadowColor: "#000000",
            shadowOpacity: 1,
            fontThickness: clampNumber(Number(editor.secondaryFontThickness), 0, 8, 0),
            fontName,
            fontBold,
            fontItalic
          }
        ]
      : [])
  ];

  if (badgeText.trim()) {
    titleTemplates.push({
      id: "__badge__",
      text: badgeText,
      x: clampNumber(Number(editor.badgeX), 0, 100, 72),
      y: clampNumber(Number(editor.badgeY), 0, 100, 10),
      width: clampNumber(Number(editor.badgeWidth), 20, 100, 40),
      fontSize: clampNumber(Number(editor.badgeFontSize), 10, 60, 16),
      color: normalizeHex(editor.badgeColor, "#FFFFFF"),
      paddingX: 4,
      paddingY: 2,
      shadowX: 1,
      shadowY: 1,
      shadowColor: "#000000",
      shadowOpacity: 0.8,
      fontThickness: clampNumber(Number(editor.badgeFontThickness), 0, 8, 0),
      fontName,
      fontBold,
      fontItalic
    });
  }

  const customLayers = editor.customLayers
    .filter((layer) => normalizeText(layer.text).trim().length > 0)
    .map((layer) => ({
      id: layer.id,
      text: normalizeText(layer.text),
      x: clampNumber(Number(layer.x), 0, 100, 50),
      y: clampNumber(Number(layer.y), 0, 100, 50),
      width: clampNumber(Number(layer.width), 20, 100, 60),
      fontSize: clampNumber(Number(layer.fontSize), 10, 120, 28),
      fontThickness: clampNumber(Number(layer.fontThickness), 0, 8, 0),
      color: normalizeHex(layer.color, "#FFFFFF"),
      paddingX: 8,
      paddingY: 4,
      shadowX: 2,
      shadowY: 2,
      shadowColor: "#000000",
      shadowOpacity: 1,
      fontName,
      fontBold,
      fontItalic
    }));

  return {
    subtitle: {
      ...BASE_SUBTITLE,
      fontSize: clampNumber(Number(editor.subtitleFontSize), 10, 120, 16),
      position:
        editor.subtitlePosition === "top" ||
        editor.subtitlePosition === "middle" ||
        editor.subtitlePosition === "bottom"
          ? editor.subtitlePosition
          : "bottom",
      subtitleYPercent: clampNumber(Number(editor.subtitleYPercent), 0, 100, 86)
    },
    overlay: {
      ...BASE_OVERLAY,
      showTitle: true,
      titleText: primaryText,
      titleFontName: fontName,
      titleFontBold: fontBold,
      titleFontItalic: fontItalic,
      titleFontSize: clampNumber(Number(editor.primaryFontSize), 12, 120, 52),
      titleColor: normalizeHex(editor.primaryColor, "#FFFFFF"),
      sceneMotionPreset: editor.motionPreset,
      motionSpeedPercent: clampNumber(Number(editor.motionSpeedPercent), 60, 220, 135),
      outputFps: editor.outputFps,
      videoLayout: editor.videoLayout,
      panelTopPercent: clampNumber(Number(editor.panelTopPercent), 0, 85, 34),
      panelWidthPercent: clampNumber(Number(editor.panelWidthPercent), 60, 100, 100),
      titleTemplates: [...titleTemplates, ...customLayers]
    }
  };
}

function extractLayerText(
  renderOptions: RenderOptions,
  id: string,
  fallback = ""
): string {
  const found = (renderOptions.overlay.titleTemplates || []).find((item) => item.id === id);
  return normalizeText(found?.text || fallback);
}

function extractLayerNumber(
  renderOptions: RenderOptions,
  id: string,
  field: "fontSize" | "fontThickness",
  fallback: number
): string {
  const found = (renderOptions.overlay.titleTemplates || []).find((item) => item.id === id);
  if (field === "fontThickness") {
    return String(clampNumber(Number(found?.[field]), 0, 8, fallback));
  }
  return String(clampNumber(Number(found?.[field]), 8, 200, fallback));
}

function extractLayerMetric(
  renderOptions: RenderOptions,
  id: string,
  field: "x" | "y" | "width",
  min: number,
  max: number,
  fallback: number
): string {
  const found = (renderOptions.overlay.titleTemplates || []).find((item) => item.id === id);
  return String(clampNumber(Number(found?.[field]), min, max, fallback));
}

function extractLayerColor(
  renderOptions: RenderOptions,
  id: string,
  fallback: string
): string {
  const found = (renderOptions.overlay.titleTemplates || []).find((item) => item.id === id);
  return normalizeHex(String(found?.color || ""), fallback);
}

function extractLayerToggle(
  renderOptions: RenderOptions,
  id: string,
  field: "fontBold" | "fontItalic",
  fallback: boolean
): boolean {
  const found = (renderOptions.overlay.titleTemplates || []).find((item) => item.id === id);
  if (typeof found?.[field] === "boolean") {
    return Boolean(found[field]);
  }
  return fallback;
}

function editorFromTemplate(item: AutomationTemplateItem): TemplateEditorState {
  const overlay = item.renderOptions.overlay;
  const hasSecondaryLayer = Boolean(
    (overlay.titleTemplates || []).find((layer) => layer.id === "__secondary_title__")
  );
  const customLayers: CustomTextLayerEditor[] = (overlay.titleTemplates || [])
    .filter(
      (layer) =>
        layer.id !== "__primary_title__" &&
        layer.id !== "__secondary_title__" &&
        layer.id !== "__badge__"
    )
    .map((layer, index) => ({
      id: layer.id || `custom_${index + 1}`,
      text: normalizeText(layer.text || ""),
      x: String(clampNumber(Number(layer.x), 0, 100, 50)),
      y: String(clampNumber(Number(layer.y), 0, 100, 50)),
      width: String(clampNumber(Number(layer.width), 20, 100, 60)),
      fontSize: String(clampNumber(Number(layer.fontSize), 10, 120, 28)),
      fontThickness: String(clampNumber(Number(layer.fontThickness), 0, 8, 0)),
      color: normalizeHex(layer.color || "", "#FFFFFF")
    }));

  return {
    templateName: item.templateName || "",
    sourceTitle: item.sourceTitle || "{{title}}",
    sourceTopic: item.sourceTopic || "{{topic}}",
    voice: (item.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed: String(clampNumber(Number(item.voiceSpeed), 0.5, 2, 1)),
    primaryText: extractLayerText(item.renderOptions, "__primary_title__", overlay.titleText || ""),
    secondaryText: extractLayerText(item.renderOptions, "__secondary_title__", "{{topic}}"),
    secondaryEnabled: hasSecondaryLayer,
    badgeText: extractLayerText(item.renderOptions, "__badge__", ""),
    fontName:
      (overlay.titleTemplates || []).find((layer) => layer.id === "__primary_title__")?.fontName ||
      overlay.titleFontName ||
      "Noto Sans KR",
    fontBold: extractLayerToggle(item.renderOptions, "__primary_title__", "fontBold", Boolean(overlay.titleFontBold)),
    fontItalic: extractLayerToggle(
      item.renderOptions,
      "__primary_title__",
      "fontItalic",
      Boolean(overlay.titleFontItalic)
    ),
    primaryX: extractLayerMetric(item.renderOptions, "__primary_title__", "x", 0, 100, 50),
    primaryY: extractLayerMetric(item.renderOptions, "__primary_title__", "y", 0, 100, 20),
    primaryWidth: extractLayerMetric(item.renderOptions, "__primary_title__", "width", 20, 100, 80),
    primaryFontSize: extractLayerNumber(item.renderOptions, "__primary_title__", "fontSize", 52),
    primaryFontThickness: extractLayerNumber(item.renderOptions, "__primary_title__", "fontThickness", 0),
    secondaryX: extractLayerMetric(item.renderOptions, "__secondary_title__", "x", 0, 100, 50),
    secondaryY: extractLayerMetric(item.renderOptions, "__secondary_title__", "y", 0, 100, 33),
    secondaryWidth: extractLayerMetric(item.renderOptions, "__secondary_title__", "width", 20, 100, 76),
    secondaryFontSize: extractLayerNumber(item.renderOptions, "__secondary_title__", "fontSize", 40),
    secondaryFontThickness: extractLayerNumber(
      item.renderOptions,
      "__secondary_title__",
      "fontThickness",
      0
    ),
    badgeX: extractLayerMetric(item.renderOptions, "__badge__", "x", 0, 100, 72),
    badgeY: extractLayerMetric(item.renderOptions, "__badge__", "y", 0, 100, 10),
    badgeWidth: extractLayerMetric(item.renderOptions, "__badge__", "width", 20, 100, 40),
    badgeFontSize: extractLayerNumber(item.renderOptions, "__badge__", "fontSize", 16),
    badgeFontThickness: extractLayerNumber(item.renderOptions, "__badge__", "fontThickness", 0),
    primaryColor: extractLayerColor(item.renderOptions, "__primary_title__", "#FFFFFF"),
    secondaryColor: extractLayerColor(item.renderOptions, "__secondary_title__", "#FFF200"),
    badgeColor: extractLayerColor(item.renderOptions, "__badge__", "#FFFFFF"),
    subtitlePosition:
      item.renderOptions.subtitle.position === "top" ||
      item.renderOptions.subtitle.position === "middle" ||
      item.renderOptions.subtitle.position === "bottom"
        ? item.renderOptions.subtitle.position
        : "bottom",
    subtitleFontSize: String(clampNumber(Number(item.renderOptions.subtitle.fontSize), 10, 120, 16)),
    subtitleYPercent: String(clampNumber(Number(item.renderOptions.subtitle.subtitleYPercent), 0, 100, 86)),
    subtitleSampleText: SAMPLE_NARRATION,
    videoLayout: overlay.videoLayout === "panel_16_9" ? "panel_16_9" : "fill_9_16",
    panelTopPercent: String(clampNumber(Number(overlay.panelTopPercent), 0, 85, 34)),
    panelWidthPercent: String(clampNumber(Number(overlay.panelWidthPercent), 60, 100, 100)),
    motionPreset:
      overlay.sceneMotionPreset === "up_down" ||
      overlay.sceneMotionPreset === "left_right" ||
      overlay.sceneMotionPreset === "random" ||
      overlay.sceneMotionPreset === "focus_smooth"
        ? overlay.sceneMotionPreset
        : "gentle_zoom",
    motionSpeedPercent: String(clampNumber(Number(overlay.motionSpeedPercent), 60, 220, 135)),
    outputFps: overlay.outputFps === 60 ? 60 : 30,
    customLayers
  };
}

function materializePreviewText(args: {
  text: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): string {
  let output = normalizeText(args.text);
  output = output
    .replace(/\{\{\s*title\s*\}\}|\{title\}/gi, SAMPLE_TITLE)
    .replace(/\{\{\s*topic\s*\}\}|\{topic\}/gi, SAMPLE_TOPIC)
    .replace(/\{\{\s*narration\s*\}\}|\{narration\}/gi, SAMPLE_NARRATION)
    .replace(/\{\{\s*keyword\s*\}\}|\{keyword\}/gi, SAMPLE_KEYWORD);

  const sourceTitle = normalizeText(args.sourceTitle || "").trim();
  const sourceTopic = normalizeText(args.sourceTopic || "").trim();
  if (sourceTitle && normalizeText(output).includes(sourceTitle)) {
    output = output.split(sourceTitle).join(SAMPLE_TITLE);
  }
  if (sourceTopic && normalizeText(output).includes(sourceTopic)) {
    output = output.split(sourceTopic).join(SAMPLE_TOPIC);
  }
  return output;
}

function dynamicHint(args: {
  text: string;
  sourceTitle?: string;
  sourceTopic?: string;
}): string | undefined {
  const raw = normalizeText(args.text);
  if (/\{\{\s*(title|topic|narration|keyword)\s*\}\}|\{(title|topic|narration|keyword)\}/i.test(raw)) {
    return "이 부분이 바뀔 예정입니다. (플레이스홀더 치환)";
  }
  if (args.sourceTitle && raw.includes(args.sourceTitle)) {
    return "이 부분이 바뀔 예정입니다. (기준 제목 치환)";
  }
  if (args.sourceTopic && raw.includes(args.sourceTopic)) {
    return "이 부분이 바뀔 예정입니다. (기준 주제 치환)";
  }
  return undefined;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `서버 응답이 JSON 형식이 아닙니다 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`
    );
  }
}

function isDynamicText(args: { text: string; sourceTitle?: string; sourceTopic?: string }): boolean {
  return Boolean(dynamicHint(args));
}

type DragTarget = string;

type DragState = {
  pointerId: number;
  target: DragTarget;
  rect: { left: number; top: number; width: number; height: number };
  startX: number;
  startY: number;
  initialPercentX?: number;
  initialPercentY: number;
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

function buildTemplatePayload(editor: TemplateEditorState, renderOptions: RenderOptions): {
  templateName: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: number;
  renderOptions: RenderOptions;
} {
  const voiceSpeed = clampNumber(Number(editor.voiceSpeed), 0.5, 2, 1);
  return {
    templateName: editor.templateName.trim(),
    sourceTitle: editor.sourceTitle.trim(),
    sourceTopic: editor.sourceTopic.trim(),
    voice: (editor.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed,
    renderOptions
  };
}

function buildPayloadSignature(payload: {
  templateName: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: number;
  renderOptions: RenderOptions;
}): string {
  return JSON.stringify(payload);
}

function buildTemplateSignature(item: AutomationTemplateItem): string {
  return JSON.stringify({
    templateName: String(item.templateName || "").trim(),
    sourceTitle: String(item.sourceTitle || "").trim(),
    sourceTopic: String(item.sourceTopic || "").trim(),
    voice: String(item.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed: clampNumber(Number(item.voiceSpeed), 0.5, 2, 1),
    renderOptions: item.renderOptions
  });
}

export function TemplatesClient(): React.JSX.Element {
  const [ttsProviderSettings, setTtsProviderSettings] = useState<
    Pick<AppSettings, "aiMode" | "aiTtsProvider" | "openaiApiKey" | "geminiApiKey">
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [autoSaveMessage, setAutoSaveMessage] = useState<string>();
  const [templates, setTemplates] = useState<AutomationTemplateItem[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("__new__");
  const [editor, setEditor] = useState<TemplateEditorState>(createInitialEditor());
  const [previewText, setPreviewText] = useState(VOICE_PREVIEW_DEFAULT_TEXT);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [selectedPreviewLayerId, setSelectedPreviewLayerId] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRequestSeqRef = useRef(0);
  const lastSavedSignatureRef = useRef("");
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const pendingPreviewPlayRef = useRef(false);

  async function refreshTemplates(): Promise<void> {
    const response = await fetch("/api/automation-template", { cache: "no-store" });
    const data = await readJsonResponse<AutomationTemplateResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || "템플릿 목록을 불러오지 못했습니다.");
    }
    const list = data.templates || [];
    setTemplates(list);
    setActiveTemplateId(data.activeTemplateId);
    if (selectedTemplateId !== "__new__") {
      const selected = list.find((item) => item.id === selectedTemplateId);
      if (!selected) {
        setSelectedTemplateId("__new__");
        setEditor(createInitialEditor());
        setSelectedPreviewLayerId(null);
        lastSavedSignatureRef.current = "";
        setAutoSaveStatus("idle");
        setAutoSaveMessage(undefined);
      }
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshTemplates();
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Partial<AppSettings>;
        if (!mounted) {
          return;
        }
        setTtsProviderSettings({
          aiMode: data.aiMode,
          aiTtsProvider: data.aiTtsProvider,
          openaiApiKey: data.openaiApiKey,
          geminiApiKey: data.geminiApiKey
        });
      } catch {
        // Keep all voices visible when settings cannot be loaded.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const builtRenderOptions = useMemo(() => buildRenderOptionsFromEditor(editor), [editor]);
  const availableVoiceOptions = useMemo(() => {
    const provider = resolveTtsVoiceProvider(ttsProviderSettings);
    const filtered = filterVoiceOptions(provider);
    return filtered.length > 0 ? filtered : ALL_VOICE_OPTIONS;
  }, [ttsProviderSettings]);
  const previewTemplates = builtRenderOptions.overlay.titleTemplates || [];
  const previewPanelTop = clampNumber(Number(editor.panelTopPercent), 0, 85, 34);
  const previewPanelWidth = clampNumber(Number(editor.panelWidthPercent), 60, 100, 100);
  const currentPayload = useMemo(
    () => buildTemplatePayload(editor, builtRenderOptions),
    [editor, builtRenderOptions]
  );
  const currentPayloadSignature = useMemo(
    () => buildPayloadSignature(currentPayload),
    [currentPayload]
  );

  useEffect(() => {
    if (!availableVoiceOptions.length) {
      return;
    }
    setEditor((prev) => {
      if (availableVoiceOptions.some((item) => item.id === prev.voice)) {
        return prev;
      }
      return {
        ...prev,
        voice: availableVoiceOptions[0].id
      };
    });
  }, [availableVoiceOptions]);

  function updateLayerPosition(target: DragTarget, nextX?: number, nextY?: number): void {
    setEditor((prev) => {
      if (target === "__primary_title__") {
        return {
          ...prev,
          primaryX:
            nextX === undefined ? prev.primaryX : String(clampNumber(nextX, 0, 100, Number(prev.primaryX))),
          primaryY:
            nextY === undefined ? prev.primaryY : String(clampNumber(nextY, 0, 100, Number(prev.primaryY)))
        };
      }
      if (target === "__secondary_title__") {
        return {
          ...prev,
          secondaryX:
            nextX === undefined
              ? prev.secondaryX
              : String(clampNumber(nextX, 0, 100, Number(prev.secondaryX))),
          secondaryY:
            nextY === undefined
              ? prev.secondaryY
              : String(clampNumber(nextY, 0, 100, Number(prev.secondaryY)))
        };
      }
      if (target === "__badge__") {
        return {
          ...prev,
          badgeX:
            nextX === undefined ? prev.badgeX : String(clampNumber(nextX, 0, 100, Number(prev.badgeX))),
          badgeY:
            nextY === undefined ? prev.badgeY : String(clampNumber(nextY, 0, 100, Number(prev.badgeY)))
        };
      }
      if (target !== "__subtitle__") {
        const nextCustomLayers = prev.customLayers.map((layer) => {
          if (layer.id !== target) {
            return layer;
          }
          return {
            ...layer,
            x:
              nextX === undefined ? layer.x : String(clampNumber(nextX, 0, 100, Number(layer.x))),
            y:
              nextY === undefined ? layer.y : String(clampNumber(nextY, 0, 100, Number(layer.y)))
          };
        });
        if (nextCustomLayers !== prev.customLayers) {
          return {
            ...prev,
            customLayers: nextCustomLayers
          };
        }
      }
      return {
        ...prev,
        subtitleYPercent:
          nextY === undefined
            ? prev.subtitleYPercent
            : String(clampNumber(nextY, 0, 100, Number(prev.subtitleYPercent)))
      };
    });
  }

  function beginDrag(
    target: DragTarget,
    event: React.PointerEvent<HTMLElement>,
    initialPercentX?: number,
    initialPercentY?: number
  ): void {
    if (!previewCanvasRef.current) {
      return;
    }
    const rect = previewCanvasRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      target,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      startX: event.clientX,
      startY: event.clientY,
      initialPercentX,
      initialPercentY: initialPercentY ?? 50
    };
    setSelectedPreviewLayerId(target);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onDragMove(event: React.PointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = ((event.clientX - drag.startX) / Math.max(1, drag.rect.width)) * 100;
    const dy = ((event.clientY - drag.startY) / Math.max(1, drag.rect.height)) * 100;
    const nextY = drag.initialPercentY + dy;
    if (drag.target === "__subtitle__") {
      updateLayerPosition(drag.target, undefined, nextY);
      return;
    }
    const nextX = (drag.initialPercentX ?? 50) + dx;
    updateLayerPosition(drag.target, nextX, nextY);
  }

  function endDrag(event: React.PointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function addCustomLayer(): void {
    const layerId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setEditor((prev) => ({
      ...prev,
      customLayers: [
        ...prev.customLayers,
        {
          id: layerId,
          text: "{{title}}",
          x: "50",
          y: "50",
          width: "60",
          fontSize: "28",
          fontThickness: "0",
          color: "#FFFFFF"
        }
      ]
    }));
    setSelectedPreviewLayerId(layerId);
  }

  function updateCustomLayer(layerId: string, patch: Partial<CustomTextLayerEditor>): void {
    setEditor((prev) => ({
      ...prev,
      customLayers: prev.customLayers.map((layer) =>
        layer.id === layerId ? { ...layer, ...patch } : layer
      )
    }));
  }

  function removeCustomLayer(layerId: string): void {
    setEditor((prev) => ({
      ...prev,
      customLayers: prev.customLayers.filter((layer) => layer.id !== layerId)
    }));
    setSelectedPreviewLayerId((prev) => (prev === layerId ? null : prev));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!selectedPreviewLayerId || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }
      const targetElement = event.target as HTMLElement | null;
      if (
        targetElement &&
        (targetElement.tagName === "INPUT" ||
          targetElement.tagName === "TEXTAREA" ||
          targetElement.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setEditor((prev) => {
        if (selectedPreviewLayerId === "__primary_title__") {
          return { ...prev, primaryText: "" };
        }
        if (selectedPreviewLayerId === "__secondary_title__") {
          return { ...prev, secondaryEnabled: false };
        }
        if (selectedPreviewLayerId === "__badge__") {
          return { ...prev, badgeText: "" };
        }
        if (selectedPreviewLayerId === "__subtitle__") {
          return { ...prev, subtitleSampleText: "" };
        }
        return {
          ...prev,
          customLayers: prev.customLayers.filter((layer) => layer.id !== selectedPreviewLayerId)
        };
      });
      setSelectedPreviewLayerId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPreviewLayerId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl);
      }
    };
  }, [previewAudioUrl]);

  useEffect(() => {
    if (!previewAudioUrl || !pendingPreviewPlayRef.current) {
      return;
    }
    const audioEl = previewAudioRef.current;
    if (!audioEl) {
      return;
    }
    pendingPreviewPlayRef.current = false;
    void audioEl.play().catch(() => {
      // Some browsers block autoplay without user interaction.
    });
  }, [previewAudioUrl]);

  useEffect(() => {
    if (selectedTemplateId === "__new__") {
      setAutoSaveStatus("idle");
      setAutoSaveMessage("자동 저장은 저장된 템플릿에서 동작합니다.");
      return;
    }
    if (loading || busy) {
      return;
    }
    if (!lastSavedSignatureRef.current) {
      lastSavedSignatureRef.current = currentPayloadSignature;
      setAutoSaveStatus("idle");
      setAutoSaveMessage(undefined);
      return;
    }
    if (lastSavedSignatureRef.current === currentPayloadSignature) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setAutoSaveStatus("saving");
    setAutoSaveMessage("자동 저장 중...");
    const requestSeq = ++autoSaveRequestSeqRef.current;
    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/automation-template", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                templateId: selectedTemplateId,
                templateName: currentPayload.templateName || undefined,
                sourceTitle: currentPayload.sourceTitle || undefined,
                sourceTopic: currentPayload.sourceTopic || undefined,
                voice: currentPayload.voice || undefined,
                voiceSpeed: currentPayload.voiceSpeed,
                renderOptions: currentPayload.renderOptions
              })
            });
          const data = await readJsonResponse<AutomationTemplateResponse>(response);
          if (!response.ok) {
            throw new Error(data.error || "자동 저장에 실패했습니다.");
          }
          const list = data.templates || [];
          setTemplates(list);
          if (data.activeTemplateId) {
            setActiveTemplateId(data.activeTemplateId);
          }
          if (requestSeq !== autoSaveRequestSeqRef.current) {
            return;
          }
          const updated = list.find((item) => item.id === selectedTemplateId);
          lastSavedSignatureRef.current = updated
            ? buildTemplateSignature(updated)
            : currentPayloadSignature;
          setAutoSaveStatus("saved");
          setAutoSaveMessage(`자동 저장됨 · ${new Date().toLocaleTimeString()}`);
        } catch (autoSaveError) {
          if (requestSeq !== autoSaveRequestSeqRef.current) {
            return;
          }
          setAutoSaveStatus("error");
          setAutoSaveMessage(
            autoSaveError instanceof Error ? autoSaveError.message : "자동 저장에 실패했습니다."
          );
        }
      })();
    }, 550);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [selectedTemplateId, loading, busy, currentPayload, currentPayloadSignature]);

  async function previewVoice(): Promise<void> {
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: editor.voice,
          speed: clampNumber(Number(editor.voiceSpeed), 0.5, 2, 1),
          text: previewText
        })
      });
      if (!response.ok) {
        const data = await readJsonResponse<{ error?: string }>(response);
        throw new Error(data.error || "보이스 미리듣기에 실패했습니다.");
      }
      const blob = await response.blob();
      const playableBlob =
        blob.type && blob.type.startsWith("audio/")
          ? blob
          : new Blob([blob], { type: "audio/wav" });
      const url = URL.createObjectURL(playableBlob);
      pendingPreviewPlayRef.current = true;
      setPreviewAudioUrl((oldUrl) => {
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        return url;
      });
    } catch (previewErr) {
      setPreviewError(previewErr instanceof Error ? previewErr.message : "Unknown error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveAsNew(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: editor.templateName.trim() || `Template ${new Date().toLocaleString()}`,
          sourceTitle: editor.sourceTitle.trim() || undefined,
          sourceTopic: editor.sourceTopic.trim() || undefined,
          voice: (editor.voice || "alloy").trim().toLowerCase() || "alloy",
          voiceSpeed: clampNumber(Number(editor.voiceSpeed), 0.5, 2, 1),
          renderOptions: builtRenderOptions
        })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "템플릿 저장에 실패했습니다.");
      }
      const list = data.templates || [];
      setTemplates(list);
      setActiveTemplateId(data.activeTemplateId);
      const active = data.activeTemplateId;
      if (active) {
        setSelectedTemplateId(active);
        const item = list.find((template) => template.id === active);
        if (item) {
          lastSavedSignatureRef.current = buildTemplateSignature(item);
          setEditor(editorFromTemplate(item));
        }
      }
      setAutoSaveStatus("saved");
      setAutoSaveMessage(`자동 저장됨 · ${new Date().toLocaleTimeString()}`);
      setSuccess("새 템플릿을 저장하고 활성화했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function updateCurrent(): Promise<void> {
    if (!selectedTemplateId || selectedTemplateId === "__new__") {
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          templateName: editor.templateName.trim() || undefined,
          sourceTitle: editor.sourceTitle.trim() || undefined,
          sourceTopic: editor.sourceTopic.trim() || undefined,
          voice: (editor.voice || "alloy").trim().toLowerCase() || "alloy",
          voiceSpeed: clampNumber(Number(editor.voiceSpeed), 0.5, 2, 1),
          renderOptions: builtRenderOptions
        })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "템플릿 수정에 실패했습니다.");
      }
      const list = data.templates || [];
      setTemplates(list);
      setActiveTemplateId(data.activeTemplateId);
      const updated = list.find((item) => item.id === selectedTemplateId);
      if (updated) {
        lastSavedSignatureRef.current = buildTemplateSignature(updated);
        setEditor(editorFromTemplate(updated));
      }
      setAutoSaveStatus("saved");
      setAutoSaveMessage(`자동 저장됨 · ${new Date().toLocaleTimeString()}`);
      setSuccess("선택 템플릿을 수정했습니다.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: id })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "활성 템플릿 설정에 실패했습니다.");
      }
      setTemplates(data.templates || []);
      setActiveTemplateId(data.activeTemplateId);
      setSuccess("활성 템플릿을 변경했습니다.");
    } catch (setErrorValue) {
      setError(setErrorValue instanceof Error ? setErrorValue.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(id: string): Promise<void> {
    const confirmed = window.confirm("선택 템플릿을 삭제할까요?");
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const response = await fetch("/api/automation-template", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: id })
      });
      const data = await readJsonResponse<AutomationTemplateResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "템플릿 삭제에 실패했습니다.");
      }
      const list = data.templates || [];
      setTemplates(list);
      setActiveTemplateId(data.activeTemplateId);
      if (selectedTemplateId === id) {
        setSelectedTemplateId("__new__");
        setEditor(createInitialEditor());
      }
      setSuccess("템플릿을 삭제했습니다.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function onSelectTemplate(value: string): void {
    setSelectedTemplateId(value);
    setError(undefined);
    setSuccess(undefined);
    if (value === "__new__") {
      setEditor(createInitialEditor());
      setSelectedPreviewLayerId(null);
      lastSavedSignatureRef.current = "";
      setAutoSaveStatus("idle");
      setAutoSaveMessage("자동 저장은 저장된 템플릿에서 동작합니다.");
      return;
    }
    const found = templates.find((item) => item.id === value);
    if (!found) {
      setEditor(createInitialEditor());
      setSelectedPreviewLayerId(null);
      lastSavedSignatureRef.current = "";
      setAutoSaveStatus("idle");
      setAutoSaveMessage(undefined);
      return;
    }
    lastSavedSignatureRef.current = buildTemplateSignature(found);
    setEditor(editorFromTemplate(found));
    setSelectedPreviewLayerId(null);
    setAutoSaveStatus("saved");
    setAutoSaveMessage("저장된 템플릿을 불러왔습니다.");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">템플릿 관리</h1>
            <p className="text-sm text-muted-foreground">
              Create 화면 없이도 자동화 템플릿을 생성/수정/선택할 수 있습니다.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void refreshTemplates()} disabled={busy}>
            새로고침
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)] xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="order-2 min-w-0 space-y-4 rounded-xl border bg-card p-4 lg:order-2">
          <div className="grid gap-2 2xl:grid-cols-[1fr,1fr,auto]">
            <div className="space-y-1">
              <Label>템플릿 선택</Label>
              <Select value={selectedTemplateId} onValueChange={onSelectTemplate}>
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">+ 새 템플릿 생성</SelectItem>
                  {templates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {(item.templateName || "(이름 없음)") + " · " + new Date(item.updatedAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>자동화 활성 템플릿</Label>
              <Input
                value={
                  templates.find((item) => item.id === activeTemplateId)?.templateName ||
                  (activeTemplateId ? activeTemplateId : "없음")
                }
                readOnly
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(createInitialEditor())}
                disabled={busy}
              >
                <Plus className="mr-1 h-4 w-4" />
                신규 초기화
              </Button>
            </div>
          </div>
          {selectedTemplateId !== "__new__" ? (
            <p
              className={`text-xs ${
                autoSaveStatus === "error"
                  ? "text-destructive"
                  : autoSaveStatus === "saving"
                    ? "text-amber-500"
                    : "text-emerald-500"
              }`}
            >
              {autoSaveMessage || "자동 저장 대기 중"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{autoSaveMessage || "새 템플릿은 수동 저장이 필요합니다."}</p>
          )}

          <div className="grid gap-2 md:grid-cols-5">
            <div className="space-y-1 md:col-span-2">
              <Label>템플릿 이름</Label>
              <Input
                value={editor.templateName}
                onChange={(event) => setEditor((prev) => ({ ...prev, templateName: event.target.value }))}
                placeholder="예: 뉴스형 자막 템플릿"
              />
            </div>
            <div className="space-y-1">
              <Label>폰트명</Label>
              <Select
                value={detectTemplateFontPreset(editor.fontName)}
                onValueChange={(value) =>
                  setEditor((prev) => ({
                    ...prev,
                    fontName: value === customTemplateFontOption ? prev.fontName : value
                  }))
                }
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue placeholder="폰트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {templateFontOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value={customTemplateFontOption}>직접 입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>폰트 스타일</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editor.fontBold ? "default" : "outline"}
                  onClick={() => setEditor((prev) => ({ ...prev, fontBold: !prev.fontBold }))}
                >
                  Bold
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editor.fontItalic ? "default" : "outline"}
                  onClick={() => setEditor((prev) => ({ ...prev, fontItalic: !prev.fontItalic }))}
                >
                  Italic
                </Button>
              </div>
            </div>
          </div>
          {detectTemplateFontPreset(editor.fontName) === customTemplateFontOption ? (
            <div className="space-y-1">
              <Label>사용자 지정 폰트명</Label>
              <Input
                value={editor.fontName}
                onChange={(event) => setEditor((prev) => ({ ...prev, fontName: event.target.value }))}
                placeholder="예: Noto Sans KR"
              />
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>기준 제목(치환 기준)</Label>
              <Input
                value={editor.sourceTitle}
                onChange={(event) => setEditor((prev) => ({ ...prev, sourceTitle: event.target.value }))}
                placeholder="{{title}}"
              />
            </div>
            <div className="space-y-1">
              <Label>기준 주제(치환 기준)</Label>
              <Input
                value={editor.sourceTopic}
                onChange={(event) => setEditor((prev) => ({ ...prev, sourceTopic: event.target.value }))}
                placeholder="{{topic}}"
              />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="grid gap-2 md:grid-cols-[1fr,140px,auto]">
              <div className="space-y-1">
                <Label>오디오 보이스</Label>
                <Select
                  value={editor.voice}
                  onValueChange={(value) =>
                    setEditor((prev) => ({
                      ...prev,
                      voice: value
                    }))
                  }
                >
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVoiceOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>보이스 배속</Label>
                <Select
                  value={editor.voiceSpeed}
                  onValueChange={(value) =>
                    setEditor((prev) => ({
                      ...prev,
                      voiceSpeed: value
                    }))
                  }
                >
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceSpeedOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void previewVoice()}
                  disabled={previewLoading}
                >
                  {previewLoading ? "미리듣기 생성 중..." : "보이스 미리 듣기"}
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              <Label>미리듣기 텍스트</Label>
              <Textarea
                rows={2}
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                placeholder={VOICE_PREVIEW_DEFAULT_TEXT}
              />
              {previewAudioUrl ? (
                <audio ref={previewAudioRef} src={previewAudioUrl} controls className="w-full" />
              ) : null}
              {previewError ? (
                <p className="text-xs text-destructive">{previewError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  템플릿에 저장된 보이스/배속이 자동화 생성 시 그대로 사용됩니다.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label>레이아웃</Label>
              <Select
                value={editor.videoLayout}
                onValueChange={(value) =>
                  setEditor((prev) => ({
                    ...prev,
                    videoLayout: value === "panel_16_9" ? "panel_16_9" : "fill_9_16"
                  }))
                }
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fill_9_16">9:16 꽉 채우기</SelectItem>
                  <SelectItem value="panel_16_9">16:9 패널 모드</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>모션</Label>
              <Select
                value={editor.motionPreset}
                onValueChange={(value) =>
                  setEditor((prev) => ({
                    ...prev,
                    motionPreset:
                      value === "up_down" ||
                      value === "left_right" ||
                      value === "random" ||
                      value === "focus_smooth"
                        ? value
                        : "gentle_zoom"
                  }))
                }
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gentle_zoom">Gentle Zoom</SelectItem>
                  <SelectItem value="up_down">Up/Down</SelectItem>
                  <SelectItem value="left_right">Left/Right</SelectItem>
                  <SelectItem value="focus_smooth">Focus Smooth</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>출력 FPS</Label>
              <Select
                value={String(editor.outputFps)}
                onValueChange={(value) =>
                  setEditor((prev) => ({
                    ...prev,
                    outputFps: value === "60" ? 60 : 30
                  }))
                }
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 FPS</SelectItem>
                  <SelectItem value="60">60 FPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>모션 속도(%)</Label>
              <Input
                type="number"
                value={editor.motionSpeedPercent ?? ""}
                min={60}
                max={220}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    motionSpeedPercent: String(event.target.value ?? "")
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>16:9 패널 상단 위치(%)</Label>
              <Input
                type="number"
                min={0}
                max={85}
                value={editor.panelTopPercent}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    panelTopPercent: event.target.value
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>16:9 패널 폭(%)</Label>
              <Input
                type="number"
                min={60}
                max={100}
                value={editor.panelWidthPercent}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    panelWidthPercent: event.target.value
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <div className="grid gap-2 2xl:grid-cols-[1fr,110px,110px,120px,90px,90px,90px]">
              <div className="space-y-1">
                <Label>기본 타이틀 텍스트</Label>
                <Textarea
                  rows={2}
                  value={editor.primaryText}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryText: event.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isDynamicText({
                    text: editor.primaryText,
                    sourceTitle: editor.sourceTitle,
                    sourceTopic: editor.sourceTopic
                  })
                    ? "동적 텍스트: 생성 주제에 맞게 바뀝니다."
                    : "고정 텍스트: 항상 동일하게 노출됩니다."}
                </p>
              </div>
              <div className="space-y-1">
                <Label>크기</Label>
                <Input
                  type="number"
                  value={editor.primaryFontSize}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryFontSize: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>굵기</Label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={editor.primaryFontThickness}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, primaryFontThickness: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>색상</Label>
                <Input
                  type="color"
                  value={normalizeHex(editor.primaryColor, "#FFFFFF")}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryColor: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>X(%)</Label>
                <Input
                  type="number"
                  value={editor.primaryX}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryX: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Y(%)</Label>
                <Input
                  type="number"
                  value={editor.primaryY}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryY: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>폭(%)</Label>
                <Input
                  type="number"
                  value={editor.primaryWidth}
                  onChange={(event) => setEditor((prev) => ({ ...prev, primaryWidth: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2 2xl:grid-cols-[1fr,110px,110px,120px,90px,90px,90px]">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>보조 타이틀 텍스트</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="secondary-enabled" className="text-xs text-muted-foreground">
                      사용
                    </Label>
                    <Switch
                      id="secondary-enabled"
                      checked={editor.secondaryEnabled}
                      onCheckedChange={(checked) =>
                        setEditor((prev) => ({
                          ...prev,
                          secondaryEnabled: Boolean(checked)
                        }))
                      }
                    />
                  </div>
                </div>
                <Textarea
                  rows={2}
                  value={editor.secondaryText}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryText: event.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isDynamicText({
                    text: editor.secondaryText,
                    sourceTitle: editor.sourceTitle,
                    sourceTopic: editor.sourceTopic
                  })
                    ? "동적 텍스트: 생성 주제에 맞게 바뀝니다."
                    : "고정 텍스트: 항상 동일하게 노출됩니다."}
                </p>
              </div>
              <div className="space-y-1">
                <Label>크기</Label>
                <Input
                  type="number"
                  value={editor.secondaryFontSize}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryFontSize: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>굵기</Label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={editor.secondaryFontThickness}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, secondaryFontThickness: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>색상</Label>
                <Input
                  type="color"
                  value={normalizeHex(editor.secondaryColor, "#FFF200")}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryColor: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>X(%)</Label>
                <Input
                  type="number"
                  value={editor.secondaryX}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryX: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Y(%)</Label>
                <Input
                  type="number"
                  value={editor.secondaryY}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryY: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>폭(%)</Label>
                <Input
                  type="number"
                  value={editor.secondaryWidth}
                  disabled={!editor.secondaryEnabled}
                  onChange={(event) => setEditor((prev) => ({ ...prev, secondaryWidth: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2 2xl:grid-cols-[1fr,110px,110px,120px,90px,90px,90px]">
              <div className="space-y-1">
                <Label>상단 배지 텍스트 (선택)</Label>
                <Input
                  value={editor.badgeText}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeText: event.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  {isDynamicText({
                    text: editor.badgeText,
                    sourceTitle: editor.sourceTitle,
                    sourceTopic: editor.sourceTopic
                  })
                    ? "동적 텍스트: 생성 주제에 맞게 바뀝니다."
                    : "고정 텍스트: 항상 동일하게 노출됩니다."}
                </p>
              </div>
              <div className="space-y-1">
                <Label>크기</Label>
                <Input
                  type="number"
                  value={editor.badgeFontSize}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeFontSize: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>굵기</Label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={editor.badgeFontThickness}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, badgeFontThickness: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>색상</Label>
                <Input
                  type="color"
                  value={normalizeHex(editor.badgeColor, "#FFFFFF")}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeColor: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>X(%)</Label>
                <Input
                  type="number"
                  value={editor.badgeX}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeX: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Y(%)</Label>
                <Input
                  type="number"
                  value={editor.badgeY}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeY: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>폭(%)</Label>
                <Input
                  type="number"
                  value={editor.badgeWidth}
                  onChange={(event) => setEditor((prev) => ({ ...prev, badgeWidth: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <Label>추가 치환 레이어</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCustomLayer}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  레이어 추가
                </Button>
              </div>
              {editor.customLayers.length === 0 ? (
                <p className="text-xs text-muted-foreground">추가 레이어가 없습니다.</p>
              ) : null}
              {editor.customLayers.map((layer, index) => (
                <div
                  key={layer.id}
                  className={`space-y-2 rounded-md border p-2 ${
                    selectedPreviewLayerId === layer.id ? "border-cyan-500/70" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">레이어 {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCustomLayer(layer.id)}
                    >
                      삭제
                    </Button>
                  </div>
                  <div className="grid gap-2 2xl:grid-cols-[1fr,110px,110px,120px,90px,90px,90px]">
                    <div className="space-y-1">
                      <Label>텍스트</Label>
                      <Textarea
                        rows={2}
                        value={layer.text}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { text: event.target.value })
                        }
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {isDynamicText({
                          text: layer.text,
                          sourceTitle: editor.sourceTitle,
                          sourceTopic: editor.sourceTopic
                        })
                          ? "동적 텍스트: 생성 주제에 맞게 바뀝니다."
                          : "고정 텍스트: 항상 동일하게 노출됩니다."}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>크기</Label>
                      <Input
                        type="number"
                        value={layer.fontSize}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { fontSize: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>굵기</Label>
                      <Input
                        type="number"
                        min={0}
                        max={8}
                        value={layer.fontThickness}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { fontThickness: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>색상</Label>
                      <Input
                        type="color"
                        value={normalizeHex(layer.color, "#FFFFFF")}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { color: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>X(%)</Label>
                      <Input
                        type="number"
                        value={layer.x}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { x: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Y(%)</Label>
                      <Input
                        type="number"
                        value={layer.y}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { y: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>폭(%)</Label>
                      <Input
                        type="number"
                        value={layer.width}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { width: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr,120px,120px,1fr]">
              <div className="space-y-1">
                <Label>자막 예시 텍스트</Label>
                <Input
                  value={editor.subtitleSampleText}
                  onChange={(event) => setEditor((prev) => ({ ...prev, subtitleSampleText: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>자막 위치(상/중/하)</Label>
                <Select
                  value={editor.subtitlePosition}
                  onValueChange={(value) =>
                    setEditor((prev) => ({
                      ...prev,
                      subtitlePosition:
                        value === "top" || value === "middle" || value === "bottom"
                          ? value
                          : "bottom"
                    }))
                  }
                >
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">상단</SelectItem>
                    <SelectItem value="middle">중단</SelectItem>
                    <SelectItem value="bottom">하단</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>자막 크기</Label>
                <Input
                  type="number"
                  min={10}
                  max={120}
                  value={editor.subtitleFontSize}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      subtitleFontSize: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>자막 Y(%)</Label>
                <Input
                  type="number"
                  value={editor.subtitleYPercent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      subtitleYPercent: event.target.value
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveAsNew()} disabled={busy}>
              <Plus className="mr-1 h-4 w-4" />
              새 템플릿 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void updateCurrent()}
              disabled={busy || selectedTemplateId === "__new__"}
            >
              <Pencil className="mr-1 h-4 w-4" />
              선택 템플릿 수정
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => (selectedTemplateId !== "__new__" ? void setActive(selectedTemplateId) : undefined)}
              disabled={busy || selectedTemplateId === "__new__"}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              자동화에 적용
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                selectedTemplateId !== "__new__" ? void removeTemplate(selectedTemplateId) : undefined
              }
              disabled={busy || selectedTemplateId === "__new__"}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              삭제
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-500">{success}</p> : null}
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
        </div>

        <div className="order-1 space-y-3 rounded-xl border bg-card p-4 lg:order-1">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <h2 className="text-base font-semibold">템플릿 미리보기</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            아래 미리보기는 자동화에서 실제 주제로 치환될 예시입니다. 텍스트/자막 박스를 드래그하면 위치가 즉시 반영됩니다.
          </p>
          <p className="text-xs text-muted-foreground">
            16:9 패널 모드에서는 패널 상단 위치/폭 값이 아래 영상 영역 박스에 그대로 반영됩니다.
          </p>
          <p className="text-xs text-muted-foreground">
            레이어 선택 후 <kbd className="rounded border px-1 py-0.5">Delete</kbd> 키로 삭제할 수 있습니다.
          </p>

          <div className="mx-auto aspect-[9/16] w-full max-w-[320px] rounded-xl border bg-black p-3">
            <div
              ref={previewCanvasRef}
              className="relative h-full w-full overflow-hidden rounded-lg bg-black"
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerLeave={endDrag}
            >
              {editor.videoLayout === "panel_16_9" ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-sm border border-white/35 bg-zinc-900"
                    style={{
                      top: `${previewPanelTop}%`,
                      width: `${previewPanelWidth}%`,
                      aspectRatio: "16 / 9"
                    }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(140deg,#2f3d4a_0%,#5f7a8f_45%,#cfa06b_100%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(255,234,173,0.35),transparent_42%)]" />
                    <p className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-amber-200">
                      16:9 영상 영역 미리보기
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,#253446_0%,#3e5c79_35%,#c18b57_100%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.24),transparent_38%)]" />
                  <p className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-cyan-200">
                    9:16 꽉 채우기 미리보기
                  </p>
                </div>
              )}

              {previewTemplates.map((item) => {
                const text = materializePreviewText({
                  text: item.text || "",
                  sourceTitle: editor.sourceTitle,
                  sourceTopic: editor.sourceTopic
                });
                const hint = dynamicHint({
                  text: item.text || "",
                  sourceTitle: editor.sourceTitle,
                  sourceTopic: editor.sourceTopic
                });
                const isSelected = selectedPreviewLayerId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move rounded text-center whitespace-pre-wrap ${
                      isSelected ? "border-2 border-cyan-300" : "border border-cyan-400/40"
                    }`}
                    style={{
                      left: `${clampNumber(Number(item.x), 0, 100, 50)}%`,
                      top: `${clampNumber(Number(item.y), 0, 100, 50)}%`,
                      width: `${clampNumber(Number(item.width), 20, 100, 70)}%`,
                      color: normalizeHex(item.color || "#FFFFFF", "#FFFFFF"),
                      fontSize: `${clampNumber(Number(item.fontSize), 10, 90, 24) * 0.42}px`,
                      fontFamily: item.fontName || editor.fontName || "Noto Sans KR",
                      fontWeight: item.fontBold ? 700 : 400,
                      fontStyle: item.fontItalic ? "italic" : "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                      WebkitTextStrokeWidth: `${clampNumber(Number(item.fontThickness), 0, 8, 0) * 0.2}px`,
                      WebkitTextStrokeColor: "rgba(0,0,0,0.85)",
                      backgroundColor: isSelected ? "rgba(8,145,178,0.16)" : "rgba(0,0,0,0.15)"
                    }}
                    onPointerDown={(event) => {
                      beginDrag(
                        item.id,
                        event,
                        clampNumber(Number(item.x), 0, 100, 50),
                        clampNumber(Number(item.y), 0, 100, 50)
                      );
                    }}
                  >
                    {text}
                    {hint ? (
                      <span className="mt-1 block rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-300">
                        {hint}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              <div
                className={`absolute left-1/2 z-20 w-[82%] -translate-x-1/2 -translate-y-1/2 cursor-move rounded bg-black/35 px-2 py-1 text-center text-sm text-white ${
                  selectedPreviewLayerId === "__subtitle__"
                    ? "border-2 border-emerald-300"
                    : "border border-emerald-400/70"
                }`}
                style={{
                  top: `${clampNumber(Number(editor.subtitleYPercent), 0, 100, 86)}%`
                }}
                onPointerDown={(event) =>
                  beginDrag(
                    "__subtitle__",
                    event,
                    undefined,
                    clampNumber(Number(editor.subtitleYPercent), 0, 100, 86)
                  )
                }
              >
                <p
                  className="whitespace-pre-wrap"
                  style={{
                    fontSize: `${clampNumber(Number(editor.subtitleFontSize), 10, 120, 16) * 0.42}px`
                  }}
                >
                  {materializePreviewText({
                    text: editor.subtitleSampleText || SAMPLE_NARRATION,
                    sourceTitle: editor.sourceTitle,
                    sourceTopic: editor.sourceTopic
                  })}
                </p>
                <p className="mt-1 text-[10px] text-emerald-300">자막 위치 드래그</p>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <p className="font-medium">치환 규칙 안내</p>
            <p className="mt-1 text-muted-foreground">
              `{"{{title}} {{topic}} {{narration}} {{keyword}}"}` 플레이스홀더 또는 기준 제목/주제에 해당하는
              텍스트는 자동화 실행 시 현재 주제로 바뀝니다.
            </p>
            <div className="mt-2 flex items-start gap-2 text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                수정모드에서 배경에 초록 힌트가 보이면, 해당 부분이 실제 생성 시점에 동적으로 변경될 예정입니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
