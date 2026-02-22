import { upsertRow } from "@/lib/repository";
import {
  generateImages,
  generateNarration,
  generateTtsAudio,
  splitNarrationToScenes
} from "@/lib/openai-service";
import { buildVideoWithEngine } from "@/lib/video-engine-service";
import { getWorkflow, upsertWorkflow } from "@/lib/workflow-store";
import {
  CreateVideoRequest,
  RenderOptions,
  WorkflowStage,
  VideoWorkflow,
  WorkflowScene
} from "@/lib/types";

const PROCESSING_STALE_MS = 5 * 60 * 1000;
const MIN_SCENES = 3;
const MAX_SCENES = 12;
const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  "scene_split_review",
  "assets_review",
  "video_review",
  "final_ready"
];

type RenderOptionsInput = {
  subtitle?: Partial<RenderOptions["subtitle"]>;
  overlay?: Partial<RenderOptions["overlay"]>;
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
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
  }
};

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
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
  aspectRatio: CreateVideoRequest["imageAspectRatio"],
  value: RenderOptions["overlay"]["videoLayout"]
): NonNullable<RenderOptions["overlay"]["videoLayout"]> {
  if (aspectRatio === "16:9") {
    return "panel_16_9";
  }
  return normalizeVideoLayout(value);
}

function normalizeRenderOptions(
  value?: RenderOptionsInput
): RenderOptions {
  const subtitle = {
    ...DEFAULT_RENDER_OPTIONS.subtitle,
    ...(value?.subtitle || {})
  };
  const overlay = {
    ...DEFAULT_RENDER_OPTIONS.overlay,
    ...(value?.overlay || {})
  };
  const manualCues = Array.isArray(subtitle.manualCues)
    ? subtitle.manualCues
        .map((cue, index) => {
          const startMs = clampNumber(Number(cue.startMs), 0, 60 * 60 * 1000, index * 1000);
          const endMs = clampNumber(
            Number(cue.endMs),
            startMs + 100,
            60 * 60 * 1000,
            startMs + 1200
          );
          return {
            id: String(cue.id || `cue-${index + 1}`),
            startMs,
            endMs,
            text: String(cue.text || "").trim()
          };
        })
        .filter((cue) => cue.text.length > 0)
        .slice(0, 400)
    : [];

  return {
    subtitle: {
      ...subtitle,
      fontSize: clampNumber(Number(subtitle.fontSize), 10, 80, 16),
      outline: clampNumber(Number(subtitle.outline), 0, 8, 2),
      shadow: clampNumber(Number(subtitle.shadow), 0, 8, 1),
      shadowOpacity: clampNumber(Number(subtitle.shadowOpacity), 0, 1, 1),
      fontThickness: clampNumber(Number(subtitle.fontThickness), 0, 8, 0),
      subtitleDelayMs: clampNumber(Number(subtitle.subtitleDelayMs), -500, 1500, 180),
      subtitleYPercent: clampNumber(Number(subtitle.subtitleYPercent), 0, 100, 86),
      wordsPerCaption: clampNumber(Number(subtitle.wordsPerCaption), 2, 10, 5),
      manualCues
    },
    overlay: {
      ...overlay,
      sceneMotionPreset:
        overlay.sceneMotionPreset === "up_down" ||
        overlay.sceneMotionPreset === "left_right" ||
        overlay.sceneMotionPreset === "random" ||
        overlay.sceneMotionPreset === "focus_smooth" ||
        overlay.sceneMotionPreset === "gentle_zoom"
          ? overlay.sceneMotionPreset
          : "gentle_zoom",
      motionSpeedPercent: clampNumber(Number(overlay.motionSpeedPercent), 60, 220, 135),
      focusXPercent: clampNumber(Number(overlay.focusXPercent), 0, 100, 50),
      focusYPercent: clampNumber(Number(overlay.focusYPercent), 0, 100, 50),
      focusDriftPercent: clampNumber(Number(overlay.focusDriftPercent), 0, 20, 6),
      focusZoomPercent: clampNumber(Number(overlay.focusZoomPercent), 3, 20, 9),
      outputFps: normalizeOutputFps(overlay.outputFps),
      videoLayout: normalizeVideoLayout(overlay.videoLayout),
      usePreviewAsFinal: Boolean(overlay.usePreviewAsFinal),
      panelTopPercent: clampNumber(Number(overlay.panelTopPercent), 0, 85, 34),
      panelWidthPercent: clampNumber(Number(overlay.panelWidthPercent), 60, 100, 100)
    }
  };
}

function withTimestamps<T extends object>(
  base: T,
  createdAt?: string
): T & { createdAt: string; updatedAt: string } {
  const now = new Date().toISOString();
  return {
    ...base,
    createdAt: createdAt ?? now,
    updatedAt: now
  };
}

function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGE_ORDER.indexOf(stage);
}

function applyStageReset(
  workflow: VideoWorkflow,
  targetStage: WorkflowStage
): Pick<VideoWorkflow, "stage" | "scenes" | "ttsUrl" | "previewVideoUrl" | "finalVideoUrl"> {
  if (targetStage === "scene_split_review") {
    return {
      stage: targetStage,
      scenes: workflow.scenes.map((scene) => ({
        ...scene,
        imageUrl: undefined
      })),
      ttsUrl: undefined,
      previewVideoUrl: undefined,
      finalVideoUrl: undefined
    };
  }

  if (targetStage === "assets_review") {
    return {
      stage: targetStage,
      scenes: workflow.scenes,
      ttsUrl: workflow.ttsUrl,
      previewVideoUrl: undefined,
      finalVideoUrl: undefined
    };
  }

  if (targetStage === "video_review") {
    return {
      stage: targetStage,
      scenes: workflow.scenes,
      ttsUrl: workflow.ttsUrl,
      previewVideoUrl: workflow.previewVideoUrl,
      finalVideoUrl: undefined
    };
  }

  return {
    stage: targetStage,
    scenes: workflow.scenes,
    ttsUrl: workflow.ttsUrl,
    previewVideoUrl: workflow.previewVideoUrl,
    finalVideoUrl: workflow.finalVideoUrl
  };
}

function isStaleProcessing(workflow: VideoWorkflow): boolean {
  if (workflow.status !== "processing") {
    return false;
  }
  const updated = Date.parse(workflow.updatedAt);
  if (!Number.isFinite(updated)) {
    return true;
  }
  return Date.now() - updated > PROCESSING_STALE_MS;
}

function validateScenes(scenes: WorkflowScene[]): void {
  if (scenes.length < MIN_SCENES || scenes.length > MAX_SCENES) {
    throw new Error(`Scene count must be between ${MIN_SCENES} and ${MAX_SCENES}.`);
  }
  scenes.forEach((scene, index) => {
    if (scene.index !== index + 1) {
      throw new Error(`Scene index must be sequential starting from 1 (found ${scene.index}).`);
    }
    if (!scene.sceneTitle.trim()) {
      throw new Error(`Scene ${index + 1} title is empty.`);
    }
    if (!scene.narrationText.trim()) {
      throw new Error(`Scene ${index + 1} narration text is empty.`);
    }
    if (!scene.imagePrompt.trim()) {
      throw new Error(`Scene ${index + 1} image prompt is empty.`);
    }
  });
}

async function markFailure(workflow: VideoWorkflow, message: string): Promise<VideoWorkflow> {
  const failed = withTimestamps(
    {
      ...workflow,
      status: "failed" as const,
      error: message
    },
    workflow.createdAt
  );
  await upsertWorkflow(failed);
  await upsertRow({
    id: workflow.id,
    status: "failed",
    error: message
  });
  return failed;
}

/** Step 1: generate narration and scene split data for manual review. */
export async function startStagedWorkflow(
  input: CreateVideoRequest
): Promise<VideoWorkflow> {
  const normalizedInput: CreateVideoRequest = {
    ...input,
    imageAspectRatio: input.imageAspectRatio === "16:9" ? "16:9" : "9:16"
  };
  const id = normalizedInput.id?.trim() || crypto.randomUUID();

  await upsertRow({
    id,
    title: normalizedInput.title,
    topic: normalizedInput.topic,
    narration: normalizedInput.narration || "",
    imagePrompts: [],
    status: "generating_script",
    tags: normalizedInput.tags ?? [],
    imageStyle: normalizedInput.imageStyle,
    voice: normalizedInput.voice,
    voiceSpeed: normalizedInput.voiceSpeed,
    useSfx: normalizedInput.useSfx,
    videoLengthSec: normalizedInput.videoLengthSec
  });

  try {
    const narration =
      normalizedInput.narration?.trim() ||
      (await generateNarration({
        title: normalizedInput.title,
        topic: normalizedInput.topic,
        targetLengthSec: normalizedInput.videoLengthSec
      }));

    const scenes = await splitNarrationToScenes({
      title: normalizedInput.title,
      narration,
      imageStyle: normalizedInput.imageStyle,
      imageAspectRatio: normalizedInput.imageAspectRatio,
      sceneCount: Math.max(MIN_SCENES, Math.min(MAX_SCENES, normalizedInput.sceneCount ?? 5))
    });
    validateScenes(scenes);

    const workflow = withTimestamps({
      id,
      stage: "scene_split_review" as const,
      status: "idle" as const,
      input: normalizedInput,
      narration,
      scenes,
      renderOptions: normalizeRenderOptions()
    });

    await upsertWorkflow(workflow);
    await upsertRow({
      id,
      narration,
      imagePrompts: scenes.map((scene) => scene.imagePrompt),
      status: "queued"
    });
    return workflow;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start workflow";
    const failed = withTimestamps({
      id,
      stage: "scene_split_review" as const,
      status: "failed" as const,
      error: message,
      input,
      narration: normalizedInput.narration || "",
      scenes: []
    });
    await upsertWorkflow(failed);
    await upsertRow({
      id,
      status: "failed",
      error: message
    });
    return failed;
  }
}

export async function updateSceneSplit(
  id: string,
  data: {
    narration?: string;
    scenes?: WorkflowScene[];
    renderOptions?: RenderOptionsInput;
    stage?: WorkflowStage;
  }
): Promise<VideoWorkflow> {
  const workflow = await getWorkflow(id);
  if (!workflow) {
    throw new Error("Workflow not found.");
  }
  if (workflow.status === "processing") {
    throw new Error("Workflow is processing. Wait until current step is finished.");
  }

  const nextStage = data.stage ?? workflow.stage;
  if (stageIndex(nextStage) > stageIndex(workflow.stage)) {
    throw new Error("Cannot move workflow forward using PATCH. Use the next-stage action.");
  }

  const shouldValidateScenes =
    workflow.stage === "scene_split_review" ||
    nextStage === "scene_split_review" ||
    Boolean(data.scenes);
  const scenes = data.scenes ?? workflow.scenes;
  if (shouldValidateScenes) {
    validateScenes(scenes);
  }

  const stageReset = applyStageReset(
    {
      ...workflow,
      scenes
    },
    nextStage
  );
  const normalizedRenderOptions = normalizeRenderOptions(
    data.renderOptions ?? workflow.renderOptions
  );
  const nextRenderOptions: RenderOptions = {
    ...normalizedRenderOptions,
    overlay: {
      ...normalizedRenderOptions.overlay,
      videoLayout: resolveVideoLayoutForAspect(
        workflow.input.imageAspectRatio,
        normalizedRenderOptions.overlay.videoLayout
      )
    }
  };

  const updated = withTimestamps(
    {
      ...workflow,
      ...stageReset,
      narration: data.narration ?? workflow.narration,
      renderOptions: nextRenderOptions,
      status: "idle" as const,
      error: undefined
    },
    workflow.createdAt
  );

  await upsertWorkflow(updated);
  await upsertRow({
    id: workflow.id,
    narration: updated.narration,
    imagePrompts: updated.scenes.map((scene) => scene.imagePrompt),
    status: "queued",
    videoUrl:
      updated.stage === "video_review"
        ? updated.previewVideoUrl
        : updated.stage === "final_ready"
          ? updated.finalVideoUrl
          : undefined
  });
  return updated;
}

/** Re-generate one scene image during assets review. */
export async function regenerateWorkflowSceneImage(
  id: string,
  sceneIndex: number
): Promise<VideoWorkflow> {
  const workflow = await getWorkflow(id);
  if (!workflow) {
    throw new Error("Workflow not found.");
  }
  if (workflow.status === "processing") {
    throw new Error("Workflow is processing. Wait until current step is finished.");
  }
  if (workflow.stage !== "assets_review") {
    throw new Error("Scene image re-generation is only available during assets review.");
  }

  const targetIndex = Math.max(1, Math.floor(sceneIndex));
  const targetScene = workflow.scenes.find((scene) => scene.index === targetIndex);
  if (!targetScene) {
    throw new Error(`Scene ${targetIndex} was not found.`);
  }
  if (!targetScene.imagePrompt.trim()) {
    throw new Error(`Scene ${targetIndex} has an empty image prompt.`);
  }

  await upsertRow({ id, status: "generating_images", progress: 55 });
  const [nextImageUrl] = await generateImages(workflow.id, [targetScene.imagePrompt], {
    startIndex: targetIndex - 1,
    imageAspectRatio: workflow.input.imageAspectRatio === "16:9" ? "16:9" : "9:16"
  });

  const scenes = workflow.scenes.map((scene) =>
    scene.index === targetIndex
      ? {
          ...scene,
          imageUrl: nextImageUrl
        }
      : scene
  );

  const updated = withTimestamps(
    {
      ...workflow,
      scenes,
      status: "idle" as const,
      error: undefined
    },
    workflow.createdAt
  );
  await upsertWorkflow(updated);
  await upsertRow({
    id,
    imagePrompts: scenes.map((scene) => scene.imagePrompt),
    status: "queued"
  });

  return updated;
}

/** Move one step forward: scene split -> assets -> preview video -> final video. */
export async function runNextWorkflowStage(id: string): Promise<VideoWorkflow> {
  let workflow = await getWorkflow(id);
  if (!workflow) {
    throw new Error("Workflow not found.");
  }
  if (workflow.status === "processing") {
    if (isStaleProcessing(workflow)) {
      workflow = withTimestamps(
        {
          ...workflow,
          status: "idle" as const,
          error: "Recovered from stale processing state."
        },
        workflow.createdAt
      );
      await upsertWorkflow(workflow);
    } else {
      throw new Error(
        "Workflow is already processing. Wait a moment and retry. " +
          "If it stays blocked for over 5 minutes, retry once more to auto-recover."
      );
    }
  }
  if (workflow.status === "failed") {
    workflow = withTimestamps(
      {
        ...workflow,
        status: "idle" as const,
        error: undefined
      },
      workflow.createdAt
    );
    await upsertWorkflow(workflow);
  }

  const processing = withTimestamps(
    {
      ...workflow,
      status: "processing" as const,
      error: undefined
    },
    workflow.createdAt
  );
  await upsertWorkflow(processing);

  try {
    if (workflow.stage === "scene_split_review") {
      await upsertRow({ id, status: "generating_images", progress: 45 });
      const imageUrls = await generateImages(
        workflow.id,
        workflow.scenes.map((scene) => scene.imagePrompt),
        {
          imageAspectRatio: workflow.input.imageAspectRatio === "16:9" ? "16:9" : "9:16",
          onProgress: async (completed, total) => {
            const progress = Math.min(64, 45 + Math.floor((completed / total) * 19));
            await upsertRow({
              id,
              status: "generating_images",
              progress
            });
          }
        }
      );

      await upsertRow({ id, status: "generating_tts" });
      const tts = await generateTtsAudio({
        jobId: workflow.id,
        narration: workflow.narration,
        voice: workflow.input.voice,
        speed: workflow.input.voiceSpeed
      });

      const scenes = workflow.scenes.map((scene, index) => ({
        ...scene,
        imageUrl: imageUrls[index]
      }));

      const updated = withTimestamps(
        {
          ...workflow,
          stage: "assets_review" as const,
          status: "idle" as const,
          scenes,
          ttsUrl: tts.publicUrl
        },
        workflow.createdAt
      );
      await upsertWorkflow(updated);
      await upsertRow({
        id,
        imagePrompts: scenes.map((scene) => scene.imagePrompt),
        status: "queued"
      });
      return updated;
    }

    if (workflow.stage === "assets_review") {
      if (!workflow.ttsUrl || workflow.scenes.some((scene) => !scene.imageUrl)) {
        throw new Error("Audio/images are missing. Complete previous stage first.");
      }
      await upsertRow({ id, status: "video_rendering" });

      const renderOptionsForVideo = normalizeRenderOptions(workflow.renderOptions);
      renderOptionsForVideo.overlay.videoLayout = resolveVideoLayoutForAspect(
        workflow.input.imageAspectRatio,
        renderOptionsForVideo.overlay.videoLayout
      );

      const previewRenderId = `${workflow.id}-preview-${Date.now()}`;
      const preview = await buildVideoWithEngine({
        jobId: previewRenderId,
        imageUrls: workflow.scenes.map((scene) => scene.imageUrl || ""),
        ttsPath: workflow.ttsUrl,
        subtitlesText: workflow.narration,
        titleText: workflow.input.title,
        useSfx: workflow.input.useSfx,
        targetDurationSec: workflow.input.videoLengthSec,
        renderOptions: renderOptionsForVideo
      });

      const updated = withTimestamps(
        {
          ...workflow,
          stage: "video_review" as const,
          status: "idle" as const,
          previewVideoUrl: preview.outputUrl || preview.outputPath,
          renderOptions: renderOptionsForVideo
        },
        workflow.createdAt
      );
      await upsertWorkflow(updated);
      await upsertRow({
        id,
        status: "queued",
        videoUrl: updated.previewVideoUrl
      });
      return updated;
    }

    if (workflow.stage === "video_review") {
      if (!workflow.ttsUrl || workflow.scenes.some((scene) => !scene.imageUrl)) {
        throw new Error("Audio/images are missing. Complete previous stage first.");
      }
      const normalizedRenderOptions = normalizeRenderOptions(workflow.renderOptions);
      normalizedRenderOptions.overlay.videoLayout = resolveVideoLayoutForAspect(
        workflow.input.imageAspectRatio,
        normalizedRenderOptions.overlay.videoLayout
      );
      const shouldReusePreview =
        Boolean(normalizedRenderOptions.overlay.usePreviewAsFinal) &&
        Boolean(workflow.previewVideoUrl);

      let finalVideoUrl = workflow.finalVideoUrl;
      if (shouldReusePreview) {
        finalVideoUrl = workflow.previewVideoUrl;
      } else {
        await upsertRow({ id, status: "video_rendering" });
        const finalRenderId = `${workflow.id}-final-${Date.now()}`;
        const finalVideo = await buildVideoWithEngine({
          jobId: finalRenderId,
          imageUrls: workflow.scenes.map((scene) => scene.imageUrl || ""),
          ttsPath: workflow.ttsUrl,
          subtitlesText: workflow.narration,
          titleText: workflow.input.title,
          useSfx: workflow.input.useSfx,
          targetDurationSec: workflow.input.videoLengthSec,
          renderOptions: normalizedRenderOptions
        });
        finalVideoUrl = finalVideo.outputUrl || finalVideo.outputPath;
      }

      const updated = withTimestamps(
        {
          ...workflow,
          stage: "final_ready" as const,
          status: "idle" as const,
          finalVideoUrl
        },
        workflow.createdAt
      );
      await upsertWorkflow(updated);
      await upsertRow({
        id,
        status: "ready",
        videoUrl: updated.finalVideoUrl,
        narration: workflow.narration,
        imagePrompts: workflow.scenes.map((scene) => scene.imagePrompt),
        tags: workflow.input.tags ?? []
      });
      return updated;
    }

    return workflow;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run next stage";
    return markFailure(workflow, message);
  }
}
