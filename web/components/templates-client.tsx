"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageStyleSnapshot } from "@/components/image-style-snapshot";
import { AppSettings, RenderOptions, SheetContentRow } from "@/lib/types";
import { wrapTemplateTextLikeEngine } from "@/lib/template-text-wrap";
import { buildFontUnsupportedLanguageNotice } from "@/lib/font-language-compat";
import {
  isLocalFontAccessSupported,
  mergeFontOptions,
  queryInstalledFontNames
} from "@/lib/local-fonts";
import {
  ALL_VOICE_OPTIONS,
  filterVoiceOptions,
  getVoiceHint,
  resolveTtsVoiceProvider
} from "@/lib/voice-options";

interface AutomationTemplateItem {
  id: string;
  templateName?: string;
  imageStyle?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  voice?: string;
  voiceSpeed?: number;
  videoLengthSec?: number;
  sceneCount?: number;
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
  fontBold: boolean;
  fontItalic: boolean;
  backgroundColor: string;
  backgroundOpacity: string;
};

type TemplateEditorState = {
  templateName: string;
  imageStyle: string;
  imageStylePreset: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: string;
  videoLengthSec: string;
  sceneCount: string;
  primaryText: string;
  primaryBold: boolean;
  primaryItalic: boolean;
  secondaryText: string;
  secondaryEnabled: boolean;
  secondaryBold: boolean;
  secondaryItalic: boolean;
  badgeText: string;
  badgeBold: boolean;
  badgeItalic: boolean;
  fontName: string;
  fontBold: boolean;
  fontItalic: boolean;
  backgroundColor: string;
  backgroundOpacity: string;
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
  subtitleBold: boolean;
  subtitleMaxCharsPerCaption: string;
  subtitleYPercent: string;
  subtitleSampleText: string;
  videoLayout: VideoLayout;
  panelTopPercent: string;
  panelWidthPercent: string;
  motionPreset: MotionPreset;
  motionSpeedPercent: string;
  focusXPercent: string;
  focusYPercent: string;
  focusDriftPercent: string;
  focusZoomPercent: string;
  outputFps: OutputFps;
  customLayers: CustomTextLayerEditor[];
};

const SAMPLE_TITLE = "클레오파트라의 숨겨진 비밀!";
const SAMPLE_TOPIC = "로마 정치의 중심에 선 마지막 파라오 이야기";
const SAMPLE_NARRATION = "고대 이집트 문명 속에서 잊힌 진실이 드러납니다.";
const SAMPLE_KEYWORD = "클레오파트라";
const VOICE_PREVIEW_DEFAULT_TEXT = "This is a voice preview for your short-form content.";
const voiceSpeedOptions = ["0.75", "0.9", "1", "1.1", "1.25", "1.5"];
const templateSceneCountOptions = ["3", "4", "5", "6", "8", "10", "12"];
const customStyleOption = "__custom__";
const imageStylePresets = [
  "Cinematic photo-real",
  "Ultra photoreal photographer",
  "Minimal flat illustration",
  "Anime cel-shaded",
  "3D Pixar-style",
  "Cyberpunk neon",
  "Watercolor painting",
  "Pencil sketch",
  "Retro VHS film",
  "Editorial product ad"
];
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
const VIDEO_RENDER_WIDTH = 1080;
const VIDEO_RENDER_HEIGHT = 1920;
const ASS_DEFAULT_PLAYRES_Y = 288;

function detectImageStylePreset(style: string): string {
  if (style === "완전 실사 포토그래퍼") {
    return "Ultra photoreal photographer";
  }
  return imageStylePresets.includes(style) ? style : customStyleOption;
}

const BASE_SUBTITLE: RenderOptions["subtitle"] = {
  fontName: "Arial",
  fontSize: 16,
  fontBold: false,
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
  maxCharsPerCaption: 18,
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
  const initialImageStyle = "Cinematic photo-real";
  return {
    templateName: "",
    imageStyle: initialImageStyle,
    imageStylePreset: detectImageStylePreset(initialImageStyle),
    sourceTitle: "{{title}}",
    sourceTopic: "{{topic}}",
    voice: "alloy",
    voiceSpeed: "1",
    videoLengthSec: "30",
    sceneCount: "5",
    primaryText: "{{title}}",
    primaryBold: false,
    primaryItalic: false,
    secondaryText: "{{topic}}",
    secondaryEnabled: true,
    secondaryBold: false,
    secondaryItalic: false,
    badgeText: "AI로 재구성된 콘텐츠입니다.",
    badgeBold: false,
    badgeItalic: false,
    fontName: "Noto Sans KR",
    fontBold: false,
    fontItalic: false,
    backgroundColor: "#000000",
    backgroundOpacity: "0",
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
    subtitleBold: false,
    subtitleMaxCharsPerCaption: "18",
    subtitleYPercent: "86",
    subtitleSampleText: "신비한 고대 이집트 문자의 비밀을 지금 공개합니다.",
    videoLayout: "fill_9_16",
    panelTopPercent: "34",
    panelWidthPercent: "100",
    motionPreset: "gentle_zoom",
    motionSpeedPercent: "135",
    focusXPercent: "50",
    focusYPercent: "50",
    focusDriftPercent: "6",
    focusZoomPercent: "9",
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

function formatPercentString(value: number, digits = 2): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const fixed = normalized.toFixed(digits);
  return String(Number(fixed));
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

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex, "#000000");
  const safeAlpha = clampNumber(Number(alpha), 0, 1, 1);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function subtitleAssScaleForCanvas(canvasScale: number): number {
  const safeCanvasScale = clampNumber(canvasScale, 0.1, 1, 0.26);
  const assToOutputScale = VIDEO_RENDER_HEIGHT / ASS_DEFAULT_PLAYRES_Y;
  return clampNumber(safeCanvasScale * assToOutputScale, 0.6, 3, 1.25);
}

function detectTemplateFontPreset(
  fontName: string | undefined,
  availableFonts: string[] = templateFontOptions
): string {
  const normalized = String(fontName || "").trim();
  if (!normalized) {
    return customTemplateFontOption;
  }
  return availableFonts.includes(normalized) ? normalized : customTemplateFontOption;
}

function buildRenderOptionsFromEditor(editor: TemplateEditorState): RenderOptions {
  const fontName = editor.fontName.trim() || "Noto Sans KR";
  const primaryBold = Boolean(editor.primaryBold);
  const primaryItalic = Boolean(editor.primaryItalic);
  const secondaryBold = Boolean(editor.secondaryBold);
  const secondaryItalic = Boolean(editor.secondaryItalic);
  const badgeBold = Boolean(editor.badgeBold);
  const badgeItalic = Boolean(editor.badgeItalic);
  const backgroundColor = normalizeHex(editor.backgroundColor, "#000000");
  const backgroundOpacity = clampNumber(Number(editor.backgroundOpacity), 0, 1, 0);
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
      backgroundColor,
      backgroundOpacity,
      paddingX: 8,
      paddingY: 4,
      shadowX: 2,
      shadowY: 2,
      shadowColor: "#000000",
      shadowOpacity: 1,
      fontThickness: clampNumber(Number(editor.primaryFontThickness), 0, 8, 0),
      fontName,
      fontBold: primaryBold,
      fontItalic: primaryItalic
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
            backgroundColor,
            backgroundOpacity,
            paddingX: 8,
            paddingY: 4,
            shadowX: 2,
            shadowY: 2,
            shadowColor: "#000000",
            shadowOpacity: 1,
            fontThickness: clampNumber(Number(editor.secondaryFontThickness), 0, 8, 0),
            fontName,
            fontBold: secondaryBold,
            fontItalic: secondaryItalic
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
      fontSize: clampNumber(Number(editor.badgeFontSize), 12, 60, 16),
      color: normalizeHex(editor.badgeColor, "#FFFFFF"),
      backgroundColor,
      backgroundOpacity,
      paddingX: 4,
      paddingY: 2,
      shadowX: 1,
      shadowY: 1,
      shadowColor: "#000000",
      shadowOpacity: 0.8,
      fontThickness: clampNumber(Number(editor.badgeFontThickness), 0, 8, 0),
      fontName,
      fontBold: badgeBold,
      fontItalic: badgeItalic
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
      fontSize: clampNumber(Number(layer.fontSize), 12, 120, 28),
      fontThickness: clampNumber(Number(layer.fontThickness), 0, 8, 0),
      color: normalizeHex(layer.color, "#FFFFFF"),
      backgroundColor: normalizeHex(layer.backgroundColor, backgroundColor),
      backgroundOpacity: clampNumber(Number(layer.backgroundOpacity), 0, 1, backgroundOpacity),
      paddingX: 8,
      paddingY: 4,
      shadowX: 2,
      shadowY: 2,
      shadowColor: "#000000",
      shadowOpacity: 1,
      fontName,
      fontBold: Boolean(layer.fontBold),
      fontItalic: Boolean(layer.fontItalic)
    }));

  return {
    subtitle: {
      ...BASE_SUBTITLE,
      fontSize: clampNumber(Number(editor.subtitleFontSize), 8, 120, 16),
      fontBold: Boolean(editor.subtitleBold),
      position:
        editor.subtitlePosition === "top" ||
        editor.subtitlePosition === "middle" ||
        editor.subtitlePosition === "bottom"
          ? editor.subtitlePosition
          : "bottom",
      subtitleYPercent: clampNumber(Number(editor.subtitleYPercent), 0, 100, 86),
      maxCharsPerCaption: clampNumber(Number(editor.subtitleMaxCharsPerCaption), 8, 60, 18)
    },
    overlay: {
      ...BASE_OVERLAY,
      showTitle: true,
      titleText: primaryText,
      titleFontName: fontName,
      titleFontBold: primaryBold,
      titleFontItalic: primaryItalic,
      titleFontSize: clampNumber(Number(editor.primaryFontSize), 12, 120, 52),
      titleColor: normalizeHex(editor.primaryColor, "#FFFFFF"),
      sceneMotionPreset: editor.motionPreset,
      motionSpeedPercent: clampNumber(Number(editor.motionSpeedPercent), 60, 220, 135),
      focusXPercent: clampNumber(Number(editor.focusXPercent), 0, 100, 50),
      focusYPercent: clampNumber(Number(editor.focusYPercent), 0, 100, 50),
      focusDriftPercent: clampNumber(Number(editor.focusDriftPercent), 0, 20, 6),
      focusZoomPercent: clampNumber(Number(editor.focusZoomPercent), 3, 20, 9),
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
  return String(clampNumber(Number(found?.[field]), 12, 200, fallback));
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
  return formatPercentString(clampNumber(Number(found?.[field]), min, max, fallback));
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
  const imageStyle = String(item.imageStyle || "").trim() || "Cinematic photo-real";
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
      x: formatPercentString(clampNumber(Number(layer.x), 0, 100, 50)),
      y: formatPercentString(clampNumber(Number(layer.y), 0, 100, 50)),
      width: formatPercentString(clampNumber(Number(layer.width), 20, 100, 60)),
      fontSize: String(clampNumber(Number(layer.fontSize), 12, 120, 28)),
      fontThickness: String(clampNumber(Number(layer.fontThickness), 0, 8, 0)),
      color: normalizeHex(layer.color || "", "#FFFFFF"),
      fontBold: Boolean(layer.fontBold),
      fontItalic: Boolean(layer.fontItalic),
      backgroundColor: normalizeHex(layer.backgroundColor || "", "#000000"),
      backgroundOpacity: String(clampNumber(Number(layer.backgroundOpacity), 0, 1, 0))
    }));

  return {
    templateName: item.templateName || "",
    imageStyle,
    imageStylePreset: detectImageStylePreset(imageStyle),
    sourceTitle: item.sourceTitle || "{{title}}",
    sourceTopic: item.sourceTopic || "{{topic}}",
    voice: (item.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed: String(clampNumber(Number(item.voiceSpeed), 0.5, 2, 1)),
    videoLengthSec: String(clampNumber(Number(item.videoLengthSec), 10, 180, 30)),
    sceneCount: String(clampNumber(Number(item.sceneCount), 3, 12, 5)),
    primaryText: extractLayerText(item.renderOptions, "__primary_title__", overlay.titleText || ""),
    primaryBold: extractLayerToggle(
      item.renderOptions,
      "__primary_title__",
      "fontBold",
      Boolean(overlay.titleFontBold)
    ),
    primaryItalic: extractLayerToggle(
      item.renderOptions,
      "__primary_title__",
      "fontItalic",
      Boolean(overlay.titleFontItalic)
    ),
    secondaryText: extractLayerText(item.renderOptions, "__secondary_title__", "{{topic}}"),
    secondaryEnabled: hasSecondaryLayer,
    secondaryBold: extractLayerToggle(
      item.renderOptions,
      "__secondary_title__",
      "fontBold",
      Boolean(overlay.titleFontBold)
    ),
    secondaryItalic: extractLayerToggle(
      item.renderOptions,
      "__secondary_title__",
      "fontItalic",
      Boolean(overlay.titleFontItalic)
    ),
    badgeText: extractLayerText(item.renderOptions, "__badge__", ""),
    badgeBold: extractLayerToggle(
      item.renderOptions,
      "__badge__",
      "fontBold",
      Boolean(overlay.titleFontBold)
    ),
    badgeItalic: extractLayerToggle(
      item.renderOptions,
      "__badge__",
      "fontItalic",
      Boolean(overlay.titleFontItalic)
    ),
    fontName:
      (overlay.titleTemplates || []).find((layer) => layer.id === "__primary_title__")?.fontName ||
      overlay.titleFontName ||
      "Noto Sans KR",
    fontBold: extractLayerToggle(
      item.renderOptions,
      "__primary_title__",
      "fontBold",
      Boolean(overlay.titleFontBold)
    ),
    fontItalic: extractLayerToggle(
      item.renderOptions,
      "__primary_title__",
      "fontItalic",
      Boolean(overlay.titleFontItalic)
    ),
    backgroundColor: normalizeHex(
      String((overlay.titleTemplates || []).find((layer) => layer.id === "__primary_title__")?.backgroundColor || ""),
      "#000000"
    ),
    backgroundOpacity: String(
      clampNumber(
        Number(
          (overlay.titleTemplates || []).find((layer) => layer.id === "__primary_title__")
            ?.backgroundOpacity
        ),
        0,
        1,
        0
      )
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
    subtitleFontSize: String(clampNumber(Number(item.renderOptions.subtitle.fontSize), 8, 120, 16)),
    subtitleBold: Boolean(item.renderOptions.subtitle.fontBold),
    subtitleMaxCharsPerCaption: String(
      clampNumber(Number(item.renderOptions.subtitle.maxCharsPerCaption), 8, 60, 18)
    ),
    subtitleYPercent: formatPercentString(
      clampNumber(Number(item.renderOptions.subtitle.subtitleYPercent), 0, 100, 86)
    ),
    subtitleSampleText: SAMPLE_NARRATION,
    videoLayout: overlay.videoLayout === "panel_16_9" ? "panel_16_9" : "fill_9_16",
    panelTopPercent: formatPercentString(clampNumber(Number(overlay.panelTopPercent), 0, 85, 34)),
    panelWidthPercent: formatPercentString(
      clampNumber(Number(overlay.panelWidthPercent), 60, 100, 100)
    ),
    motionPreset:
      overlay.sceneMotionPreset === "up_down" ||
      overlay.sceneMotionPreset === "left_right" ||
      overlay.sceneMotionPreset === "random" ||
      overlay.sceneMotionPreset === "focus_smooth"
        ? overlay.sceneMotionPreset
        : "gentle_zoom",
    motionSpeedPercent: String(clampNumber(Number(overlay.motionSpeedPercent), 60, 220, 135)),
    focusXPercent: formatPercentString(clampNumber(Number(overlay.focusXPercent), 0, 100, 50)),
    focusYPercent: formatPercentString(clampNumber(Number(overlay.focusYPercent), 0, 100, 50)),
    focusDriftPercent: formatPercentString(clampNumber(Number(overlay.focusDriftPercent), 0, 20, 6)),
    focusZoomPercent: formatPercentString(clampNumber(Number(overlay.focusZoomPercent), 3, 20, 9)),
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
  mode: "move" | "resize-left" | "resize-right";
  rect: { left: number; top: number; width: number; height: number };
  startX: number;
  startY: number;
  initialPercentX?: number;
  initialPercentY: number;
  initialPercentWidth?: number;
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";
type TemplateImportPayload = {
  templateName?: string;
  imageStyle?: string;
  sourceTitle?: string;
  sourceTopic?: string;
  voice?: string;
  voiceSpeed?: number;
  videoLengthSec?: number;
  sceneCount?: number;
  renderOptions: RenderOptions;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImportedTemplates(value: unknown): TemplateImportPayload[] {
  let candidates: unknown[] = [];
  if (Array.isArray(value)) {
    candidates = value;
  } else if (isRecord(value) && Array.isArray(value.templates)) {
    candidates = value.templates;
  } else if (isRecord(value)) {
    candidates = [value];
  } else {
    throw new Error("JSON 형식이 올바르지 않습니다. 객체 또는 배열이어야 합니다.");
  }

  const normalized: TemplateImportPayload[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    if (!isRecord(item)) {
      throw new Error(`템플릿 ${index + 1}: 객체 형식이 아닙니다.`);
    }
    const renderOptions = item.renderOptions;
    if (
      !isRecord(renderOptions) ||
      !isRecord(renderOptions.overlay) ||
      !isRecord(renderOptions.subtitle)
    ) {
      throw new Error(`템플릿 ${index + 1}: renderOptions(overlay/subtitle)가 필요합니다.`);
    }
    const voiceSpeedRaw = Number(item.voiceSpeed);
    const videoLengthSecRaw = Number(item.videoLengthSec);
    const sceneCountRaw = Number(item.sceneCount);
    normalized.push({
      templateName:
        typeof item.templateName === "string" && item.templateName.trim()
          ? item.templateName.trim()
          : undefined,
      imageStyle:
        typeof item.imageStyle === "string" && item.imageStyle.trim()
          ? item.imageStyle.trim()
          : undefined,
      sourceTitle:
        typeof item.sourceTitle === "string" && item.sourceTitle.trim()
          ? item.sourceTitle.trim()
          : undefined,
      sourceTopic:
        typeof item.sourceTopic === "string" && item.sourceTopic.trim()
          ? item.sourceTopic.trim()
          : undefined,
      voice:
        typeof item.voice === "string" && item.voice.trim()
          ? item.voice.trim().toLowerCase()
          : undefined,
      voiceSpeed: Number.isFinite(voiceSpeedRaw)
        ? clampNumber(voiceSpeedRaw, 0.5, 2, 1)
        : undefined,
      videoLengthSec: Number.isFinite(videoLengthSecRaw)
        ? Math.round(clampNumber(videoLengthSecRaw, 10, 180, 30))
        : undefined,
      sceneCount: Number.isFinite(sceneCountRaw)
        ? Math.round(clampNumber(sceneCountRaw, 3, 12, 5))
        : undefined,
      renderOptions: renderOptions as unknown as RenderOptions
    });
  }
  if (normalized.length === 0) {
    throw new Error("가져올 템플릿이 없습니다.");
  }
  return normalized;
}

function buildTemplatePayload(editor: TemplateEditorState, renderOptions: RenderOptions): {
  templateName: string;
  imageStyle: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: number;
  videoLengthSec: number;
  sceneCount: number;
  renderOptions: RenderOptions;
} {
  const voiceSpeed = clampNumber(Number(editor.voiceSpeed), 0.5, 2, 1);
  const videoLengthSec = Math.round(clampNumber(Number(editor.videoLengthSec), 10, 180, 30));
  const sceneCount = Math.round(clampNumber(Number(editor.sceneCount), 3, 12, 5));
  const imageStyle =
    editor.imageStylePreset === customStyleOption
      ? editor.imageStyle.trim()
      : editor.imageStylePreset.trim();
  return {
    templateName: editor.templateName.trim(),
    imageStyle: imageStyle || "Cinematic photo-real",
    sourceTitle: editor.sourceTitle.trim(),
    sourceTopic: editor.sourceTopic.trim(),
    voice: (editor.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed,
    videoLengthSec,
    sceneCount,
    renderOptions
  };
}

function buildPayloadSignature(payload: {
  templateName: string;
  imageStyle: string;
  sourceTitle: string;
  sourceTopic: string;
  voice: string;
  voiceSpeed: number;
  videoLengthSec: number;
  sceneCount: number;
  renderOptions: RenderOptions;
}): string {
  return JSON.stringify(payload);
}

function buildTemplateSignature(item: AutomationTemplateItem): string {
  return JSON.stringify({
    templateName: String(item.templateName || "").trim(),
    imageStyle: String(item.imageStyle || "").trim() || "Cinematic photo-real",
    sourceTitle: String(item.sourceTitle || "").trim(),
    sourceTopic: String(item.sourceTopic || "").trim(),
    voice: String(item.voice || "alloy").trim().toLowerCase() || "alloy",
    voiceSpeed: clampNumber(Number(item.voiceSpeed), 0.5, 2, 1),
    videoLengthSec: Math.round(clampNumber(Number(item.videoLengthSec), 10, 180, 30)),
    sceneCount: Math.round(clampNumber(Number(item.sceneCount), 3, 12, 5)),
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
  const [previewCanvasWidth, setPreviewCanvasWidth] = useState(0);
  const [previewPaneWidth, setPreviewPaneWidth] = useState(360);
  const [previewFollowOffset, setPreviewFollowOffset] = useState(0);
  const [templateSelectOpen, setTemplateSelectOpen] = useState(true);
  const [templateNameOpen, setTemplateNameOpen] = useState(true);
  const [voiceSectionOpen, setVoiceSectionOpen] = useState(true);
  const [templateImportJson, setTemplateImportJson] = useState("");
  const [templateImportMessage, setTemplateImportMessage] = useState<string>();
  const [templateImportError, setTemplateImportError] = useState<string>();
  const [readySheetRowsForFontCheck, setReadySheetRowsForFontCheck] = useState<SheetContentRow[]>([]);
  const [fontLanguageNotice, setFontLanguageNotice] = useState<string>();
  const [localFontNames, setLocalFontNames] = useState<string[]>([]);
  const [localFontLoading, setLocalFontLoading] = useState(false);
  const [localFontMessage, setLocalFontMessage] = useState<string>();
  const [templateFontQuery, setTemplateFontQuery] = useState("");
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const templateLayoutRef = useRef<HTMLDivElement | null>(null);
  const previewFollowRef = useRef<HTMLDivElement | null>(null);
  const templateImportFileRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    const node = previewCanvasRef.current;
    if (!node) {
      return;
    }
    const updateSize = (): void => {
      const width = node.getBoundingClientRect().width;
      setPreviewCanvasWidth((prev) => (Math.abs(prev - width) > 0.5 ? width : prev));
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/sheet-rows", { cache: "no-store" });
        const data = (await response.json()) as { rows?: SheetContentRow[] };
        if (!mounted || !response.ok) {
          return;
        }
        setReadySheetRowsForFontCheck(data.rows || []);
      } catch {
        // Ignore row lookup failures for optional font warning.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(min-width: 1024px)");
    let rafId = 0;

    const updateFollowOffset = (): void => {
      const layoutNode = templateLayoutRef.current;
      const previewNode = previewFollowRef.current;
      if (!layoutNode || !previewNode || !media.matches) {
        setPreviewFollowOffset(0);
        return;
      }

      const layoutRect = layoutNode.getBoundingClientRect();
      const previewHeight = previewNode.offsetHeight;
      const topOffset = 16;
      const maxOffset = Math.max(0, layoutNode.scrollHeight - previewHeight);
      const desiredOffset = topOffset - layoutRect.top;
      const nextOffset = clampNumber(desiredOffset, 0, maxOffset, 0);
      setPreviewFollowOffset((prev) => (Math.abs(prev - nextOffset) > 0.5 ? nextOffset : prev));
    };

    const scheduleUpdate = (): void => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(updateFollowOffset);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    media.addEventListener("change", scheduleUpdate);

    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => scheduleUpdate());
    if (observer) {
      if (templateLayoutRef.current) {
        observer.observe(templateLayoutRef.current);
      }
      if (previewFollowRef.current) {
        observer.observe(previewFollowRef.current);
      }
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      media.removeEventListener("change", scheduleUpdate);
      observer?.disconnect();
    };
  }, [previewPaneWidth]);

  const builtRenderOptions = useMemo(() => buildRenderOptionsFromEditor(editor), [editor]);
  const availableVoiceOptions = useMemo(() => {
    const provider = resolveTtsVoiceProvider(ttsProviderSettings);
    const filtered = filterVoiceOptions(provider);
    return filtered.length > 0 ? filtered : ALL_VOICE_OPTIONS;
  }, [ttsProviderSettings]);
  const selectedVoiceHint = useMemo(() => getVoiceHint(editor.voice), [editor.voice]);
  const previewTemplates = builtRenderOptions.overlay.titleTemplates || [];
  const templatePreviewScale = useMemo(() => {
    const liveCanvasWidth = previewCanvasWidth || previewCanvasRef.current?.getBoundingClientRect().width || 0;
    if (Number.isFinite(liveCanvasWidth) && liveCanvasWidth > 0) {
      return clampNumber(liveCanvasWidth / VIDEO_RENDER_WIDTH, 0.12, 1, 0.28);
    }
    return 0.28;
  }, [previewCanvasWidth]);
  const subtitlePreviewRenderScale = useMemo(
    () => subtitleAssScaleForCanvas(templatePreviewScale),
    [templatePreviewScale]
  );
  const titlePreviewRenderScale = templatePreviewScale;
  const subtitlePreviewFontSize = useMemo(
    () =>
      clampNumber(
        Number(editor.subtitleFontSize) * subtitlePreviewRenderScale,
        8,
        120,
        24
      ),
    [editor.subtitleFontSize, subtitlePreviewRenderScale]
  );
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
  const templateLayoutStyle = useMemo(
    () =>
      ({
        ["--tpl-preview-width" as const]: `${clampNumber(previewPaneWidth, 280, 560, 360)}px`
      }) as CSSProperties,
    [previewPaneWidth]
  );
  const availableTemplateFonts = useMemo(
    () => mergeFontOptions(templateFontOptions, localFontNames),
    [localFontNames]
  );
  const filteredTemplateFonts = useMemo(() => {
    const q = templateFontQuery.trim().toLowerCase();
    if (!q) {
      return availableTemplateFonts;
    }
    return availableTemplateFonts.filter((name) => name.toLowerCase().includes(q));
  }, [availableTemplateFonts, templateFontQuery]);
  const notifyFontLanguageSupport = useCallback(
    (fontName: string): void => {
      const notice = buildFontUnsupportedLanguageNotice(fontName, readySheetRowsForFontCheck);
      setFontLanguageNotice(notice);
    },
    [readySheetRowsForFontCheck]
  );
  const loadLocalFonts = useCallback(async (): Promise<void> => {
    if (!isLocalFontAccessSupported()) {
      setLocalFontMessage("현재 브라우저는 설치 폰트 조회를 지원하지 않습니다.");
      return;
    }
    setLocalFontLoading(true);
    setLocalFontMessage(undefined);
    try {
      const names = await queryInstalledFontNames();
      setLocalFontNames(names);
      setLocalFontMessage(
        names.length > 0 ? `설치 폰트 ${names.length}개를 불러왔습니다.` : "설치 폰트를 찾지 못했습니다."
      );
    } catch (error) {
      setLocalFontMessage(
        error instanceof Error
          ? `설치 폰트 조회 실패: ${error.message}`
          : "설치 폰트 조회에 실패했습니다."
      );
    } finally {
      setLocalFontLoading(false);
    }
  }, []);

  useEffect(() => {
    notifyFontLanguageSupport(editor.fontName);
  }, [editor.fontName, notifyFontLanguageSupport]);

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

  function updateLayerPosition(
    target: DragTarget,
    nextX?: number,
    nextY?: number,
    nextWidth?: number
  ): void {
    setEditor((prev) => {
      if (target === "__primary_title__") {
        return {
          ...prev,
          primaryX:
            nextX === undefined
              ? prev.primaryX
              : formatPercentString(clampNumber(nextX, 0, 100, Number(prev.primaryX))),
          primaryY:
            nextY === undefined
              ? prev.primaryY
              : formatPercentString(clampNumber(nextY, 0, 100, Number(prev.primaryY))),
          primaryWidth:
            nextWidth === undefined
              ? prev.primaryWidth
              : formatPercentString(clampNumber(nextWidth, 20, 100, Number(prev.primaryWidth)))
        };
      }
      if (target === "__secondary_title__") {
        return {
          ...prev,
          secondaryX:
            nextX === undefined
              ? prev.secondaryX
              : formatPercentString(clampNumber(nextX, 0, 100, Number(prev.secondaryX))),
          secondaryY:
            nextY === undefined
              ? prev.secondaryY
              : formatPercentString(clampNumber(nextY, 0, 100, Number(prev.secondaryY))),
          secondaryWidth:
            nextWidth === undefined
              ? prev.secondaryWidth
              : formatPercentString(clampNumber(nextWidth, 20, 100, Number(prev.secondaryWidth)))
        };
      }
      if (target === "__badge__") {
        return {
          ...prev,
          badgeX:
            nextX === undefined
              ? prev.badgeX
              : formatPercentString(clampNumber(nextX, 0, 100, Number(prev.badgeX))),
          badgeY:
            nextY === undefined
              ? prev.badgeY
              : formatPercentString(clampNumber(nextY, 0, 100, Number(prev.badgeY))),
          badgeWidth:
            nextWidth === undefined
              ? prev.badgeWidth
              : formatPercentString(clampNumber(nextWidth, 20, 100, Number(prev.badgeWidth)))
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
              nextX === undefined
                ? layer.x
                : formatPercentString(clampNumber(nextX, 0, 100, Number(layer.x))),
            y:
              nextY === undefined
                ? layer.y
                : formatPercentString(clampNumber(nextY, 0, 100, Number(layer.y))),
            width:
              nextWidth === undefined
                ? layer.width
                : formatPercentString(clampNumber(nextWidth, 20, 100, Number(layer.width)))
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
            : formatPercentString(clampNumber(nextY, 0, 100, Number(prev.subtitleYPercent)))
      };
    });
  }

  function beginDrag(
    target: DragTarget,
    event: React.PointerEvent<HTMLElement>,
    mode: DragState["mode"],
    initialPercentX?: number,
    initialPercentY?: number,
    initialPercentWidth?: number
  ): void {
    if (!previewCanvasRef.current) {
      return;
    }
    const rect = previewCanvasRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      target,
      mode,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      startX: event.clientX,
      startY: event.clientY,
      initialPercentX,
      initialPercentY: initialPercentY ?? 50,
      initialPercentWidth
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
    const initialX = drag.initialPercentX ?? 50;
    if (drag.mode === "move") {
      const nextX = initialX + dx;
      updateLayerPosition(drag.target, nextX, nextY);
      return;
    }

    const initialWidth = clampNumber(drag.initialPercentWidth ?? 60, 20, 100, 60);
    const initialLeft = initialX - initialWidth / 2;
    const initialRight = initialX + initialWidth / 2;

    if (drag.mode === "resize-right") {
      const nextRight = initialRight + dx;
      const nextWidth = clampNumber(nextRight - initialLeft, 20, 100, initialWidth);
      const nextX = initialLeft + nextWidth / 2;
      updateLayerPosition(drag.target, nextX, undefined, nextWidth);
      return;
    }

    const nextLeft = initialLeft + dx;
    const nextWidth = clampNumber(initialRight - nextLeft, 20, 100, initialWidth);
    const nextX = initialRight - nextWidth / 2;
    updateLayerPosition(drag.target, nextX, undefined, nextWidth);
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
          color: "#FFFFFF",
          fontBold: prev.fontBold,
          fontItalic: prev.fontItalic,
          backgroundColor: prev.backgroundColor,
          backgroundOpacity: prev.backgroundOpacity
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
                imageStyle: currentPayload.imageStyle || undefined,
                sourceTitle: currentPayload.sourceTitle || undefined,
                sourceTopic: currentPayload.sourceTopic || undefined,
                voice: currentPayload.voice || undefined,
                voiceSpeed: currentPayload.voiceSpeed,
                videoLengthSec: currentPayload.videoLengthSec,
                sceneCount: currentPayload.sceneCount,
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
          imageStyle: currentPayload.imageStyle || undefined,
          sourceTitle: editor.sourceTitle.trim() || undefined,
          sourceTopic: editor.sourceTopic.trim() || undefined,
          voice: currentPayload.voice || undefined,
          voiceSpeed: currentPayload.voiceSpeed,
          videoLengthSec: currentPayload.videoLengthSec,
          sceneCount: currentPayload.sceneCount,
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
          imageStyle: currentPayload.imageStyle || undefined,
          sourceTitle: editor.sourceTitle.trim() || undefined,
          sourceTopic: editor.sourceTopic.trim() || undefined,
          voice: currentPayload.voice || undefined,
          voiceSpeed: currentPayload.voiceSpeed,
          videoLengthSec: currentPayload.videoLengthSec,
          sceneCount: currentPayload.sceneCount,
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

  async function importTemplatesFromJsonText(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) {
      setTemplateImportError("JSON 텍스트를 입력해 주세요.");
      setTemplateImportMessage(undefined);
      return;
    }
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    setTemplateImportError(undefined);
    setTemplateImportMessage(undefined);
    try {
      const parsed = JSON.parse(text) as unknown;
      const payloads = normalizeImportedTemplates(parsed);
      for (const payload of payloads) {
        const response = await fetch("/api/automation-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await readJsonResponse<AutomationTemplateResponse>(response);
        if (!response.ok) {
          throw new Error(data.error || "템플릿 가져오기에 실패했습니다.");
        }
      }
      await refreshTemplates();
      setTemplateImportMessage(`${payloads.length}개 템플릿을 추가했습니다.`);
      setSuccess(`${payloads.length}개 템플릿을 추가했습니다.`);
    } catch (importError) {
      const message =
        importError instanceof Error ? importError.message : "템플릿 추가에 실패했습니다.";
      setTemplateImportError(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function onTemplateImportFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    void (async () => {
      try {
        const text = await file.text();
        setTemplateImportJson(text);
        await importTemplatesFromJsonText(text);
      } catch (fileError) {
        setTemplateImportError(
          fileError instanceof Error ? fileError.message : "템플릿 파일 읽기에 실패했습니다."
        );
      }
    })();
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

  function onImageStylePresetChange(value: string): void {
    setEditor((prev) => {
      if (value === customStyleOption) {
        return {
          ...prev,
          imageStylePreset: customStyleOption
        };
      }
      return {
        ...prev,
        imageStylePreset: value,
        imageStyle: value
      };
    });
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-xs text-muted-foreground">좌/우 너비</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPreviewPaneWidth((prev) => clampNumber(prev - 20, 280, 560, 360))}
              >
                -
              </Button>
              <Input
                type="range"
                min={280}
                max={560}
                step={10}
                value={previewPaneWidth}
                onChange={(event) =>
                  setPreviewPaneWidth(clampNumber(Number(event.target.value), 280, 560, 360))
                }
                className="h-2 w-28 border-0 px-0 lg:w-40"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPreviewPaneWidth((prev) => clampNumber(prev + 20, 280, 560, 360))}
              >
                +
              </Button>
              <span className="w-12 text-right text-xs text-muted-foreground">
                {previewPaneWidth}px
              </span>
            </div>
            <Button type="button" variant="outline" onClick={() => void refreshTemplates()} disabled={busy}>
              새로고침
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={templateLayoutRef}
        className="grid gap-4 lg:items-start lg:[grid-template-columns:minmax(280px,var(--tpl-preview-width))_minmax(0,1fr)]"
        style={templateLayoutStyle}
      >
        <div
          className="order-2 min-w-0 space-y-4 overflow-hidden break-words rounded-xl border bg-card p-4 lg:order-2"
          onPointerDownCapture={() => setSelectedPreviewLayerId(null)}
        >
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">템플릿 선택</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setTemplateSelectOpen((prev) => !prev)}
              >
                {templateSelectOpen ? "접기" : "펼치기"}
                {templateSelectOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
              </Button>
            </div>
            {templateSelectOpen ? (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 2xl:grid-cols-[1fr,1fr,auto]">
                  <div className="space-y-1">
                    <Label>저장된 템플릿</Label>
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        selectedTemplateId !== "__new__" ? void removeTemplate(selectedTemplateId) : undefined
                      }
                      disabled={busy || selectedTemplateId === "__new__"}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      선택 삭제
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
                  <p className="text-xs text-muted-foreground">
                    {autoSaveMessage || "새 템플릿은 수동 저장이 필요합니다."}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">템플릿 이름</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setTemplateNameOpen((prev) => !prev)}
              >
                {templateNameOpen ? "접기" : "펼치기"}
                {templateNameOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
              </Button>
            </div>
            {templateNameOpen ? (
              <div className="mt-3 space-y-1">
                <Input
                  value={editor.templateName}
                  onChange={(event) => setEditor((prev) => ({ ...prev, templateName: event.target.value }))}
                  placeholder="예: 뉴스형 자막 템플릿"
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>폰트명</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void loadLocalFonts()}
                  disabled={localFontLoading}
                >
                  {localFontLoading ? "불러오는 중..." : "설치 폰트 불러오기"}
                </Button>
              </div>
              <Select
                value={detectTemplateFontPreset(editor.fontName, availableTemplateFonts)}
                onValueChange={(value) => {
                  setEditor((prev) => ({
                    ...prev,
                    fontName: value === customTemplateFontOption ? prev.fontName : value
                  }));
                  setTemplateFontQuery("");
                }}
              >
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue placeholder="폰트 선택" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      value={templateFontQuery}
                      onChange={(event) => setTemplateFontQuery(event.target.value)}
                      placeholder="폰트 검색"
                      className="h-8"
                    />
                  </div>
                  {filteredTemplateFonts.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {filteredTemplateFonts.length === 0 ? (
                    <SelectItem value="__font_no_match__" disabled>
                      검색 결과 없음
                    </SelectItem>
                  ) : null}
                  <SelectItem value={customTemplateFontOption}>직접 입력</SelectItem>
                </SelectContent>
              </Select>
              {localFontMessage ? (
                <p className="text-xs text-muted-foreground">{localFontMessage}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>폰트 스타일</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editor.fontBold ? "default" : "outline"}
                  onClick={() =>
                    setEditor((prev) => {
                      const next = !prev.fontBold;
                      return {
                        ...prev,
                        fontBold: next,
                        primaryBold: next,
                        secondaryBold: next,
                        badgeBold: next
                      };
                    })
                  }
                >
                  Bold
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editor.fontItalic ? "default" : "outline"}
                  onClick={() =>
                    setEditor((prev) => {
                      const next = !prev.fontItalic;
                      return {
                        ...prev,
                        fontItalic: next,
                        primaryItalic: next,
                        secondaryItalic: next,
                        badgeItalic: next
                      };
                    })
                  }
                >
                  Italic
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>텍스트 배경색</Label>
              <Input
                type="color"
                value={normalizeHex(editor.backgroundColor, "#000000")}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    backgroundColor: event.target.value
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>배경 투명도(%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(clampNumber(Number(editor.backgroundOpacity), 0, 1, 0) * 100)}
                onChange={(event) =>
                  setEditor((prev) => ({
                    ...prev,
                    backgroundOpacity: String(
                      clampNumber(Number(event.target.value), 0, 100, 0) / 100
                    )
                  }))
                }
              />
            </div>
          </div>
          {detectTemplateFontPreset(editor.fontName, availableTemplateFonts) ===
          customTemplateFontOption ? (
            <div className="space-y-1">
              <Label>사용자 지정 폰트명</Label>
              <Input
                value={editor.fontName}
                onChange={(event) => setEditor((prev) => ({ ...prev, fontName: event.target.value }))}
                placeholder="예: Noto Sans KR"
              />
            </div>
          ) : null}
          {fontLanguageNotice ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
              {fontLanguageNotice}
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

          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>이미지 스타일 프리셋</Label>
              <Select value={editor.imageStylePreset} onValueChange={onImageStylePresetChange}>
                <SelectTrigger className="bg-card dark:bg-zinc-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageStylePresets.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                  <SelectItem value={customStyleOption}>Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>이미지 스타일 프롬프트</Label>
              <Input
                value={editor.imageStyle}
                onChange={(event) =>
                  setEditor((prev) => {
                    const nextStyle = event.target.value;
                    return {
                      ...prev,
                      imageStyle: nextStyle,
                      imageStylePreset: detectImageStylePreset(nextStyle)
                    };
                  })
                }
                placeholder="예: Cinematic photo-real"
              />
            </div>
          </div>

          <ImageStyleSnapshot styleText={editor.imageStyle} />

          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">오디오 보이스</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setVoiceSectionOpen((prev) => !prev)}
              >
                {voiceSectionOpen ? "접기" : "펼치기"}
                {voiceSectionOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
              </Button>
            </div>
            {voiceSectionOpen ? (
              <div className="mt-3">
                <div className="grid items-end gap-2 md:grid-cols-[1fr,140px,auto]">
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
                            {item.label} · {item.hint || getVoiceHint(item.id)}
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
                <p className="mt-2 text-xs text-muted-foreground">선택 보이스 특성: {selectedVoiceHint}</p>
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
            ) : null}
          </div>

          <div className="rounded-md border p-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold">자동화 생성 기본값</p>
              <p className="text-xs text-muted-foreground">
                이 템플릿으로 자동화 실행할 때 기본 분할 장면 수와 영상 길이를 사용합니다.
              </p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>영상 길이(초)</Label>
                <Input
                  type="number"
                  min={10}
                  max={180}
                  step={1}
                  value={editor.videoLengthSec}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      videoLengthSec: String(event.target.value ?? "")
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>장면 수(이미지 분할)</Label>
                <Select
                  value={editor.sceneCount}
                  onValueChange={(value) =>
                    setEditor((prev) => ({
                      ...prev,
                      sceneCount: value
                    }))
                  }
                >
                  <SelectTrigger className="bg-card dark:bg-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateSceneCountOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}장면
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
          <div className="space-y-2 rounded-md border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">포커스 모션 옵션</p>
              <p className="text-xs text-muted-foreground">
                영상 생성의 모션 옵션과 동일하게 적용됩니다. 중심점, 이동 범위, 줌 강도를 템플릿 단계에서 미리 저장할 수 있습니다.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label>포커스 X(%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editor.focusXPercent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      focusXPercent: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>포커스 Y(%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editor.focusYPercent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      focusYPercent: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>이동 범위(%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={editor.focusDriftPercent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      focusDriftPercent: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>줌 강도(%)</Label>
                <Input
                  type="number"
                  min={3}
                  max={20}
                  step={0.5}
                  value={editor.focusZoomPercent}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      focusZoomPercent: event.target.value
                    }))
                  }
                />
              </div>
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
                <div className="flex items-center justify-between gap-2">
                  <Label>기본 타이틀 텍스트</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.primaryBold ? "default" : "outline"}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          primaryBold: !prev.primaryBold
                        }))
                      }
                    >
                      Bold
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.primaryItalic ? "default" : "outline"}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          primaryItalic: !prev.primaryItalic
                        }))
                      }
                    >
                      Italic
                    </Button>
                  </div>
                </div>
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
                  min={12}
                  max={120}
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
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.secondaryBold ? "default" : "outline"}
                      disabled={!editor.secondaryEnabled}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          secondaryBold: !prev.secondaryBold
                        }))
                      }
                    >
                      Bold
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.secondaryItalic ? "default" : "outline"}
                      disabled={!editor.secondaryEnabled}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          secondaryItalic: !prev.secondaryItalic
                        }))
                      }
                    >
                      Italic
                    </Button>
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
                  min={12}
                  max={120}
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
                <div className="flex items-center justify-between gap-2">
                  <Label>상단 배지 텍스트 (선택)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.badgeBold ? "default" : "outline"}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          badgeBold: !prev.badgeBold
                        }))
                      }
                    >
                      Bold
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editor.badgeItalic ? "default" : "outline"}
                      onClick={() =>
                        setEditor((prev) => ({
                          ...prev,
                          badgeItalic: !prev.badgeItalic
                        }))
                      }
                    >
                      Italic
                    </Button>
                  </div>
                </div>
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
                  min={12}
                  max={60}
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
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={layer.fontBold ? "default" : "outline"}
                        onClick={() =>
                          updateCustomLayer(layer.id, { fontBold: !layer.fontBold })
                        }
                      >
                        Bold
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={layer.fontItalic ? "default" : "outline"}
                        onClick={() =>
                          updateCustomLayer(layer.id, { fontItalic: !layer.fontItalic })
                        }
                      >
                        Italic
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCustomLayer(layer.id)}
                      >
                        삭제
                      </Button>
                    </div>
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
                        min={12}
                        max={120}
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
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>배경색</Label>
                      <Input
                        type="color"
                        value={normalizeHex(layer.backgroundColor, "#000000")}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, { backgroundColor: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>배경 투명도(%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(
                          clampNumber(Number(layer.backgroundOpacity), 0, 1, 0) * 100
                        )}
                        onFocus={() => setSelectedPreviewLayerId(layer.id)}
                        onChange={(event) =>
                          updateCustomLayer(layer.id, {
                            backgroundOpacity: String(
                              clampNumber(Number(event.target.value), 0, 100, 0) / 100
                            )
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(130px,0.9fr)_minmax(110px,0.8fr)]">
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 예시 텍스트</Label>
                <Input
                  value={editor.subtitleSampleText}
                  onChange={(event) => setEditor((prev) => ({ ...prev, subtitleSampleText: event.target.value }))}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 위치</Label>
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
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 굵게</Label>
                <Button
                  type="button"
                  variant={editor.subtitleBold ? "default" : "outline"}
                  className="w-full"
                  onClick={() =>
                    setEditor((prev) => ({
                      ...prev,
                      subtitleBold: !prev.subtitleBold
                    }))
                  }
                >
                  Bold
                </Button>
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 크기</Label>
                <Input
                  type="number"
                  min={8}
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
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 최대 글자수</Label>
                <Input
                  type="number"
                  min={8}
                  max={60}
                  value={editor.subtitleMaxCharsPerCaption}
                  onChange={(event) =>
                    setEditor((prev) => ({
                      ...prev,
                      subtitleMaxCharsPerCaption: event.target.value
                    }))
                  }
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="whitespace-nowrap">자막 Y(%)</Label>
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

          <div className="rounded-md border p-3">
            <Label className="text-sm font-semibold">템플릿 JSON 추가</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              JSON 텍스트를 붙여넣거나 파일을 선택해 템플릿을 일괄 추가할 수 있습니다.
            </p>
            <div className="mt-3 space-y-2">
              <Textarea
                rows={6}
                value={templateImportJson}
                onChange={(event) => {
                  setTemplateImportJson(event.target.value);
                  if (templateImportError) {
                    setTemplateImportError(undefined);
                  }
                }}
                placeholder='{"templateName":"예시","renderOptions":{"subtitle":{},"overlay":{}}}'
              />
              <input
                ref={templateImportFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onTemplateImportFileChange}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => templateImportFileRef.current?.click()}
                  disabled={busy}
                >
                  JSON 파일 선택
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void importTemplatesFromJsonText(templateImportJson)}
                  disabled={busy}
                >
                  JSON 텍스트로 추가
                </Button>
              </div>
              {templateImportError ? (
                <p className="text-xs text-destructive">{templateImportError}</p>
              ) : templateImportMessage ? (
                <p className="text-xs text-emerald-500">{templateImportMessage}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  형식: 템플릿 객체 1개, 템플릿 배열, 또는 {"{ templates: [...] }"} 형태를 지원합니다.
                </p>
              )}
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

        <div className="order-1 min-w-0 self-start lg:order-1">
          <div
            ref={previewFollowRef}
            className="h-fit space-y-3 overflow-hidden break-words rounded-xl border bg-card p-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
            style={{
              transform: previewFollowOffset > 0 ? `translateY(${previewFollowOffset}px)` : undefined
            }}
          >
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
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedPreviewLayerId(null);
                }
              }}
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
                const baseText = materializePreviewText({
                  text: item.text || "",
                  sourceTitle: editor.sourceTitle,
                  sourceTopic: editor.sourceTopic
                });
                const text = wrapTemplateTextLikeEngine({
                  text: baseText,
                  widthPercent: clampNumber(Number(item.width), 20, 100, 70),
                  fontSize: clampNumber(Number(item.fontSize), 12, 120, 28)
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
                      fontSize: `${clampNumber(Number(item.fontSize), 12, 120, 28) * titlePreviewRenderScale}px`,
                      fontFamily: item.fontName || editor.fontName || "Noto Sans KR",
                      fontWeight: item.fontBold ? 700 : 400,
                      fontStyle: item.fontItalic ? "italic" : "normal",
                      whiteSpace: "pre-line",
                      overflowWrap: "normal",
                      wordBreak: "normal",
                      overflow: "hidden",
                      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                      WebkitTextStrokeWidth: `${
                        clampNumber(Number(item.fontThickness), 0, 8, 0) *
                        (0.2 * (titlePreviewRenderScale / 0.42))
                      }px`,
                      WebkitTextStrokeColor: "rgba(0,0,0,0.85)",
                      backgroundColor: isSelected
                        ? "rgba(8,145,178,0.16)"
                        : hexToRgba(
                            normalizeHex(item.backgroundColor || "", "#000000"),
                            clampNumber(Number(item.backgroundOpacity), 0, 1, 0)
                          )
                    }}
                    onPointerDown={(event) => {
                      beginDrag(
                        item.id,
                        event,
                        "move",
                        clampNumber(Number(item.x), 0, 100, 50),
                        clampNumber(Number(item.y), 0, 100, 50),
                        clampNumber(Number(item.width), 20, 100, 70)
                      );
                    }}
                  >
                    {isSelected ? (
                      <>
                        <button
                          type="button"
                          className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-cyan-200 bg-cyan-500/90"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            beginDrag(
                              item.id,
                              event,
                              "resize-left",
                              clampNumber(Number(item.x), 0, 100, 50),
                              clampNumber(Number(item.y), 0, 100, 50),
                              clampNumber(Number(item.width), 20, 100, 70)
                            );
                          }}
                          title="왼쪽 핸들 너비 조절"
                        />
                        <button
                          type="button"
                          className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-cyan-200 bg-cyan-500/90"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            beginDrag(
                              item.id,
                              event,
                              "resize-right",
                              clampNumber(Number(item.x), 0, 100, 50),
                              clampNumber(Number(item.y), 0, 100, 50),
                              clampNumber(Number(item.width), 20, 100, 70)
                            );
                          }}
                          title="오른쪽 핸들 너비 조절"
                        />
                      </>
                    ) : null}
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
                    "move",
                    undefined,
                    clampNumber(Number(editor.subtitleYPercent), 0, 100, 86)
                  )
                }
              >
                <p
                  className="whitespace-pre-wrap"
                  style={{
                    fontSize: `${subtitlePreviewFontSize}px`,
                    fontWeight: editor.subtitleBold ? 700 : 400,
                    overflowWrap: "anywhere",
                    wordBreak: "break-word"
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
    </div>
  );
}
