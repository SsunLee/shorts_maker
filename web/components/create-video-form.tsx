"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ALL_VOICE_OPTIONS } from "@/lib/voice-options";
import {
  ImageAspectRatio,
  RenderOptions,
  SheetContentRow,
  SubtitleCue,
  TitleTemplateItem,
  VideoCanvasLayout,
  VideoWorkflow
} from "@/lib/types";

const voiceSpeedOptions = ["0.75", "0.9", "1", "1.1", "1.25", "1.5"];
const sceneCountOptions = ["3", "4", "5", "6", "8", "10", "12"];
const CREATE_DRAFT_KEY = "shorts-maker:create-draft:v1";
const CREATE_WORKFLOW_ID_KEY = "shorts-maker:create-workflow-id:v1";
const RENDER_TEMPLATE_LIBRARY_KEY = "shorts-maker:render-template-library:v1";
const customStyleOption = "__custom__";
const imageStylePresets = [
  "Cinematic photo-real",
  "Minimal flat illustration",
  "Anime cel-shaded",
  "3D Pixar-style",
  "Cyberpunk neon",
  "Watercolor painting",
  "Pencil sketch",
  "Retro VHS film",
  "Editorial product ad"
];
const titleFontPresets = [
  "Malgun Gothic",
  "Noto Sans KR",
  "NanumGothic",
  "Arial",
  "Segoe UI"
];
const subtitleFontPresets = [
  "Arial",
  "Malgun Gothic",
  "Noto Sans KR",
  "NanumGothic",
  "Segoe UI",
  "Arial Black"
];
const sceneMotionPresets: Array<{
  id: NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]>;
  label: string;
  description: string;
}> = [
  { id: "gentle_zoom", label: "부드러운 줌", description: "기본. 흔들림을 줄인 완만한 확대" },
  { id: "up_down", label: "위아래 이동", description: "위/아래로 천천히 움직이는 모션" },
  { id: "left_right", label: "좌우 이동", description: "좌/우로 흐르는 패닝 모션" },
  {
    id: "focus_smooth",
    label: "포커스 영역 이동",
    description: "선택한 포커스 영역을 중심으로 Vrew 스타일의 부드러운 이동"
  },
  { id: "random", label: "랜덤", description: "장면마다 모션을 자동 랜덤 선택" }
];
const customFontOption = "__custom_font__";
const customSubtitleFontOption = "__custom_subtitle_font__";
const primaryTitleTemplateId = "__primary_title__";
const defaultPrimaryTemplateText = "제목";
const customSubtitleStyleOption = "__subtitle_custom__";
const subtitlePreviewSentence = "신비한 고대 이집트 문자의 비밀을 지금 공개합니다";
const VIDEO_RENDER_WIDTH = 1080;
const VIDEO_RENDER_HEIGHT = 1920;
const ASS_DEFAULT_PLAYRES_Y = 288;
const imageAspectRatioOptions: Array<{ value: ImageAspectRatio; label: string; description: string }> = [
  { value: "9:16", label: "9:16 세로형", description: "기본 Shorts 세로 이미지 구도" },
  { value: "16:9", label: "16:9 가로형", description: "와이드 패널 레이아웃에 적합" }
];
const videoLayoutOptions: Array<{ value: VideoCanvasLayout; label: string; description: string }> = [
  { value: "fill_9_16", label: "9:16 풀프레임", description: "이미지가 화면 전체를 채웁니다." },
  { value: "panel_16_9", label: "16:9 패널 + 템플릿", description: "가로 영상 패널 위/아래에 텍스트 영역 확보" }
];
const outputFpsOptions: Array<{ value: 30 | 60; label: string; description: string }> = [
  { value: 30, label: "30 FPS", description: "기본 품질/속도 균형" },
  { value: 60, label: "60 FPS", description: "더 부드러운 모션, 렌더 시간 증가" }
];
const SCENE_SPLIT_STATIC_PROMPT_CHARS = 320;
const SCENE_SPLIT_OUTPUT_TOKENS_PER_SCENE = 65;
const SCENE_SPLIT_OUTPUT_BASE_TOKENS = 50;
const TOKEN_CHARS_PER_TOKEN = 3;
const IMAGE_PROMPT_OVERHEAD_TOKENS = 20;
const TTS_INPUT_OVERHEAD_TOKENS = 25;
const MIN_CUE_MS = 100;
const MOTION_SPEED_PERCENT_MIN = 60;
const MOTION_SPEED_PERCENT_MAX = 220;
const MOTION_SPEED_PERCENT_DEFAULT = 135;
const TIMELINE_LANE_OPTIONS = [2, 3, 4, 5, 6, 8] as const;
const TIMELINE_LANE_DEFAULT = 6;
const TIMELINE_LANE_HEIGHT = 34;
const TIMELINE_TOP_PADDING = 8;
const TIMELINE_BOTTOM_PADDING = 10;

interface SubtitleStylePreset {
  id: string;
  label: string;
  description: string;
  subtitle: Partial<RenderOptions["subtitle"]>;
}

const subtitleStylePresets: SubtitleStylePreset[] = [
  {
    id: "capcut-clean",
    label: "CapCut Clean",
    description: "깔끔한 흰색 본문 + 얇은 외곽선",
    subtitle: {
      fontName: "Arial",
      fontSize: 16,
      primaryColor: "#FFFFFF",
      outlineColor: "#000000",
      outline: 2,
      shadow: 1,
      shadowOpacity: 1,
      fontThickness: 0,
      position: "bottom",
      subtitleYPercent: 86,
      wordsPerCaption: 5
    }
  },
  {
    id: "capcut-bold-pop",
    label: "CapCut Bold Pop",
    description: "굵은 글자 느낌의 강한 외곽선 스타일",
    subtitle: {
      fontName: "Arial Black",
      fontSize: 18,
      primaryColor: "#FFFFFF",
      outlineColor: "#141414",
      outline: 4,
      shadow: 2,
      shadowOpacity: 1,
      fontThickness: 4,
      position: "bottom",
      subtitleYPercent: 86,
      wordsPerCaption: 4
    }
  },
  {
    id: "capcut-neon",
    label: "CapCut Neon",
    description: "민트 톤 + 어두운 외곽선의 네온 느낌",
    subtitle: {
      fontName: "Noto Sans KR",
      fontSize: 17,
      primaryColor: "#7DF9FF",
      outlineColor: "#001A1F",
      outline: 3,
      shadow: 3,
      shadowOpacity: 0.8,
      fontThickness: 2,
      position: "middle",
      subtitleYPercent: 52,
      wordsPerCaption: 4
    }
  },
  {
    id: "capcut-news",
    label: "CapCut News",
    description: "뉴스 자막처럼 또렷한 고대비 하단 스타일",
    subtitle: {
      fontName: "Malgun Gothic",
      fontSize: 16,
      primaryColor: "#FFF5CC",
      outlineColor: "#0A0A0A",
      outline: 3,
      shadow: 1,
      shadowOpacity: 1,
      fontThickness: 1,
      position: "bottom",
      subtitleYPercent: 86,
      wordsPerCaption: 6
    }
  },
  {
    id: "capcut-minimal",
    label: "CapCut Minimal",
    description: "중앙 배치의 심플한 텍스트형 스타일",
    subtitle: {
      fontName: "Segoe UI",
      fontSize: 15,
      primaryColor: "#FFFFFF",
      outlineColor: "#222222",
      outline: 1,
      shadow: 1,
      shadowOpacity: 0.7,
      fontThickness: 0,
      position: "middle",
      subtitleYPercent: 52,
      wordsPerCaption: 5
    }
  }
];

function estimateSceneSplitTokens(args: {
  title: string;
  topic: string;
  narration: string;
  imageStyle: string;
  sceneCount: number;
  videoLengthSec: number;
}): number {
  const safeSceneCount = Math.max(3, Math.min(12, args.sceneCount));
  const fallbackNarrationChars = Math.max(160, Math.round(args.videoLengthSec * 9));
  const effectiveNarrationChars =
    args.narration.trim().length > 0 ? args.narration.trim().length : fallbackNarrationChars;

  const inputChars =
    SCENE_SPLIT_STATIC_PROMPT_CHARS +
    args.title.trim().length +
    args.topic.trim().length +
    args.imageStyle.trim().length +
    effectiveNarrationChars;

  // Conservative estimate for mixed KR/EN prompts.
  const inputTokens = Math.ceil(inputChars / 3);
  const outputTokens =
    SCENE_SPLIT_OUTPUT_BASE_TOKENS + safeSceneCount * SCENE_SPLIT_OUTPUT_TOKENS_PER_SCENE;
  return inputTokens + outputTokens;
}

function estimateTextTokens(text: string, fallbackChars = 0): number {
  const chars = text.trim().length > 0 ? text.trim().length : Math.max(0, fallbackChars);
  return Math.max(1, Math.ceil(chars / TOKEN_CHARS_PER_TOKEN));
}

function estimateImagePromptTokens(prompt: string): number {
  return IMAGE_PROMPT_OVERHEAD_TOKENS + estimateTextTokens(prompt, 120);
}

function estimateTtsInputTokens(narration: string, videoLengthSec: number): number {
  const fallbackNarrationChars = Math.max(160, Math.round(videoLengthSec * 9));
  return TTS_INPUT_OVERHEAD_TOKENS + estimateTextTokens(narration, fallbackNarrationChars);
}

function estimateAssetsGenerationTokens(args: {
  prompts: string[];
  narration: string;
  videoLengthSec: number;
}): number {
  const imageTokens = args.prompts.reduce(
    (sum, prompt) => sum + estimateImagePromptTokens(prompt),
    0
  );
  const ttsTokens = estimateTtsInputTokens(args.narration, args.videoLengthSec);
  return imageTokens + ttsTokens;
}

function formatTokenCount(tokens: number): string {
  return Math.max(0, Math.round(tokens)).toLocaleString("ko-KR");
}

function detectStylePreset(style: string): string {
  return imageStylePresets.includes(style) ? style : customStyleOption;
}

function detectFontPreset(fontName?: string): string {
  if (!fontName) {
    return customFontOption;
  }
  return titleFontPresets.includes(fontName) ? fontName : customFontOption;
}

function detectSubtitleFontPreset(fontName?: string): string {
  if (!fontName) {
    return customSubtitleFontOption;
  }
  return subtitleFontPresets.includes(fontName) ? fontName : customSubtitleFontOption;
}

function normalizeImageAspectRatio(value?: string): ImageAspectRatio {
  return value === "16:9" ? "16:9" : "9:16";
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const raw = String(value || fallback).trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return fallback.toUpperCase();
  }
  return raw.toUpperCase();
}

function hexToRgba(value: string | undefined, alpha: number, fallback: string): string {
  const hex = normalizeHexColor(value, fallback).replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function buildTextThicknessShadow(color: string, thickness: number): string[] {
  const safeThickness = Math.max(0, Math.min(8, Number.isFinite(thickness) ? thickness : 0));
  if (safeThickness <= 0) {
    return [];
  }
  const spread = Math.max(0.35, safeThickness * 0.4);
  return [
    `${spread}px 0 ${color}`,
    `${-spread}px 0 ${color}`,
    `0 ${spread}px ${color}`,
    `0 ${-spread}px ${color}`,
    `${spread}px ${spread}px ${color}`,
    `${spread}px ${-spread}px ${color}`,
    `${-spread}px ${spread}px ${color}`,
    `${-spread}px ${-spread}px ${color}`
  ];
}

function subtitleAssScaleForCanvas(canvasScale: number): number {
  const safeCanvasScale = clampNumber(canvasScale, 0.1, 1, 0.26);
  const assToOutputScale = VIDEO_RENDER_HEIGHT / ASS_DEFAULT_PLAYRES_Y;
  return clampNumber(safeCanvasScale * assToOutputScale, 0.6, 3, 1.25);
}

function buildSubtitlePreviewTextShadow(args: {
  outline: number;
  shadow: number;
  shadowOpacity: number;
  outlineColor: string;
  primaryColor: string;
  fontThickness: number;
  scale: number;
}): string {
  const outlineSize = clampNumber(args.outline * args.scale, 0, 24, 2);
  const shadowSize = clampNumber(args.shadow * args.scale, 0, 20, 1);
  const thickness = clampNumber(args.fontThickness * args.scale, 0, 24, 0);
  const shadowOpacity = clampNumber(args.shadowOpacity, 0, 1, 1);
  const shadowParts: string[] = [];
  shadowParts.push(...buildTextThicknessShadow(args.primaryColor, thickness));
  if (outlineSize > 0) {
    shadowParts.push(`${outlineSize}px 0 ${args.outlineColor}`);
    shadowParts.push(`-${outlineSize}px 0 ${args.outlineColor}`);
    shadowParts.push(`0 ${outlineSize}px ${args.outlineColor}`);
    shadowParts.push(`0 -${outlineSize}px ${args.outlineColor}`);
  }
  if (shadowSize > 0) {
    shadowParts.push(`${shadowSize}px ${shadowSize}px rgba(0,0,0,${shadowOpacity})`);
  }
  return shadowParts.join(", ");
}

function smoothStep(value: number): number {
  const t = clampNumber(value, 0, 1, 0);
  return t * t * (3 - 2 * t);
}

function resolveSceneMotionPresetForScene(
  preset: RenderOptions["overlay"]["sceneMotionPreset"],
  sceneNumber: number
): NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]> {
  const normalized = normalizeSceneMotionPreset(preset);
  if (normalized !== "random") {
    return normalized;
  }
  const cycle: Array<NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]>> = [
    "gentle_zoom",
    "focus_smooth",
    "up_down",
    "left_right"
  ];
  const safeSceneNumber = Math.max(1, Math.floor(sceneNumber));
  return cycle[(safeSceneNumber - 1) % cycle.length];
}

function computeSceneMotionPreview(args: {
  sceneNumber: number;
  sceneProgress: number;
  sceneMotionPreset: RenderOptions["overlay"]["sceneMotionPreset"];
  overlay: RenderOptions["overlay"];
}): {
  resolvedMotionPreset: NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]>;
  zoom: number;
  translateXPercent: number;
  translateYPercent: number;
  focusNowXPercent: number;
  focusNowYPercent: number;
  focusBoxLeftPercent: number;
  focusBoxTopPercent: number;
  focusBoxWidthPercent: number;
  focusBoxHeightPercent: number;
} {
  const sceneNumber = Math.max(1, Math.floor(args.sceneNumber));
  const resolvedMotionPreset = resolveSceneMotionPresetForScene(args.sceneMotionPreset, sceneNumber);
  const motionSpeedMultiplier =
    clampNumber(
      Number(args.overlay.motionSpeedPercent),
      MOTION_SPEED_PERCENT_MIN,
      MOTION_SPEED_PERCENT_MAX,
      MOTION_SPEED_PERCENT_DEFAULT
    ) / 100;
  const boostedProgress = clampNumber(
    args.sceneProgress * motionSpeedMultiplier,
    0,
    1,
    0
  );
  const ease = smoothStep(boostedProgress);
  const focusX = clampNumber(Number(args.overlay.focusXPercent), 0, 100, 50) / 100;
  const focusY = clampNumber(Number(args.overlay.focusYPercent), 0, 100, 50) / 100;
  const drift = clampNumber(Number(args.overlay.focusDriftPercent), 0, 20, 6) / 100;
  const driftX = drift;
  const driftY = drift * 0.72;
  const zoomGain = clampNumber(Number(args.overlay.focusZoomPercent), 3, 20, 9) / 100;
  const directionX = sceneNumber % 2 === 1 ? -1 : 1;
  const directionY = sceneNumber % 3 === 0 ? 1 : -1;

  let currentX = focusX;
  let currentY = focusY;
  let boxLeft = clampNumber((focusX - driftX) * 100, 0, 100, 50);
  let boxTop = clampNumber((focusY - driftY) * 100, 0, 100, 50);
  let boxWidth = Math.max(4, driftX * 2 * 100);
  let boxHeight = Math.max(4, driftY * 2 * 100);
  let zoom = 1 + zoomGain * ease;

  if (resolvedMotionPreset === "focus_smooth") {
    const startX = clampNumber(focusX - driftX * directionX, 0.06, 0.94, focusX);
    const endX = clampNumber(focusX + driftX * directionX, 0.06, 0.94, focusX);
    const startY = clampNumber(focusY - driftY * directionY, 0.06, 0.94, focusY);
    const endY = clampNumber(focusY + driftY * directionY, 0.06, 0.94, focusY);
    currentX = startX + (endX - startX) * ease;
    currentY = startY + (endY - startY) * ease;
    boxLeft = Math.min(startX, endX) * 100;
    boxTop = Math.min(startY, endY) * 100;
    boxWidth = Math.max(4, Math.abs(endX - startX) * 100);
    boxHeight = Math.max(4, Math.abs(endY - startY) * 100);
    // Focus mode keeps stable zoom to avoid in/out breathing.
    zoom = 1 + zoomGain;
  } else if (resolvedMotionPreset === "up_down") {
    const startY = clampNumber(focusY - driftY * directionY, 0.06, 0.94, focusY);
    const endY = clampNumber(focusY + driftY * directionY, 0.06, 0.94, focusY);
    currentY = startY + (endY - startY) * ease;
    boxLeft = clampNumber((focusX - driftX * 0.6) * 100, 0, 100, 50);
    boxTop = Math.min(startY, endY) * 100;
    boxWidth = Math.max(4, driftX * 100);
    boxHeight = Math.max(4, Math.abs(endY - startY) * 100);
  } else if (resolvedMotionPreset === "left_right") {
    const startX = clampNumber(focusX - driftX * directionX, 0.06, 0.94, focusX);
    const endX = clampNumber(focusX + driftX * directionX, 0.06, 0.94, focusX);
    currentX = startX + (endX - startX) * ease;
    boxLeft = Math.min(startX, endX) * 100;
    boxTop = clampNumber((focusY - driftY * 0.6) * 100, 0, 100, 50);
    boxWidth = Math.max(4, Math.abs(endX - startX) * 100);
    boxHeight = Math.max(4, driftY * 100);
  }

  const translateXPercent = ((0.5 - currentX) * 85) / Math.max(1, zoom);
  const translateYPercent = ((0.5 - currentY) * 85) / Math.max(1, zoom);
  return {
    resolvedMotionPreset,
    zoom,
    translateXPercent,
    translateYPercent,
    focusNowXPercent: currentX * 100,
    focusNowYPercent: currentY * 100,
    focusBoxLeftPercent: boxLeft,
    focusBoxTopPercent: boxTop,
    focusBoxWidthPercent: boxWidth,
    focusBoxHeightPercent: boxHeight
  };
}

function splitSubtitlePreviewLines(text: string, wordsPerCaption: number): string[] {
  const safeWords = Math.max(2, Math.min(10, wordsPerCaption));
  const chunks: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let index = 0; index < words.length; index += safeWords) {
    chunks.push(words.slice(index, index + safeWords).join(" "));
  }
  return chunks.length > 0 ? chunks : [text];
}

function buildCaptionChunksFromNarration(text: string, wordsPerCaption: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const safeWords = Math.max(2, Math.min(10, wordsPerCaption));
  const sentenceUnits = normalized
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？]+[.!?。！？]?/g) || [line])
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  sentenceUnits.forEach((unit) => {
    const words = unit.split(/\s+/).filter(Boolean);
    if (words.length <= safeWords) {
      chunks.push(unit);
      return;
    }
    for (let index = 0; index < words.length; index += safeWords) {
      chunks.push(words.slice(index, index + safeWords).join(" "));
    }
  });
  return chunks;
}

function generateSubtitleCuesFromNarration(args: {
  narration: string;
  durationSec: number;
  wordsPerCaption: number;
  subtitleDelayMs: number;
}): SubtitleCue[] {
  const normalized = args.narration.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks = buildCaptionChunksFromNarration(normalized, args.wordsPerCaption || 5);
  if (chunks.length === 0) {
    return [];
  }

  const safeDurationSec = Math.max(1, Number.isFinite(args.durationSec) ? args.durationSec : 30);
  const weights = chunks.map((chunk) => Math.max(1, chunk.replace(/\s+/g, "").length));
  const totalWeight = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
  const delaySec = Math.max(-0.5, Math.min(1.5, (args.subtitleDelayMs || 0) / 1000));
  const minCueDuration = 0.16;

  const cues: SubtitleCue[] = [];
  let elapsed = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const fraction = weights[index] / totalWeight;
    const durationForChunk =
      index === chunks.length - 1 ? Math.max(0, safeDurationSec - elapsed) : safeDurationSec * fraction;
    const baseStart = elapsed;
    const baseEnd = Math.min(safeDurationSec, baseStart + durationForChunk);
    elapsed = baseEnd;
    const startSec = Math.max(0, Math.min(safeDurationSec, baseStart + delaySec));
    if (startSec >= safeDurationSec) {
      continue;
    }
    const endSec = Math.max(startSec + minCueDuration, Math.min(safeDurationSec, baseEnd + delaySec));
    if (endSec <= startSec) {
      continue;
    }

    cues.push({
      id: crypto.randomUUID(),
      startMs: Math.round(startSec * 1000),
      endMs: Math.round(endSec * 1000),
      text: chunks[index]
    });
  }
  return cues;
}

function formatTimelineTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(safeMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centi = Math.floor((safeMs % 1000) / 10);
  return `${min}:${String(sec).padStart(2, "0")}.${String(centi).padStart(2, "0")}`;
}

function normalizeTemplateText(value: string | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
}

function detectSubtitleStylePreset(subtitle: RenderOptions["subtitle"]): string {
  const normalizedCurrent = {
    fontName: (subtitle.fontName || "").trim().toLowerCase(),
    fontSize: subtitle.fontSize,
    primaryColor: normalizeHexColor(subtitle.primaryColor, "#FFFFFF"),
    outlineColor: normalizeHexColor(subtitle.outlineColor, "#000000"),
    outline: subtitle.outline,
    shadow: subtitle.shadow,
    shadowOpacity: clampNumber(Number(subtitle.shadowOpacity), 0, 1, 1),
    fontThickness: clampNumber(Number(subtitle.fontThickness), 0, 8, 0),
    position: subtitle.position,
    subtitleYPercent: clampNumber(
      Number(subtitle.subtitleYPercent),
      8,
      92,
      subtitlePreviewYForPosition(subtitle.position)
    ),
    wordsPerCaption: subtitle.wordsPerCaption
  };

  const matched = subtitleStylePresets.find((preset) => {
    const expected = {
      fontName: String(preset.subtitle.fontName || "").trim().toLowerCase(),
      fontSize: preset.subtitle.fontSize ?? normalizedCurrent.fontSize,
      primaryColor: normalizeHexColor(
        preset.subtitle.primaryColor,
        normalizedCurrent.primaryColor
      ),
      outlineColor: normalizeHexColor(
        preset.subtitle.outlineColor,
        normalizedCurrent.outlineColor
      ),
      outline: preset.subtitle.outline ?? normalizedCurrent.outline,
      shadow: preset.subtitle.shadow ?? normalizedCurrent.shadow,
      shadowOpacity: clampNumber(
        Number(preset.subtitle.shadowOpacity),
        0,
        1,
        normalizedCurrent.shadowOpacity
      ),
      fontThickness: clampNumber(
        Number(preset.subtitle.fontThickness),
        0,
        8,
        normalizedCurrent.fontThickness
      ),
      position: preset.subtitle.position ?? normalizedCurrent.position,
      subtitleYPercent:
        preset.subtitle.subtitleYPercent ?? normalizedCurrent.subtitleYPercent,
      wordsPerCaption: preset.subtitle.wordsPerCaption ?? normalizedCurrent.wordsPerCaption
    };
    return (
      normalizedCurrent.fontName === expected.fontName &&
      normalizedCurrent.fontSize === expected.fontSize &&
      normalizedCurrent.primaryColor === expected.primaryColor &&
      normalizedCurrent.outlineColor === expected.outlineColor &&
      normalizedCurrent.outline === expected.outline &&
      normalizedCurrent.shadow === expected.shadow &&
      normalizedCurrent.shadowOpacity === expected.shadowOpacity &&
      normalizedCurrent.fontThickness === expected.fontThickness &&
      normalizedCurrent.position === expected.position &&
      normalizedCurrent.subtitleYPercent === expected.subtitleYPercent &&
      normalizedCurrent.wordsPerCaption === expected.wordsPerCaption
    );
  });
  return matched?.id || customSubtitleStyleOption;
}

function subtitlePositionFromYPercent(value: number): RenderOptions["subtitle"]["position"] {
  if (value < 34) {
    return "top";
  }
  if (value < 67) {
    return "middle";
  }
  return "bottom";
}

function subtitlePreviewYForPosition(
  value: RenderOptions["subtitle"]["position"]
): number {
  if (value === "top") {
    return 18;
  }
  if (value === "middle") {
    return 52;
  }
  return 86;
}

function normalizeSceneMotionPreset(
  value: RenderOptions["overlay"]["sceneMotionPreset"]
): NonNullable<RenderOptions["overlay"]["sceneMotionPreset"]> {
  return sceneMotionPresets.some((item) => item.id === value) ? value || "gentle_zoom" : "gentle_zoom";
}

function normalizeVideoLayout(
  value: RenderOptions["overlay"]["videoLayout"]
): NonNullable<RenderOptions["overlay"]["videoLayout"]> {
  return value === "panel_16_9" ? value : "fill_9_16";
}

function normalizeOutputFps(
  value: RenderOptions["overlay"]["outputFps"]
): NonNullable<RenderOptions["overlay"]["outputFps"]> {
  return Number(value) === 60 ? 60 : 30;
}

function resolveVideoLayoutForAspect(
  layout: RenderOptions["overlay"]["videoLayout"],
  aspectRatio: ImageAspectRatio
): NonNullable<RenderOptions["overlay"]["videoLayout"]> {
  if (aspectRatio === "16:9") {
    return "panel_16_9";
  }
  return normalizeVideoLayout(layout);
}

function isNineBySixteen(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }
  return Math.abs(width / height - 9 / 16) <= 0.01;
}

const workflowStepLabels = [
  {
    stage: "scene_split_review",
    title: "1. 장면 분할 검토"
  },
  {
    stage: "assets_review",
    title: "2. 오디오/이미지 검토"
  },
  {
    stage: "video_review",
    title: "3. 자막/비디오 검증"
  },
  {
    stage: "final_ready",
    title: "4. 최종 생성 완료"
  }
] as const;

function stageIndex(stage: VideoWorkflow["stage"]): number {
  return workflowStepLabels.findIndex((item) => item.stage === stage);
}

function isWorkflowPayload(value: unknown): value is VideoWorkflow {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "stage" in value &&
      "status" in value
  );
}

interface CreateDraft {
  title: string;
  topic: string;
  narration: string;
  imageStyle: string;
  imageStylePreset: string;
  imageAspectRatio: ImageAspectRatio;
  voice: string;
  voiceSpeed: string;
  useSfx: boolean;
  videoLengthSec: string;
  sceneCount: string;
  timelineLaneCount: number;
  sheetName: string;
  previewText: string;
  renderOptions: RenderOptions;
}

interface RenderTemplatePreset {
  id: string;
  name: string;
  renderOptions: RenderOptions;
  createdAt: string;
  updatedAt: string;
}

const defaultRenderOptions: RenderOptions = {
  subtitle: {
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
  },
  overlay: {
    showTitle: false,
    titlePosition: "top",
    titleFontSize: 48,
    titleColor: "#FFFFFF",
    titleFontName: "Malgun Gothic",
    titleFontFile: "",
    sceneMotionPreset: "gentle_zoom",
    motionSpeedPercent: MOTION_SPEED_PERCENT_DEFAULT,
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
  }
};

function ensureRenderOptions(value?: RenderOptions): RenderOptions {
  const subtitleDefaults = {
    ...defaultRenderOptions.subtitle,
    ...(value?.subtitle || {})
  };
  const overlayDefaults = {
    ...defaultRenderOptions.overlay,
    ...(value?.overlay || {})
  };
  const normalizedSubtitle: RenderOptions["subtitle"] = {
    fontName: String(subtitleDefaults.fontName || defaultRenderOptions.subtitle.fontName).trim() || "Arial",
    fontSize: clampNumber(Number(subtitleDefaults.fontSize), 10, 80, 16),
    primaryColor: normalizeHexColor(subtitleDefaults.primaryColor, "#FFFFFF"),
    outlineColor: normalizeHexColor(subtitleDefaults.outlineColor, "#000000"),
    outline: clampNumber(Number(subtitleDefaults.outline), 0, 8, 2),
    shadow: clampNumber(Number(subtitleDefaults.shadow), 0, 8, 1),
    shadowOpacity: clampNumber(Number(subtitleDefaults.shadowOpacity), 0, 1, 1),
    fontThickness: clampNumber(Number(subtitleDefaults.fontThickness), 0, 8, 0),
    subtitleDelayMs: clampNumber(Number(subtitleDefaults.subtitleDelayMs), -500, 1500, 180),
    position:
      subtitleDefaults.position === "top" ||
      subtitleDefaults.position === "middle" ||
      subtitleDefaults.position === "bottom"
        ? subtitleDefaults.position
        : "bottom",
    subtitleYPercent: clampNumber(
      Number(subtitleDefaults.subtitleYPercent),
      8,
      92,
      subtitlePreviewYForPosition(
        subtitleDefaults.position === "top" ||
          subtitleDefaults.position === "middle" ||
          subtitleDefaults.position === "bottom"
          ? subtitleDefaults.position
          : "bottom"
      )
    ),
    wordsPerCaption: clampNumber(Number(subtitleDefaults.wordsPerCaption), 2, 10, 5),
    manualCues: Array.isArray(subtitleDefaults.manualCues)
      ? subtitleDefaults.manualCues
          .map((cue, index) => {
            const startMs = clampNumber(Number(cue.startMs), 0, 3600000, index * 1000);
            const endMs = clampNumber(Number(cue.endMs), startMs + 100, 3600000, startMs + 1200);
            return {
              id: String(cue.id || `cue-${index + 1}`),
              startMs,
              endMs,
              text: String(cue.text || "").trim()
            };
          })
          .filter((cue) => cue.text.length > 0)
          .slice(0, 400)
      : []
  };
  const primaryText =
    normalizeTemplateText(overlayDefaults.titleText || "").trim() || defaultPrimaryTemplateText;

  let normalizedTemplates = (value?.overlay?.titleTemplates || []).map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    text:
      item.id === primaryTitleTemplateId
        ? normalizeTemplateText(item.text).trim() || defaultPrimaryTemplateText
        : normalizeTemplateText(item.text),
    x: clampPercent(Number(item.x) || 50),
    y: clampPercent(Number(item.y) || 10),
    width: clampNumber(Number(item.width), 10, 95, 60),
    fontSize: clampNumber(Number(item.fontSize), 12, 120, Number(overlayDefaults.titleFontSize) || 48),
    color: item.color || overlayDefaults.titleColor || "#FFFFFF",
    paddingX: clampNumber(Number(item.paddingX), 0, 80, 8),
    paddingY: clampNumber(Number(item.paddingY), 0, 80, 4),
    shadowX: clampNumber(Number(item.shadowX), -20, 20, 2),
    shadowY: clampNumber(Number(item.shadowY), -20, 20, 2),
    shadowColor: item.shadowColor || "#000000",
    shadowOpacity: clampNumber(Number(item.shadowOpacity), 0, 1, 1),
    fontThickness: clampNumber(Number(item.fontThickness), 0, 8, 0)
  }));
  const hasPrimary = normalizedTemplates.some((item) => item.id === primaryTitleTemplateId);
  if (!hasPrimary) {
    normalizedTemplates = [
      {
        id: primaryTitleTemplateId,
        text: primaryText,
        x: 50,
        y: overlayDefaults.titlePosition === "bottom" ? 88 : 10,
        width: 70,
        fontSize: overlayDefaults.titleFontSize,
        color: overlayDefaults.titleColor,
        paddingX: 8,
        paddingY: 4,
        shadowX: 2,
        shadowY: 2,
        shadowColor: "#000000",
        shadowOpacity: 1,
        fontThickness: 0,
        fontName: overlayDefaults.titleFontName,
        fontFile: overlayDefaults.titleFontFile || undefined
      },
      ...normalizedTemplates
    ];
  }

  return {
    subtitle: normalizedSubtitle,
    overlay: {
      ...overlayDefaults,
      sceneMotionPreset: normalizeSceneMotionPreset(overlayDefaults.sceneMotionPreset),
      motionSpeedPercent: clampNumber(
        Number(overlayDefaults.motionSpeedPercent),
        MOTION_SPEED_PERCENT_MIN,
        MOTION_SPEED_PERCENT_MAX,
        MOTION_SPEED_PERCENT_DEFAULT
      ),
      focusXPercent: clampNumber(Number(overlayDefaults.focusXPercent), 0, 100, 50),
      focusYPercent: clampNumber(Number(overlayDefaults.focusYPercent), 0, 100, 50),
      focusDriftPercent: clampNumber(Number(overlayDefaults.focusDriftPercent), 0, 20, 6),
      focusZoomPercent: clampNumber(Number(overlayDefaults.focusZoomPercent), 3, 20, 9),
      outputFps: normalizeOutputFps(overlayDefaults.outputFps),
      videoLayout: normalizeVideoLayout(overlayDefaults.videoLayout),
      usePreviewAsFinal: Boolean(overlayDefaults.usePreviewAsFinal),
      panelTopPercent: clampNumber(Number(overlayDefaults.panelTopPercent), 0, 85, 34),
      panelWidthPercent: clampNumber(Number(overlayDefaults.panelWidthPercent), 60, 100, 100),
      showTitle: false,
      titleTemplates: normalizedTemplates
    }
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const normalized = matches.map((item) => item.replace(/^#/, "").trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

function formatLocalTime(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function processingHint(stage: VideoWorkflow["stage"]): string {
  if (stage === "scene_split_review") {
    return "1단계 처리 중입니다. 완료되면 2단계(오디오/이미지 검토)로 자동 전환됩니다.";
  }
  if (stage === "assets_review") {
    return "2단계 처리 중입니다. 완료되면 3단계(자막/비디오 검증)로 자동 전환됩니다.";
  }
  if (stage === "video_review") {
    return "3단계 처리 중입니다. 완료되면 4단계(최종 생성 완료)로 자동 전환됩니다.";
  }
  return "처리 중입니다. 잠시 후 자동 갱신됩니다.";
}

function isLocalHostName(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function toDisplayMediaUrl(raw?: string, cacheTag?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  if (typeof window === "undefined") {
    return raw;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    if (cacheTag && cacheTag.trim()) {
      parsed.searchParams.set("v", cacheTag.trim());
    }
    // Only rewrite web static generated assets.
    if (!parsed.pathname.startsWith("/generated/")) {
      return parsed.toString();
    }
    if (
      isLocalHostName(parsed.hostname) &&
      parsed.origin !== window.location.origin
    ) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function CreateVideoForm(): React.JSX.Element {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [narration, setNarration] = useState("");
  const [imageStyle, setImageStyle] = useState("Cinematic photo-real");
  const [imageStylePreset, setImageStylePreset] = useState(
    detectStylePreset("Cinematic photo-real")
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>("9:16");
  const [voice, setVoice] = useState("alloy");
  const [voiceSpeed, setVoiceSpeed] = useState("1");
  const [useSfx, setUseSfx] = useState(true);
  const [videoLengthSec, setVideoLengthSec] = useState("30");
  const [sceneCount, setSceneCount] = useState("5");
  const [activePanelTab, setActivePanelTab] = useState<"create" | "workflow">("create");
  const [submitting, setSubmitting] = useState(false);
  const [sceneSplitProgress, setSceneSplitProgress] = useState(0);
  const [assetsGenerationProgress, setAssetsGenerationProgress] = useState(0);
  const [videoReviewProgress, setVideoReviewProgress] = useState(0);
  const [finalRenderProgress, setFinalRenderProgress] = useState(0);
  const [workflow, setWorkflow] = useState<VideoWorkflow>();
  const [runningNext, setRunningNext] = useState(false);
  const [savingSceneSplit, setSavingSceneSplit] = useState(false);
  const [resumableWorkflows, setResumableWorkflows] = useState<VideoWorkflow[]>([]);
  const [selectedResumeWorkflowId, setSelectedResumeWorkflowId] = useState("");
  const [loadingResumables, setLoadingResumables] = useState(false);
  const [resumingWorkflow, setResumingWorkflow] = useState(false);
  const [resumeError, setResumeError] = useState<string>();
  const [error, setError] = useState<string>();
  const [sheetName, setSheetName] = useState("");
  const [sheetRows, setSheetRows] = useState<SheetContentRow[]>([]);
  const [selectedSheetRowId, setSelectedSheetRowId] = useState<string>("");
  const [appliedSheetRowId, setAppliedSheetRowId] = useState<string>("");
  const [loadingSheetRows, setLoadingSheetRows] = useState(false);
  const [sheetError, setSheetError] = useState<string>();
  const [previewText, setPreviewText] = useState(
    "This is a voice preview for your short-form content."
  );
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [renderOptions, setRenderOptions] = useState<RenderOptions>(
    ensureRenderOptions()
  );
  const [renderTemplatePresets, setRenderTemplatePresets] = useState<RenderTemplatePreset[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedTemplatePresetId, setSelectedTemplatePresetId] = useState<string>("");
  const [regeneratingSceneIndexes, setRegeneratingSceneIndexes] = useState<number[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const pendingPreviewPlayRef = useRef<boolean>(false);
  const previewBlobMetaRef = useRef<{ type: string; size: number } | undefined>(undefined);
  const templateCanvasRef = useRef<HTMLDivElement>(null);
  const vrewPreviewCanvasRef = useRef<HTMLDivElement>(null);
  const vrewFocusRegionRef = useRef<HTMLDivElement>(null);
  const subtitleDragRef = useRef<{ pointerId: number } | undefined>(undefined);
  const focusPickerDragRef = useRef<{ pointerId: number } | undefined>(undefined);
  const focusPickerInteractionRef = useRef<
    | {
        startX: number;
        startY: number;
      }
    | undefined
  >(undefined);
  const templateInteractionRef = useRef<
    | {
        id: string;
        mode: "move" | "resize";
        startX: number;
        startY: number;
        startWidth: number;
      }
    | undefined
  >(undefined);
  const [draggingTemplateId, setDraggingTemplateId] = useState<string>();
  const [draggingSubtitlePreview, setDraggingSubtitlePreview] = useState(false);
  const [draggingFocusPicker, setDraggingFocusPicker] = useState(false);
  const [focusSelectionDraft, setFocusSelectionDraft] = useState<
    { left: number; top: number; width: number; height: number } | undefined
  >(undefined);
  const [templateCanvasWidth, setTemplateCanvasWidth] = useState(0);
  const [vrewPreviewCanvasWidth, setVrewPreviewCanvasWidth] = useState(280);
  const [previewVideoSize, setPreviewVideoSize] = useState<{ width: number; height: number }>();
  const [finalVideoSize, setFinalVideoSize] = useState<{ width: number; height: number }>();
  const [ttsDurationSec, setTtsDurationSec] = useState<number>();
  const [timelineAudioSec, setTimelineAudioSec] = useState(0);
  const [timelineAudioPlaying, setTimelineAudioPlaying] = useState(false);
  const [draggingCueId, setDraggingCueId] = useState<string>();
  const [timelineLaneCount, setTimelineLaneCount] = useState<number>(TIMELINE_LANE_DEFAULT);
  const workflowAudioRef = useRef<HTMLAudioElement>(null);
  const subtitleTimelineRef = useRef<HTMLDivElement>(null);
  const subtitleCueInteractionRef = useRef<
    | {
        cueId: string;
        mode: "move" | "start" | "end";
        startX: number;
        startStartMs: number;
        startEndMs: number;
        timelineWidth: number;
      }
    | undefined
  >(undefined);
  const hydratedRef = useRef(false);
  const sceneCountValue = useMemo(() => {
    const parsed = Number.parseInt(sceneCount, 10);
    return Number.isFinite(parsed) ? Math.max(3, Math.min(12, parsed)) : 5;
  }, [sceneCount]);
  const estimatedSceneSplitTokens = useMemo(() => {
    const videoLength = Number.parseInt(videoLengthSec, 10);
    return estimateSceneSplitTokens({
      title,
      topic,
      narration,
      imageStyle,
      sceneCount: sceneCountValue,
      videoLengthSec: Number.isFinite(videoLength) ? videoLength : 30
    });
  }, [title, topic, narration, imageStyle, sceneCountValue, videoLengthSec]);
  const previewVoiceEstimatedTokens = useMemo(() => {
    const videoLength = Number.parseInt(videoLengthSec, 10);
    return estimateTtsInputTokens(previewText, Number.isFinite(videoLength) ? videoLength : 30);
  }, [previewText, videoLengthSec]);
  const assetsGenerationEstimatedTokens = useMemo(() => {
    if (!workflow || workflow.stage !== "scene_split_review") {
      return 0;
    }
    return estimateAssetsGenerationTokens({
      prompts: workflow.scenes.map((scene) => scene.imagePrompt),
      narration: workflow.narration,
      videoLengthSec: workflow.input.videoLengthSec || 30
    });
  }, [workflow]);
  const isAssetsGenerationProcessing = Boolean(
    workflow &&
      workflow.status === "processing" &&
      workflow.stage === "scene_split_review"
  );
  const isVideoReviewBuildProcessing = Boolean(
    workflow &&
      workflow.status === "processing" &&
      workflow.stage === "assets_review"
  );
  const isFinalRenderProcessing = Boolean(
    workflow &&
      workflow.status === "processing" &&
      workflow.stage === "video_review"
  );
  const shouldShowVideoReviewProgress = Boolean(
    isVideoReviewBuildProcessing || (runningNext && workflow?.stage === "assets_review")
  );
  const shouldShowFinalRenderProgress = Boolean(
    isFinalRenderProcessing || (runningNext && workflow?.stage === "video_review")
  );
  const sceneImageAspectClass =
    workflow?.input.imageAspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]";
  const manualSubtitleCues = useMemo(
    () => renderOptions.subtitle.manualCues || [],
    [renderOptions.subtitle.manualCues]
  );
  const timelineDurationMs = useMemo(() => {
    const fromAudio = Number.isFinite(ttsDurationSec) && (ttsDurationSec || 0) > 0
      ? Math.round((ttsDurationSec || 0) * 1000)
      : undefined;
    const fromWorkflow = workflow?.input.videoLengthSec
      ? Math.round(Math.max(1, workflow.input.videoLengthSec) * 1000)
      : undefined;
    const fromCues =
      manualSubtitleCues.length > 0
        ? Math.max(...manualSubtitleCues.map((cue) => cue.endMs + 300))
        : undefined;
    return Math.max(1000, fromAudio || fromWorkflow || fromCues || 30000);
  }, [manualSubtitleCues, ttsDurationSec, workflow?.input.videoLengthSec]);
  const timelineWaveBars = useMemo(() => {
    const seedText = workflow?.narration || narration || title || "shorts-maker";
    const seed = Array.from(seedText).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return Array.from({ length: 72 }, (_, index) => {
      const a = Math.sin((index + 1) * 0.45 + seed * 0.01);
      const b = Math.sin((index + 1) * 0.19 + seed * 0.017);
      const value = Math.abs((a + b) / 2);
      return Math.round(12 + value * 88);
    });
  }, [workflow?.narration, narration, title]);
  const timelineCues = useMemo(
    () =>
      [...manualSubtitleCues].sort((a, b) =>
        a.startMs === b.startMs ? a.endMs - b.endMs : a.startMs - b.startMs
      ),
    [manualSubtitleCues]
  );
  const timelineCueLanes = useMemo(() => {
    const safeLaneCount = clampNumber(
      Number(timelineLaneCount),
      TIMELINE_LANE_OPTIONS[0],
      TIMELINE_LANE_OPTIONS[TIMELINE_LANE_OPTIONS.length - 1],
      TIMELINE_LANE_DEFAULT
    );
    const laneEndTimes = Array.from({ length: safeLaneCount }, () => -1);
    return timelineCues.map((cue) => {
      let laneIndex = laneEndTimes.findIndex((endMs) => cue.startMs >= endMs);
      if (laneIndex < 0) {
        laneIndex = laneEndTimes.indexOf(Math.min(...laneEndTimes));
      }
      laneEndTimes[laneIndex] = Math.max(laneEndTimes[laneIndex], cue.endMs);
      return { cue, lane: laneIndex };
    });
  }, [timelineCues, timelineLaneCount]);
  const timelineViewportHeight = useMemo(() => {
    const safeLaneCount = clampNumber(
      Number(timelineLaneCount),
      TIMELINE_LANE_OPTIONS[0],
      TIMELINE_LANE_OPTIONS[TIMELINE_LANE_OPTIONS.length - 1],
      TIMELINE_LANE_DEFAULT
    );
    return Math.max(
      132,
      TIMELINE_TOP_PADDING + TIMELINE_BOTTOM_PADDING + safeLaneCount * TIMELINE_LANE_HEIGHT
    );
  }, [timelineLaneCount]);
  const generatedPreviewCues = useMemo(() => {
    if (!workflow) {
      return [];
    }
    const durationSec = ttsDurationSec || workflow.input.videoLengthSec || 30;
    return generateSubtitleCuesFromNarration({
      narration: workflow.narration,
      durationSec,
      wordsPerCaption: renderOptions.subtitle.wordsPerCaption,
      subtitleDelayMs: renderOptions.subtitle.subtitleDelayMs
    });
  }, [
    workflow,
    ttsDurationSec,
    renderOptions.subtitle.wordsPerCaption,
    renderOptions.subtitle.subtitleDelayMs
  ]);
  const effectivePreviewCues = manualSubtitleCues.length > 0 ? timelineCues : generatedPreviewCues;
  const effectiveImageAspectRatio = useMemo(
    () => normalizeImageAspectRatio(workflow?.input.imageAspectRatio || imageAspectRatio),
    [workflow?.input.imageAspectRatio, imageAspectRatio]
  );
  const effectiveVideoLayout = useMemo(
    () =>
      resolveVideoLayoutForAspect(
        renderOptions.overlay.videoLayout,
        effectiveImageAspectRatio
      ),
    [renderOptions.overlay.videoLayout, effectiveImageAspectRatio]
  );
  const previewTitleTemplates = useMemo(
    () => [...(renderOptions.overlay.titleTemplates || [])],
    [renderOptions.overlay.titleTemplates]
  );
  const vrewPreviewLayout = useMemo(() => effectiveVideoLayout, [effectiveVideoLayout]);
  const activePreviewCueText = useMemo(() => {
    if (effectivePreviewCues.length === 0) {
      return "";
    }
    const nowMs = Math.round(timelineAudioSec * 1000);
    const activeCue = effectivePreviewCues.find(
      (cue) => cue.startMs <= nowMs && nowMs < cue.endMs
    );
    return activeCue?.text || "";
  }, [effectivePreviewCues, timelineAudioSec]);
  const activePreviewSceneIndex = useMemo(() => {
    if (!workflow?.scenes?.length) {
      return 0;
    }
    const totalScenes = workflow.scenes.length;
    const durationSec = Math.max(1, timelineDurationMs / 1000);
    const perSceneSec = durationSec / totalScenes;
    if (perSceneSec <= 0) {
      return 0;
    }
    return Math.min(totalScenes - 1, Math.floor(timelineAudioSec / perSceneSec));
  }, [workflow?.scenes, timelineAudioSec, timelineDurationMs]);
  const activePreviewSceneProgress = useMemo(() => {
    if (!workflow?.scenes?.length) {
      return 0;
    }
    const totalScenes = workflow.scenes.length;
    const durationSec = Math.max(1, timelineDurationMs / 1000);
    const perSceneSec = durationSec / totalScenes;
    if (perSceneSec <= 0) {
      return 0;
    }
    const sceneOffsetSec = timelineAudioSec - activePreviewSceneIndex * perSceneSec;
    return clampNumber(sceneOffsetSec / perSceneSec, 0, 1, 0);
  }, [workflow?.scenes, timelineDurationMs, timelineAudioSec, activePreviewSceneIndex]);
  const resolvedPreviewMotionPreset = useMemo(
    () =>
      resolveSceneMotionPresetForScene(
        renderOptions.overlay.sceneMotionPreset,
        activePreviewSceneIndex + 1
      ),
    [renderOptions.overlay.sceneMotionPreset, activePreviewSceneIndex]
  );
  const sceneMotionPreview = useMemo(
    () =>
      computeSceneMotionPreview({
        sceneNumber: activePreviewSceneIndex + 1,
        sceneProgress: activePreviewSceneProgress,
        sceneMotionPreset: renderOptions.overlay.sceneMotionPreset,
        overlay: renderOptions.overlay
      }),
    [
      activePreviewSceneIndex,
      activePreviewSceneProgress,
      renderOptions.overlay
    ]
  );
  const showFocusPicker = useMemo(
    () => workflow?.stage === "assets_review" && (workflow.scenes?.length || 0) > 0,
    [workflow?.stage, workflow?.scenes]
  );
  const focusPickerBox = useMemo(() => {
    if (focusSelectionDraft) {
      return focusSelectionDraft;
    }
    return {
      left: sceneMotionPreview.focusBoxLeftPercent,
      top: sceneMotionPreview.focusBoxTopPercent,
      width: Math.max(2, sceneMotionPreview.focusBoxWidthPercent),
      height: Math.max(2, sceneMotionPreview.focusBoxHeightPercent)
    };
  }, [focusSelectionDraft, sceneMotionPreview]);
  const focusPickerCenter = useMemo(() => {
    if (focusSelectionDraft) {
      return {
        x: focusSelectionDraft.left + focusSelectionDraft.width / 2,
        y: focusSelectionDraft.top + focusSelectionDraft.height / 2
      };
    }
    return {
      x: sceneMotionPreview.focusNowXPercent,
      y: sceneMotionPreview.focusNowYPercent
    };
  }, [focusSelectionDraft, sceneMotionPreview.focusNowXPercent, sceneMotionPreview.focusNowYPercent]);
  const vrewImageMotionStyle = useMemo(() => {
    return {
      transform: `scale(${sceneMotionPreview.zoom.toFixed(4)})`,
      transformOrigin: `${sceneMotionPreview.focusNowXPercent.toFixed(2)}% ${sceneMotionPreview.focusNowYPercent.toFixed(2)}%`,
      objectPosition: `${sceneMotionPreview.focusNowXPercent.toFixed(2)}% ${sceneMotionPreview.focusNowYPercent.toFixed(2)}%`,
      willChange: "transform, object-position"
    };
  }, [sceneMotionPreview]);

  const refreshResumableWorkflows = useCallback(async (): Promise<void> => {
    setLoadingResumables(true);
    setResumeError(undefined);
    try {
      const response = await fetch("/api/workflows?activeOnly=1", { cache: "no-store" });
      const data = (await response.json()) as {
        workflows?: VideoWorkflow[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load resumable workflows.");
      }
      const items = data.workflows || [];
      setResumableWorkflows(items);
      setSelectedResumeWorkflowId((current) => {
        if (items.length === 0) {
          return "";
        }
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0].id;
      });
    } catch (loadError) {
      setResumeError(loadError instanceof Error ? loadError.message : "Unknown error");
      setResumableWorkflows([]);
    } finally {
      setLoadingResumables(false);
    }
  }, []);

  async function resumeWorkflowById(id: string): Promise<void> {
    if (!id) {
      return;
    }
    setResumingWorkflow(true);
    setResumeError(undefined);
    try {
      const response = await fetch(`/api/workflow/${id}`, { cache: "no-store" });
      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (!response.ok || !isWorkflowPayload(data)) {
        throw new Error(("error" in data && data.error) || "Failed to resume workflow.");
      }
      setWorkflow(data);
      setActivePanelTab("workflow");
      setTitle(data.input.title || "");
      setTopic(data.input.topic || "");
      setNarration(data.narration || data.input.narration || "");
      setImageStyle(data.input.imageStyle || "Cinematic photo-real");
      setImageStylePreset(detectStylePreset(data.input.imageStyle || "Cinematic photo-real"));
      setImageAspectRatio(normalizeImageAspectRatio(data.input.imageAspectRatio));
      setVoice(data.input.voice || "alloy");
      setVoiceSpeed(String(data.input.voiceSpeed || 1));
      setUseSfx(data.input.useSfx ?? true);
      setVideoLengthSec(String(data.input.videoLengthSec || 30));
      setSceneCount(String(data.input.sceneCount || 5));
      setAppliedSheetRowId(data.id || "");
      setRenderOptions(ensureRenderOptions(data.renderOptions));
      setError(undefined);
    } catch (resumeErr) {
      setResumeError(resumeErr instanceof Error ? resumeErr.message : "Unknown error");
    } finally {
      setResumingWorkflow(false);
    }
  }

  const fetchWorkflowSnapshot = useCallback(
    async (workflowId: string): Promise<void> => {
      const response = await fetch(`/api/workflow/${workflowId}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (isWorkflowPayload(data)) {
        setWorkflow(data);
        setRenderOptions(ensureRenderOptions(data.renderOptions));
      }
    },
    []
  );

  useEffect(() => {
    try {
      const draftRaw = localStorage.getItem(CREATE_DRAFT_KEY);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as Partial<CreateDraft>;
        if (typeof draft.title === "string") {
          setTitle(draft.title);
        }
        if (typeof draft.topic === "string") {
          setTopic(draft.topic);
        }
        if (typeof draft.narration === "string") {
          setNarration(draft.narration);
        }
        if (typeof draft.imageStyle === "string" && draft.imageStyle.trim()) {
          setImageStyle(draft.imageStyle);
          setImageStylePreset(
            typeof draft.imageStylePreset === "string"
              ? draft.imageStylePreset
              : detectStylePreset(draft.imageStyle)
          );
        }
        if (typeof draft.imageAspectRatio === "string") {
          setImageAspectRatio(normalizeImageAspectRatio(draft.imageAspectRatio));
        }
        if (typeof draft.voice === "string" && draft.voice.trim()) {
          setVoice(draft.voice);
        }
        if (typeof draft.voiceSpeed === "string" && draft.voiceSpeed.trim()) {
          setVoiceSpeed(draft.voiceSpeed);
        }
        if (typeof draft.useSfx === "boolean") {
          setUseSfx(draft.useSfx);
        }
        if (typeof draft.videoLengthSec === "string" && draft.videoLengthSec.trim()) {
          setVideoLengthSec(draft.videoLengthSec);
        }
        if (typeof draft.sceneCount === "string" && draft.sceneCount.trim()) {
          setSceneCount(draft.sceneCount);
        }
        if (typeof draft.timelineLaneCount === "number") {
          setTimelineLaneCount(
            clampNumber(
              Number(draft.timelineLaneCount),
              TIMELINE_LANE_OPTIONS[0],
              TIMELINE_LANE_OPTIONS[TIMELINE_LANE_OPTIONS.length - 1],
              TIMELINE_LANE_DEFAULT
            )
          );
        }
        if (typeof draft.sheetName === "string") {
          setSheetName(draft.sheetName);
        }
        if (typeof draft.previewText === "string") {
          setPreviewText(draft.previewText);
        }
        if (draft.renderOptions) {
          setRenderOptions(ensureRenderOptions(draft.renderOptions));
        }
      }

      const presetsRaw = localStorage.getItem(RENDER_TEMPLATE_LIBRARY_KEY);
      if (presetsRaw) {
        const parsed = JSON.parse(presetsRaw) as Partial<RenderTemplatePreset>[];
        const safePresets = parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            id: String(item.id || crypto.randomUUID()),
            name: String(item.name || "Template"),
            renderOptions: ensureRenderOptions(item.renderOptions),
            createdAt:
              typeof item.createdAt === "string" && item.createdAt
                ? item.createdAt
                : new Date().toISOString(),
            updatedAt:
              typeof item.updatedAt === "string" && item.updatedAt
                ? item.updatedAt
                : new Date().toISOString()
          }));
        setRenderTemplatePresets(safePresets);
        setSelectedTemplatePresetId(safePresets[0]?.id || "");
      }
    } catch {
      // Ignore broken local storage.
    }

    const restoreWorkflow = async () => {
      try {
        const workflowId = localStorage.getItem(CREATE_WORKFLOW_ID_KEY);
        if (!workflowId) {
          return;
        }
        const response = await fetch(`/api/workflow/${workflowId}`, { cache: "no-store" });
        if (!response.ok) {
          localStorage.removeItem(CREATE_WORKFLOW_ID_KEY);
          return;
        }
        const data = (await response.json()) as VideoWorkflow | { error?: string };
        if (isWorkflowPayload(data)) {
          setWorkflow(data);
          setRenderOptions(ensureRenderOptions(data.renderOptions));
          setImageAspectRatio(normalizeImageAspectRatio(data.input.imageAspectRatio));
          return;
        }
        localStorage.removeItem(CREATE_WORKFLOW_ID_KEY);
      } catch {
        // Ignore restore failure.
      }
    };

    void Promise.all([restoreWorkflow(), refreshResumableWorkflows()]).finally(() => {
      hydratedRef.current = true;
    });
  }, [refreshResumableWorkflows]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const draft: CreateDraft = {
      title,
      topic,
      narration,
      imageStyle,
      imageStylePreset,
      imageAspectRatio,
      voice,
      voiceSpeed,
      useSfx,
      videoLengthSec,
      sceneCount,
      timelineLaneCount,
      sheetName,
      previewText,
      renderOptions
    };
    localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft));
  }, [
    title,
    topic,
    narration,
    imageStyle,
    imageStylePreset,
    imageAspectRatio,
    voice,
    voiceSpeed,
    useSfx,
    videoLengthSec,
    sceneCount,
    timelineLaneCount,
    sheetName,
    previewText,
    renderOptions
  ]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    if (workflow?.id) {
      localStorage.setItem(CREATE_WORKFLOW_ID_KEY, workflow.id);
    } else {
      localStorage.removeItem(CREATE_WORKFLOW_ID_KEY);
    }
  }, [workflow?.id]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    void refreshResumableWorkflows();
  }, [workflow?.id, workflow?.updatedAt, workflow?.stage, workflow?.status, refreshResumableWorkflows]);

  useEffect(() => {
    setTtsDurationSec(undefined);
    setTimelineAudioSec(0);
    setTimelineAudioPlaying(false);
  }, [workflow?.id, workflow?.ttsUrl]);

  useEffect(() => {
    setTimelineAudioSec((prev) => Math.min(prev, timelineDurationMs / 1000));
  }, [timelineDurationMs]);

  useEffect(() => {
    if (!workflow?.id || workflow.status !== "processing") {
      return;
    }
    const interval = setInterval(() => {
      void fetchWorkflowSnapshot(workflow.id);
    }, 2500);
    return () => clearInterval(interval);
  }, [workflow?.id, workflow?.status, fetchWorkflowSnapshot]);

  useEffect(() => {
    if (!submitting) {
      setSceneSplitProgress(0);
      return;
    }

    setSceneSplitProgress(8);
    const interval = setInterval(() => {
      setSceneSplitProgress((prev) => {
        if (prev >= 92) {
          return prev;
        }
        if (prev < 40) {
          return Math.min(92, prev + 6);
        }
        if (prev < 70) {
          return Math.min(92, prev + 3);
        }
        return Math.min(92, prev + 1);
      });
    }, 350);

    return () => clearInterval(interval);
  }, [submitting]);

  useEffect(() => {
    if (!isAssetsGenerationProcessing) {
      setAssetsGenerationProgress(0);
      return;
    }

    setAssetsGenerationProgress((prev) => (prev > 0 ? prev : 12));
    const interval = setInterval(() => {
      setAssetsGenerationProgress((prev) => {
        if (prev >= 96) {
          return prev;
        }
        if (prev < 55) {
          return Math.min(96, prev + 5);
        }
        if (prev < 82) {
          return Math.min(96, prev + 2);
        }
        return Math.min(96, prev + 1);
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isAssetsGenerationProcessing]);

  useEffect(() => {
    if (!shouldShowVideoReviewProgress) {
      setVideoReviewProgress(0);
      return;
    }

    setVideoReviewProgress((prev) => (prev > 0 ? prev : 10));
    const interval = setInterval(() => {
      setVideoReviewProgress((prev) => {
        if (prev >= 96) {
          return prev;
        }
        if (prev < 50) {
          return Math.min(96, prev + 5);
        }
        if (prev < 80) {
          return Math.min(96, prev + 2);
        }
        return Math.min(96, prev + 1);
      });
    }, 420);

    return () => clearInterval(interval);
  }, [shouldShowVideoReviewProgress]);

  useEffect(() => {
    if (!shouldShowFinalRenderProgress) {
      setFinalRenderProgress(0);
      return;
    }

    setFinalRenderProgress((prev) => (prev > 0 ? prev : 10));
    const interval = setInterval(() => {
      setFinalRenderProgress((prev) => {
        if (prev >= 96) {
          return prev;
        }
        if (prev < 45) {
          return Math.min(96, prev + 4);
        }
        if (prev < 78) {
          return Math.min(96, prev + 2);
        }
        return Math.min(96, prev + 1);
      });
    }, 450);

    return () => clearInterval(interval);
  }, [shouldShowFinalRenderProgress]);

  useEffect(() => {
    if (workflow?.stage !== "assets_review") {
      setRegeneratingSceneIndexes([]);
      subtitleDragRef.current = undefined;
      setDraggingSubtitlePreview(false);
      focusPickerDragRef.current = undefined;
      focusPickerInteractionRef.current = undefined;
      setDraggingFocusPicker(false);
      setFocusSelectionDraft(undefined);
    }
  }, [workflow?.stage, workflow?.id]);

  useEffect(() => {
    setPreviewVideoSize(undefined);
  }, [workflow?.previewVideoUrl]);

  useEffect(() => {
    setFinalVideoSize(undefined);
  }, [workflow?.finalVideoUrl]);

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

    const onCanPlay = () => {
      const playPromise = audioEl.play();
      if (playPromise) {
        void playPromise.catch((playError) => {
          const meta = previewBlobMetaRef.current;
          setPreviewError(
            playError instanceof Error
              ? `Voice preview playback failed: ${playError.message}${
                  meta ? ` (type=${meta.type || "unknown"}, size=${meta.size})` : ""
                }`
              : "Voice preview playback failed."
          );
        });
      }
      pendingPreviewPlayRef.current = false;
    };

    const onError = () => {
      const meta = previewBlobMetaRef.current;
      setPreviewError(
        `Voice preview playback failed: unsupported source${
          meta ? ` (type=${meta.type || "unknown"}, size=${meta.size})` : ""
        }`
      );
      pendingPreviewPlayRef.current = false;
    };

    audioEl.addEventListener("canplay", onCanPlay, { once: true });
    audioEl.addEventListener("error", onError, { once: true });
    audioEl.load();

    return () => {
      audioEl.removeEventListener("canplay", onCanPlay);
      audioEl.removeEventListener("error", onError);
    };
  }, [previewAudioUrl]);

  const selectedSheetRow = useMemo(
    () => sheetRows.find((row) => row.id === selectedSheetRowId),
    [selectedSheetRowId, sheetRows]
  );
  const selectedRenderTemplatePreset = useMemo(
    () => renderTemplatePresets.find((item) => item.id === selectedTemplatePresetId),
    [renderTemplatePresets, selectedTemplatePresetId]
  );
  const subtitleStylePresetId = useMemo(
    () => detectSubtitleStylePreset(renderOptions.subtitle),
    [renderOptions.subtitle]
  );
  const selectedSubtitleStylePreset = useMemo(
    () => subtitleStylePresets.find((item) => item.id === subtitleStylePresetId),
    [subtitleStylePresetId]
  );
  const subtitlePreviewLines = useMemo(
    () =>
      splitSubtitlePreviewLines(
        subtitlePreviewSentence,
        clampNumber(renderOptions.subtitle.wordsPerCaption, 2, 10, 5)
      ),
    [renderOptions.subtitle.wordsPerCaption]
  );
  const subtitlePreviewTop = useMemo(
    () =>
      clampNumber(
        Number(renderOptions.subtitle.subtitleYPercent),
        8,
        92,
        subtitlePreviewYForPosition(renderOptions.subtitle.position)
      ),
    [renderOptions.subtitle.position, renderOptions.subtitle.subtitleYPercent]
  );
  const templatePreviewScale = useMemo(() => {
    if (templateCanvasWidth > 0) {
      return templateCanvasWidth / VIDEO_RENDER_WIDTH;
    }
    const liveCanvasWidth = templateCanvasRef.current?.getBoundingClientRect().width ?? 0;
    if (Number.isFinite(liveCanvasWidth) && liveCanvasWidth > 0) {
      return liveCanvasWidth / VIDEO_RENDER_WIDTH;
    }
    // Fallback while hidden/not measured yet: prevents oversized preview text.
    return 0.5;
  }, [templateCanvasWidth]);
  const vrewPreviewScale = useMemo(() => {
    const width = vrewPreviewCanvasWidth > 0 ? vrewPreviewCanvasWidth : 280;
    return clampNumber(width / VIDEO_RENDER_WIDTH, 0.12, 1, 0.26);
  }, [vrewPreviewCanvasWidth]);
  const templateSubtitleRenderScale = useMemo(
    () => subtitleAssScaleForCanvas(templatePreviewScale),
    [templatePreviewScale]
  );
  const vrewSubtitleRenderScale = useMemo(
    () => subtitleAssScaleForCanvas(vrewPreviewScale),
    [vrewPreviewScale]
  );
  const subtitlePreviewFontSize = useMemo(
    () =>
      clampNumber(
        renderOptions.subtitle.fontSize * templateSubtitleRenderScale,
        10,
        120,
        24
      ),
    [renderOptions.subtitle.fontSize, templateSubtitleRenderScale]
  );
  const subtitlePreviewTextShadow = useMemo(
    () =>
      buildSubtitlePreviewTextShadow({
        outline: clampNumber(renderOptions.subtitle.outline, 0, 8, 2),
        shadow: clampNumber(renderOptions.subtitle.shadow, 0, 8, 1),
        shadowOpacity: clampNumber(renderOptions.subtitle.shadowOpacity, 0, 1, 1),
        outlineColor: normalizeHexColor(renderOptions.subtitle.outlineColor, "#000000"),
        primaryColor: normalizeHexColor(renderOptions.subtitle.primaryColor, "#FFFFFF"),
        fontThickness: clampNumber(renderOptions.subtitle.fontThickness, 0, 8, 0),
        scale: templateSubtitleRenderScale
      }),
    [
      renderOptions.subtitle.fontThickness,
      renderOptions.subtitle.outline,
      renderOptions.subtitle.outlineColor,
      renderOptions.subtitle.primaryColor,
      renderOptions.subtitle.shadow,
      renderOptions.subtitle.shadowOpacity,
      templateSubtitleRenderScale
    ]
  );
  const vrewSubtitlePreviewFontSize = useMemo(
    () =>
      clampNumber(
        renderOptions.subtitle.fontSize * vrewSubtitleRenderScale,
        10,
        120,
        22
      ),
    [renderOptions.subtitle.fontSize, vrewSubtitleRenderScale]
  );
  const vrewSubtitlePreviewTextShadow = useMemo(
    () =>
      buildSubtitlePreviewTextShadow({
        outline: clampNumber(renderOptions.subtitle.outline, 0, 8, 2),
        shadow: clampNumber(renderOptions.subtitle.shadow, 0, 8, 1),
        shadowOpacity: clampNumber(renderOptions.subtitle.shadowOpacity, 0, 1, 1),
        outlineColor: normalizeHexColor(renderOptions.subtitle.outlineColor, "#000000"),
        primaryColor: normalizeHexColor(renderOptions.subtitle.primaryColor, "#FFFFFF"),
        fontThickness: clampNumber(renderOptions.subtitle.fontThickness, 0, 8, 0),
        scale: vrewSubtitleRenderScale
      }),
    [
      renderOptions.subtitle.fontThickness,
      renderOptions.subtitle.outline,
      renderOptions.subtitle.outlineColor,
      renderOptions.subtitle.primaryColor,
      renderOptions.subtitle.shadow,
      renderOptions.subtitle.shadowOpacity,
      vrewSubtitleRenderScale
    ]
  );

  useEffect(() => {
    const canvas = vrewPreviewCanvasRef.current;
    if (!canvas || workflow?.stage !== "assets_review") {
      return;
    }
    const measure = (): void => {
      const nextWidth = canvas.getBoundingClientRect().width;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
        return;
      }
      setVrewPreviewCanvasWidth((prev) =>
        Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth
      );
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(canvas);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [workflow?.stage, workflow?.id]);

  const persistRenderTemplatePresets = useCallback(
    (next: RenderTemplatePreset[]): void => {
      setRenderTemplatePresets(next);
      localStorage.setItem(RENDER_TEMPLATE_LIBRARY_KEY, JSON.stringify(next));
    },
    []
  );

  const saveCurrentRenderTemplate = useCallback((): void => {
    const name = newTemplateName.trim();
    const now = new Date();
    const nowIso = now.toISOString();
    const fallbackName = `Template ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    const preset: RenderTemplatePreset = {
      id: crypto.randomUUID(),
      name: name || fallbackName,
      renderOptions: ensureRenderOptions(renderOptions),
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const next = [preset, ...renderTemplatePresets].slice(0, 30);
    persistRenderTemplatePresets(next);
    setSelectedTemplatePresetId(preset.id);
    setNewTemplateName("");
  }, [newTemplateName, renderOptions, renderTemplatePresets, persistRenderTemplatePresets]);

  const applySelectedRenderTemplate = useCallback(async (): Promise<void> => {
    if (!selectedRenderTemplatePreset) {
      return;
    }
    const nextRenderOptions = ensureRenderOptions(selectedRenderTemplatePreset.renderOptions);
    setRenderOptions(nextRenderOptions);
    try {
      const response = await fetch("/api/automation-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          renderOptions: nextRenderOptions,
          sourceTitle: title || selectedRenderTemplatePreset.name,
          sourceTopic: topic || undefined,
          templateName: selectedRenderTemplatePreset.name
        })
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to persist automation template.");
      }
    } catch (persistError) {
      setError(
        persistError instanceof Error
          ? `템플릿은 적용되었지만 자동화 기본 템플릿 저장에 실패했습니다: ${persistError.message}`
          : "템플릿은 적용되었지만 자동화 기본 템플릿 저장에 실패했습니다."
      );
    }
  }, [selectedRenderTemplatePreset, title, topic]);

  const deleteSelectedRenderTemplate = useCallback((): void => {
    if (!selectedRenderTemplatePreset) {
      return;
    }
    const next = renderTemplatePresets.filter(
      (item) => item.id !== selectedRenderTemplatePreset.id
    );
    persistRenderTemplatePresets(next);
    setSelectedTemplatePresetId((current) =>
      current === selectedRenderTemplatePreset.id ? "" : current
    );
  }, [selectedRenderTemplatePreset, renderTemplatePresets, persistRenderTemplatePresets]);

  const applySubtitleStylePreset = useCallback((presetId: string): void => {
    if (presetId === customSubtitleStyleOption) {
      return;
    }
    const preset = subtitleStylePresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        ...preset.subtitle
      }
    }));
  }, []);

  useEffect(() => {
    const fallbackTitle = title.trim();
    if (!fallbackTitle) {
      return;
    }
    setRenderOptions((prev) => {
      const templates = prev.overlay.titleTemplates || [];
      const primaryIndex = templates.findIndex(
        (item) => item.id === primaryTitleTemplateId
      );
      if (primaryIndex < 0) {
        return prev;
      }
      const primary = templates[primaryIndex];
      const primaryText = primary.text.trim();
      if (primaryText && primaryText !== defaultPrimaryTemplateText) {
        return prev;
      }
      const nextTemplates = [...templates];
      nextTemplates[primaryIndex] = {
        ...primary,
        text: fallbackTitle
      };
      return {
        ...prev,
        overlay: {
          ...prev.overlay,
          titleTemplates: nextTemplates
        }
      };
    });
  }, [title, renderOptions.overlay.titleTemplates]);

  useEffect(() => {
    if (effectiveImageAspectRatio !== "16:9") {
      return;
    }
    setRenderOptions((prev) => {
      if (normalizeVideoLayout(prev.overlay.videoLayout) === "panel_16_9") {
        return prev;
      }
      return {
        ...prev,
        overlay: {
          ...prev.overlay,
          videoLayout: "panel_16_9"
        }
      };
    });
  }, [effectiveImageAspectRatio]);

  async function loadSheetRows(): Promise<void> {
    setLoadingSheetRows(true);
    setSheetError(undefined);
    try {
      const query = sheetName.trim()
        ? `?sheetName=${encodeURIComponent(sheetName.trim())}`
        : "";
      const response = await fetch(`/api/sheet-rows${query}`, { cache: "no-store" });
      const data = (await response.json()) as {
        rows?: SheetContentRow[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load sheet rows.");
      }

      const rows = data.rows || [];
      setSheetRows(rows);
      setSelectedSheetRowId(rows[0]?.id ?? "");
      setAppliedSheetRowId("");
    } catch (loadError) {
      setSheetRows([]);
      setSelectedSheetRowId("");
      setAppliedSheetRowId("");
      setSheetError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setLoadingSheetRows(false);
    }
  }

  function applySheetRow(row: SheetContentRow | undefined): void {
    if (!row) {
      return;
    }
    // Applying a new sheet row means we are starting a new flow context.
    setWorkflow(undefined);
    setSelectedResumeWorkflowId("");
    setError(undefined);
    localStorage.removeItem(CREATE_WORKFLOW_ID_KEY);

    setTitle(row.subject || "");
    setTopic(row.description || "");
    setNarration(row.narration || "");
    setAppliedSheetRowId(row.id);
    setRenderOptions(ensureRenderOptions());
  }

  function handleSheetRowSelection(value: string): void {
    setSelectedSheetRowId(value);
    const row = sheetRows.find((item) => item.id === value);
    if (row) {
      applySheetRow(row);
      return;
    }
    setAppliedSheetRowId("");
  }

  function handleImageAspectRatioChange(value: string): void {
    const nextAspectRatio = normalizeImageAspectRatio(value);
    setImageAspectRatio(nextAspectRatio);
    if (nextAspectRatio === "16:9") {
      setOverlayOption("videoLayout", "panel_16_9");
    }
  }

  function setSceneField(
    sceneIndex: number,
    field: "sceneTitle" | "narrationText" | "imagePrompt",
    value: string
  ): void {
    setWorkflow((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.index === sceneIndex
            ? {
                ...scene,
                [field]: value
              }
            : scene
        )
      };
    });
  }

  function setSubtitleOption<K extends keyof RenderOptions["subtitle"]>(
    key: K,
    value: RenderOptions["subtitle"][K]
  ): void {
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        [key]: value
      }
    }));
  }

  const setManualSubtitleCues = useCallback((nextCues: SubtitleCue[]): void => {
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        manualCues: nextCues
      }
    }));
  }, []);

  const updateManualSubtitleCue = useCallback(
    (cueId: string, patch: Partial<SubtitleCue>): void => {
      setRenderOptions((prev) => ({
        ...prev,
        subtitle: {
          ...prev.subtitle,
          manualCues: (prev.subtitle.manualCues || []).map((cue) =>
            cue.id === cueId
              ? {
                  ...cue,
                  ...patch
                }
              : cue
          )
        }
      }));
    },
    []
  );

  function removeManualSubtitleCue(cueId: string): void {
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        manualCues: (prev.subtitle.manualCues || []).filter((cue) => cue.id !== cueId)
      }
    }));
  }

  function addManualSubtitleCue(): void {
    const tail = manualSubtitleCues[manualSubtitleCues.length - 1];
    const startMs = tail ? tail.endMs : 0;
    const endMs = startMs + 1500;
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        manualCues: [
          ...(prev.subtitle.manualCues || []),
          {
            id: crypto.randomUUID(),
            startMs,
            endMs,
            text: "새 자막"
          }
        ]
      }
    }));
  }

  function generateManualSubtitleCues(): void {
    if (!workflow) {
      return;
    }
    const durationSec = ttsDurationSec || workflow.input.videoLengthSec || 30;
    const cues = generateSubtitleCuesFromNarration({
      narration: workflow.narration,
      durationSec,
      wordsPerCaption: renderOptions.subtitle.wordsPerCaption,
      subtitleDelayMs: renderOptions.subtitle.subtitleDelayMs
    });
    setManualSubtitleCues(cues);
  }

  function shiftAllManualSubtitleCues(deltaMs: number): void {
    const cues = renderOptions.subtitle.manualCues || [];
    if (cues.length === 0) {
      return;
    }
    const minStart = Math.min(...cues.map((cue) => cue.startMs));
    const maxEnd = Math.max(...cues.map((cue) => cue.endMs));
    const allowedShift = clampNumber(
      deltaMs,
      -minStart,
      Math.max(0, timelineDurationMs - maxEnd),
      0
    );
    if (allowedShift === 0) {
      return;
    }
    setRenderOptions((prev) => ({
      ...prev,
      subtitle: {
        ...prev.subtitle,
        manualCues: (prev.subtitle.manualCues || []).map((cue) => ({
          ...cue,
          startMs: clampNumber(cue.startMs + allowedShift, 0, timelineDurationMs, cue.startMs),
          endMs: clampNumber(cue.endMs + allowedShift, 1, timelineDurationMs, cue.endMs)
        }))
      }
    }));
  }

  function alignFirstCueToPlayhead(): void {
    const cues = [...(renderOptions.subtitle.manualCues || [])];
    if (cues.length === 0) {
      return;
    }
    const firstCue = cues.sort((a, b) => a.startMs - b.startMs)[0];
    const targetMs = clampNumber(Math.round(timelineAudioSec * 1000), 0, timelineDurationMs, 0);
    const deltaMs = targetMs - firstCue.startMs;
    shiftAllManualSubtitleCues(deltaMs);
  }

  function seekTimelineAudio(nextMs: number): void {
    const audio = workflowAudioRef.current;
    const clampedMs = clampNumber(nextMs, 0, timelineDurationMs, 0);
    setTimelineAudioSec(clampedMs / 1000);
    if (audio) {
      audio.currentTime = clampedMs / 1000;
    }
  }

  function startSubtitleCueInteraction(
    event: React.PointerEvent<HTMLDivElement>,
    cueId: string,
    mode: "move" | "start" | "end"
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const timeline = subtitleTimelineRef.current;
    const cue = (renderOptions.subtitle.manualCues || []).find((item) => item.id === cueId);
    if (!timeline || !cue) {
      return;
    }
    const width = timeline.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) {
      return;
    }
    subtitleCueInteractionRef.current = {
      cueId,
      mode,
      startX: event.clientX,
      startStartMs: cue.startMs,
      startEndMs: cue.endMs,
      timelineWidth: width
    };
    setDraggingCueId(cueId);
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  const handleSubtitleCueDragMove = useCallback(
    (event: PointerEvent): void => {
      const interaction = subtitleCueInteractionRef.current;
      if (!interaction) {
        return;
      }
      const deltaPx = event.clientX - interaction.startX;
      const deltaMs = Math.round((deltaPx / interaction.timelineWidth) * timelineDurationMs);
      const cueDurationMs = Math.max(
        MIN_CUE_MS,
        interaction.startEndMs - interaction.startStartMs
      );

      if (interaction.mode === "move") {
        const nextStart = clampNumber(
          interaction.startStartMs + deltaMs,
          0,
          Math.max(0, timelineDurationMs - cueDurationMs),
          interaction.startStartMs
        );
        updateManualSubtitleCue(interaction.cueId, {
          startMs: nextStart,
          endMs: nextStart + cueDurationMs
        });
        return;
      }

      if (interaction.mode === "start") {
        const nextStart = clampNumber(
          interaction.startStartMs + deltaMs,
          0,
          interaction.startEndMs - MIN_CUE_MS,
          interaction.startStartMs
        );
        updateManualSubtitleCue(interaction.cueId, {
          startMs: nextStart
        });
        return;
      }

      const nextEnd = clampNumber(
        interaction.startEndMs + deltaMs,
        interaction.startStartMs + MIN_CUE_MS,
        timelineDurationMs,
        interaction.startEndMs
      );
      updateManualSubtitleCue(interaction.cueId, {
        endMs: nextEnd
      });
    },
    [timelineDurationMs, updateManualSubtitleCue]
  );

  const stopSubtitleCueDrag = useCallback((): void => {
    subtitleCueInteractionRef.current = undefined;
    setDraggingCueId(undefined);
  }, []);

  function onSubtitleTimelinePointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ): void {
    if (event.defaultPrevented) {
      return;
    }
    const timeline = subtitleTimelineRef.current;
    if (!timeline) {
      return;
    }
    const rect = timeline.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const ratio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1, 0);
    seekTimelineAudio(Math.round(ratio * timelineDurationMs));
  }

  function setOverlayOption<K extends keyof RenderOptions["overlay"]>(
    key: K,
    value: RenderOptions["overlay"][K]
  ): void {
    setRenderOptions((prev) => ({
      ...prev,
      overlay: {
        ...prev.overlay,
        [key]: value
      }
    }));
  }

  const updateTemplateItem = useCallback(
    (id: string, patch: Partial<TitleTemplateItem>): void => {
      const normalizedPatch =
        typeof patch.text === "string"
          ? {
              ...patch,
              text: normalizeTemplateText(patch.text)
            }
          : patch;
      setRenderOptions((prev) => ({
        ...prev,
        overlay: {
          ...prev.overlay,
          titleTemplates: (prev.overlay.titleTemplates || []).map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...normalizedPatch,
                  ...(id === primaryTitleTemplateId &&
                  typeof normalizedPatch.text === "string" &&
                  !normalizedPatch.text.trim()
                    ? { text: defaultPrimaryTemplateText }
                    : {})
                }
              : item
          )
        }
      }));
    },
    []
  );

  function addTitleTemplate(): void {
    const currentTemplates = renderOptions.overlay.titleTemplates || [];
    const nextIndex = currentTemplates.length + 1;
    const template: TitleTemplateItem = {
      id: crypto.randomUUID(),
      text: `TITLE ${nextIndex}`,
      x: 50,
      y: Math.min(85, 8 + nextIndex * 10),
      width: 60,
      fontSize: 44,
      color: "#FFFFFF",
      paddingX: 8,
      paddingY: 4,
      shadowX: 2,
      shadowY: 2,
      shadowColor: "#000000",
      shadowOpacity: 1,
      fontThickness: 0,
      fontName: renderOptions.overlay.titleFontName,
      fontFile: renderOptions.overlay.titleFontFile || undefined
    };

    setOverlayOption("titleTemplates", [...currentTemplates, template]);
  }

  function removeTitleTemplate(id: string): void {
    if (id === primaryTitleTemplateId) {
      return;
    }
    setOverlayOption(
      "titleTemplates",
      (renderOptions.overlay.titleTemplates || []).filter((item) => item.id !== id)
    );
  }

  function startTemplateInteraction(
    event: React.PointerEvent<HTMLDivElement>,
    templateId: string,
    mode: "move" | "resize"
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const currentTemplate = (renderOptions.overlay.titleTemplates || []).find(
      (item) => item.id === templateId
    );
    templateInteractionRef.current = {
      id: templateId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentTemplate?.width || 60
    };
    setDraggingTemplateId(templateId);
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function startSubtitlePreviewDrag(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const canvas = templateCanvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }
    const y = clampNumber(((event.clientY - rect.top) / rect.height) * 100, 8, 92, 52);
    subtitleDragRef.current = { pointerId: event.pointerId };
    setDraggingSubtitlePreview(true);
    const nextPosition = subtitlePositionFromYPercent(y);
    setRenderOptions((prev) =>
      prev.subtitle.position === nextPosition && prev.subtitle.subtitleYPercent === y
        ? prev
        : {
            ...prev,
            subtitle: {
              ...prev.subtitle,
              position: nextPosition,
              subtitleYPercent: y
            }
          }
    );
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  const readFocusRegionPoint = useCallback((clientX: number, clientY: number) => {
    const region = vrewFocusRegionRef.current;
    if (!region) {
      return undefined;
    }
    const rect = region.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }
    const x = clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100, 50);
    const y = clampNumber(((clientY - rect.top) / rect.height) * 100, 0, 100, 50);
    return { x, y };
  }, []);

  const updateFocusPointFromClient = useCallback((clientX: number, clientY: number): void => {
    const point = readFocusRegionPoint(clientX, clientY);
    if (!point) {
      return;
    }
    setRenderOptions((prev) => ({
      ...prev,
      overlay: {
        ...prev.overlay,
        focusXPercent: point.x,
        focusYPercent: point.y
      }
    }));
  }, [readFocusRegionPoint]);

  function startFocusPickerDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (!showFocusPicker) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = readFocusRegionPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    focusPickerDragRef.current = { pointerId: event.pointerId };
    focusPickerInteractionRef.current = {
      startX: point.x,
      startY: point.y
    };
    setFocusSelectionDraft(undefined);
    setDraggingFocusPicker(true);
    updateFocusPointFromClient(event.clientX, event.clientY);
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  const handleTemplateDragMove = useCallback(
    (event: PointerEvent): void => {
      const interaction = templateInteractionRef.current;
      const canvas = templateCanvasRef.current;
      if (!interaction || !canvas) {
        return;
      }
      if (interaction.mode === "move") {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }
        const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
        const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
        updateTemplateItem(interaction.id, { x, y });
        return;
      }

      const deltaX = event.clientX - interaction.startX;
      const nextWidth = Math.max(
        10,
        Math.min(95, Math.round(interaction.startWidth + deltaX * 0.15))
      );
      updateTemplateItem(interaction.id, { width: nextWidth });
    },
    [updateTemplateItem]
  );

  const stopTemplateDrag = useCallback((): void => {
    templateInteractionRef.current = undefined;
    setDraggingTemplateId(undefined);
  }, []);

  useEffect(() => {
    if (!draggingTemplateId) {
      return;
    }
    const onMove = (event: PointerEvent) => handleTemplateDragMove(event);
    const onUp = () => stopTemplateDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingTemplateId, handleTemplateDragMove, stopTemplateDrag]);

  useEffect(() => {
    if (!draggingSubtitlePreview) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const canvas = templateCanvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const y = clampNumber(((event.clientY - rect.top) / rect.height) * 100, 8, 92, 52);
      const nextPosition = subtitlePositionFromYPercent(y);
      setRenderOptions((prev) =>
        prev.subtitle.position === nextPosition && prev.subtitle.subtitleYPercent === y
          ? prev
          : {
              ...prev,
              subtitle: {
                ...prev.subtitle,
                position: nextPosition,
                subtitleYPercent: y
              }
            }
      );
    };
    const stopDrag = () => {
      subtitleDragRef.current = undefined;
      setDraggingSubtitlePreview(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [draggingSubtitlePreview]);

  useEffect(() => {
    if (!draggingFocusPicker) {
      return;
    }
    const onMove = (event: PointerEvent): void => {
      const point = readFocusRegionPoint(event.clientX, event.clientY);
      const interaction = focusPickerInteractionRef.current;
      if (!point || !interaction) {
        return;
      }
      const width = Math.abs(point.x - interaction.startX);
      const height = Math.abs(point.y - interaction.startY);
      if (width < 1.2 && height < 1.2) {
        setFocusSelectionDraft(undefined);
        updateFocusPointFromClient(event.clientX, event.clientY);
        return;
      }
      const left = Math.min(interaction.startX, point.x);
      const top = Math.min(interaction.startY, point.y);
      const nextWidth = Math.max(2, width);
      const nextHeight = Math.max(2, height);
      setFocusSelectionDraft({
        left,
        top,
        width: nextWidth,
        height: nextHeight
      });
      const centerX = left + nextWidth / 2;
      const centerY = top + nextHeight / 2;
      const nextDrift = clampNumber(Math.max(nextWidth, nextHeight) / 2, 0, 20, 6);
      setRenderOptions((prev) => ({
        ...prev,
        overlay: {
          ...prev.overlay,
          focusXPercent: centerX,
          focusYPercent: centerY,
          focusDriftPercent: nextDrift
        }
      }));
    };
    const stopDrag = (): void => {
      focusPickerDragRef.current = undefined;
      focusPickerInteractionRef.current = undefined;
      setDraggingFocusPicker(false);
      setFocusSelectionDraft(undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [draggingFocusPicker, readFocusRegionPoint, updateFocusPointFromClient]);

  useEffect(() => {
    if (!draggingCueId) {
      return;
    }
    const onMove = (event: PointerEvent) => handleSubtitleCueDragMove(event);
    const onUp = () => stopSubtitleCueDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingCueId, handleSubtitleCueDragMove, stopSubtitleCueDrag]);

  useEffect(() => {
    const canvas = templateCanvasRef.current;
    if (!canvas || activePanelTab !== "workflow") {
      return;
    }

    const measure = (): boolean => {
      const nextWidth = canvas.getBoundingClientRect().width;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
        return false;
      }
      setTemplateCanvasWidth((prev) =>
        Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth
      );
      return true;
    };

    let rafId: number | undefined;
    const ensureMeasured = (): void => {
      if (measure()) {
        return;
      }
      rafId = window.requestAnimationFrame(ensureMeasured);
    };
    ensureMeasured();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(canvas);
    }

    const onResize = (): void => {
      measure();
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (rafId !== undefined) {
        window.cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [activePanelTab, workflow?.stage, workflow?.id]);

  function onImageStylePresetChange(value: string): void {
    setImageStylePreset(value);
    if (value !== customStyleOption) {
      setImageStyle(value);
    }
  }

  function onImageStyleInputChange(nextValue: string): void {
    setImageStyle(nextValue);
    setImageStylePreset(detectStylePreset(nextValue));
  }

  async function previewVoice(): Promise<void> {
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice,
          speed: Number(voiceSpeed),
          text: previewText
        })
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to generate preview audio.");
      }

      const blob = await response.blob();
      const playableBlob =
        blob.type && blob.type.startsWith("audio/")
          ? blob
          : new Blob([blob], { type: "audio/wav" });
      previewBlobMetaRef.current = {
        type: playableBlob.type,
        size: playableBlob.size
      };
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

  async function saveSceneSplitEdits(): Promise<void> {
    if (!workflow || workflow.stage !== "scene_split_review") {
      return;
    }
    setSavingSceneSplit(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/workflow/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          narration: workflow.narration,
          scenes: workflow.scenes
        })
      });
      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (!response.ok || !isWorkflowPayload(data)) {
        throw new Error(("error" in data && data.error) || "Failed to save scene split.");
      }
      setWorkflow(data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown error");
    } finally {
      setSavingSceneSplit(false);
    }
  }

  async function regenerateSceneImage(sceneIndex: number): Promise<void> {
    if (!workflow || workflow.stage !== "assets_review") {
      return;
    }
    if (regeneratingSceneIndexes.includes(sceneIndex)) {
      return;
    }

    setRegeneratingSceneIndexes((prev) => [...prev, sceneIndex]);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/workflow/${workflow.id}/scenes/${sceneIndex}/regenerate`,
        {
          method: "POST"
        }
      );
      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (!response.ok || !isWorkflowPayload(data)) {
        throw new Error(
          ("error" in data && data.error) || "Failed to re-generate scene image."
        );
      }
      setWorkflow(data);
      setRenderOptions(ensureRenderOptions(data.renderOptions));
    } catch (regenError) {
      setError(regenError instanceof Error ? regenError.message : "Unknown error");
    } finally {
      setRegeneratingSceneIndexes((prev) =>
        prev.filter((index) => index !== sceneIndex)
      );
    }
  }

  async function runNextStage(): Promise<void> {
    if (!workflow || workflow.status === "processing") {
      return;
    }
    const currentIdx = stageIndex(workflow.stage);
    const target = workflowStepLabels[currentIdx + 1];
    if (!target) {
      return;
    }
    await runUntilStage(target.stage);
  }

  async function rewindToStage(targetStage: VideoWorkflow["stage"]): Promise<void> {
    if (!workflow || workflow.status === "processing") {
      return;
    }

    setRunningNext(true);
    setError(undefined);
    try {
      const patchPayload: Record<string, unknown> = {
        stage: targetStage,
        renderOptions
      };

      if (targetStage === "scene_split_review") {
        patchPayload.narration = workflow.narration;
        patchPayload.scenes = workflow.scenes;
      }

      const response = await fetch(`/api/workflow/${workflow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload)
      });
      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (!response.ok || !isWorkflowPayload(data)) {
        throw new Error(("error" in data && data.error) || "Failed to move workflow stage.");
      }

      setWorkflow(data);
      setRenderOptions(ensureRenderOptions(data.renderOptions));
    } catch (rewindError) {
      setError(rewindError instanceof Error ? rewindError.message : "Unknown error");
    } finally {
      setRunningNext(false);
    }
  }

  async function selectWorkflowStage(targetStage: VideoWorkflow["stage"]): Promise<void> {
    if (!workflow || workflow.status === "processing" || runningNext) {
      return;
    }

    const currentIdx = stageIndex(workflow.stage);
    const targetIdx = stageIndex(targetStage);
    if (targetIdx < 0 || currentIdx === targetIdx) {
      return;
    }

    if (targetIdx > currentIdx) {
      await runUntilStage(targetStage);
      return;
    }

    await rewindToStage(targetStage);
  }

  async function runUntilStage(targetStage: VideoWorkflow["stage"]): Promise<void> {
    if (!workflow || workflow.status === "processing") {
      return;
    }

    const targetIdx = stageIndex(targetStage);
    if (targetIdx < 0) {
      return;
    }

    setRunningNext(true);
    setError(undefined);
    let currentWorkflow = workflow;

    try {
      while (stageIndex(currentWorkflow.stage) < targetIdx) {
        const patchPayload: Record<string, unknown> = {
          renderOptions
        };
        if (currentWorkflow.stage === "scene_split_review") {
          patchPayload.narration = currentWorkflow.narration;
          patchPayload.scenes = currentWorkflow.scenes;
        }

        const patchResponse = await fetch(`/api/workflow/${currentWorkflow.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload)
        });
        const patchData = (await patchResponse.json()) as VideoWorkflow | { error?: string };
        if (!patchResponse.ok || !isWorkflowPayload(patchData)) {
          throw new Error(
            ("error" in patchData && patchData.error) ||
              "Failed to save workflow settings before next stage."
          );
        }

        setRenderOptions(ensureRenderOptions(patchData.renderOptions));
        setWorkflow({
          ...patchData,
          status: "processing",
          updatedAt: new Date().toISOString(),
          error: undefined
        });

        const response = await fetch(`/api/workflow/${currentWorkflow.id}/next`, {
          method: "POST"
        });
        const data = (await response.json()) as VideoWorkflow | { error?: string };
        if (!response.ok || !isWorkflowPayload(data)) {
          throw new Error(("error" in data && data.error) || "Failed to run next stage.");
        }

        if (currentWorkflow.stage === "scene_split_review") {
          setAssetsGenerationProgress(100);
        } else if (currentWorkflow.stage === "assets_review") {
          setVideoReviewProgress(100);
        } else if (currentWorkflow.stage === "video_review") {
          setFinalRenderProgress(100);
        }
        currentWorkflow = data;
        setWorkflow(currentWorkflow);
        setRenderOptions(ensureRenderOptions(currentWorkflow.renderOptions));

        if (currentWorkflow.status === "failed") {
          break;
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unknown error");
    } finally {
      setRunningNext(false);
    }
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setWorkflow(undefined);
    const effectiveSheetRowId = selectedSheetRow?.id || appliedSheetRowId || undefined;
    try {
      const response = await fetch("/api/workflow/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: effectiveSheetRowId,
          title,
          topic: topic || undefined,
          narration: narration || undefined,
          imageStyle,
          imageAspectRatio,
          voice,
          voiceSpeed: Number(voiceSpeed),
          useSfx,
          videoLengthSec: Number(videoLengthSec),
          sceneCount: Number(sceneCount),
          tags: extractHashtags(topic)
        })
      });

      const data = (await response.json()) as VideoWorkflow | { error?: string };
      if (!response.ok || !isWorkflowPayload(data)) {
        throw new Error(("error" in data && data.error) || "Failed to start workflow.");
      }
      setSceneSplitProgress(100);
      setWorkflow(data);
      setActivePanelTab("workflow");
      setRenderOptions(ensureRenderOptions(data.renderOptions));
      setImageAspectRatio(normalizeImageAspectRatio(data.input.imageAspectRatio));
      setVoiceSpeed(String(data.input.voiceSpeed || 1));
      setSceneCount(String(data.input.sceneCount || 5));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div
        className="inline-flex min-w-0 w-full gap-1 rounded-xl border bg-card p-1"
        role="tablist"
        aria-label="Create panels"
      >
        <Button
          type="button"
          variant={activePanelTab === "create" ? "default" : "ghost"}
          className="flex-1"
          role="tab"
          aria-selected={activePanelTab === "create"}
          onClick={() => setActivePanelTab("create")}
        >
          Create 입력
        </Button>
        <Button
          type="button"
          variant={activePanelTab === "workflow" ? "default" : "ghost"}
          className="flex-1"
          role="tab"
          aria-selected={activePanelTab === "workflow"}
          onClick={() => setActivePanelTab("workflow")}
        >
          단계 진행
        </Button>
      </div>

      <div className={activePanelTab === "create" ? "block" : "hidden"}>
        <Card>
        <CardHeader>
          <CardTitle>Create New Short</CardTitle>
          <CardDescription>
            Fill the creative inputs, then run generation. Narration is optional if topic is provided.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitForm}>
            <div className="min-w-0 space-y-3 rounded-lg border bg-muted/25 p-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
                <Input
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                  placeholder="Sheet tab name (optional)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadSheetRows()}
                  disabled={loadingSheetRows}
                >
                  {loadingSheetRows ? "Loading..." : "Load Sheet Rows"}
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
                <Select value={selectedSheetRowId} onValueChange={handleSheetRowSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject row" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetRows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.subject || `(row ${row.rowNumber})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applySheetRow(selectedSheetRow)}
                  disabled={!selectedSheetRow}
                >
                  Apply Row
                </Button>
              </div>
              {selectedSheetRow ? (
                <p className="break-words text-xs text-muted-foreground">
                  Row {selectedSheetRow.rowNumber} | status: {selectedSheetRow.status} | keyword:{" "}
                  {selectedSheetRow.keyword || "-"} | subject:{" "}
                  {selectedSheetRow.subject || "-"} | description:{" "}
                  {selectedSheetRow.description || "-"} | narration:{" "}
                  {selectedSheetRow.narration ? "loaded" : "-"}
                </p>
              ) : null}
              {appliedSheetRowId ? (
                <p className="text-xs text-primary">
                  Applied row: {appliedSheetRowId} (선택한 주제만 반영됨)
                </p>
              ) : null}
              {appliedSheetRowId ? (
                <p className="text-xs text-muted-foreground">
                  새 시트 row를 적용하면 기존 이어하기 워크플로우는 자동 해제됩니다.
                </p>
              ) : null}
              {sheetError ? <p className="text-xs text-destructive">{sheetError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="5 productivity hacks that actually work"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic (optional)</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Productivity tips for remote workers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="narration">Narration (optional override)</Label>
              <Textarea
                id="narration"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Hook... Body... CTA..."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Image Style Preset</Label>
                <Select value={imageStylePreset} onValueChange={onImageStylePresetChange}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label htmlFor="style">Image Style Prompt</Label>
                <Input
                  id="style"
                  value={imageStyle}
                  onChange={(e) => onImageStyleInputChange(e.target.value)}
                  placeholder="Anime cel-shaded"
                />
              </div>
              <div className="space-y-2">
                <Label>장면 이미지 비율</Label>
                <Select value={imageAspectRatio} onValueChange={handleImageAspectRatioChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageAspectRatioOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {imageAspectRatioOptions.find((option) => option.value === imageAspectRatio)?.description}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_VOICE_OPTIONS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void previewVoice()}
                  disabled={previewLoading}
                >
                  {previewLoading ? "Generating..." : "Preview Voice"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Preview Voice 예상 소모: {formatTokenCount(previewVoiceEstimatedTokens)} 토큰
              </p>
              <div className="space-y-2">
                <Label>Voice Speed</Label>
                <Select value={voiceSpeed} onValueChange={setVoiceSpeed}>
                  <SelectTrigger>
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
              <Textarea
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                rows={2}
                placeholder="Preview text for TTS voice test"
              />
              {previewAudioUrl ? (
                <audio ref={previewAudioRef} src={previewAudioUrl} controls className="w-full" />
              ) : null}
              {previewError ? (
                <p className="text-xs text-destructive">{previewError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Generate a short sample to hear the selected voice before rendering.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Video Length</Label>
                <Select value={videoLengthSec} onValueChange={setVideoLengthSec}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                    <SelectItem value="45">45s</SelectItem>
                    <SelectItem value="60">60s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scene Count</Label>
                <Select value={sceneCount} onValueChange={setSceneCount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sceneCountOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value} scenes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Use SFX</Label>
                  <p className="text-xs text-muted-foreground">Mix background ambience</p>
                </div>
                <Switch checked={useSfx} onCheckedChange={setUseSfx} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Starting..."
                : `1단계 시작: 장면 분할 (예상 ${formatTokenCount(estimatedSceneSplitTokens)} 토큰)`}
            </Button>
            {submitting ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>장면 분할 처리 중...</span>
                  <span>{sceneSplitProgress}%</span>
                </div>
                <Progress value={sceneSplitProgress} />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </CardContent>
        </Card>
      </div>

      <div className={activePanelTab === "workflow" ? "block" : "hidden"}>
        <Card>
        <CardHeader>
          <CardTitle>단계 진행</CardTitle>
          <CardDescription>
            장면 분할 검토 → 오디오/이미지 검토 → 자막/비디오 검증 → 최종 생성
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">진행 중 작업 이어서 하기</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refreshResumableWorkflows()}
                disabled={loadingResumables}
              >
                {loadingResumables ? "Loading..." : "Refresh"}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
              <Select
                value={selectedResumeWorkflowId}
                onValueChange={setSelectedResumeWorkflowId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="이어갈 워크플로우 선택" />
                </SelectTrigger>
                <SelectContent>
                  {resumableWorkflows.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.input.title || "Untitled"} | {item.stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void resumeWorkflowById(selectedResumeWorkflowId)}
                disabled={!selectedResumeWorkflowId || resumingWorkflow}
              >
                {resumingWorkflow ? "Resuming..." : "이어하기"}
              </Button>
            </div>
            {resumeError ? <p className="text-xs text-destructive">{resumeError}</p> : null}
            {resumableWorkflows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                이어서 진행 가능한 작업이 없습니다.
              </p>
            ) : null}
          </div>

          {workflow ? (
            <>
              <div className="grid gap-2">
                {workflowStepLabels.map((step, idx) => {
                  const current = stageIndex(workflow.stage);
                  const state =
                    idx < current ? "done" : idx === current ? "current" : "pending";
                  const canRunToStep =
                    idx !== current &&
                    workflow.status !== "processing" &&
                    !runningNext;
                  return (
                    <button
                      type="button"
                      key={step.stage}
                      className="flex w-full items-center justify-between rounded-md border p-2 text-left disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={!canRunToStep}
                      onClick={() => void selectWorkflowStage(step.stage)}
                    >
                      <span className="text-sm">{step.title}</span>
                      <Badge
                        variant={state === "done" ? "default" : "muted"}
                      >
                        {state === "done"
                          ? "완료"
                          : state === "current"
                            ? "진행중"
                            : "대기"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                완료된 단계를 클릭하면 해당 단계로 돌아가 수정할 수 있습니다.
              </p>

              {workflow.status === "failed" ? (
                <p className="text-sm text-destructive">{workflow.error || "Workflow failed."}</p>
              ) : null}
              {workflow.status === "processing" ? (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-sm font-medium text-primary">
                    {processingHint(workflow.stage)}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      최근 갱신: {formatLocalTime(workflow.updatedAt)}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void fetchWorkflowSnapshot(workflow.id)}
                    >
                      상태 새로고침
                    </Button>
                  </div>
                  {isAssetsGenerationProcessing ? (
                    <div className="space-y-1 rounded-md border border-primary/20 bg-card p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>오디오/이미지 생성 중...</span>
                        <span>{assetsGenerationProgress}%</span>
                      </div>
                      <Progress value={assetsGenerationProgress} />
                    </div>
                  ) : null}
                  {shouldShowVideoReviewProgress ? (
                    <div className="space-y-1 rounded-md border border-primary/20 bg-card p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>자막/비디오 검증 생성 중...</span>
                        <span>{videoReviewProgress}%</span>
                      </div>
                      <Progress value={videoReviewProgress} />
                    </div>
                  ) : null}
                  {shouldShowFinalRenderProgress ? (
                    <div className="space-y-1 rounded-md border border-primary/20 bg-card p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>최종 비디오 생성 중...</span>
                        <span>{finalRenderProgress}%</span>
                      </div>
                      <Progress value={finalRenderProgress} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {workflow.stage === "scene_split_review" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    장면 생성 비율: {workflow.input.imageAspectRatio || "9:16"}
                  </p>
                  <Label>나레이션</Label>
                  <Textarea
                    value={workflow.narration}
                    rows={4}
                    onChange={(event) =>
                      setWorkflow((prev) =>
                        prev
                          ? {
                              ...prev,
                              narration: event.target.value
                            }
                          : prev
                      )
                    }
                  />
                  <div className="max-h-[280px] space-y-3 overflow-auto pr-1">
                    {workflow.scenes.map((scene) => (
                      <div key={scene.index} className="space-y-2 rounded-lg border p-3">
                        <p className="text-xs font-semibold text-muted-foreground">
                          Scene {scene.index}
                        </p>
                        <Input
                          value={scene.sceneTitle}
                          onChange={(event) =>
                            setSceneField(scene.index, "sceneTitle", event.target.value)
                          }
                        />
                        <Textarea
                          value={scene.narrationText}
                          rows={2}
                          onChange={(event) =>
                            setSceneField(scene.index, "narrationText", event.target.value)
                          }
                        />
                        <Textarea
                          value={scene.imagePrompt}
                          rows={3}
                          onChange={(event) =>
                            setSceneField(scene.index, "imagePrompt", event.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void saveSceneSplitEdits()}
                      disabled={savingSceneSplit || runningNext || workflow.status === "processing"}
                    >
                      {savingSceneSplit ? "Saving..." : "분할 내용 저장"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void runNextStage()}
                      disabled={runningNext || savingSceneSplit || workflow.status === "processing"}
                    >
                      {runningNext || workflow.status === "processing"
                        ? "Processing..."
                        : `다음: 오디오/이미지 생성 (예상 ${formatTokenCount(assetsGenerationEstimatedTokens)} 토큰)`}
                    </Button>
                  </div>
                </div>
              ) : null}

              {workflow.stage === "assets_review" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    장면 이미지 비율: {workflow.input.imageAspectRatio || "9:16"}
                  </p>
                  {workflow.ttsUrl ? (
                    <audio
                      ref={workflowAudioRef}
                      src={toDisplayMediaUrl(workflow.ttsUrl)}
                      controls
                      className="w-full"
                      onLoadedMetadata={(event) => {
                        const nextDuration = event.currentTarget.duration;
                        if (Number.isFinite(nextDuration) && nextDuration > 0) {
                          setTtsDurationSec(nextDuration);
                        }
                        setTimelineAudioSec(event.currentTarget.currentTime || 0);
                      }}
                      onTimeUpdate={(event) => {
                        setTimelineAudioSec(event.currentTarget.currentTime || 0);
                      }}
                      onPlay={() => setTimelineAudioPlaying(true)}
                      onPause={() => setTimelineAudioPlaying(false)}
                      onEnded={() => setTimelineAudioPlaying(false)}
                      onSeeking={(event) => {
                        setTimelineAudioSec(event.currentTarget.currentTime || 0);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">TTS 오디오가 없습니다.</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {workflow.scenes.map((scene) => {
                      const isRegenerating = regeneratingSceneIndexes.includes(scene.index);
                      return (
                        <div key={scene.index} className="space-y-2 rounded-md border p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {scene.imageUrl ? (
                            <img
                              src={toDisplayMediaUrl(scene.imageUrl)}
                              alt={`Scene ${scene.index}`}
                              className={`${sceneImageAspectClass} w-full rounded-md border object-cover`}
                            />
                          ) : (
                            <div className={`${sceneImageAspectClass} w-full rounded-md border bg-muted`} />
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              Scene {scene.index} · 예상 {formatTokenCount(estimateImagePromptTokens(scene.imagePrompt))} 토큰
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isRegenerating || workflow.status === "processing"}
                              onClick={() => void regenerateSceneImage(scene.index)}
                            >
                              {isRegenerating ? "Re-generating..." : "Re-generate"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-4 rounded-lg border p-3 sm:p-4">
                    <div className="order-2 space-y-1">
                      <p className="text-sm font-semibold">자막/화면 요소 설정</p>
                      <p className="text-xs text-muted-foreground">
                        다음 단계 비디오에 적용될 자막 스타일과 타이틀 레이어를 미리 조정합니다.
                      </p>
                    </div>
                    <div className="order-2 space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label>자막 스타일 프리셋 (CapCut 유사)</Label>
                          <Select
                            value={subtitleStylePresetId}
                            onValueChange={applySubtitleStylePreset}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="자막 스타일 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {subtitleStylePresets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                              <SelectItem value={customSubtitleStyleOption}>사용자 지정</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {selectedSubtitleStylePreset
                              ? selectedSubtitleStylePreset.description
                              : "직접 자막 폰트/색상/외곽선/그림자를 조합한 사용자 지정 스타일입니다."}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label>자막 폰트</Label>
                          <Select
                            value={detectSubtitleFontPreset(renderOptions.subtitle.fontName)}
                            onValueChange={(value) => {
                              if (value === customSubtitleFontOption) {
                                const currentFont = renderOptions.subtitle.fontName.trim();
                                if (!currentFont || subtitleFontPresets.includes(currentFont)) {
                                  setSubtitleOption("fontName", "Pretendard");
                                }
                                return;
                              }
                              setSubtitleOption("fontName", value);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="자막 폰트 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {subtitleFontPresets.map((font) => (
                                <SelectItem key={font} value={font}>
                                  {font}
                                </SelectItem>
                              ))}
                              <SelectItem value={customSubtitleFontOption}>
                                사용자 지정 폰트명
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>이미지 모션 효과</Label>
                          <Select
                            value={renderOptions.overlay.sceneMotionPreset || "gentle_zoom"}
                            onValueChange={(value) =>
                              setOverlayOption(
                                "sceneMotionPreset",
                                normalizeSceneMotionPreset(
                                  value as RenderOptions["overlay"]["sceneMotionPreset"]
                                )
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="모션 효과 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {sceneMotionPresets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {
                              sceneMotionPresets.find(
                                (item) =>
                                  item.id ===
                                  normalizeSceneMotionPreset(renderOptions.overlay.sceneMotionPreset)
                              )?.description
                            }
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label>렌더 FPS</Label>
                          <Select
                            value={String(normalizeOutputFps(renderOptions.overlay.outputFps))}
                            onValueChange={(value) =>
                              setOverlayOption(
                                "outputFps",
                                normalizeOutputFps(Number(value) as 30 | 60)
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="FPS 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {outputFpsOptions.map((option) => (
                                <SelectItem key={option.value} value={String(option.value)}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {
                              outputFpsOptions.find(
                                (item) => item.value === normalizeOutputFps(renderOptions.overlay.outputFps)
                              )?.description
                            }
                          </p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="motionSpeedPercent">모션 속도</Label>
                            <span className="text-xs text-muted-foreground">
                              {clampNumber(
                                Number(renderOptions.overlay.motionSpeedPercent),
                                MOTION_SPEED_PERCENT_MIN,
                                MOTION_SPEED_PERCENT_MAX,
                                MOTION_SPEED_PERCENT_DEFAULT
                              ).toFixed(0)}
                              %
                            </span>
                          </div>
                          <Input
                            id="motionSpeedPercent"
                            type="range"
                            min={MOTION_SPEED_PERCENT_MIN}
                            max={MOTION_SPEED_PERCENT_MAX}
                            step={5}
                            value={clampNumber(
                              Number(renderOptions.overlay.motionSpeedPercent),
                              MOTION_SPEED_PERCENT_MIN,
                              MOTION_SPEED_PERCENT_MAX,
                              MOTION_SPEED_PERCENT_DEFAULT
                            )}
                            onChange={(event) =>
                              setOverlayOption(
                                "motionSpeedPercent",
                                clampNumber(
                                  Number(event.target.value),
                                  MOTION_SPEED_PERCENT_MIN,
                                  MOTION_SPEED_PERCENT_MAX,
                                  MOTION_SPEED_PERCENT_DEFAULT
                                )
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            장면 내 카메라 이동 속도를 조절합니다. 값이 높을수록 더 빠르게 이동합니다.
                          </p>
                        </div>
                        {showFocusPicker ? (
                          <div className="space-y-3 rounded-md border border-cyan-200/60 bg-cyan-50/40 p-3">
                            <p className="text-xs text-cyan-800">
                              모든 모션 공통 포커스: 아래 미리보기 이미지를 클릭하면 중심점, 드래그하면 이동 영역이 바로 반영됩니다.
                            </p>
                            <p className="text-xs text-cyan-900">
                              현재 중심점: X{" "}
                              {clampNumber(Number(renderOptions.overlay.focusXPercent), 0, 100, 50).toFixed(1)}% · Y{" "}
                              {clampNumber(Number(renderOptions.overlay.focusYPercent), 0, 100, 50).toFixed(1)}%
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <Label htmlFor="focusDriftPercent">이동 범위</Label>
                                  <span className="text-xs text-muted-foreground">
                                    {clampNumber(
                                      Number(renderOptions.overlay.focusDriftPercent),
                                      0,
                                      20,
                                      6
                                    ).toFixed(1)}
                                    %
                                  </span>
                                </div>
                                <Input
                                  id="focusDriftPercent"
                                  type="range"
                                  min={0}
                                  max={20}
                                  step={0.5}
                                  value={clampNumber(
                                    Number(renderOptions.overlay.focusDriftPercent),
                                    0,
                                    20,
                                    6
                                  )}
                                  onChange={(event) =>
                                    setOverlayOption(
                                      "focusDriftPercent",
                                      clampNumber(Number(event.target.value), 0, 20, 6)
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <Label htmlFor="focusZoomPercent">줌 강도</Label>
                                  <span className="text-xs text-muted-foreground">
                                    {clampNumber(
                                      Number(renderOptions.overlay.focusZoomPercent),
                                      3,
                                      20,
                                      9
                                    ).toFixed(1)}
                                    %
                                  </span>
                                </div>
                                <Input
                                  id="focusZoomPercent"
                                  type="range"
                                  min={3}
                                  max={20}
                                  step={0.5}
                                  value={clampNumber(
                                    Number(renderOptions.overlay.focusZoomPercent),
                                    3,
                                    20,
                                    9
                                  )}
                                  onChange={(event) =>
                                    setOverlayOption(
                                      "focusZoomPercent",
                                      clampNumber(Number(event.target.value), 3, 20, 9)
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-1">
                          <Label>비디오 레이아웃</Label>
                          <Select
                            value={effectiveVideoLayout}
                            disabled={effectiveImageAspectRatio === "16:9"}
                            onValueChange={(value) =>
                              setOverlayOption(
                                "videoLayout",
                                resolveVideoLayoutForAspect(
                                  value as RenderOptions["overlay"]["videoLayout"],
                                  effectiveImageAspectRatio
                                )
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="레이아웃 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {videoLayoutOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {
                              videoLayoutOptions.find(
                                (item) =>
                                  item.value === effectiveVideoLayout
                              )?.description
                            }
                          </p>
                          {effectiveImageAspectRatio === "16:9" ? (
                            <p className="text-xs text-amber-600">
                              16:9 장면 비율에서는 가로 패널(`panel_16_9`) 레이아웃이 자동 적용됩니다.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {effectiveVideoLayout === "panel_16_9" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="panelTopPercent">16:9 패널 상단 위치(%)</Label>
                            <Input
                              id="panelTopPercent"
                              type="number"
                              min={0}
                              max={85}
                              value={clampNumber(Number(renderOptions.overlay.panelTopPercent), 0, 85, 34)}
                              onChange={(event) =>
                                setOverlayOption(
                                  "panelTopPercent",
                                  clampNumber(Number(event.target.value), 0, 85, 34)
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="panelWidthPercent">16:9 패널 폭(%)</Label>
                            <Input
                              id="panelWidthPercent"
                              type="number"
                              min={60}
                              max={100}
                              value={clampNumber(Number(renderOptions.overlay.panelWidthPercent), 60, 100, 100)}
                              onChange={(event) =>
                                setOverlayOption(
                                  "panelWidthPercent",
                                  clampNumber(Number(event.target.value), 60, 100, 100)
                                )
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {detectSubtitleFontPreset(renderOptions.subtitle.fontName) ===
                      customSubtitleFontOption ? (
                        <div className="space-y-1">
                          <Label htmlFor="subtitleCustomFont">자막 사용자 폰트명</Label>
                          <Input
                            id="subtitleCustomFont"
                            value={renderOptions.subtitle.fontName}
                            onChange={(event) =>
                              setSubtitleOption(
                                "fontName",
                                event.target.value.trim() || "Pretendard"
                              )
                            }
                            placeholder="예: Pretendard"
                          />
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1">
                          <Label>자막 위치</Label>
                          <Select
                            value={renderOptions.subtitle.position}
                            onValueChange={(value) => {
                              const nextPosition = value as RenderOptions["subtitle"]["position"];
                              const nextY = subtitlePreviewYForPosition(nextPosition);
                              setRenderOptions((prev) => ({
                                ...prev,
                                subtitle: {
                                  ...prev.subtitle,
                                  position: nextPosition,
                                  subtitleYPercent: nextY
                                }
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">상단</SelectItem>
                              <SelectItem value="middle">중앙</SelectItem>
                              <SelectItem value="bottom">하단</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleWords">자막 단어 수 (캡션당)</Label>
                          <Input
                            id="subtitleWords"
                            type="number"
                            min={2}
                            max={10}
                            value={renderOptions.subtitle.wordsPerCaption}
                            onChange={(event) =>
                              setSubtitleOption(
                                "wordsPerCaption",
                                clampNumber(Number(event.target.value), 2, 10, 5)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleDelayMs">자막 시작 지연(ms)</Label>
                          <Input
                            id="subtitleDelayMs"
                            type="number"
                            min={-500}
                            max={1500}
                            value={clampNumber(Number(renderOptions.subtitle.subtitleDelayMs), -500, 1500, 180)}
                            onChange={(event) =>
                              setSubtitleOption(
                                "subtitleDelayMs",
                                clampNumber(Number(event.target.value), -500, 1500, 180)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleSize">자막 폰트 크기</Label>
                          <Input
                            id="subtitleSize"
                            type="number"
                            min={10}
                            max={80}
                            value={renderOptions.subtitle.fontSize}
                            onChange={(event) =>
                              setSubtitleOption(
                                "fontSize",
                                clampNumber(Number(event.target.value), 10, 80, 16)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="titleSize">기본 타이틀 폰트 크기</Label>
                          <Input
                            id="titleSize"
                            type="number"
                            min={16}
                            max={120}
                            value={renderOptions.overlay.titleFontSize}
                            onChange={(event) =>
                              setOverlayOption(
                                "titleFontSize",
                                clampNumber(Number(event.target.value), 16, 120, 48)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleOutlineThickness">자막 외곽선 두께</Label>
                          <Input
                            id="subtitleOutlineThickness"
                            type="number"
                            min={0}
                            max={8}
                            value={renderOptions.subtitle.outline}
                            onChange={(event) =>
                              setSubtitleOption(
                                "outline",
                                clampNumber(Number(event.target.value), 0, 8, 2)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleShadow">자막 그림자 강도</Label>
                          <Input
                            id="subtitleShadow"
                            type="number"
                            min={0}
                            max={8}
                            value={renderOptions.subtitle.shadow}
                            onChange={(event) =>
                              setSubtitleOption(
                                "shadow",
                                clampNumber(Number(event.target.value), 0, 8, 1)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleShadowOpacity">자막 그림자 투명도(%)</Label>
                          <Input
                            id="subtitleShadowOpacity"
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(
                              clampNumber(Number(renderOptions.subtitle.shadowOpacity), 0, 1, 1) * 100
                            )}
                            onChange={(event) =>
                              setSubtitleOption(
                                "shadowOpacity",
                                clampNumber(Number(event.target.value), 0, 100, 100) / 100
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleThickness">자막 텍스트 두께</Label>
                          <Input
                            id="subtitleThickness"
                            type="number"
                            min={0}
                            max={8}
                            value={clampNumber(Number(renderOptions.subtitle.fontThickness), 0, 8, 0)}
                            onChange={(event) =>
                              setSubtitleOption(
                                "fontThickness",
                                clampNumber(Number(event.target.value), 0, 8, 0)
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleColor">자막 본문 색상</Label>
                          <Input
                            id="subtitleColor"
                            type="color"
                            className="h-10 p-1"
                            value={normalizeHexColor(renderOptions.subtitle.primaryColor, "#FFFFFF")}
                            onChange={(event) =>
                              setSubtitleOption("primaryColor", event.target.value.toUpperCase())
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="subtitleOutline">자막 외곽선 색상</Label>
                          <Input
                            id="subtitleOutline"
                            type="color"
                            className="h-10 p-1"
                            value={normalizeHexColor(renderOptions.subtitle.outlineColor, "#000000")}
                            onChange={(event) =>
                              setSubtitleOption("outlineColor", event.target.value.toUpperCase())
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2 rounded-md border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">자막 타이밍 편집 (Vrew 스타일 2차)</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const audio = workflowAudioRef.current;
                                if (!audio) {
                                  return;
                                }
                                if (audio.paused) {
                                  void audio.play();
                                } else {
                                  audio.pause();
                                }
                              }}
                            >
                              {timelineAudioPlaying ? "일시정지" : "재생"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={generateManualSubtitleCues}
                            >
                              나레이션 기준 자동 생성
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addManualSubtitleCue}
                            >
                              자막 추가
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setManualSubtitleCues([])}
                            >
                              초기화
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          각 행의 시작/종료(ms)와 텍스트를 수정하면 그대로 렌더됩니다.
                          {` `}
                          자동 생성은 현재 길이(
                          {Math.round((ttsDurationSec || workflow.input.videoLengthSec || 30) * 10) / 10}s)
                          기준입니다.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">타임라인 레인</Label>
                            <Select
                              value={String(timelineLaneCount)}
                              onValueChange={(value) =>
                                setTimelineLaneCount(
                                  clampNumber(
                                    Number(value),
                                    TIMELINE_LANE_OPTIONS[0],
                                    TIMELINE_LANE_OPTIONS[TIMELINE_LANE_OPTIONS.length - 1],
                                    TIMELINE_LANE_DEFAULT
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-[96px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIMELINE_LANE_OPTIONS.map((laneCount) => (
                                  <SelectItem key={`lane-${laneCount}`} value={String(laneCount)}>
                                    {laneCount}줄
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={timelineCues.length === 0}
                              onClick={() => shiftAllManualSubtitleCues(-120)}
                            >
                              싱크 -120ms
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={timelineCues.length === 0}
                              onClick={() => shiftAllManualSubtitleCues(120)}
                            >
                              싱크 +120ms
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={timelineCues.length === 0}
                              onClick={alignFirstCueToPlayhead}
                            >
                              플레이헤드에 첫 자막 정렬
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-[320px,minmax(0,1fr)]">
                          <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold">영상 미리보기</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => seekTimelineAudio(0)}
                              >
                                처음으로
                              </Button>
                            </div>
                            <div className="mx-auto w-full max-w-[280px]">
                              <div
                                ref={vrewPreviewCanvasRef}
                                className="relative aspect-[9/16] w-full overflow-hidden rounded-md border bg-black"
                              >
                                {vrewPreviewLayout === "panel_16_9" ? (
                                  <div
                                    ref={vrewFocusRegionRef}
                                    className="absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-sm bg-black"
                                    style={{
                                      top: `${clampNumber(Number(renderOptions.overlay.panelTopPercent), 0, 85, 34)}%`,
                                      width: `${clampNumber(Number(renderOptions.overlay.panelWidthPercent), 60, 100, 100)}%`,
                                      aspectRatio: "16 / 9"
                                    }}
                                  >
                                    {workflow.scenes[activePreviewSceneIndex]?.imageUrl ? (
                                      <img
                                        src={toDisplayMediaUrl(
                                          workflow.scenes[activePreviewSceneIndex]?.imageUrl,
                                          workflow.updatedAt
                                        )}
                                        alt={`Preview scene ${activePreviewSceneIndex + 1}`}
                                        className="absolute inset-0 h-full w-full object-cover"
                                        style={vrewImageMotionStyle}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
                                        이미지 없음
                                      </div>
                                    )}
                                    {showFocusPicker ? (
                                      <div
                                        onPointerDown={startFocusPickerDrag}
                                        className={`absolute inset-0 ${draggingFocusPicker ? "cursor-grabbing" : "cursor-crosshair"}`}
                                      >
                                        <div
                                          className="pointer-events-none absolute rounded border border-cyan-300/70"
                                          style={{
                                            left: `${focusPickerBox.left}%`,
                                            top: `${focusPickerBox.top}%`,
                                            width: `${Math.max(2, focusPickerBox.width)}%`,
                                            height: `${Math.max(2, focusPickerBox.height)}%`
                                          }}
                                        />
                                        <div
                                          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100 bg-cyan-400/80"
                                          style={{
                                            left: `${focusPickerCenter.x}%`,
                                            top: `${focusPickerCenter.y}%`
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div ref={vrewFocusRegionRef} className="absolute inset-0 overflow-hidden">
                                    {workflow.scenes[activePreviewSceneIndex]?.imageUrl ? (
                                      <img
                                        src={toDisplayMediaUrl(
                                          workflow.scenes[activePreviewSceneIndex]?.imageUrl,
                                          workflow.updatedAt
                                        )}
                                        alt={`Preview scene ${activePreviewSceneIndex + 1}`}
                                        className="absolute inset-0 h-full w-full object-cover"
                                        style={vrewImageMotionStyle}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
                                        이미지 없음
                                      </div>
                                    )}
                                    {showFocusPicker ? (
                                      <div
                                        onPointerDown={startFocusPickerDrag}
                                        className={`absolute inset-0 ${draggingFocusPicker ? "cursor-grabbing" : "cursor-crosshair"}`}
                                      >
                                        <div
                                          className="pointer-events-none absolute rounded border border-cyan-300/70"
                                          style={{
                                            left: `${focusPickerBox.left}%`,
                                            top: `${focusPickerBox.top}%`,
                                            width: `${Math.max(2, focusPickerBox.width)}%`,
                                            height: `${Math.max(2, focusPickerBox.height)}%`
                                          }}
                                        />
                                        <div
                                          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100 bg-cyan-400/80"
                                          style={{
                                            left: `${focusPickerCenter.x}%`,
                                            top: `${focusPickerCenter.y}%`
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                                {previewTitleTemplates.map((item) => {
                                  const text =
                                    item.id === primaryTitleTemplateId
                                      ? normalizeTemplateText(item.text).trim() || defaultPrimaryTemplateText
                                      : normalizeTemplateText(item.text);
                                  const titleColor = normalizeHexColor(item.color, "#FFFFFF");
                                  const titleTextShadow = [
                                    ...buildTextThicknessShadow(
                                      titleColor,
                                      clampNumber(Number(item.fontThickness), 0, 8, 0)
                                    ),
                                    `${(item.shadowX ?? 2) * vrewPreviewScale}px ${(item.shadowY ?? 2) * vrewPreviewScale}px ${Math.max(1, 4 * vrewPreviewScale)}px ${hexToRgba(
                                      item.shadowColor,
                                      clampNumber(Number(item.shadowOpacity), 0, 1, 1),
                                      "#000000"
                                    )}`
                                  ].join(", ");
                                  return (
                                    <div
                                      key={`preview-title-${item.id}`}
                                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center"
                                      style={{
                                        zIndex: 22,
                                        left: `${item.x}%`,
                                        top: `${item.y}%`,
                                        width: `${item.width}%`,
                                        color: titleColor,
                                        fontSize: `${Math.max(10, item.fontSize * vrewPreviewScale)}px`,
                                        fontFamily:
                                          item.fontName ||
                                          renderOptions.overlay.titleFontName ||
                                          "Malgun Gothic",
                                        padding: `${item.paddingY ?? 4}px ${item.paddingX ?? 8}px`,
                                        textShadow: titleTextShadow || undefined,
                                        lineHeight: 1.2,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word"
                                      }}
                                    >
                                      {text}
                                    </div>
                                  );
                                })}
                                {activePreviewCueText ? (
                                  <div
                                    className="pointer-events-none absolute left-2 right-2 -translate-y-1/2 rounded px-2 py-1 text-center"
                                    style={{ top: `${subtitlePreviewTop}%`, zIndex: 24 }}
                                  >
                                    <p
                                      style={{
                                        color: normalizeHexColor(renderOptions.subtitle.primaryColor, "#FFFFFF"),
                                        fontFamily: renderOptions.subtitle.fontName || "Arial",
                                        fontSize: `${vrewSubtitlePreviewFontSize}px`,
                                        textShadow: vrewSubtitlePreviewTextShadow || undefined,
                                        lineHeight: 1.22,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "keep-all"
                                      }}
                                    >
                                      {activePreviewCueText}
                                    </p>
                                  </div>
                                ) : null}
                                <div className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
                                  Scene {activePreviewSceneIndex + 1} / {workflow.scenes.length}
                                </div>
                                <div className="absolute right-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
                                  {formatTimelineTime(Math.round(timelineAudioSec * 1000))}
                                </div>
                                <div className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
                                  Title Layers {previewTitleTemplates.length}
                                </div>
                              </div>
                            </div>
                            <Input
                              type="range"
                              min={0}
                              max={timelineDurationMs}
                              step={10}
                              value={clampNumber(
                                Math.round(timelineAudioSec * 1000),
                                0,
                                timelineDurationMs,
                                0
                              )}
                              onChange={(event) => seekTimelineAudio(Number(event.target.value))}
                            />
                            <p className="text-[10px] text-muted-foreground">
                              타이밍 편집과 동기화된 미리보기
                            </p>
                            {showFocusPicker ? (
                              <p className="text-[10px] text-cyan-700">
                                현재 모션: {sceneMotionPresets.find((item) => item.id === resolvedPreviewMotionPreset)?.label || "부드러운 줌"} ·
                                출력 {normalizeOutputFps(renderOptions.overlay.outputFps)}fps · 속도{" "}
                                {clampNumber(
                                  Number(renderOptions.overlay.motionSpeedPercent),
                                  MOTION_SPEED_PERCENT_MIN,
                                  MOTION_SPEED_PERCENT_MAX,
                                  MOTION_SPEED_PERCENT_DEFAULT
                                ).toFixed(0)}
                                % · 이미지 영역 클릭/드래그로 포커스 위치/범위를 조정할 수 있습니다.
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                          <div
                            ref={subtitleTimelineRef}
                            onPointerDown={onSubtitleTimelinePointerDown}
                            className="relative w-full overflow-auto rounded-md border bg-slate-950/95"
                            style={{ height: `${timelineViewportHeight}px` }}
                          >
                            <div className="pointer-events-none absolute inset-0 flex items-end gap-[2px] px-1 pb-1">
                              {timelineWaveBars.map((bar, index) => (
                                <div
                                  key={`wave-${index}`}
                                  className="flex-1 rounded-sm bg-cyan-300/35"
                                  style={{ height: `${bar}%` }}
                                />
                              ))}
                            </div>
                            <div className="pointer-events-none absolute inset-0">
                              {Array.from({ length: timelineLaneCount }).map((_, laneIndex) => (
                                <div
                                  key={`lane-sep-${laneIndex}`}
                                  className="absolute inset-x-0 border-t border-white/10"
                                  style={{
                                    top: `${TIMELINE_TOP_PADDING + laneIndex * TIMELINE_LANE_HEIGHT - 2}px`
                                  }}
                                />
                              ))}
                            </div>

                            {timelineCueLanes.map(({ cue, lane }) => {
                              const leftPct = clampNumber(
                                (cue.startMs / Math.max(1, timelineDurationMs)) * 100,
                                0,
                                100,
                                0
                              );
                              const widthPct = clampNumber(
                                ((cue.endMs - cue.startMs) / Math.max(1, timelineDurationMs)) * 100,
                                0.8,
                                100,
                                1
                              );
                              return (
                                <div
                                  key={cue.id}
                                  onPointerDown={(event) =>
                                    startSubtitleCueInteraction(event, cue.id, "move")
                                  }
                                  className={`absolute cursor-grab rounded border px-2 py-1 text-[10px] leading-3.5 text-white ${
                                    draggingCueId === cue.id
                                      ? "border-amber-300 bg-amber-500/60"
                                      : "border-cyan-200/70 bg-cyan-500/45"
                                  }`}
                                  style={{
                                    left: `${leftPct}%`,
                                    width: `${widthPct}%`,
                                    top: `${TIMELINE_TOP_PADDING + lane * TIMELINE_LANE_HEIGHT}px`,
                                    minWidth: "14px",
                                    minHeight: "28px"
                                  }}
                                  title={`${formatTimelineTime(cue.startMs)} ~ ${formatTimelineTime(cue.endMs)}`}
                                >
                                  <div
                                    className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize rounded-l bg-black/30"
                                    onPointerDown={(event) =>
                                      startSubtitleCueInteraction(event, cue.id, "start")
                                    }
                                    title="시작 지점 조절"
                                  />
                                  <span className="block max-h-[26px] overflow-hidden break-all pl-1 pr-1 whitespace-normal">
                                    {cue.text}
                                  </span>
                                  <div
                                    className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize rounded-r bg-black/30"
                                    onPointerDown={(event) =>
                                      startSubtitleCueInteraction(event, cue.id, "end")
                                    }
                                    title="종료 지점 조절"
                                  />
                                </div>
                              );
                            })}

                            <div
                              className="pointer-events-none absolute bottom-0 top-0 w-[2px] bg-rose-400"
                              style={{
                                left: `${clampNumber((timelineAudioSec * 1000 / Math.max(1, timelineDurationMs)) * 100, 0, 100, 0)}%`
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{formatTimelineTime(Math.round(timelineAudioSec * 1000))}</span>
                            <span>{formatTimelineTime(timelineDurationMs)}</span>
                          </div>
                          <div className="grid grid-cols-6 gap-1 text-[10px] text-muted-foreground">
                            {Array.from({ length: 6 }).map((_, tickIndex) => {
                              const tickMs = Math.round((timelineDurationMs / 5) * tickIndex);
                              return (
                                <span key={`tick-${tickIndex}`} className="text-center">
                                  {formatTimelineTime(tickMs)}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        </div>
                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {timelineCues.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              아직 수동 타임라인이 없습니다. `나레이션 기준 자동 생성`을 눌러 시작하세요.
                            </p>
                          ) : (
                            timelineCues.map((cue, index) => (
                              <div key={cue.id} className="space-y-2 rounded border p-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    Caption {index + 1}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeManualSubtitleCue(cue.id)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">시작(ms)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={3600000}
                                      value={cue.startMs}
                                      onChange={(event) => {
                                        const nextStart = clampNumber(
                                          Number(event.target.value),
                                          0,
                                          3600000,
                                          cue.startMs
                                        );
                                        updateManualSubtitleCue(cue.id, {
                                          startMs: nextStart,
                                          endMs: Math.max(nextStart + 100, cue.endMs)
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">종료(ms)</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={3600000}
                                      value={cue.endMs}
                                      onChange={(event) => {
                                        const nextEnd = clampNumber(
                                          Number(event.target.value),
                                          cue.startMs + 100,
                                          3600000,
                                          cue.endMs
                                        );
                                        updateManualSubtitleCue(cue.id, { endMs: nextEnd });
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">텍스트</Label>
                                  <Input
                                    value={cue.text}
                                    onChange={(event) =>
                                      updateManualSubtitleCue(cue.id, { text: event.target.value })
                                    }
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="order-1 space-y-3 rounded-lg border p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">텍스트 레이어 편집 (기본 타이틀 포함)</p>
                        <Button type="button" variant="outline" size="sm" onClick={addTitleTemplate}>
                          추가 텍스트 레이어
                        </Button>
                      </div>
                      <div className="grid gap-2 rounded-md border bg-muted/20 p-2 sm:p-3 lg:grid-cols-2">
                        <div className="min-w-0 space-y-1">
                          <Label htmlFor="templateNameInput" className="text-xs text-muted-foreground">
                            템플릿 이름
                          </Label>
                          <Input
                            id="templateNameInput"
                            value={newTemplateName}
                            onChange={(event) => setNewTemplateName(event.target.value)}
                            placeholder="템플릿 이름 (예: 뉴스형 자막)"
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Label className="text-xs text-muted-foreground">저장된 템플릿</Label>
                          <Select
                            value={selectedTemplatePresetId || undefined}
                            onValueChange={setSelectedTemplatePresetId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="저장된 템플릿 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {renderTemplatePresets.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {preset.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:col-span-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={saveCurrentRenderTemplate}
                          >
                            템플릿 저장
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!selectedRenderTemplatePreset}
                            onClick={() => void applySelectedRenderTemplate()}
                          >
                            템플릿 적용
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!selectedRenderTemplatePreset}
                            onClick={deleteSelectedRenderTemplate}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
                        <div className="space-y-2">
                          <div
                            ref={templateCanvasRef}
                            className="relative aspect-[9/16] w-full overflow-hidden rounded-md border bg-black"
                          >
                            {(renderOptions.overlay.titleTemplates || []).length === 0 ? (
                              <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-white/70">
                                템플릿을 추가한 뒤 드래그로 위치를 조정하세요.
                              </p>
                            ) : null}
                            {effectiveVideoLayout === "panel_16_9" ? (
                              <div
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded border border-white/30 bg-zinc-800/80"
                                style={{
                                  top: `${clampNumber(Number(renderOptions.overlay.panelTopPercent), 0, 85, 34)}%`,
                                  width: `${clampNumber(Number(renderOptions.overlay.panelWidthPercent), 60, 100, 100)}%`,
                                  aspectRatio: "16 / 9"
                                }}
                              >
                                <p className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-amber-200">
                                  16:9 영상 영역
                                </p>
                              </div>
                            ) : null}
                            {(renderOptions.overlay.titleTemplates || []).map((item) => (
                              <div
                                key={item.id}
                                onPointerDown={(event) =>
                                  startTemplateInteraction(event, item.id, "move")
                                }
                                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded cursor-move ${
                                  draggingTemplateId === item.id
                                    ? "ring-2 ring-primary"
                                    : "ring-1 ring-white/40"
                                }`}
                                style={{
                                  left: `${item.x}%`,
                                  top: `${item.y}%`,
                                  width: `${item.width}%`,
                                  color: normalizeHexColor(item.color, "#FFFFFF"),
                                  fontSize: `${Math.max(10, item.fontSize * templatePreviewScale)}px`,
                                  fontFamily:
                                    item.fontName ||
                                    renderOptions.overlay.titleFontName ||
                                    "Malgun Gothic",
                                  padding: `${item.paddingY ?? 4}px ${item.paddingX ?? 8}px`,
                                  backgroundColor: "transparent",
                                  textShadow: [
                                    ...buildTextThicknessShadow(
                                      normalizeHexColor(item.color, "#FFFFFF"),
                                      clampNumber(Number(item.fontThickness), 0, 8, 0)
                                    ),
                                    `${item.shadowX ?? 2}px ${item.shadowY ?? 2}px 4px ${hexToRgba(
                                      item.shadowColor,
                                      clampNumber(Number(item.shadowOpacity), 0, 1, 1),
                                      "#000000"
                                    )}`
                                  ].join(", "),
                                  userSelect: "none",
                                  textAlign: "center",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  lineHeight: 1.2
                                }}
                              >
                                <div
                                  className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-slate-700 text-[10px] text-white cursor-move"
                                  onPointerDown={(event) =>
                                    startTemplateInteraction(event, item.id, "move")
                                  }
                                  title="위치 이동"
                                >
                                  MV
                                </div>
                                {item.id === primaryTitleTemplateId
                                  ? normalizeTemplateText(item.text).trim() || defaultPrimaryTemplateText
                                  : normalizeTemplateText(item.text)}
                                <div
                                  className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-primary text-[10px] text-white cursor-nwse-resize"
                                  onPointerDown={(event) =>
                                    startTemplateInteraction(event, item.id, "resize")
                                  }
                                  title="크기 조절"
                                >
                                  SZ
                                </div>
                              </div>
                            ))}
                            <div
                              onPointerDown={startSubtitlePreviewDrag}
                              className={`absolute left-2 right-2 -translate-y-1/2 rounded-md border border-dashed px-3 py-2 text-center ${
                                draggingSubtitlePreview
                                  ? "cursor-grabbing border-emerald-200 bg-emerald-500/10"
                                  : "cursor-grab border-emerald-300/60 bg-transparent"
                              }`}
                              style={{
                                top: `${subtitlePreviewTop}%`
                              }}
                            >
                              <p
                                className="font-semibold"
                                style={{
                                  color: normalizeHexColor(
                                    renderOptions.subtitle.primaryColor,
                                    "#FFFFFF"
                                  ),
                                  fontFamily: renderOptions.subtitle.fontName || "Arial",
                                  fontSize: `${subtitlePreviewFontSize}px`,
                                  textShadow: subtitlePreviewTextShadow || undefined,
                                  lineHeight: 1.25,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "keep-all"
                                }}
                              >
                                {subtitlePreviewLines.slice(0, 2).join("\n")}
                              </p>
                            </div>
                            <p className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-emerald-200">
                              자막 예상 위치 ·{" "}
                              {renderOptions.subtitle.position === "top"
                                ? "상단"
                                : renderOptions.subtitle.position === "middle"
                                  ? "중앙"
                                  : "하단"}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            자막 예시(점선 박스)는 마우스로 드래그해 위치를 바꿀 수 있습니다. 타이틀은 드래그
                            이동, `SZ` 핸들로 박스 폭(width) 조절 가능합니다.
                          </p>
                          {effectiveVideoLayout === "panel_16_9" &&
                          effectiveImageAspectRatio !== "16:9" ? (
                            <p className="text-xs text-amber-600">
                              현재 장면 이미지 비율이 9:16입니다. `16:9 패널` 레이아웃 품질을 위해 새 워크플로우에서
                              장면 이미지 비율을 16:9로 생성하는 것을 권장합니다.
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-3 overflow-x-hidden pb-2 lg:max-h-[72vh] lg:overflow-y-auto lg:pr-1">
                          {(renderOptions.overlay.titleTemplates || []).map((item) => (
                            <div key={item.id} className="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  {item.id === primaryTitleTemplateId
                                    ? "기본 타이틀 레이어"
                                    : "추가 텍스트 레이어"}
                                </p>
                                <div className="flex items-center gap-2">
                                  {item.id === primaryTitleTemplateId ? (
                                    <Badge variant="muted">고정</Badge>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={item.id === primaryTitleTemplateId}
                                    onClick={() => removeTitleTemplate(item.id)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">레이어 텍스트</Label>
                                <Textarea
                                  value={item.text}
                                  rows={2}
                                  className="min-h-[64px] resize-y"
                                  onChange={(event) =>
                                    updateTemplateItem(item.id, { text: event.target.value })
                                  }
                                  placeholder="템플릿 텍스트 (Enter로 줄바꿈)"
                                />
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <div className="min-w-0 space-y-1 xl:col-span-2">
                                  <Label className="text-xs text-muted-foreground">폰트</Label>
                                  <Select
                                    value={detectFontPreset(item.fontName)}
                                    onValueChange={(value) =>
                                      updateTemplateItem(item.id, {
                                        fontName: value === customFontOption ? "" : value
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Template Font" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {titleFontPresets.map((font) => (
                                        <SelectItem key={font} value={font}>
                                          {font}
                                        </SelectItem>
                                      ))}
                                      <SelectItem value={customFontOption}>
                                        사용자 지정 폰트명
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">레이어 폭(%)</Label>
                                  <Input
                                    type="number"
                                    min={10}
                                    max={95}
                                    value={item.width}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        width: clampNumber(Number(event.target.value), 10, 95, 60)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">폰트 크기</Label>
                                  <Input
                                    type="number"
                                    min={12}
                                    max={120}
                                    value={item.fontSize}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        fontSize: clampNumber(Number(event.target.value), 12, 120, 44)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">텍스트 두께</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={8}
                                    value={clampNumber(Number(item.fontThickness), 0, 8, 0)}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        fontThickness: clampNumber(
                                          Number(event.target.value),
                                          0,
                                          8,
                                          0
                                        )
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">텍스트 색상</Label>
                                  <Input
                                    type="color"
                                    className="h-10 p-1"
                                    value={normalizeHexColor(item.color, "#FFFFFF")}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        color: event.target.value.toUpperCase()
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">좌우 여백</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={80}
                                    value={item.paddingX ?? 8}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        paddingX: clampNumber(Number(event.target.value), 0, 80, 8)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">상하 여백</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={80}
                                    value={item.paddingY ?? 4}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        paddingY: clampNumber(Number(event.target.value), 0, 80, 4)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">그림자 X</Label>
                                  <Input
                                    type="number"
                                    min={-20}
                                    max={20}
                                    value={item.shadowX ?? 2}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        shadowX: clampNumber(Number(event.target.value), -20, 20, 2)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">그림자 Y</Label>
                                  <Input
                                    type="number"
                                    min={-20}
                                    max={20}
                                    value={item.shadowY ?? 2}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        shadowY: clampNumber(Number(event.target.value), -20, 20, 2)
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">그림자 색상</Label>
                                  <Input
                                    type="color"
                                    className="h-10 p-1"
                                    value={normalizeHexColor(item.shadowColor, "#000000")}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        shadowColor: event.target.value.toUpperCase()
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">그림자 투명도(%)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={Math.round(
                                      clampNumber(Number(item.shadowOpacity), 0, 1, 1) * 100
                                    )}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, {
                                        shadowOpacity:
                                          clampNumber(Number(event.target.value), 0, 100, 100) / 100
                                      })
                                    }
                                  />
                                </div>
                              </div>

                              {detectFontPreset(item.fontName) === customFontOption ? (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    사용자 지정 폰트명
                                  </Label>
                                  <Input
                                    value={item.fontName || ""}
                                    onChange={(event) =>
                                      updateTemplateItem(item.id, { fontName: event.target.value })
                                    }
                                    placeholder="예: Pretendard"
                                  />
                                </div>
                              ) : null}
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  폰트 파일 경로 (선택)
                                </Label>
                                <Input
                                  value={item.fontFile || ""}
                                  onChange={(event) =>
                                    updateTemplateItem(item.id, { fontFile: event.target.value })
                                  }
                                  placeholder="Template font file path (optional)"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void runNextStage()}
                    disabled={runningNext || workflow.status === "processing"}
                  >
                    {runningNext || workflow.status === "processing"
                      ? "Processing..."
                      : "다음: 자막/비디오 검증"}
                  </Button>
                  {shouldShowVideoReviewProgress ? (
                    <div className="space-y-1 rounded-md border p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>자막/비디오 검증 준비 중...</span>
                        <span>{videoReviewProgress}%</span>
                      </div>
                      <Progress value={videoReviewProgress} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {workflow.stage === "video_review" ? (
                <div className="space-y-3">
                  {workflow.previewVideoUrl ? (
                    <video
                      key={`${workflow.previewVideoUrl || ""}:${workflow.updatedAt || ""}`}
                      src={toDisplayMediaUrl(workflow.previewVideoUrl, workflow.updatedAt)}
                      controls
                      className="aspect-[9/16] w-full rounded-md border bg-black object-cover"
                      onLoadedMetadata={(event) => {
                        const element = event.currentTarget;
                        setPreviewVideoSize({
                          width: element.videoWidth,
                          height: element.videoHeight
                        });
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">미리보기 비디오가 없습니다.</p>
                  )}
                  {previewVideoSize ? (
                    <p
                      className={`text-xs ${
                        isNineBySixteen(previewVideoSize.width, previewVideoSize.height)
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      해상도 {previewVideoSize.width}x{previewVideoSize.height} ·{" "}
                      {isNineBySixteen(previewVideoSize.width, previewVideoSize.height)
                        ? "9:16 검증 통과"
                        : "9:16 비율 아님"}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">미리보기 영상을 최종본으로 사용</p>
                      <p className="text-xs text-muted-foreground">
                        체크하면 최종 렌더를 다시 돌리지 않고 현재 미리보기 파일을 그대로 확정합니다.
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(renderOptions.overlay.usePreviewAsFinal)}
                      onCheckedChange={(checked) =>
                        setRenderOptions((prev) => ({
                          ...prev,
                          overlay: {
                            ...prev.overlay,
                            usePreviewAsFinal: checked
                          }
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void runNextStage()}
                    disabled={runningNext || workflow.status === "processing"}
                  >
                    {runningNext || workflow.status === "processing"
                      ? "Processing..."
                      : renderOptions.overlay.usePreviewAsFinal
                        ? "미리보기 영상으로 최종 확정"
                        : "최종 생성 실행"}
                  </Button>
                  {shouldShowFinalRenderProgress ? (
                    <div className="space-y-1 rounded-md border p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>최종 비디오 생성 중...</span>
                        <span>{finalRenderProgress}%</span>
                      </div>
                      <Progress value={finalRenderProgress} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {workflow.stage === "final_ready" ? (
                <div className="space-y-3">
                  {workflow.finalVideoUrl ? (
                    <video
                      key={`${workflow.finalVideoUrl || ""}:${workflow.updatedAt || ""}`}
                      src={toDisplayMediaUrl(workflow.finalVideoUrl, workflow.updatedAt)}
                      controls
                      className="aspect-[9/16] w-full rounded-md border bg-black object-cover"
                      onLoadedMetadata={(event) => {
                        const element = event.currentTarget;
                        setFinalVideoSize({
                          width: element.videoWidth,
                          height: element.videoHeight
                        });
                      }}
                    />
                  ) : null}
                  {finalVideoSize ? (
                    <p
                      className={`text-xs ${
                        isNineBySixteen(finalVideoSize.width, finalVideoSize.height)
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      해상도 {finalVideoSize.width}x{finalVideoSize.height} ·{" "}
                      {isNineBySixteen(finalVideoSize.width, finalVideoSize.height)
                        ? "9:16 검증 통과"
                        : "9:16 비율 아님"}
                    </p>
                  ) : null}
                  <Button asChild className="w-full">
                    <a href="/dashboard">대시보드에서 업로드 진행</a>
                  </Button>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Workflow ID: {workflow.id}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWorkflow(undefined);
                    setRenderOptions(ensureRenderOptions());
                    localStorage.removeItem(CREATE_WORKFLOW_ID_KEY);
                    setActivePanelTab("create");
                  }}
                >
                  새 워크플로우
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              왼쪽 폼을 제출하면 1단계(장면 분할)부터 수동으로 진행할 수 있습니다.
            </p>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
