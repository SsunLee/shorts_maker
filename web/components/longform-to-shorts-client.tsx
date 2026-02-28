"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Lock,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Split,
  Trash2,
  Unlock,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TabId = "convert" | "editor" | "templates" | "captions" | "export";
type TrackType = "video" | "audio" | "text" | "effect";
type SplitMode = "count" | "seconds" | "silence";
type AnimationPreset = "none" | "fade" | "slide" | "scale" | "bounce" | "typing";
type Ratio = "9:16" | "1:1" | "16:9";
type Fps = 30 | 60;

type Segment = { id: string; index: number; startSec: number; endSec: number; reason: "scene" | "highlight" | "silence" | "manual" };
type Keyframe = { frame: number; x: number; y: number; scale: number; rotation: number; opacity: number };
type Visual = { x: number; y: number; w: number; h: number; scale: number; rotation: number; opacity: number; shadow: number; stroke: number; glow: number; fontSize: number; color: string; animation: AnimationPreset; keyframes: Keyframe[] };
type Clip = {
  id: string;
  track: TrackType;
  label: string;
  start: number;
  duration: number;
  color: string;
  text?: string;
  visual?: Visual;
  speed?: number;
  filter?: "none" | "cinematic" | "bw" | "warm";
  volume?: number;
};
type Cue = { id: string; start: number; end: number; text: string };
type TemplateTrack = { type: TrackType; start: number; duration: number; label?: string; text?: string; animation?: AnimationPreset; style?: Partial<Visual> };
type TemplatePayload = { tracks: TemplateTrack[] };
type TemplateEntry = { id: string; name: string; category: string; previewLabel?: string; payload: TemplatePayload };

type Project = {
  fps: Fps;
  ratio: Ratio;
  zoom: number;
  duration: number;
  playhead: number;
  snap: boolean;
  autoReframe: boolean;
  mobileCompact: boolean;
  shortsSafeLine: boolean;
  proxyPreview: boolean;
  workerEnabled: boolean;
  subtitleAutoCenter: boolean;
  topUiCompact: boolean;
  trackCollapsed: Record<TrackType, boolean>;
  trackLocked: Record<TrackType, boolean>;
  tracks: Record<TrackType, Clip[]>;
  cues: Cue[];
  captionFontSize: number;
  captionColor: string;
  captionShadow: number;
  captionStroke: number;
  captionGlow: number;
  captionAnimation: AnimationPreset;
  captionBackgroundBox: boolean;
  wordsPerCaption: number;
  exportResolution: "1080x1920" | "720x1280";
  exportBitrate: "4M" | "6M" | "8M" | "12M";
  exportMode: "server" | "local";
  exportFps: Fps;
  watermark: boolean;
  watermarkText: string;
};

const LOCAL_KEY = "shorts-maker:longform-editor-project:v1";
const LOCAL_CAPTION_STYLE_KEY = "shorts-maker:longform-caption-style:v1";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "convert", label: "변환 모듈" },
  { id: "editor", label: "타임라인 편집" },
  { id: "templates", label: "템플릿" },
  { id: "captions", label: "자막/오디오" },
  { id: "export", label: "내보내기" }
];
const TRACKS: Array<{ key: TrackType; label: string }> = [
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "text", label: "Text" },
  { key: "effect", label: "Effect" }
];

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
function uid(prefix: string): string { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function secToFrame(sec: number, fps: number): number { return Math.max(0, Math.round(sec * fps)); }
function frameToSec(frame: number, fps: number): number { return frame / Math.max(1, fps); }
function formatMMSS(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
function extractYoutubeId(inputText: string): string | undefined {
  const input = String(inputText || "").trim();
  if (!input) return undefined;
  const match = input.match(/(?:watch\?v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/i);
  return match?.[1];
}
function defaultVisual(animation: AnimationPreset = "none", color = "#FFFFFF"): Visual {
  return { x: 50, y: 20, w: 70, h: 20, scale: 1, rotation: 0, opacity: 1, shadow: 2, stroke: 2, glow: 0, fontSize: 48, color, animation, keyframes: [] };
}
function createDefaultProject(): Project {
  return {
    fps: 30,
    ratio: "9:16",
    zoom: 1,
    duration: 30 * 40,
    playhead: 0,
    snap: true,
    autoReframe: true,
    mobileCompact: false,
    shortsSafeLine: true,
    proxyPreview: true,
    workerEnabled: true,
    subtitleAutoCenter: true,
    topUiCompact: false,
    trackCollapsed: { video: false, audio: false, text: false, effect: false },
    trackLocked: { video: false, audio: false, text: false, effect: false },
    tracks: {
      video: [{ id: uid("video"), track: "video", label: "Base Video", start: 0, duration: 30 * 12, color: "#0ea5e9", speed: 1, filter: "none", volume: 100 }],
      audio: [{ id: uid("audio"), track: "audio", label: "Narration", start: 0, duration: 30 * 12, color: "#22c55e", speed: 1, volume: 100 }],
      text: [{ id: uid("text"), track: "text", label: "Title", start: 0, duration: 30 * 4, color: "#facc15", text: "{{title}}", visual: defaultVisual("slide", "#FFFFFF") }],
      effect: [{ id: uid("effect"), track: "effect", label: "Glow", start: 0, duration: 30 * 6, color: "#a855f7", text: "Glow", visual: defaultVisual("fade", "#FFFFFF") }]
    },
    cues: [],
    captionFontSize: 38,
    captionColor: "#FFFFFF",
    captionShadow: 2,
    captionStroke: 2,
    captionGlow: 0,
    captionAnimation: "fade",
    captionBackgroundBox: true,
    wordsPerCaption: 5,
    exportResolution: "1080x1920",
    exportBitrate: "8M",
    exportMode: "server",
    exportFps: 30,
    watermark: false,
    watermarkText: "Shorts Maker"
  };
}

function splitByMode(totalSec: number, mode: SplitMode, splitCount: number, splitSeconds: number): Segment[] {
  const safe = Math.max(1, Math.round(totalSec));
  if (mode === "silence") {
    const out: Segment[] = [];
    let t = 0;
    let i = 1;
    while (t < safe) {
      const next = Math.min(safe, t + 8 + ((i * 3) % 5));
      out.push({ id: uid("sil"), index: i, startSec: t, endSec: next, reason: "silence" });
      t = next + 1;
      i += 1;
    }
    return out;
  }
  if (mode === "count") {
    const n = Math.max(1, splitCount);
    return Array.from({ length: n }).map((_, i) => {
      const startSec = Math.round((safe / n) * i);
      const endSec = i === n - 1 ? safe : Math.round((safe / n) * (i + 1));
      return { id: uid("seg"), index: i + 1, startSec, endSec, reason: "manual" as const };
    });
  }
  const s = Math.max(1, splitSeconds);
  const out: Segment[] = [];
  let t = 0;
  let i = 1;
  while (t < safe) {
    const next = Math.min(safe, t + s);
    out.push({ id: uid("seg"), index: i, startSec: t, endSec: next, reason: "manual" });
    t = next;
    i += 1;
  }
  return out;
}

function cuesFromTranscript(text: string, duration: number, wordsPerCue: number): Cue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const unit = clamp(wordsPerCue, 1, 12, 5);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += unit) chunks.push(words.slice(i, i + unit).join(" "));
  const cueDuration = Math.max(8, Math.floor(duration / chunks.length));
  return chunks.map((chunk, idx) => ({ id: uid("cue"), start: idx * cueDuration, end: Math.max(idx * cueDuration + 6, (idx + 1) * cueDuration - 1), text: chunk }));
}

function applyPresetAnimation(visual: Visual, clip: Clip, frame: number): Visual {
  const p = clamp((frame - clip.start) / Math.max(1, clip.duration), 0, 1, 0);
  if (visual.animation === "fade") return { ...visual, opacity: visual.opacity * Math.min(p * 2, (1 - p) * 2, 1) };
  if (visual.animation === "slide") return { ...visual, y: visual.y + (1 - Math.min(1, p * 2)) * 8 };
  if (visual.animation === "scale") return { ...visual, scale: visual.scale * (0.85 + Math.min(1, p * 2) * 0.15) };
  if (visual.animation === "bounce") return { ...visual, y: visual.y + Math.sin(p * Math.PI * 2.2) * 1.5 };
  return visual;
}

function previewSize(ratio: Ratio): { w: number; h: number } {
  if (ratio === "1:1") return { w: 320, h: 320 };
  if (ratio === "16:9") return { w: 360, h: 203 };
  return { w: 260, h: 462 };
}

type DragState = {
  clipId: string;
  track: TrackType;
  mode: "move" | "trim-start" | "trim-end";
  startClientX: number;
  clipStart: number;
  clipDuration: number;
  before: Project;
  changed: boolean;
};

type CanvasDragState = {
  clipId: string;
  mode: "move" | "scale" | "rotate";
  startClientX: number;
  startClientY: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  before: Project;
  changed: boolean;
};

export function LongformToShortsClient(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>("convert");
  const [project, setProject] = useState<Project>(createDefaultProject());
  const projectRef = useRef(project);
  const undoRef = useRef<Project[]>([]);
  const redoRef = useRef<Project[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string>();
  const [videoDurationSec, setVideoDurationSec] = useState<number>();
  const [manualDurationSec, setManualDurationSec] = useState("180");
  const [splitMode, setSplitMode] = useState<SplitMode>("count");
  const [splitCount, setSplitCount] = useState("4");
  const [splitSeconds, setSplitSeconds] = useState("30");
  const [segments, setSegments] = useState<Segment[]>([]);

  const [selectedClipId, setSelectedClipId] = useState<string>();
  const dragRef = useRef<DragState | null>(null);
  const canvasDragRef = useRef<CanvasDragState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rippleDelete, setRippleDelete] = useState(false);
  const [editingTextClipId, setEditingTextClipId] = useState<string>();
  const [editingTextValue, setEditingTextValue] = useState("");
  const [hoverTemplateId, setHoverTemplateId] = useState<string>();

  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateCategory, setTemplateCategory] = useState("전체");
  const [templateJson, setTemplateJson] = useState('{"tracks": []}');
  const [templateName, setTemplateName] = useState("커스텀 템플릿");
  const [templateCategoryInput, setTemplateCategoryInput] = useState("기타");
  const [templatePreviewLabel, setTemplatePreviewLabel] = useState("");
  const [templateTitleReplacement, setTemplateTitleReplacement] = useState("{{title}}");
  const [templateTopicReplacement, setTemplateTopicReplacement] = useState("{{topic}}");
  const [templateError, setTemplateError] = useState<string>();

  const [transcript, setTranscript] = useState("");
  const [captionTemplateName, setCaptionTemplateName] = useState("");
  const [captionTemplateList, setCaptionTemplateList] = useState<Array<{ id: string; name: string; fontSize: number; color: string; shadow: number; stroke: number; glow: number; animation: AnimationPreset }>>([]);
  const [captionTemplateId, setCaptionTemplateId] = useState("");

  const [autoSavedAt, setAutoSavedAt] = useState<string>();
  const [webglSupported, setWebglSupported] = useState(false);
  const [shiftPressed, setShiftPressed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ytId = useMemo(() => extractYoutubeId(url), [url]);
  const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined;
  const size = previewSize(project.ratio);
  const pxPerSec = 42 * project.zoom;
  const pxPerFrame = pxPerSec / project.fps;
  const timelineWidth = Math.max(1100, project.duration * pxPerFrame + 200);

  const effectiveDurationSec = useMemo(() => {
    if (videoDurationSec && videoDurationSec > 0) return Math.round(videoDurationSec);
    const m = Number(manualDurationSec);
    return Number.isFinite(m) && m > 0 ? Math.round(m) : 180;
  }, [manualDurationSec, videoDurationSec]);

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return undefined;
    for (const track of TRACKS.map((t) => t.key)) {
      const clip = project.tracks[track].find((c) => c.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return undefined;
  }, [project.tracks, selectedClipId]);

  const activeOverlay = useMemo(() => {
    return [...project.tracks.text, ...project.tracks.effect].filter((clip) => project.playhead >= clip.start && project.playhead <= clip.start + clip.duration);
  }, [project.playhead, project.tracks.effect, project.tracks.text]);

  const activeCue = useMemo(() => project.cues.find((cue) => project.playhead >= cue.start && project.playhead <= cue.end), [project.cues, project.playhead]);
  const selectedVisual = useMemo(() => {
    if (!selectedClip) return undefined;
    if (selectedClip.track !== "text" && selectedClip.track !== "effect") return undefined;
    return selectedClip.clip.visual || defaultVisual();
  }, [selectedClip]);
  const selectedClipProgress = useMemo(() => {
    if (!selectedClip) return 0;
    return clamp((project.playhead - selectedClip.clip.start) / Math.max(1, selectedClip.clip.duration), 0, 1, 0);
  }, [project.playhead, selectedClip]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setProject((prev) => {
        const nextFrame = prev.playhead + 1;
        if (nextFrame >= prev.duration) {
          setIsPlaying(false);
          return { ...prev, playhead: prev.duration };
        }
        return { ...prev, playhead: nextFrame };
      });
    }, 1000 / project.fps);
    return () => window.clearInterval(timer);
  }, [isPlaying, project.fps]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Shift") {
        setShiftPressed(true);
      }
    }
    function onKeyUp(event: KeyboardEvent): void {
      if (event.key === "Shift") {
        setShiftPressed(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => { projectRef.current = project; }, [project]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCAL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Project;
        if (parsed?.tracks) setProject(parsed);
      }
      const savedCaptionStyles = window.localStorage.getItem(LOCAL_CAPTION_STYLE_KEY);
      if (savedCaptionStyles) {
        const parsed = JSON.parse(savedCaptionStyles) as typeof captionTemplateList;
        if (Array.isArray(parsed)) setCaptionTemplateList(parsed);
      }
    } catch {
      // noop
    }

    const canvas = document.createElement("canvas");
    setWebglSupported(Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(projectRef.current));
        setAutoSavedAt(new Date().toLocaleTimeString());
      } catch {
        // noop
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/longform/templates", { cache: "no-store" });
      const data = (await response.json()) as { templates?: TemplateEntry[]; error?: string };
      if (!response.ok) {
        setTemplateError(data.error || "템플릿 로드 실패");
        return;
      }
      const list = data.templates || [];
      setTemplates(list);
      if (list[0]) {
        setSelectedTemplateId(list[0].id);
        setTemplateJson(JSON.stringify(list[0].payload, null, 2));
      }
    })();
  }, []);

  useEffect(() => {
    const selected = templates.find((item) => item.id === selectedTemplateId);
    if (selected) {
      setTemplateName(selected.name);
      setTemplateCategoryInput(selected.category);
      setTemplatePreviewLabel(selected.previewLabel || "");
      setTemplateJson(JSON.stringify(selected.payload, null, 2));
    }
  }, [selectedTemplateId, templates]);

  const pushHistory = useCallback((snapshot: Project): void => {
    undoRef.current = [...undoRef.current, clone(snapshot)].slice(-50);
    redoRef.current = [];
    setHistoryTick((v) => v + 1);
  }, []);

  const updateProject = useCallback((mutator: (prev: Project) => Project, withHistory = true): void => {
    setProject((prev) => {
      const next = mutator(prev);
      if (withHistory && JSON.stringify(prev) !== JSON.stringify(next)) {
        pushHistory(prev);
      }
      return next;
    });
  }, [pushHistory]);

  function undo(): void {
    const prev = undoRef.current.pop();
    if (!prev) return;
    setProject((current) => {
      redoRef.current = [...redoRef.current, clone(current)].slice(-50);
      return prev;
    });
    setHistoryTick((v) => v + 1);
  }

  function redo(): void {
    const next = redoRef.current.pop();
    if (!next) return;
    setProject((current) => {
      undoRef.current = [...undoRef.current, clone(current)].slice(-50);
      return next;
    });
    setHistoryTick((v) => v + 1);
  }

  function handleFilePick(): void { fileInputRef.current?.click(); }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFile(picked);
    setFilePreviewUrl(URL.createObjectURL(picked));
    setSegments([]);
    setVideoDurationSec(undefined);
  }

  function runSceneDetect(): void {
    const safe = Math.max(8, effectiveDurationSec);
    const out: Segment[] = [];
    let t = 0;
    let i = 1;
    while (t < safe) {
      const step = 6 + ((i * 3) % 6);
      const next = Math.min(safe, t + step);
      out.push({ id: uid("scene"), index: i, startSec: t, endSec: next, reason: "scene" });
      t = next;
      i += 1;
    }
    setSegments(out);
  }

  function runHighlightDetect(): void {
    const words = transcript.trim().split(/\s+/).filter(Boolean);
    const count = clamp(Math.ceil(words.length / 25), 2, 6, 3);
    const unit = effectiveDurationSec / (count + 1);
    const out: Segment[] = Array.from({ length: count }).map((_, idx) => {
      const center = unit * (idx + 1);
      const startSec = Math.max(0, Math.round(center - 4));
      const endSec = Math.min(effectiveDurationSec, Math.round(center + 4));
      return { id: uid("hl"), index: idx + 1, startSec, endSec, reason: "highlight" };
    });
    setSegments(out);
  }

  function runSplitOption(): void {
    setSegments(splitByMode(effectiveDurationSec, splitMode, Number(splitCount) || 1, Number(splitSeconds) || 30));
  }

  function applySegmentsToTimeline(): void {
    if (segments.length === 0) return;
    const fps = projectRef.current.fps;
    let cursor = 0;
    const nextVideo: Clip[] = [];
    const nextAudio: Clip[] = [];
    const nextText: Clip[] = [];
    segments.forEach((segment, idx) => {
      const duration = Math.max(8, secToFrame(segment.endSec - segment.startSec, fps));
      nextAudio.push({ id: uid("audio"), track: "audio", label: `Audio ${idx + 1}`, start: cursor, duration, color: "#22c55e", speed: 1, volume: 100 });
      nextVideo.push({ id: uid("video"), track: "video", label: `Scene ${idx + 1}`, start: cursor, duration, color: "#0ea5e9", speed: 1, filter: "none", volume: 100 });
      nextText.push({ id: uid("text"), track: "text", label: `Text ${idx + 1}`, start: cursor, duration: Math.max(8, Math.floor(duration * 0.6)), color: "#facc15", text: `Scene ${idx + 1}`, visual: { ...defaultVisual("fade", "#FFFFFF"), y: 16 + (idx % 2) * 8 } });
      cursor += duration;
    });
    updateProject((prev) => ({
      ...prev,
      tracks: { ...prev.tracks, video: nextVideo, audio: nextAudio, text: [...prev.tracks.text.filter((c) => c.label === "Title"), ...nextText], effect: prev.tracks.effect },
      duration: Math.max(prev.duration, cursor + secToFrame(4, prev.fps)),
      playhead: 0
    }));
    setTab("editor");
  }

  const splitSelectedClip = useCallback((): void => {
    if (!selectedClip) {
      return;
    }
    const { track, clip } = selectedClip;
    if (project.trackLocked[track]) {
      return;
    }
    if (project.playhead <= clip.start || project.playhead >= clip.start + clip.duration) {
      return;
    }
    const cutFrame = project.playhead;
    const leftDuration = Math.max(4, cutFrame - clip.start);
    const rightDuration = Math.max(4, clip.duration - leftDuration);
    const rightClip: Clip = {
      ...clip,
      id: uid(track),
      start: cutFrame,
      duration: rightDuration
    };
    updateProject((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [track]: prev.tracks[track]
          .flatMap((item) => {
            if (item.id !== clip.id) {
              return [item];
            }
            return [{ ...item, duration: leftDuration }, rightClip];
          })
          .sort((a, b) => a.start - b.start)
      }
    }));
    setSelectedClipId(rightClip.id);
  }, [project.playhead, project.trackLocked, selectedClip, updateProject]);

  const deleteSelectedClip = useCallback((): void => {
    if (!selectedClip) {
      return;
    }
    const { track, clip } = selectedClip;
    if (project.trackLocked[track]) {
      return;
    }
    const removeDuration = clip.duration;
    updateProject((prev) => {
      const nextTrack = prev.tracks[track].filter((item) => item.id !== clip.id);
      if (!rippleDelete) {
        return {
          ...prev,
          tracks: {
            ...prev.tracks,
            [track]: nextTrack
          }
        };
      }
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [track]: nextTrack.map((item) =>
            item.start > clip.start ? { ...item, start: Math.max(0, item.start - removeDuration) } : item
          )
        },
        duration: Math.max(10, prev.duration - removeDuration)
      };
    });
    setSelectedClipId(undefined);
  }, [project.trackLocked, rippleDelete, selectedClip, updateProject]);

  const updateTrackClip = useCallback((track: TrackType, clipId: string, updater: (clip: Clip) => Clip, withHistory = true): void => {
    updateProject((prev) => ({
      ...prev,
      tracks: { ...prev.tracks, [track]: prev.tracks[track].map((clip) => (clip.id === clipId ? updater(clip) : clip)).sort((a, b) => a.start - b.start) }
    }), withHistory);
  }, [updateProject]);

  const commitCanvasTextEdit = useCallback((): void => {
    if (!editingTextClipId) {
      return;
    }
    const target = selectedClip;
    if (!target || target.clip.id !== editingTextClipId) {
      setEditingTextClipId(undefined);
      return;
    }
    if (target.track !== "text" && target.track !== "effect") {
      setEditingTextClipId(undefined);
      return;
    }
    updateProject((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [target.track]: prev.tracks[target.track].map((clip) =>
          clip.id === target.clip.id ? { ...clip, text: editingTextValue } : clip
        )
      }
    }));
    setEditingTextClipId(undefined);
  }, [editingTextClipId, editingTextValue, selectedClip, updateProject]);

  function beginClipDrag(event: React.PointerEvent<HTMLDivElement>, track: TrackType, clip: Clip, mode: DragState["mode"]): void {
    event.preventDefault();
    if (project.trackLocked[track]) {
      return;
    }
    setSelectedClipId(clip.id);
    dragRef.current = { clipId: clip.id, track, mode, startClientX: event.clientX, clipStart: clip.start, clipDuration: clip.duration, before: clone(projectRef.current), changed: false };
  }

  function beginCanvasDrag(event: React.PointerEvent<HTMLDivElement>, clipId: string, mode: CanvasDragState["mode"], visual: Visual): void {
    event.preventDefault();
    const lockedTrack = selectedClip?.clip.id === clipId ? selectedClip.track : undefined;
    if (lockedTrack && project.trackLocked[lockedTrack]) {
      return;
    }
    setSelectedClipId(clipId);
    canvasDragRef.current = { clipId, mode, startClientX: event.clientX, startClientY: event.clientY, x: visual.x, y: visual.y, scale: visual.scale, rotation: visual.rotation, before: clone(projectRef.current), changed: false };
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function onPointerMove(event: PointerEvent): void {
      const drag = dragRef.current;
      if (drag) {
        const dx = event.clientX - drag.startClientX;
        const delta = Math.round(dx / Math.max(0.001, pxPerFrame));
        updateProject((prev) => {
          const clip = prev.tracks[drag.track].find((c) => c.id === drag.clipId);
          if (!clip) return prev;
          const canSnap = prev.snap && !event.shiftKey;
          const boundaries = canSnap
            ? [...prev.tracks[drag.track].filter((c) => c.id !== drag.clipId).flatMap((c) => [c.start, c.start + c.duration]), 0, prev.duration]
            : [];
          const snapFrame = (value: number): number => {
            if (!canSnap || boundaries.length === 0) return value;
            let best = value;
            let bestDiff = Number.POSITIVE_INFINITY;
            boundaries.forEach((point) => {
              const diff = Math.abs(value - point);
              if (diff < bestDiff) { best = point; bestDiff = diff; }
            });
            return bestDiff <= 8 ? best : value;
          };

          let nextStart = clip.start;
          let nextDuration = clip.duration;
          if (prev.trackLocked[drag.track]) {
            return prev;
          }
          if (drag.mode === "move") {
            nextStart = clamp(drag.clipStart + delta, 0, Math.max(0, prev.duration - clip.duration), drag.clipStart);
            nextStart = snapFrame(nextStart);
          } else if (drag.mode === "trim-start") {
            nextStart = clamp(drag.clipStart + delta, 0, drag.clipStart + drag.clipDuration - 4, drag.clipStart);
            nextStart = snapFrame(nextStart);
            nextDuration = Math.max(4, drag.clipDuration - (nextStart - drag.clipStart));
          } else {
            nextDuration = clamp(drag.clipDuration + delta, 4, prev.duration - drag.clipStart, drag.clipDuration);
            const end = snapFrame(drag.clipStart + nextDuration);
            nextDuration = Math.max(4, end - drag.clipStart);
          }
          drag.changed = true;
          return {
            ...prev,
            tracks: {
              ...prev.tracks,
              [drag.track]: prev.tracks[drag.track].map((c) => (c.id === drag.clipId ? { ...c, start: nextStart, duration: nextDuration } : c)).sort((a, b) => a.start - b.start)
            }
          };
        }, false);
      }

      const canvasDrag = canvasDragRef.current;
      if (canvasDrag) {
        const dx = event.clientX - canvasDrag.startClientX;
        const dy = event.clientY - canvasDrag.startClientY;
        updateProject((prev) => {
          let foundTrack: TrackType | undefined;
          let foundClip: Clip | undefined;
          for (const track of TRACKS.map((t) => t.key)) {
            const clip = prev.tracks[track].find((c) => c.id === canvasDrag.clipId);
            if (clip) { foundTrack = track; foundClip = clip; break; }
          }
          if (!foundTrack || !foundClip || (foundTrack !== "text" && foundTrack !== "effect")) return prev;
          const visual = foundClip.visual || defaultVisual();
          const nextVisual = { ...visual };
          if (canvasDrag.mode === "move") {
            nextVisual.x = clamp(canvasDrag.x + dx * 0.12, 0, 100, canvasDrag.x);
            nextVisual.y = clamp(canvasDrag.y + dy * 0.12, 0, 100, canvasDrag.y);
          } else if (canvasDrag.mode === "scale") {
            nextVisual.scale = clamp(canvasDrag.scale + dx * 0.01, 0.3, 3, canvasDrag.scale);
          } else {
            nextVisual.rotation = clamp(canvasDrag.rotation + dx * 0.5, -180, 180, canvasDrag.rotation);
          }
          canvasDrag.changed = true;
          return { ...prev, tracks: { ...prev.tracks, [foundTrack]: prev.tracks[foundTrack].map((c) => (c.id === canvasDrag.clipId ? { ...c, visual: nextVisual } : c)) } };
        }, false);
      }
    }

    function onPointerUp(): void {
      if (dragRef.current) {
        if (dragRef.current.changed) pushHistory(dragRef.current.before);
        dragRef.current = null;
      }
      if (canvasDragRef.current) {
        if (canvasDragRef.current.changed) pushHistory(canvasDragRef.current.before);
        canvasDragRef.current = null;
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [pxPerFrame, pushHistory, updateProject]);

  function addTextClip(): void {
    updateProject((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        text: [...prev.tracks.text, { id: uid("text"), track: "text", label: "새 텍스트", start: prev.playhead, duration: secToFrame(3, prev.fps), color: "#facc15", text: "텍스트를 입력하세요", visual: defaultVisual("fade", "#FFFFFF") } as Clip].sort((a, b) => a.start - b.start)
      }
    }));
  }

  function addKeyframe(): void {
    if (!selectedClip || (selectedClip.track !== "text" && selectedClip.track !== "effect")) return;
    const frame = project.playhead;
    updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => {
      const visual = clip.visual || defaultVisual();
      const key = { frame, x: visual.x, y: visual.y, scale: visual.scale, rotation: visual.rotation, opacity: visual.opacity };
      return { ...clip, visual: { ...visual, keyframes: [...visual.keyframes.filter((k) => k.frame !== frame), key].sort((a, b) => a.frame - b.frame) } };
    });
  }

  function removeKeyframe(): void {
    if (!selectedClip || (selectedClip.track !== "text" && selectedClip.track !== "effect")) return;
    const frame = project.playhead;
    updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => {
      const visual = clip.visual || defaultVisual();
      return { ...clip, visual: { ...visual, keyframes: visual.keyframes.filter((k) => k.frame !== frame) } };
    });
  }

  function applyTemplate(template: TemplateEntry): void {
    let payload: TemplatePayload;
    try {
      payload = JSON.parse(templateJson) as TemplatePayload;
      if (!Array.isArray(payload.tracks)) payload = template.payload;
    } catch {
      payload = template.payload;
    }
    const fps = project.fps;
    const next: Record<TrackType, Clip[]> = { video: [], audio: [], text: [], effect: [] };
    payload.tracks.forEach((item) => {
      const text = String(item.text || "")
        .replace(/\{\{\s*title\s*\}\}/gi, templateTitleReplacement)
        .replace(/\{\{\s*topic\s*\}\}/gi, templateTopicReplacement);
      next[item.type].push({
        id: uid(item.type),
        track: item.type,
        label: item.label || `${template.name}-${item.type}`,
        start: secToFrame(item.start, fps),
        duration: Math.max(4, secToFrame(item.duration, fps)),
        color: item.type === "video" ? "#0ea5e9" : item.type === "audio" ? "#22c55e" : item.type === "text" ? "#facc15" : "#a855f7",
        text: text || undefined,
        visual: item.type === "text" || item.type === "effect" ? { ...defaultVisual(item.animation || "none", item.style?.color || "#FFFFFF"), ...(item.style || {}), animation: item.animation || "none" } : undefined
      });
    });
    const maxFrame = Math.max(...TRACKS.map(({ key }) => next[key].reduce((acc, clip) => Math.max(acc, clip.start + clip.duration), 0)), secToFrame(10, fps));
    updateProject((prev) => ({ ...prev, tracks: { video: next.video.length ? next.video : prev.tracks.video, audio: next.audio.length ? next.audio : prev.tracks.audio, text: next.text.length ? next.text : prev.tracks.text, effect: next.effect.length ? next.effect : prev.tracks.effect }, duration: Math.max(prev.duration, maxFrame + secToFrame(2, fps)), playhead: 0 }));
    setTab("editor");
  }

  async function saveTemplate(updateMode: boolean): Promise<void> {
    setTemplateError(undefined);
    let payload: TemplatePayload;
    try {
      payload = JSON.parse(templateJson) as TemplatePayload;
      if (!Array.isArray(payload.tracks)) throw new Error("Invalid tracks array");
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "JSON parse error");
      return;
    }
    const response = await fetch("/api/longform/templates", {
      method: updateMode ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedTemplateId, name: templateName.trim() || "커스텀 템플릿", category: templateCategoryInput.trim() || "기타", previewLabel: templatePreviewLabel.trim() || undefined, payload })
    });
    const data = (await response.json()) as { templates?: TemplateEntry[]; error?: string; saved?: TemplateEntry; updated?: TemplateEntry };
    if (!response.ok) {
      setTemplateError(data.error || "템플릿 저장 실패");
      return;
    }
    const list = data.templates || [];
    setTemplates(list);
    const newId = data.updated?.id || data.saved?.id || selectedTemplateId;
    if (newId) setSelectedTemplateId(newId);
  }

  async function deleteTemplate(): Promise<void> {
    if (!selectedTemplateId) return;
    const response = await fetch("/api/longform/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedTemplateId })
    });
    const data = (await response.json()) as { templates?: TemplateEntry[]; error?: string };
    if (!response.ok) {
      setTemplateError(data.error || "삭제 실패");
      return;
    }
    const list = data.templates || [];
    setTemplates(list);
    const first = list[0];
    setSelectedTemplateId(first?.id || "");
    setTemplateJson(JSON.stringify(first?.payload || { tracks: [] }, null, 2));
  }

  function generateCaptions(): void {
    if (!transcript.trim()) return;
    const cues = cuesFromTranscript(transcript, project.duration, project.wordsPerCaption);
    updateProject((prev) => ({ ...prev, cues }));
  }

  function saveCaptionTemplate(): void {
    const name = captionTemplateName.trim();
    if (!name) return;
    const item = { id: uid("caption"), name, fontSize: project.captionFontSize, color: project.captionColor, shadow: project.captionShadow, stroke: project.captionStroke, glow: project.captionGlow, animation: project.captionAnimation };
    const next = [item, ...captionTemplateList].slice(0, 40);
    setCaptionTemplateList(next);
    window.localStorage.setItem(LOCAL_CAPTION_STYLE_KEY, JSON.stringify(next));
    setCaptionTemplateId(item.id);
  }

  function applyCaptionTemplate(id: string): void {
    setCaptionTemplateId(id);
    const found = captionTemplateList.find((item) => item.id === id);
    if (!found) return;
    updateProject((prev) => ({ ...prev, captionFontSize: found.fontSize, captionColor: found.color, captionShadow: found.shadow, captionStroke: found.stroke, captionGlow: found.glow, captionAnimation: found.animation }));
  }

  const templateCategories = useMemo(() => ["전체", ...Array.from(new Set(templates.map((item) => item.category).filter(Boolean)))], [templates]);
  const filteredTemplates = useMemo(() => (templateCategory === "전체" ? templates : templates.filter((item) => item.category === templateCategory)), [templateCategory, templates]);

  const exportPayload = useMemo(() => ({
    canvas: { ratio: project.ratio, resolution: project.exportResolution, fps: project.exportFps },
    render: { mode: project.exportMode, codec: "H.264", bitrate: project.exportBitrate, watermark: project.watermark ? project.watermarkText : null },
    tracks: TRACKS.flatMap(({ key }) => project.tracks[key].map((clip) => ({ type: key, start: Number(frameToSec(clip.start, project.fps).toFixed(2)), duration: Number(frameToSec(clip.duration, project.fps).toFixed(2)), label: clip.label, text: clip.text, animation: clip.visual?.animation || "none", style: clip.visual || undefined }))),
    captions: project.cues
  }), [project]);

  const activeCueWords = useMemo(() => {
    if (!activeCue) return [] as Array<{ word: string; active: boolean }>;
    const words = activeCue.text.split(/\s+/).filter(Boolean);
    const progress = clamp((project.playhead - activeCue.start) / Math.max(1, activeCue.end - activeCue.start), 0, 1, 0);
    const idx = Math.floor(progress * words.length);
    return words.map((word, i) => ({ word, active: i === idx }));
  }, [activeCue, project.playhead]);
  const activeCueTypingText = useMemo(() => {
    if (!activeCue) return "";
    const progress = clamp((project.playhead - activeCue.start) / Math.max(1, activeCue.end - activeCue.start), 0, 1, 0);
    const chars = Math.max(1, Math.floor(activeCue.text.length * progress));
    return activeCue.text.slice(0, chars);
  }, [activeCue, project.playhead]);

  useEffect(() => {
    function onEditorKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isInput) {
        return;
      }
      if (event.key.toLowerCase() === "s" && tab === "editor") {
        event.preventDefault();
        splitSelectedClip();
      }
      if (event.key === " ") {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && tab === "editor") {
        event.preventDefault();
        deleteSelectedClip();
      }
      if (event.key === "Escape" && editingTextClipId) {
        setEditingTextClipId(undefined);
      }
      if (event.key === "Enter" && editingTextClipId) {
        event.preventDefault();
        commitCanvasTextEdit();
      }
    }
    window.addEventListener("keydown", onEditorKeyDown);
    return () => window.removeEventListener("keydown", onEditorKeyDown);
  }, [commitCanvasTextEdit, deleteSelectedClip, editingTextClipId, splitSelectedClip, tab]);

  return (
    <section className="mx-auto w-full max-w-[1420px] space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">롱폼 → 숏폼 변환 스튜디오</h1>
            {project.topUiCompact ? null : (
              <p className="text-sm text-muted-foreground">NLE 기반 타임라인 편집/템플릿/자막/내보내기 코어.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded border px-2 py-1">
              <Switch
                checked={project.topUiCompact}
                onCheckedChange={(checked) =>
                  updateProject((prev) => ({ ...prev, topUiCompact: Boolean(checked) }))
                }
              />
              <span className="text-xs">상단 UI 최소화</span>
            </div>
            {project.topUiCompact ? null : (
              <>
                <Badge variant={webglSupported ? "default" : "muted"}>WebGL {webglSupported ? "ON" : "OFF"}</Badge>
                <Badge variant={project.workerEnabled ? "default" : "muted"}>Worker {project.workerEnabled ? "ON" : "OFF"}</Badge>
                <Badge variant={project.proxyPreview ? "default" : "muted"}>Proxy {project.proxyPreview ? "ON" : "OFF"}</Badge>
                <Badge variant="muted">Autosave 5s {autoSavedAt ? `· ${autoSavedAt}` : ""}</Badge>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-2">
        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <Button key={item.id} type="button" size="sm" variant={tab === item.id ? "default" : "outline"} onClick={() => setTab(item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {tab === "convert" ? (
        <div className="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle>세로 자동 크롭 미리보기</CardTitle>
              <CardDescription>업로드/URL 기반 9:16 미리보기</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-lg border bg-black">
                <div className="relative aspect-[9/16] w-full">
                  {filePreviewUrl ? (
                    <video className="h-full w-full object-cover" src={filePreviewUrl} controls onLoadedMetadata={(e) => { const d = Number(e.currentTarget.duration); if (Number.isFinite(d) && d > 0) setVideoDurationSec(d); }} />
                  ) : ytThumb ? (
                    <img src={ytThumb} alt="youtube thumbnail" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-zinc-300">영상/URL을 입력하면 미리보기가 표시됩니다.</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 border border-cyan-300/60" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">기준 길이: {formatMMSS(effectiveDurationSec)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>롱폼 → 숏폼 변환</CardTitle>
              <CardDescription>URL, 업로드, 씬/하이라이트/분할 옵션 실행 후 타임라인 자동 배치.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>YouTube URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="space-y-2">
                <Label>파일 업로드</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={handleFilePick}><Upload className="mr-1 h-4 w-4" />파일 업로드</Button>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />
                  {file ? <Badge variant="default">첨부됨</Badge> : <Badge variant="muted">미첨부</Badge>}
                </div>
                <Input value={file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : "첨부된 파일 없음"} readOnly />
              </div>

              <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>분할 방식</Label>
                  <Select value={splitMode} onValueChange={(v) => setSplitMode(v as SplitMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">N개로 분할</SelectItem>
                      <SelectItem value="seconds">N초 단위 분할</SelectItem>
                      <SelectItem value="silence">침묵 기준 분할</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>기준 영상 길이(초)</Label>
                  <Input type="number" min={1} value={manualDurationSec} onChange={(e) => setManualDurationSec(e.target.value)} disabled={typeof videoDurationSec === "number"} />
                </div>
                <div className="space-y-2">
                  <Label>N개 분할</Label>
                  <Select value={splitCount} onValueChange={setSplitCount}>
                    <SelectTrigger disabled={splitMode !== "count"}><SelectValue /></SelectTrigger>
                    <SelectContent>{["2", "3", "4", "5", "6", "8", "10", "12"].map((v) => <SelectItem key={v} value={v}>{v}개</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>N초 분할</Label>
                  <Select value={splitSeconds} onValueChange={setSplitSeconds}>
                    <SelectTrigger disabled={splitMode !== "seconds"}><SelectValue /></SelectTrigger>
                    <SelectContent>{["10", "15", "20", "30", "45", "60", "90"].map((v) => <SelectItem key={v} value={v}>{v}초</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>음성 기반 하이라이트 텍스트</Label>
                <Textarea rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="하이라이트 감지용 스크립트" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={runSceneDetect}>자동 씬 감지</Button>
                <Button type="button" variant="outline" onClick={runHighlightDetect}>음성 기반 하이라이트 감지</Button>
                <Button type="button" variant="outline" onClick={runSplitOption}>분할 옵션 실행</Button>
                <Button type="button" onClick={applySegmentsToTimeline}>분할 결과 타임라인 배치</Button>
              </div>

              <div className="space-y-2">
                <Label>분할 결과</Label>
                {segments.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">결과 없음</div>
                ) : (
                  <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-md border p-2">
                    {segments.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span className="font-medium">{s.index}. {s.reason.toUpperCase()}</span>
                        <span className="text-muted-foreground">{formatMMSS(s.startSec)} - {formatMMSS(s.endSec)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "editor" ? (
        <div className={cn("grid gap-4", project.mobileCompact ? "lg:grid-cols-1" : "lg:grid-cols-[340px,minmax(0,1fr)]")}>
          <Card>
            <CardHeader>
              <CardTitle>캔버스 편집</CardTitle>
              <CardDescription>Bounding Box / 위치·회전·확대 / Keyframe 지원</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="mx-auto rounded-md border bg-black p-2" style={{ width: size.w + 16 }}>
                <div className="relative overflow-hidden rounded bg-zinc-900" style={{ width: size.w, height: size.h }}>
                  <div className="absolute inset-0 bg-gradient-to-b from-zinc-700 to-zinc-950" />
                  {project.shortsSafeLine ? <div className="pointer-events-none absolute inset-x-0 top-[14%] border-t border-cyan-300/70" /> : null}
                  <div className="pointer-events-none absolute inset-2 border border-white/25" />

                  {activeOverlay.map((clip) => {
                    const base = clip.visual || defaultVisual();
                    const visual = applyPresetAnimation(base, clip, project.playhead);
                    const selected = selectedClipId === clip.id;
                    const isEditing = editingTextClipId === clip.id;
                    const rawText = String(clip.text || clip.label || "");
                    const clipProgress = clamp((project.playhead - clip.start) / Math.max(1, clip.duration), 0, 1, 0);
                    const renderedText = visual.animation === "typing" ? rawText.slice(0, Math.max(1, Math.floor(rawText.length * clipProgress))) : rawText;
                    return (
                      <div
                        key={clip.id}
                        className="absolute cursor-move"
                        style={{
                          left: `${visual.x}%`,
                          top: `${visual.y}%`,
                          width: `${visual.w}%`,
                          height: `${visual.h}%`,
                          transform: `translate(-50%, -50%) rotate(${visual.rotation}deg) scale(${visual.scale})`,
                          opacity: visual.opacity
                        }}
                        onPointerDown={(e) => beginCanvasDrag(e, clip.id, "move", visual)}
                        onClick={() => setSelectedClipId(clip.id)}
                        onDoubleClick={() => {
                          if (clip.track === "text" || clip.track === "effect") {
                            setSelectedClipId(clip.id);
                            setEditingTextClipId(clip.id);
                            setEditingTextValue(String(clip.text || clip.label || ""));
                          }
                        }}
                      >
                        <div className={cn("flex h-full w-full items-center justify-center text-center leading-tight", selected ? "border border-cyan-300" : "border border-transparent")} style={{ color: visual.color, fontSize: Math.max(10, visual.fontSize * (size.w / 260)), textShadow: `${visual.stroke}px ${visual.stroke}px rgba(0,0,0,1), ${visual.shadow}px ${visual.shadow}px rgba(0,0,0,0.8), 0 0 ${visual.glow}px rgba(255,255,255,0.85)` }}>
                          {isEditing ? (
                            <textarea
                              className="h-full w-full resize-none rounded bg-black/60 p-1 text-center text-white outline-none"
                              value={editingTextValue}
                              onChange={(event) => setEditingTextValue(event.target.value)}
                              onBlur={commitCanvasTextEdit}
                            />
                          ) : (
                            renderedText
                          )}
                        </div>
                        {selected ? (
                          <>
                            <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded bg-cyan-300" onPointerDown={(e) => beginCanvasDrag(e, clip.id, "scale", visual)} />
                            <div className="absolute -right-1 -top-1 h-3 w-3 rounded border border-cyan-300 bg-zinc-900" onPointerDown={(e) => beginCanvasDrag(e, clip.id, "rotate", visual)} />
                          </>
                        ) : null}
                      </div>
                    );
                  })}

                  {activeCue ? (
                    <div
                      className={cn(
                        "absolute inset-x-3 bottom-[8%]",
                        project.subtitleAutoCenter ? "text-center" : "text-left"
                      )}
                    >
                      <div
                        className={cn("inline-block rounded px-2 py-1", project.captionBackgroundBox ? "bg-black/55" : "bg-transparent")}
                        style={{ fontSize: Math.max(12, project.captionFontSize * (size.w / 260)), color: project.captionColor, textShadow: `${project.captionStroke}px ${project.captionStroke}px rgba(0,0,0,1), ${project.captionShadow}px ${project.captionShadow}px rgba(0,0,0,0.8), 0 0 ${project.captionGlow}px rgba(255,255,255,0.7)` }}
                      >
                        {project.captionAnimation === "typing" ? (
                          <span>{activeCueTypingText}</span>
                        ) : activeCueWords.length > 0 ? (
                          activeCueWords.map((w, i) => <span key={`${w.word}-${i}`} className={w.active ? "font-bold text-yellow-300" : ""}>{w.word} </span>)
                        ) : (
                          activeCue.text
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>비율</Label>
                  <Select value={project.ratio} onValueChange={(v) => updateProject((prev) => ({ ...prev, ratio: v as Ratio }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="9:16">9:16</SelectItem><SelectItem value="1:1">1:1</SelectItem><SelectItem value="16:9">16:9</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>타임베이스</Label>
                  <Select value={String(project.fps)} onValueChange={(v) => updateProject((prev) => ({ ...prev, fps: v === "60" ? 60 : 30, exportFps: v === "60" ? 60 : 30 }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="30">30 FPS</SelectItem><SelectItem value="60">60 FPS</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2"><Switch checked={project.autoReframe} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, autoReframe: Boolean(c) }))} /><span className="text-sm">Auto Reframe</span></div>
                <div className="flex items-center gap-2"><Switch checked={project.mobileCompact} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, mobileCompact: Boolean(c) }))} /><span className="text-sm">모바일 축소 모드</span></div>
                <div className="flex items-center gap-2"><Switch checked={project.shortsSafeLine} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, shortsSafeLine: Boolean(c) }))} /><span className="text-sm">Shorts Safe Line</span></div>
                <div className="flex items-center gap-2"><Switch checked={project.subtitleAutoCenter} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, subtitleAutoCenter: Boolean(c) }))} /><span className="text-sm">자막 중앙 정렬</span></div>
                <div className="flex items-center gap-2"><Switch checked={project.captionBackgroundBox} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, captionBackgroundBox: Boolean(c) }))} /><span className="text-sm">자막 배경 박스</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>멀티 트랙 타임라인</CardTitle>
              <CardDescription>드래그 이동/트림, 줌, 스냅, Undo/Redo, 30/60fps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateProject(
                      (prev) => ({ ...prev, playhead: Math.max(0, prev.playhead - 1) }),
                      false
                    )
                  }
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsPlaying((prev) => !prev)}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateProject(
                      (prev) => ({ ...prev, playhead: Math.min(prev.duration, prev.playhead + 1) }),
                      false
                    )
                  }
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={undo} disabled={undoRef.current.length === 0}>Undo</Button>
                <Button type="button" variant="outline" size="sm" onClick={redo} disabled={redoRef.current.length === 0}>Redo</Button>
                <Button type="button" variant="outline" size="sm" onClick={addTextClip}>텍스트 클립 추가</Button>
                <Button type="button" variant="outline" size="sm" onClick={splitSelectedClip}>
                  <Split className="mr-1 h-4 w-4" />
                  Split (S)
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={deleteSelectedClip}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  삭제
                </Button>
                <Badge variant="muted">히스토리 {undoRef.current.length}/50</Badge>
                <Badge variant="muted">tick {historyTick}</Badge>
                <Badge variant={shiftPressed ? "default" : "muted"}>
                  Shift 스냅해제 {shiftPressed ? "ON" : "OFF"}
                </Badge>
                <div className="ml-auto flex items-center gap-2"><span className="text-xs text-muted-foreground">Zoom</span><Input className="w-32" type="range" min={0.5} max={4} step={0.1} value={project.zoom} onChange={(e) => updateProject((prev) => ({ ...prev, zoom: clamp(Number(e.target.value), 0.5, 4, prev.zoom) }))} /></div>
                <div className="flex items-center gap-2"><Switch checked={project.snap} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, snap: Boolean(c) }))} /><span className="text-sm">Snap</span></div>
                <div className="flex items-center gap-2"><Switch checked={rippleDelete} onCheckedChange={(c) => setRippleDelete(Boolean(c))} /><span className="text-sm">Ripple Delete</span></div>
              </div>

              <div className="space-y-1">
                <Label>Playhead {formatMMSS(frameToSec(project.playhead, project.fps))}</Label>
                <Input type="range" min={0} max={project.duration} value={project.playhead} onChange={(e) => updateProject((prev) => ({ ...prev, playhead: clamp(Number(e.target.value), 0, prev.duration, prev.playhead) }), false)} />
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr),320px]">
                <div
                  className="overflow-x-auto rounded-md border"
                  onWheel={(event) => {
                    if (!event.ctrlKey) {
                      return;
                    }
                    event.preventDefault();
                    const delta = event.deltaY > 0 ? -0.1 : 0.1;
                    updateProject((prev) => ({
                      ...prev,
                      zoom: clamp(prev.zoom + delta, 0.5, 4, prev.zoom)
                    }));
                  }}
                >
                  <div className="relative" style={{ width: timelineWidth }}>
                    <div className="grid grid-cols-[120px,minmax(0,1fr)] bg-muted/40">
                      <div className="border-r px-2 py-2 text-xs font-medium">Track / Time</div>
                      <div className="relative h-8">
                        {Array.from({ length: Math.ceil(project.duration / project.fps) + 1 }).map((_, sec) => <div key={sec} className="absolute top-0 h-full border-l border-border" style={{ left: sec * pxPerSec }}><span className="absolute left-1 top-1 text-[10px] text-muted-foreground">{sec}s</span></div>)}
                        <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-rose-400" style={{ left: project.playhead * pxPerFrame }} />
                      </div>
                    </div>

                    {TRACKS.map(({ key, label }) => (
                      <div key={key} className="grid grid-cols-[120px,minmax(0,1fr)] border-t">
                        <div className="border-r px-2 py-2 text-xs font-medium">
                          <div className="flex items-center justify-between gap-1">
                            <span>{label}</span>
                            {project.trackLocked[key] ? <Lock className="h-3 w-3 text-rose-400" /> : null}
                          </div>
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              className="rounded border px-1 py-0.5 text-[10px]"
                              onClick={() =>
                                updateProject((prev) => ({
                                  ...prev,
                                  trackCollapsed: {
                                    ...prev.trackCollapsed,
                                    [key]: !prev.trackCollapsed[key]
                                  }
                                }))
                              }
                              title="Collapse Track"
                            >
                              {project.trackCollapsed[key] ? "펼침" : "접기"}
                            </button>
                            <button
                              type="button"
                              className="rounded border px-1 py-0.5 text-[10px]"
                              onClick={() =>
                                updateProject((prev) => ({
                                  ...prev,
                                  trackLocked: {
                                    ...prev.trackLocked,
                                    [key]: !prev.trackLocked[key]
                                  }
                                }))
                              }
                              title="Lock Track"
                            >
                              {project.trackLocked[key] ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                        <div className={cn("relative bg-background/70", project.trackCollapsed[key] ? "h-8" : "h-16", project.trackLocked[key] ? "opacity-70" : "")}>
                          <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-rose-400" style={{ left: project.playhead * pxPerFrame }} />
                          {project.trackCollapsed[key]
                            ? null
                            : project.tracks[key].map((clip) => (
                              <div
                                key={clip.id}
                                className={cn("absolute top-3 h-10 rounded border px-2 text-xs font-medium text-black shadow-sm", selectedClipId === clip.id ? "ring-2 ring-cyan-300" : "", project.trackLocked[key] ? "cursor-not-allowed" : "")}
                                style={{ left: clip.start * pxPerFrame, width: Math.max(16, clip.duration * pxPerFrame), backgroundColor: clip.color }}
                                onPointerDown={(e) => beginClipDrag(e, key, clip, "move")}
                                onClick={() => setSelectedClipId(clip.id)}
                              >
                                <div className="line-clamp-1">{clip.label}</div>
                                <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l bg-black/35", project.trackLocked[key] ? "cursor-not-allowed" : "cursor-ew-resize")} onPointerDown={(e) => beginClipDrag(e, key, clip, "trim-start")} />
                                <div className={cn("absolute inset-y-0 right-0 w-1 rounded-r bg-black/35", project.trackLocked[key] ? "cursor-not-allowed" : "cursor-ew-resize")} onPointerDown={(e) => beginClipDrag(e, key, clip, "trim-end")} />
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">선택 클립 속성</p>
                    {selectedClip ? <Badge variant="muted">{selectedClip.track}</Badge> : null}
                  </div>
                  {!selectedClip ? (
                    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">클립을 선택하면 속성이 표시됩니다.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>클립 이름</Label>
                        <Input value={selectedClip.clip.label} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, label: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>Start(frame)</Label>
                          <Input type="number" min={0} max={project.duration} value={selectedClip.clip.start} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, start: clamp(Number(e.target.value), 0, project.duration - 1, clip.start) }))} />
                        </div>
                        <div className="space-y-1">
                          <Label>Duration(frame)</Label>
                          <Input type="number" min={4} max={project.duration} value={selectedClip.clip.duration} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, duration: clamp(Number(e.target.value), 4, project.duration, clip.duration) }))} />
                        </div>
                      </div>

                      {(selectedClip.track === "video" || selectedClip.track === "audio") ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label>속도</Label>
                              <Input type="number" min={0.25} max={4} step={0.05} value={selectedClip.clip.speed ?? 1} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, speed: clamp(Number(e.target.value), 0.25, 4, clip.speed ?? 1) }))} />
                            </div>
                            <div className="space-y-1">
                              <Label>볼륨(%)</Label>
                              <Input type="number" min={0} max={200} value={selectedClip.clip.volume ?? 100} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, volume: clamp(Number(e.target.value), 0, 200, clip.volume ?? 100) }))} />
                            </div>
                          </div>
                          {selectedClip.track === "video" ? (
                            <div className="space-y-1">
                              <Label>필터</Label>
                              <Select value={selectedClip.clip.filter ?? "none"} onValueChange={(v) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, filter: v as Clip["filter"] }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="cinematic">Cinematic</SelectItem>
                                  <SelectItem value="bw">B/W</SelectItem>
                                  <SelectItem value="warm">Warm</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {(selectedClip.track === "text" || selectedClip.track === "effect") && selectedVisual ? (
                        <>
                          <div className="space-y-1">
                            <Label>텍스트</Label>
                            <Textarea rows={3} value={selectedClip.clip.text || ""} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, text: e.target.value }))} />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1"><Label>X(%)</Label><Input type="number" min={0} max={100} value={Math.round(selectedVisual.x)} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), x: clamp(Number(e.target.value), 0, 100, 50) } }))} /></div>
                            <div className="space-y-1"><Label>Y(%)</Label><Input type="number" min={0} max={100} value={Math.round(selectedVisual.y)} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), y: clamp(Number(e.target.value), 0, 100, 50) } }))} /></div>
                            <div className="space-y-1"><Label>폭(%)</Label><Input type="number" min={10} max={100} value={Math.round(selectedVisual.w)} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), w: clamp(Number(e.target.value), 10, 100, 70) } }))} /></div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1"><Label>폰트 크기</Label><Input type="number" min={12} max={180} value={Math.round(selectedVisual.fontSize)} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), fontSize: clamp(Number(e.target.value), 12, 180, 48) } }))} /></div>
                            <div className="space-y-1"><Label>그림자</Label><Input type="number" min={0} max={20} value={selectedVisual.shadow} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), shadow: clamp(Number(e.target.value), 0, 20, 2) } }))} /></div>
                            <div className="space-y-1"><Label>스트로크</Label><Input type="number" min={0} max={20} value={selectedVisual.stroke} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), stroke: clamp(Number(e.target.value), 0, 20, 2) } }))} /></div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1"><Label>Glow</Label><Input type="number" min={0} max={30} value={selectedVisual.glow} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), glow: clamp(Number(e.target.value), 0, 30, 0) } }))} /></div>
                            <div className="space-y-1"><Label>색상</Label><Input type="color" value={selectedVisual.color} onChange={(e) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), color: e.target.value } }))} /></div>
                            <div className="space-y-1"><Label>애니메이션</Label><Select value={selectedVisual.animation} onValueChange={(v) => updateTrackClip(selectedClip.track, selectedClip.clip.id, (clip) => ({ ...clip, visual: { ...(clip.visual || defaultVisual()), animation: v as AnimationPreset } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="fade">Fade</SelectItem><SelectItem value="slide">Slide</SelectItem><SelectItem value="scale">Scale</SelectItem><SelectItem value="bounce">Bounce</SelectItem><SelectItem value="typing">Typing</SelectItem></SelectContent></Select></div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label>키프레임 타임라인</Label>
                              <div className="flex gap-1">
                                <Button type="button" size="sm" variant="outline" onClick={addKeyframe}>+</Button>
                                <Button type="button" size="sm" variant="outline" onClick={removeKeyframe}>-</Button>
                              </div>
                            </div>
                            <div className="relative h-10 rounded border bg-muted/20">
                              <div className="absolute inset-y-0 w-[2px] bg-rose-400" style={{ left: `${selectedClipProgress * 100}%` }} />
                              {selectedVisual.keyframes.map((keyframe) => (
                                <div key={keyframe.frame} className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300" style={{ left: `${clamp((keyframe.frame - selectedClip.clip.start) / Math.max(1, selectedClip.clip.duration), 0, 1, 0) * 100}%` }} />
                              ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">현재 프레임: {project.playhead} / 키프레임: {selectedVisual.keyframes.length}</p>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "templates" ? (
        <Card>
          <CardHeader>
            <CardTitle>템플릿 시스템 (JSON 기반)</CardTitle>
            <CardDescription>카테고리 필터, 미리보기, placeholder 치환, 서버 저장/재사용</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-[220px,1fr]">
              <div className="space-y-1">
                <Label>카테고리</Label>
                <Select value={templateCategory} onValueChange={setTemplateCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{templateCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label>Title 치환</Label><Input value={templateTitleReplacement} onChange={(e) => setTemplateTitleReplacement(e.target.value)} /></div>
                <div className="space-y-1"><Label>Topic 치환</Label><Input value={templateTopicReplacement} onChange={(e) => setTemplateTopicReplacement(e.target.value)} /></div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={cn("rounded-lg border p-3", selectedTemplateId === template.id ? "border-cyan-400 bg-cyan-50/20" : "")}
                  onMouseEnter={() => setHoverTemplateId(template.id)}
                  onMouseLeave={() => setHoverTemplateId((prev) => (prev === template.id ? undefined : prev))}
                >
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold">{template.name}</p><Badge variant="muted">{template.category}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{template.previewLabel || "템플릿 미리보기"}</p>
                  <div className="relative mt-3 h-24 overflow-hidden rounded border bg-gradient-to-br from-zinc-900 to-zinc-700 p-2 text-xs text-white">
                    <div className={cn("absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700", hoverTemplateId === template.id ? "translate-x-[-5%]" : "-translate-x-full")} />
                    <p className="relative z-10 line-clamp-1">{templateTitleReplacement}</p>
                    <p className="relative z-10 mt-1 line-clamp-2 text-yellow-300">{templateTopicReplacement}</p>
                    {hoverTemplateId === template.id ? <Badge className="absolute bottom-1 right-1 z-10">Preview</Badge> : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" variant={selectedTemplateId === template.id ? "default" : "outline"} onClick={() => setSelectedTemplateId(template.id)}>선택</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const confirmed = window.confirm("현재 프로젝트 타임라인을 템플릿으로 덮어쓸까요?");
                        if (!confirmed) return;
                        applyTemplate(template);
                      }}
                    >
                      적용
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="템플릿 이름" />
                <Input value={templateCategoryInput} onChange={(e) => setTemplateCategoryInput(e.target.value)} placeholder="카테고리" />
                <Input value={templatePreviewLabel} onChange={(e) => setTemplatePreviewLabel(e.target.value)} placeholder="미리보기 설명" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setTemplateJson(JSON.stringify({ tracks: TRACKS.flatMap(({ key }) => project.tracks[key].map((clip) => ({ type: key, start: Number(frameToSec(clip.start, project.fps).toFixed(2)), duration: Number(frameToSec(clip.duration, project.fps).toFixed(2)), label: clip.label, text: clip.text, animation: clip.visual?.animation || "none", style: clip.visual || undefined })) ) }, null, 2))}>현재 타임라인 → JSON</Button><Button type="button" size="sm" variant="outline" onClick={() => void saveTemplate(false)}>새로 저장</Button><Button type="button" size="sm" variant="outline" disabled={!selectedTemplateId} onClick={() => void saveTemplate(true)}>선택 수정</Button><Button type="button" size="sm" variant="destructive" disabled={!selectedTemplateId} onClick={() => void deleteTemplate()}>삭제</Button></div>
                <Textarea rows={12} value={templateJson} onChange={(e) => setTemplateJson(e.target.value)} />
                {templateError ? <p className="text-sm text-destructive">{templateError}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "captions" ? (
        <Card>
          <CardHeader>
            <CardTitle>자막 자동 생성 + 스타일</CardTitle>
            <CardDescription>STT 데모, 단어 하이라이트, 자막 템플릿 저장</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr,auto]">
              <Textarea rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="자막 생성용 텍스트" />
              <div className="flex flex-col gap-2"><Button type="button" onClick={generateCaptions}>STT 기반 자막 생성</Button><Button type="button" variant="outline" onClick={() => setTab("editor")}>에디터에서 확인</Button></div>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <Input type="number" min={1} max={12} value={project.wordsPerCaption} onChange={(e) => updateProject((prev) => ({ ...prev, wordsPerCaption: clamp(Number(e.target.value), 1, 12, prev.wordsPerCaption) }))} />
              <Input type="number" min={14} max={120} value={project.captionFontSize} onChange={(e) => updateProject((prev) => ({ ...prev, captionFontSize: clamp(Number(e.target.value), 14, 120, prev.captionFontSize) }))} />
              <Input type="color" value={project.captionColor} onChange={(e) => updateProject((prev) => ({ ...prev, captionColor: e.target.value }))} />
              <Select value={project.captionAnimation} onValueChange={(v) => updateProject((prev) => ({ ...prev, captionAnimation: v as AnimationPreset }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="fade">Fade</SelectItem><SelectItem value="slide">Slide</SelectItem><SelectItem value="scale">Scale</SelectItem><SelectItem value="bounce">Bounce</SelectItem><SelectItem value="typing">Typing</SelectItem></SelectContent></Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2"><Switch checked={project.subtitleAutoCenter} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, subtitleAutoCenter: Boolean(c) }))} /><span className="text-sm">자막 자동 중앙 정렬</span></div>
              <div className="flex items-center gap-2"><Switch checked={project.captionBackgroundBox} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, captionBackgroundBox: Boolean(c) }))} /><span className="text-sm">배경 박스 자동 생성</span></div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2"><Input className="max-w-[220px]" value={captionTemplateName} onChange={(e) => setCaptionTemplateName(e.target.value)} placeholder="자막 템플릿 이름" /><Button type="button" variant="outline" onClick={saveCaptionTemplate}>자막 템플릿 저장</Button><Select value={captionTemplateId} onValueChange={applyCaptionTemplate}><SelectTrigger className="w-[240px]"><SelectValue placeholder="저장된 자막 템플릿" /></SelectTrigger><SelectContent>{captionTemplateList.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="rounded-lg border p-3">
              <Label>자막 목록</Label>
              {project.cues.length === 0 ? <div className="mt-2 rounded border border-dashed p-2 text-sm text-muted-foreground">자막 없음</div> : <div className="mt-2 max-h-[240px] space-y-2 overflow-y-auto rounded border p-2">{project.cues.map((cue) => <div key={cue.id} className="rounded border p-2 text-sm"><p>{cue.text}</p><p className="text-xs text-muted-foreground">{formatMMSS(frameToSec(cue.start, project.fps))} - {formatMMSS(frameToSec(cue.end, project.fps))}</p></div>)}</div>}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "export" ? (
        <Card>
          <CardHeader>
            <CardTitle>Export 시스템</CardTitle>
            <CardDescription>해상도/비트레이트/워터마크/서버·로컬 렌더 선택</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-5">
              <Select value={project.exportResolution} onValueChange={(v) => updateProject((prev) => ({ ...prev, exportResolution: v as Project["exportResolution"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1080x1920">1080x1920</SelectItem><SelectItem value="720x1280">720x1280</SelectItem></SelectContent></Select>
              <Input value="MP4 H.264" readOnly />
              <Select value={project.exportBitrate} onValueChange={(v) => updateProject((prev) => ({ ...prev, exportBitrate: v as Project["exportBitrate"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="4M">4 Mbps</SelectItem><SelectItem value="6M">6 Mbps</SelectItem><SelectItem value="8M">8 Mbps</SelectItem><SelectItem value="12M">12 Mbps</SelectItem></SelectContent></Select>
              <Select value={project.exportMode} onValueChange={(v) => updateProject((prev) => ({ ...prev, exportMode: v as Project["exportMode"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="server">서버 렌더링</SelectItem><SelectItem value="local">로컬 렌더링</SelectItem></SelectContent></Select>
              <Select value={String(project.exportFps)} onValueChange={(v) => updateProject((prev) => ({ ...prev, exportFps: v === "60" ? 60 : 30 }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30</SelectItem><SelectItem value="60">60</SelectItem></SelectContent></Select>
            </div>
            <div className="rounded-lg border p-3"><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2"><Switch checked={project.watermark} onCheckedChange={(c) => updateProject((prev) => ({ ...prev, watermark: Boolean(c) }))} /><span className="text-sm">워터마크</span></div><Input className="max-w-[280px]" value={project.watermarkText} disabled={!project.watermark} onChange={(e) => updateProject((prev) => ({ ...prev, watermarkText: e.target.value }))} /></div></div>
            <div className="space-y-2"><Label>Export Job JSON</Label><Textarea rows={14} value={JSON.stringify(exportPayload, null, 2)} readOnly /></div>
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="muted" className="gap-1"><Film className="h-3 w-3" /> 타임라인 상태 JSON</Badge>
          <Badge variant="muted" className="gap-1"><Scissors className="h-3 w-3" /> 분할 결과 자동 배치</Badge>
          <Badge variant="muted" className="gap-1"><Sparkles className="h-3 w-3" /> 템플릿 JSON 렌더</Badge>
        </div>
      </div>
    </section>
  );
}
