"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clapperboard,
  Coins,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  billableClipSeconds,
  estimateRunCredits,
  type CinematicAspectRatio,
  type CinematicCut,
  type CinematicHookCandidate,
  type CinematicResearch,
  type CinematicScriptBlock,
  type CinematicTake,
  type CinematicTopicCandidate
} from "@/lib/cinematic-types";
import { findNegativePhrasing } from "@/lib/cinematic-style-presets";
import {
  CINEMATIC_SCRIPT_TEMPLATES,
  DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID,
  emptyBlocksForTemplate,
  findCinematicScriptTemplate
} from "@/lib/cinematic-script-templates";
import {
  CINEMATIC_STYLE_PRESETS,
  DEFAULT_CINEMATIC_STYLE_PRESET_ID,
  buildCutPrompt,
  findCinematicStylePreset
} from "@/lib/cinematic-style-presets";
import { ALL_VOICE_OPTIONS } from "@/lib/voice-options";
import { cn } from "@/lib/utils";

type HiggsfieldStatus = {
  available: boolean;
  email?: string;
  plan?: string;
  credits?: number;
  error?: string;
  endpoint?: string;
};

type HiggsfieldModel = { job_type: string; display_name: string; type: string };

type ProjectSummary = { id: string; title: string; topic: string; updatedAt: string };

type SaveState = "idle" | "saving" | "saved" | "error";

type ElevenVoice = {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  previewUrl?: string;
};

type LoadedProject = {
  id: string;
  topic: string;
  stylePresetId: string;
  aspectRatio: CinematicAspectRatio;
  model: string;
  resolution: "480p" | "720p" | "1080p";
  targetDurationSec: number;
  research?: CinematicResearch;
  selectedHook?: CinematicHookCandidate;
  hookCandidates: CinematicHookCandidate[];
  scriptBlocks: CinematicScriptBlock[];
  scriptTemplateId?: string;
  cuts: CinematicCut[];
  narrationVoice?: string;
  finalVideoUrl?: string;
};

type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 1, label: "훅", hint: "상식과 반대되는 사실 고르기" },
  { id: 2, label: "대본", hint: "선택한 구조로 다듬기" },
  { id: 3, label: "장면", hint: "2~5초 컷으로 분할" },
  { id: 4, label: "생성", hint: "컷별 영상 뽑고 고르기" },
  { id: 5, label: "조립", hint: "내레이션·자막 붙여 완성" }
];

/** Spoken Korean runs near 6.5 characters per second at default TTS speed. */
const CHARS_PER_SECOND = 6.5;

function estimateSeconds(text: string): number {
  return Math.round((text.trim().length / CHARS_PER_SECOND) * 10) / 10;
}

function emptyScriptBlocks(templateId: string): CinematicScriptBlock[] {
  return emptyBlocksForTemplate(templateId);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data?.error || `요청이 실패했습니다. (HTTP ${response.status})`);
  }
  return data;
}

export function CinematicStudioClient(): React.JSX.Element {
  const [step, setStep] = useState<StepId>(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [engineStatus, setEngineStatus] = useState<HiggsfieldStatus | null>(null);
  const [models, setModels] = useState<HiggsfieldModel[]>([]);

  const [topic, setTopic] = useState("");
  const [stylePresetId, setStylePresetId] = useState(DEFAULT_CINEMATIC_STYLE_PRESET_ID);
  const [aspectRatio, setAspectRatio] = useState<CinematicAspectRatio>("9:16");
  const [model, setModel] = useState("veo3_1_lite");
  const [resolution, setResolution] = useState<"480p" | "720p" | "1080p">("720p");
  const [targetDurationSec, setTargetDurationSec] = useState(50);

  const [topicIdeas, setTopicIdeas] = useState<CinematicTopicCandidate[]>([]);
  const [topicHint, setTopicHint] = useState("");
  const [research, setResearch] = useState<CinematicResearch | null>(null);
  const [hooks, setHooks] = useState<CinematicHookCandidate[]>([]);
  const [selectedHook, setSelectedHook] = useState<CinematicHookCandidate | null>(null);
  const [scriptTemplateId, setScriptTemplateId] = useState(DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID);
  const [scriptBlocks, setScriptBlocks] = useState<CinematicScriptBlock[]>(() =>
    emptyScriptBlocks(DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID)
  );
  const [cuts, setCuts] = useState<CinematicCut[]>([]);
  const [spentCredits, setSpentCredits] = useState(0);
  const [budgetCredits, setBudgetCredits] = useState(300);
  const [ttsProvider, setTtsProvider] = useState<"openai" | "elevenlabs">("elevenlabs");
  const [voice, setVoice] = useState("onyx");
  const [elevenVoices, setElevenVoices] = useState<ElevenVoice[]>([]);
  const [elevenVoicesError, setElevenVoicesError] = useState("");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [finalVideoUrl, setFinalVideoUrl] = useState("");
  const [sfxSpendUsd, setSfxSpendUsd] = useState(0);
  const [pendingCutIds, setPendingCutIds] = useState<string[]>([]);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaTags, setMetaTags] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<"private" | "unlisted" | "public">("private");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const preset = useMemo(() => findCinematicStylePreset(stylePresetId), [stylePresetId]);
  const scriptTemplate = useMemo(
    () => findCinematicScriptTemplate(scriptTemplateId),
    [scriptTemplateId]
  );
  const pollTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Suppresses autosave while a project is being hydrated from the server. */
  const hydrating = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cinematic/status", { cache: "no-store" });
        const data = (await response.json()) as {
          status: HiggsfieldStatus;
          models: HiggsfieldModel[];
        };
        if (cancelled) return;
        setEngineStatus(data.status);
        setModels(Array.isArray(data.models) ? data.models : []);
      } catch {
        if (!cancelled) {
          setEngineStatus({ available: false, error: "엔진 상태를 확인하지 못했습니다." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (ttsProvider !== "elevenlabs" || elevenVoices.length > 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/cinematic/voices", { cache: "no-store" });
        const data = (await response.json()) as { voices?: ElevenVoice[]; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setElevenVoicesError(data.error || "보이스 목록을 불러오지 못했습니다.");
          return;
        }
        setElevenVoices(data.voices || []);
        setElevenVoicesError("");
      } catch (caught) {
        if (!cancelled) {
          setElevenVoicesError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [elevenVoices.length, ttsProvider]);

  const scriptTotalSeconds = useMemo(
    () => estimateSeconds(scriptBlocks.map((block) => block.text).join(" ")),
    [scriptBlocks]
  );

  const cutsTotalSeconds = useMemo(
    () => cuts.reduce((sum, cut) => sum + cut.durationSec, 0),
    [cuts]
  );

  /** Every model bills a 4s floor, so short cuts cost more than they run. */
  const billableTotalSeconds = useMemo(
    () => cuts.reduce((sum, cut) => sum + billableClipSeconds(cut.durationSec), 0),
    [cuts]
  );

  const estimatedRunCredits = useMemo(
    () => estimateRunCredits(model, billableTotalSeconds),
    [billableTotalSeconds, model]
  );

  const readyCutCount = useMemo(
    () => cuts.filter((cut) => Boolean(cut.selectedTakeId)).length,
    [cuts]
  );

  const refreshProjectList = useCallback(async () => {
    try {
      const response = await fetch("/api/cinematic/projects", { cache: "no-store" });
      const data = (await response.json()) as { projects?: ProjectSummary[] };
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      // A failed list only hides the picker; saving still works.
    }
  }, []);

  useEffect(() => {
    void refreshProjectList();
  }, [refreshProjectList]);

  const projectSnapshot = useMemo(
    () => ({
      title: selectedHook?.hook || topic || "제목 없음",
      topic,
      stylePresetId,
      scriptTemplateId,
      masterPrompt: preset.masterPrompt,
      aspectRatio,
      model,
      resolution,
      targetDurationSec,
      research: research || undefined,
      selectedHook: selectedHook || undefined,
      hookCandidates: hooks,
      scriptBlocks,
      cuts,
      narrationVoice: voice,
      ttsProvider,
      finalVideoUrl: finalVideoUrl || undefined
    }),
    [
      aspectRatio,
      cuts,
      finalVideoUrl,
      hooks,
      model,
      preset.masterPrompt,
      research,
      resolution,
      scriptBlocks,
      scriptTemplateId,
      selectedHook,
      ttsProvider,
      stylePresetId,
      targetDurationSec,
      topic,
      voice
    ]
  );

  /**
   * Persist the project. Generated takes cost real credits, so this runs on a
   * short debounce rather than waiting for an explicit save.
   */
  const persistProject = useCallback(async (): Promise<void> => {
    if (topic.trim().length < 2) {
      return;
    }
    setSaveState("saving");
    try {
      if (!projectId) {
        const response = await fetch("/api/cinematic/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectSnapshot)
        });
        const data = (await response.json()) as { project?: { id: string }; error?: string };
        if (!response.ok || !data.project) {
          throw new Error(data.error || "프로젝트 생성에 실패했습니다.");
        }
        setProjectId(data.project.id);
        // The create route only seeds the header fields, so push the rest now.
        await fetch(`/api/cinematic/projects/${data.project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectSnapshot)
        });
      } else {
        const response = await fetch(`/api/cinematic/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectSnapshot)
        });
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error || "저장에 실패했습니다.");
        }
      }
      setSaveState("saved");
      void refreshProjectList();
    } catch (caught) {
      setSaveState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [projectId, projectSnapshot, refreshProjectList, topic]);

  useEffect(() => {
    if (hydrating.current || topic.trim().length < 2) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      void persistProject();
    }, 1500);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [persistProject, topic]);

  const runStep = useCallback(
    async (label: string, task: () => Promise<void>): Promise<void> => {
      setBusy(label);
      setError("");
      try {
        await task();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy("");
      }
    },
    []
  );

  const handleSuggestTopics = useCallback(
    () =>
      runStep("주제 추천 중", async () => {
        const data = await postJson<{ topics: CinematicTopicCandidate[] }>(
          "/api/cinematic/topics",
          {
            stylePresetId,
            count: 6,
            hint: topicHint.trim() || undefined,
            // Refresh keeps what is on screen out of the next batch.
            exclude: topicIdeas.map((item) => item.topic)
          }
        );
        setTopicIdeas(data.topics);
      }),
    [runStep, stylePresetId, topicHint, topicIdeas]
  );

  const handleResearch = useCallback(
    () =>
      runStep("자료 조사 중", async () => {
        const data = await postJson<{ research: CinematicResearch }>("/api/cinematic/research", {
          topic,
          stylePresetId
        });
        setResearch(data.research);
        // Hooks written before the research are no longer grounded in it.
        setHooks([]);
        setSelectedHook(null);
      }),
    [runStep, stylePresetId, topic]
  );

  const handleGenerateHooks = useCallback(
    () =>
      runStep("훅 생성 중", async () => {
        const data = await postJson<{ hooks: CinematicHookCandidate[] }>("/api/cinematic/hooks", {
          topic,
          stylePresetId,
          count: 5,
          research: research || undefined
        });
        setHooks(data.hooks);
        setSelectedHook(null);
      }),
    [research, runStep, stylePresetId, topic]
  );

  const handleGenerateScript = useCallback(
    () =>
      runStep("대본 작성 중", async () => {
        if (!selectedHook) {
          throw new Error("먼저 훅을 선택해주세요.");
        }
        const data = await postJson<{ blocks: CinematicScriptBlock[] }>("/api/cinematic/script", {
          topic,
          stylePresetId,
          scriptTemplateId,
          targetDurationSec,
          hook: selectedHook,
          research: research || undefined
        });
        setScriptBlocks(data.blocks);
        setStep(2);
      }),
    [research, runStep, scriptTemplateId, selectedHook, stylePresetId, targetDurationSec, topic]
  );

  const handleSplitCuts = useCallback(
    () =>
      runStep("장면 분할 중", async () => {
        const data = await postJson<{ cuts: CinematicCut[] }>("/api/cinematic/cuts", {
          topic,
          stylePresetId,
          masterPrompt: preset.masterPrompt,
          aspectRatio,
          targetDurationSec,
          scriptBlocks
        });
        setCuts(data.cuts);
        setStep(3);
      }),
    [
      aspectRatio,
      preset.masterPrompt,
      runStep,
      scriptBlocks,
      stylePresetId,
      targetDurationSec,
      topic
    ]
  );

  const updateCut = useCallback(
    (cutId: string, patch: Partial<CinematicCut>) => {
      setCuts((current) =>
        current.map((cut) => {
          if (cut.id !== cutId) {
            return cut;
          }
          const next = { ...cut, ...patch };
          if (
            patch.subject !== undefined ||
            patch.action !== undefined ||
            patch.camera !== undefined
          ) {
            next.prompt = buildCutPrompt({
              masterPrompt: preset.masterPrompt,
              subject: next.subject,
              action: next.action,
              camera: next.camera,
              aspectRatio
            });
          }
          return next;
        })
      );
    },
    [aspectRatio, preset.masterPrompt]
  );

  const pollTake = useCallback((cutId: string, takeId: string, jobId: string, attempt = 0) => {
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            const response = await fetch(`/api/cinematic/clips/${encodeURIComponent(jobId)}`, {
              cache: "no-store"
            });
            const data = (await response.json()) as {
              job?: {
                status: string;
                resultUrl?: string | null;
                previewUrl?: string | null;
                error?: string | null;
              };
              error?: string;
            };
            if (!response.ok || !data.job) {
              throw new Error(data.error || "작업 상태를 읽지 못했습니다.");
            }

            const { status, resultUrl, previewUrl } = data.job;
            const done = status === "completed" && Boolean(resultUrl);
            const failed = status === "failed" || status === "canceled";

            setCuts((current) =>
              current.map((cut) =>
                cut.id !== cutId
                  ? cut
                  : {
                      ...cut,
                      takes: cut.takes.map((take) =>
                        take.id !== takeId
                          ? take
                          : {
                              ...take,
                              status: done ? "completed" : failed ? "failed" : "in_progress",
                              videoUrl: resultUrl || undefined,
                              previewUrl: previewUrl || undefined,
                              error: failed
                                ? data.job?.error || "생성에 실패했습니다."
                                : undefined
                            }
                      ),
                      selectedTakeId: done && !cut.selectedTakeId ? takeId : cut.selectedTakeId
                    }
              )
            );

            if (!done && !failed && attempt < 90) {
              pollTake(cutId, takeId, jobId, attempt + 1);
            }
          } catch {
            if (attempt < 90) {
              pollTake(cutId, takeId, jobId, attempt + 1);
            }
          }
        })();
      },
      attempt === 0 ? 4000 : 8000
    );
    pollTimers.current[takeId] = timer;
  }, []);

  const loadProject = useCallback(
    async (id: string): Promise<void> => {
      if (!id) {
        return;
      }
      hydrating.current = true;
      setError("");
      try {
        const response = await fetch(`/api/cinematic/projects/${id}`, { cache: "no-store" });
        const data = (await response.json()) as { project?: LoadedProject; error?: string };
        if (!response.ok || !data.project) {
          throw new Error(data.error || "프로젝트를 불러오지 못했습니다.");
        }
        const project = data.project;

        setProjectId(project.id);
        setTopic(project.topic || "");
        setStylePresetId(project.stylePresetId || DEFAULT_CINEMATIC_STYLE_PRESET_ID);
        setAspectRatio(project.aspectRatio === "16:9" ? "16:9" : "9:16");
        setModel(project.model || "veo3_1_lite");
        setResolution(project.resolution || "720p");
        setTargetDurationSec(project.targetDurationSec || 50);
        setResearch(project.research || null);
        setHooks(Array.isArray(project.hookCandidates) ? project.hookCandidates : []);
        setSelectedHook(project.selectedHook || null);
        const loadedTemplateId = project.scriptTemplateId || DEFAULT_CINEMATIC_SCRIPT_TEMPLATE_ID;
        setScriptTemplateId(loadedTemplateId);
        setScriptBlocks(
          Array.isArray(project.scriptBlocks) && project.scriptBlocks.length > 0
            ? project.scriptBlocks
            : emptyScriptBlocks(loadedTemplateId)
        );
        const loadedCuts = Array.isArray(project.cuts) ? project.cuts : [];
        setCuts(loadedCuts);
        setVoice(project.narrationVoice || "onyx");
        setFinalVideoUrl(project.finalVideoUrl || "");
        setSaveState("saved");

        // Pick up any generation that was still running when the page closed.
        loadedCuts.forEach((cut) => {
          cut.takes
            .filter((take) => take.status === "in_progress" || take.status === "queued")
            .forEach((take) => pollTake(cut.id, take.id, take.jobId));
        });

        setStep(loadedCuts.length > 0 ? 3 : project.scriptBlocks?.[0]?.text ? 2 : 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        // Let state settle before autosave starts watching again.
        setTimeout(() => {
          hydrating.current = false;
        }, 100);
      }
    },
    [pollTake]
  );

  const startNewProject = useCallback(() => {
    hydrating.current = true;
    setProjectId("");
    setTopic("");
    setResearch(null);
    setHooks([]);
    setSelectedHook(null);
    setScriptBlocks(emptyScriptBlocks(scriptTemplateId));
    setCuts([]);
    setFinalVideoUrl("");
    setSpentCredits(0);
    setSaveState("idle");
    setStep(1);
    setTimeout(() => {
      hydrating.current = false;
    }, 100);
  }, [scriptTemplateId]);

  const handleDeleteProject = useCallback(() => {
    if (!projectId) {
      return;
    }
    const label = projects.find((item) => item.id === projectId)?.title || "이 프로젝트";
    if (!window.confirm(`${label}을(를) 삭제할까요? 생성한 컷 결과도 함께 사라집니다.`)) {
      return;
    }
    void runStep("프로젝트 삭제 중", async () => {
      const response = await fetch(`/api/cinematic/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("삭제에 실패했습니다.");
      }
      startNewProject();
      await refreshProjectList();
    });
  }, [projectId, projects, refreshProjectList, runStep, startNewProject]);

  const handleGenerateTake = useCallback(
    (cut: CinematicCut) =>
      runStep(`컷 ${cut.index} 생성 요청 중`, async () => {
        if (spentCredits >= budgetCredits) {
          throw new Error(`설정한 크레딧 상한(${budgetCredits})에 도달했습니다.`);
        }
        if (pendingCutIds.includes(cut.id)) {
          throw new Error(`컷 ${cut.index}은(는) 이미 생성 요청 중입니다.`);
        }
        setPendingCutIds((current) => [...current, cut.id]);
        try {
        const data = await postJson<{ jobId: string; credits: number | null }>(
          "/api/cinematic/clips",
          {
            prompt: cut.prompt,
            model,
            durationSec: cut.durationSec,
            aspectRatio,
            resolution
          }
        );
        const take: CinematicTake = {
          id: `${cut.id}-${data.jobId}`,
          jobId: data.jobId,
          model,
          status: "in_progress",
          credits: typeof data.credits === "number" ? data.credits : undefined,
          createdAt: new Date().toISOString()
        };
        setCuts((current) =>
          current.map((item) =>
            item.id === cut.id ? { ...item, takes: [...item.takes, take] } : item
          )
        );
        if (typeof data.credits === "number") {
          const spend = data.credits;
          setSpentCredits((value) => Math.round((value + spend) * 100) / 100);
        }
        pollTake(cut.id, take.id, data.jobId);
        } finally {
          setPendingCutIds((current) => current.filter((id) => id !== cut.id));
        }
      }),
    [
      aspectRatio,
      budgetCredits,
      model,
      pendingCutIds,
      pollTake,
      resolution,
      runStep,
      spentCredits
    ]
  );

  const handleGenerateSfx = useCallback(
    (cut: CinematicCut) =>
      runStep(`컷 ${cut.index} 효과음 생성 중`, async () => {
        const prompt = String(cut.sfxPrompt || "").trim();
        if (prompt.length < 3) {
          throw new Error("효과음 설명이 비어 있습니다. 프롬프트를 열어 입력해주세요.");
        }
        const data = await postJson<{ publicUrl: string; estimatedCostUsd: number }>(
          "/api/cinematic/sfx",
          {
            projectId: projectId || "draft",
            cutId: cut.id,
            prompt,
            // A touch longer than the cut so the tail is not clipped.
            durationSec: Math.min(30, cut.durationSec + 0.5)
          }
        );
        updateCut(cut.id, { sfxUrl: data.publicUrl });
        setSfxSpendUsd((value) => Number((value + data.estimatedCostUsd).toFixed(4)));
      }),
    [projectId, runStep, updateCut]
  );

  const handleAssemble = useCallback(
    () =>
      runStep("최종 영상 조립 중", async () => {
        const data = await postJson<{ videoUrl: string }>("/api/cinematic/assemble", {
          projectId: projectId || "draft",
          title: selectedHook?.hook || topic,
          voice,
          voiceSpeed,
          ttsProvider,
          useSfx: true,
          cuts
        });
        setFinalVideoUrl(data.videoUrl);
      }),
    [cuts, projectId, runStep, selectedHook, topic, ttsProvider, voice, voiceSpeed]
  );

  const handleGenerateMetadata = useCallback(
    () =>
      runStep("제목·설명 생성 중", async () => {
        if (!selectedHook) {
          throw new Error("훅이 선택되지 않았습니다.");
        }
        const data = await postJson<{ title: string; description: string; tags: string[] }>(
          "/api/cinematic/metadata",
          { topic, hook: selectedHook, scriptBlocks, research: research || undefined }
        );
        setMetaTitle(data.title);
        setMetaDescription(data.description);
        setMetaTags(data.tags.join(", "));
      }),
    [research, runStep, scriptBlocks, selectedHook, topic]
  );

  const handleUploadYoutube = useCallback(
    () =>
      runStep("유튜브 업로드 중", async () => {
        if (!finalVideoUrl) {
          throw new Error("먼저 최종 영상을 만들어주세요.");
        }
        if (!metaTitle.trim()) {
          throw new Error("제목이 비어 있습니다.");
        }
        const data = await postJson<{ youtubeUrl?: string; url?: string }>(
          "/api/upload-youtube",
          {
            videoUrl: finalVideoUrl,
            title: metaTitle.trim(),
            description: metaDescription,
            tags: metaTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            privacyStatus
          }
        );
        setYoutubeUrl(data.youtubeUrl || data.url || "");
      }),
    [finalVideoUrl, metaDescription, metaTags, metaTitle, privacyStatus, runStep]
  );

  const videoModels = useMemo(
    () =>
      models.filter(
        (item) =>
          item.type === "video" && !/upscale|remove|deflicker|clipify|llm_text/i.test(item.job_type)
      ),
    [models]
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Clapperboard className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">시네마틱 스튜디오</h1>
          <EngineBadge status={engineStatus} />
        </div>
        <p className="text-sm text-muted-foreground">
          모순형 훅 → 구조 대본 → 2~5초 컷 분할 → 컷별 AI 영상 생성 → 조립. 스타일은 마스터
          프롬프트로 고정됩니다.
        </p>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Label htmlFor="project" className="pl-1 text-xs text-muted-foreground">
            프로젝트
          </Label>
          <Select value={projectId || "__new__"} onValueChange={(value) => {
            if (value === "__new__") {
              startNewProject();
              return;
            }
            void loadProject(value);
          }}>
            <SelectTrigger id="project" className="h-8 w-full sm:w-80">
              <SelectValue placeholder="새 프로젝트" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__new__">+ 새 프로젝트</SelectItem>
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title || item.topic || "제목 없음"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SaveIndicator state={saveState} hasProject={Boolean(projectId)} />
          {projectId ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={handleDeleteProject}
              disabled={Boolean(busy)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              삭제
            </Button>
          ) : null}
        </div>
      </header>

      <Stepper
        current={step}
        onSelect={setStep}
        cutsReady={cuts.length > 0}
        scriptReady={Boolean(scriptBlocks[0]?.text)}
      />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>① 주제와 훅</CardTitle>
            <CardDescription>
              상식과 반대되는 사실을 첫 문장에 던지는 것이 이 포맷의 시작입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topic">주제</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="예: 갯벌 위에 지은 공항이 가라앉지 않는 이유"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={topicHint}
                    onChange={(event) => setTopicHint(event.target.value)}
                    placeholder="추천 방향 (선택) — 예: 지하철, 조선시대"
                    className="h-8 flex-1 min-w-[12rem] text-sm"
                    aria-label="주제 추천 방향"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggestTopics}
                    disabled={Boolean(busy)}
                  >
                    {busy === "주제 추천 중" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : topicIdeas.length > 0 ? (
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Lightbulb className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {topicIdeas.length > 0 ? "다른 주제" : "주제 추천"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="style">마스터 스타일</Label>
                <Select value={stylePresetId} onValueChange={setStylePresetId}>
                  <SelectTrigger id="style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CINEMATIC_STYLE_PRESETS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="scriptTemplate">대본 구조</Label>
                <Select
                  value={scriptTemplateId}
                  onValueChange={(value) => {
                    setScriptTemplateId(value);
                    // Blocks differ per template, so reseed rather than mismatch.
                    setScriptBlocks(emptyScriptBlocks(value));
                  }}
                >
                  <SelectTrigger id="scriptTemplate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CINEMATIC_SCRIPT_TEMPLATES.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{scriptTemplate.description}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="model">영상 모델</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(videoModels.length > 0
                      ? videoModels
                      : [{ job_type: "veo3_1_lite", display_name: "Google Veo 3.1 Lite", type: "video" }]
                    ).map((item) => (
                      <SelectItem key={item.job_type} value={item.job_type}>
                        {item.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aspect">비율</Label>
                <Select
                  value={aspectRatio}
                  onValueChange={(value) => setAspectRatio(value as CinematicAspectRatio)}
                >
                  <SelectTrigger id="aspect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (쇼츠)</SelectItem>
                    <SelectItem value="16:9">16:9 (가로)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resolution">해상도</Label>
                <Select
                  value={resolution}
                  onValueChange={(value) => setResolution(value as "480p" | "720p" | "1080p")}
                >
                  <SelectTrigger id="resolution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p">480p (테스트)</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">목표 길이 (초)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={20}
                  max={120}
                  value={targetDurationSec}
                  onChange={(event) => setTargetDurationSec(Number(event.target.value) || 50)}
                />
              </div>
            </div>

            {topicIdeas.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  카드를 누르면 주제로 들어갑니다. 이미 만든 프로젝트의 주제는 제외됩니다.
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {topicIdeas.map((idea) => {
                    const active = topic.trim() === idea.topic;
                    return (
                      <button
                        key={idea.id}
                        type="button"
                        onClick={() => setTopic(idea.topic)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-accent/40",
                          active ? "border-primary bg-accent/60 ring-1 ring-primary" : "border-border"
                        )}
                      >
                        <p className="text-sm font-medium">{idea.topic}</p>
                        {idea.angle ? (
                          <p className="mt-1 text-xs text-muted-foreground">{idea.angle}</p>
                        ) : null}
                        {idea.whyVisual ? (
                          <p className="mt-0.5 text-xs text-muted-foreground/80">{idea.whyVisual}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleResearch}
                disabled={Boolean(busy) || topic.trim().length < 2}
              >
                {busy === "자료 조사 중" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {research ? "자료 다시 조사" : "자료 조사"}
              </Button>
              {!research ? (
                <span className="text-xs text-muted-foreground">
                  웹에서 사실을 확인한 뒤 훅과 대본을 씁니다. 건너뛰면 모델 기억에만 의존합니다.
                </span>
              ) : null}
            </div>

            {research ? (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-medium">확인된 자료</p>
                {research.mainCause ? (
                  <p className="text-sm">
                    <span className="font-medium text-muted-foreground">주된 원인 · </span>
                    {research.mainCause}
                  </p>
                ) : null}
                {research.findings.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {research.findings.map((item, index) => (
                      <li key={index}>
                        {item.claim}
                        {item.detail ? (
                          <span className="text-muted-foreground/80"> — {item.detail}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {research.misconceptions.length > 0 ? (
                  <p className="text-xs text-amber-600">
                    흔한 오해 · {research.misconceptions.join(" / ")}
                  </p>
                ) : null}
                {research.sources.length > 0 ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                    {research.sources.map((source, index) => (
                      <a
                        key={index}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline underline-offset-2"
                      >
                        {source.title || source.url}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button onClick={handleGenerateHooks} disabled={Boolean(busy) || topic.trim().length < 2}>
              {busy === "훅 생성 중" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              모순형 훅 5개 생성
            </Button>

            {hooks.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {hooks.map((hook) => {
                  const active = selectedHook?.id === hook.id;
                  return (
                    <button
                      key={hook.id}
                      type="button"
                      onClick={() => setSelectedHook(hook)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border p-4 text-left transition hover:border-primary/60 hover:bg-accent/40",
                        active ? "border-primary bg-accent/60 ring-1 ring-primary" : "border-border"
                      )}
                    >
                      <p className="text-sm font-medium leading-relaxed">{hook.hook}</p>
                      <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-medium">통념</dt>
                          <dd>{hook.commonBelief}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-medium">사실</dt>
                          <dd>{hook.reality}</dd>
                        </div>
                      </dl>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {selectedHook ? (
              <Button onClick={handleGenerateScript} disabled={Boolean(busy)}>
                {busy === "대본 작성 중" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                이 훅으로 5블록 대본 만들기
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>② 대본</CardTitle>
            <CardDescription>
              {scriptTemplate.label} · 블록별 예상 길이가 표시됩니다. 총 {targetDurationSec}초에 맞춰
              다듬으세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">예상 총 길이</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  Math.abs(scriptTotalSeconds - targetDurationSec) > 10
                    ? "text-amber-600"
                    : "text-emerald-600"
                )}
              >
                {scriptTotalSeconds}초
              </span>
              <span className="text-muted-foreground">/ 목표 {targetDurationSec}초</span>
            </div>

            {scriptTemplate.blocks.map((spec) => {
              const blockId = spec.id;
              const block = scriptBlocks.find((item) => item.id === blockId) || {
                id: blockId,
                text: ""
              };
              return (
                <div key={blockId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`block-${blockId}`} title={spec.guidance}>
                      {spec.label}
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {estimateSeconds(block.text)}초 · {block.text.trim().length}자
                    </span>
                  </div>
                  <Textarea
                    id={`block-${blockId}`}
                    rows={2}
                    value={block.text}
                    onChange={(event) => {
                      const text = event.target.value;
                      setScriptBlocks((current) =>
                        current.some((item) => item.id === blockId)
                          ? current.map((item) => (item.id === blockId ? { ...item, text } : item))
                          : [...current, { id: blockId, text }]
                      );
                    }}
                  />
                </div>
              );
            })}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button onClick={handleSplitCuts} disabled={Boolean(busy) || scriptTotalSeconds < 5}>
                {busy === "장면 분할 중" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                2~5초 컷으로 나누기
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 || step === 4 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{step === 3 ? "③ 장면 분할" : "④ 컷 생성"}</CardTitle>
                <CardDescription>
                  컷 {cuts.length}개 · 편집 {cutsTotalSeconds}초 · 과금 {billableTotalSeconds}초 ·
                  선택 완료 {readyCutCount}/{cuts.length}
                  {estimatedRunCredits !== undefined ? (
                    <>
                      {" · 1회차 예상 "}
                      <span className="font-medium tabular-nums">
                        {estimatedRunCredits}크레딧
                      </span>
                    </>
                  ) : null}
                </CardDescription>
              </div>
              {step === 4 ? (
                <div className="flex items-center gap-2 text-sm">
                  <Coins className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="tabular-nums">사용 {spentCredits}</span>
                  {sfxSpendUsd > 0 ? (
                    <span className="tabular-nums text-muted-foreground">
                      효과음 ${sfxSpendUsd.toFixed(3)}
                    </span>
                  ) : null}
                  <Label htmlFor="budget" className="text-muted-foreground">
                    상한
                  </Label>
                  <Input
                    id="budget"
                    type="number"
                    min={10}
                    value={budgetCredits}
                    onChange={(event) => setBudgetCredits(Number(event.target.value) || 300)}
                    className="h-8 w-24 text-right"
                  />
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cuts.map((cut) => (
              <CutRow
                key={cut.id}
                cut={cut}
                showGenerate={step === 4}
                busy={busy}
                pending={pendingCutIds.includes(cut.id)}
                onChange={updateCut}
                onGenerate={handleGenerateTake}
                onGenerateSfx={handleGenerateSfx}
                onSelectTake={(takeId) => updateCut(cut.id, { selectedTakeId: takeId })}
              />
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(step === 4 ? 3 : 2)}>
                이전
              </Button>
              <Button onClick={() => setStep(step === 3 ? 4 : 5)} disabled={cuts.length === 0}>
                {step === 3 ? "컷 생성으로" : "조립으로"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>⑤ 조립</CardTitle>
            <CardDescription>
              선택한 컷 {readyCutCount}개를 내레이션·자막과 합쳐 최종 영상을 만듭니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="ttsProvider">나레이션 엔진</Label>
                <Select
                  value={ttsProvider}
                  onValueChange={(value) => {
                    const next = value as "openai" | "elevenlabs";
                    setTtsProvider(next);
                    // Voice ids are provider-specific, so reset to a valid one.
                    setVoice(next === "elevenlabs" ? "" : "onyx");
                  }}
                >
                  <SelectTrigger id="ttsProvider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elevenlabs">ElevenLabs (권장)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice">내레이션 음성</Label>
                {ttsProvider === "elevenlabs" ? (
                  <>
                    <Select value={voice} onValueChange={setVoice}>
                      <SelectTrigger id="voice">
                        <SelectValue placeholder="보이스를 고르세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {elevenVoices.map((item) => (
                          <SelectItem key={item.voiceId} value={item.voiceId}>
                            {item.name}
                            {item.labels?.description ? ` · ${item.labels.description}` : ""}
                            {item.labels?.gender ? ` · ${item.labels.gender}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {elevenVoicesError ? (
                      <p className="text-xs text-destructive">{elevenVoicesError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        보이스 {elevenVoices.length}개 · 레퍼런스 톤은 중저음 남성 내레이션입니다.
                      </p>
                    )}
                    {voice ? (
                      (() => {
                        const preview = elevenVoices.find((item) => item.voiceId === voice)
                          ?.previewUrl;
                        return preview ? <audio src={preview} controls className="h-8 w-full" /> : null;
                      })()
                    ) : null}
                  </>
                ) : (
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger id="voice">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_VOICE_OPTIONS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                          {item.hint ? ` · ${item.hint}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceSpeed">말하기 속도</Label>
                <Input
                  id="voiceSpeed"
                  type="number"
                  step={0.05}
                  min={0.5}
                  max={2}
                  value={voiceSpeed}
                  onChange={(event) => setVoiceSpeed(Number(event.target.value) || 1)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handleAssemble}
                  disabled={
                    Boolean(busy) ||
                    readyCutCount === 0 ||
                    readyCutCount !== cuts.length ||
                    !voice
                  }
                >
                  {busy === "최종 영상 조립 중" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Clapperboard className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  최종 영상 만들기
                </Button>
              </div>
            </div>

            {readyCutCount !== cuts.length ? (
              <p className="text-sm text-amber-600">
                컷 {cuts.length}개 중 {readyCutCount}개만 선택됐습니다. 전부 선택해야 조립할 수
                있습니다.
              </p>
            ) : null}

            {finalVideoUrl ? (
              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-sm font-medium">완성본</p>
                <video
                  src={finalVideoUrl}
                  controls
                  playsInline
                  className="mx-auto max-h-[70vh] rounded-md"
                />
                <a
                  className="inline-block text-sm text-primary underline underline-offset-2"
                  href={finalVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  새 탭에서 열기
                </a>
              </div>
            ) : null}

            {finalVideoUrl ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">유튜브 업로드</p>
                  <Button variant="outline" size="sm" onClick={handleGenerateMetadata} disabled={Boolean(busy)}>
                    {busy === "제목·설명 생성 중" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    제목·설명 생성
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metaTitle">제목</Label>
                  <Input
                    id="metaTitle"
                    value={metaTitle}
                    onChange={(event) => setMetaTitle(event.target.value)}
                    placeholder="상식과 반대되는 사실을 한 줄로"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metaDescription">설명</Label>
                  <Textarea
                    id="metaDescription"
                    rows={4}
                    value={metaDescription}
                    onChange={(event) => setMetaDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <div className="space-y-2">
                    <Label htmlFor="metaTags">태그 (쉼표로 구분)</Label>
                    <Input
                      id="metaTags"
                      value={metaTags}
                      onChange={(event) => setMetaTags(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="privacy">공개 범위</Label>
                    <Select
                      value={privacyStatus}
                      onValueChange={(value) =>
                        setPrivacyStatus(value as "private" | "unlisted" | "public")
                      }
                    >
                      <SelectTrigger id="privacy">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">비공개</SelectItem>
                        <SelectItem value="unlisted">일부 공개</SelectItem>
                        <SelectItem value="public">공개</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleUploadYoutube}
                  disabled={Boolean(busy) || !metaTitle.trim()}
                >
                  {busy === "유튜브 업로드 중" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  유튜브에 올리기
                </Button>

                {youtubeUrl ? (
                  <a
                    className="block text-sm text-primary underline underline-offset-2"
                    href={youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    업로드 완료 — {youtubeUrl}
                  </a>
                ) : null}
              </div>
            ) : null}

            <ul className="space-y-2">
              {cuts.map((cut) => {
                const selected = cut.takes.find((take) => take.id === cut.selectedTakeId);
                return (
                  <li
                    key={cut.id}
                    className="flex items-center justify-between gap-3 rounded border p-3 text-sm"
                  >
                    <span className="font-medium">컷 {cut.index}</span>
                    <span className="flex-1 truncate text-muted-foreground">{cut.screenNote}</span>
                    {selected?.videoUrl ? (
                      <a
                        className="text-primary underline underline-offset-2"
                        href={selected.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        결과 열기
                      </a>
                    ) : (
                      <span className="text-muted-foreground">미선택</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button variant="outline" onClick={() => setStep(4)}>
              이전
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SaveIndicator({
  state,
  hasProject
}: {
  state: SaveState;
  hasProject: boolean;
}): React.JSX.Element {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        저장 중…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        저장됨
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        저장 실패
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {hasProject ? "변경 없음" : "주제를 입력하면 자동 저장됩니다"}
    </span>
  );
}

function EngineBadge({ status }: { status: HiggsfieldStatus | null }): React.JSX.Element {
  if (!status) {
    return <Badge variant="muted">엔진 확인 중…</Badge>;
  }
  if (!status.available) {
    return (
      <Badge variant="destructive" title={status.error}>
        Higgsfield 연결 안 됨
      </Badge>
    );
  }
  return (
    <Badge variant="muted">
      Higgsfield · {status.plan || "연결됨"} · {status.credits ?? "-"} 크레딧
    </Badge>
  );
}

function Stepper({
  current,
  onSelect,
  scriptReady,
  cutsReady
}: {
  current: StepId;
  onSelect: (step: StepId) => void;
  scriptReady: boolean;
  cutsReady: boolean;
}): React.JSX.Element {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="제작 단계">
      {STEPS.map((item) => {
        const enabled =
          item.id === 1 ||
          (item.id === 2 && scriptReady) ||
          (item.id >= 3 && cutsReady) ||
          item.id === current;
        const active = item.id === current;
        return (
          <li key={item.id} className="min-w-[9rem] flex-1">
            <button
              type="button"
              disabled={!enabled}
              onClick={() => onSelect(item.id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left transition",
                active
                  ? "border-primary bg-primary/10"
                  : enabled
                    ? "border-border hover:border-primary/50 hover:bg-accent/40"
                    : "cursor-not-allowed border-dashed border-border opacity-50"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
                  {item.id}
                </span>
                {item.label}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CutRow({
  cut,
  showGenerate,
  busy,
  pending,
  onChange,
  onGenerate,
  onGenerateSfx,
  onSelectTake
}: {
  cut: CinematicCut;
  showGenerate: boolean;
  busy: string;
  pending: boolean;
  onChange: (cutId: string, patch: Partial<CinematicCut>) => void;
  onGenerate: (cut: CinematicCut) => void;
  onGenerateSfx: (cut: CinematicCut) => void;
  onSelectTake: (takeId: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const negations = findNegativePhrasing({
    subject: cut.subject,
    action: cut.action,
    camera: cut.camera
  });
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="tabular-nums">
              컷 {cut.index}
            </Badge>
            <span className="text-xs tabular-nums text-muted-foreground">
              편집 {cut.durationSec}초
              {billableClipSeconds(cut.durationSec) !== cut.durationSec
                ? ` · 과금 ${billableClipSeconds(cut.durationSec)}초`
                : null}
            </span>
          </div>
          <p className="text-sm font-medium">{cut.screenNote}</p>
          <p className="text-sm text-muted-foreground">{cut.narrationText}</p>
          {negations.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                부정 표현 <span className="font-medium">{negations.join(", ")}</span> — 영상 모델은
                없는 것을 그리지 못하고 오히려 그 사물을 그립니다. 남아 있는 모습으로 바꿔 주세요.
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? "프롬프트 접기" : "프롬프트 보기"}
          </Button>
          {showGenerate ? (
            <Button
              size="sm"
              onClick={() => onGenerate(cut)}
              disabled={Boolean(busy) || pending}
            >
              {busy.startsWith(`컷 ${cut.index} `) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : cut.takes.length > 0 ? (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {cut.takes.length > 0 ? "다시 뽑기" : "생성"}
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <PromptField
            label="Subject"
            value={cut.subject}
            onChange={(value) => onChange(cut.id, { subject: value })}
          />
          <PromptField
            label="Action"
            value={cut.action}
            onChange={(value) => onChange(cut.id, { action: value })}
          />
          <PromptField
            label="Camera"
            value={cut.camera}
            onChange={(value) => onChange(cut.id, { camera: value })}
          />
          <div className="space-y-1 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Sound effect
              </Label>
              <div className="flex items-center gap-2">
                {cut.sfxUrl ? (
                  <audio src={cut.sfxUrl} controls className="h-8" />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateSfx(cut)}
                  disabled={Boolean(busy) || String(cut.sfxPrompt || "").trim().length < 3}
                >
                  {busy.startsWith(`컷 ${cut.index} 효과음`) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {cut.sfxUrl ? "다시 생성" : "효과음 생성"}
                </Button>
              </div>
            </div>
            <Textarea
              rows={2}
              value={cut.sfxPrompt || ""}
              placeholder="예: deep concrete impact with a low rumble, dirt settling"
              onChange={(event) => onChange(cut.id, { sfxPrompt: event.target.value })}
            />
          </div>
        </div>
      ) : null}

      {cut.takes.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {cut.takes.map((take, index) => {
            const selected = take.id === cut.selectedTakeId;
            return (
              <button
                key={take.id}
                type="button"
                onClick={() => take.videoUrl && onSelectTake(take.id)}
                aria-pressed={selected}
                disabled={!take.videoUrl}
                className={cn(
                  "w-40 overflow-hidden rounded-lg border text-left transition",
                  selected ? "border-primary ring-1 ring-primary" : "border-border",
                  take.videoUrl ? "hover:border-primary/60" : "cursor-default opacity-80"
                )}
              >
                <div className="flex aspect-[9/16] items-center justify-center bg-muted">
                  {take.videoUrl ? (
                    <video
                      src={take.videoUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      controls
                    />
                  ) : take.status === "failed" ? (
                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  ) : (
                    <Loader2
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between px-2 py-1 text-xs">
                  <span>v{index + 1}</span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  ) : null}
                  {typeof take.credits === "number" ? (
                    <span className="tabular-nums text-muted-foreground">{take.credits}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PromptField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
