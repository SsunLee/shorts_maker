import { upsertRow } from "@/lib/repository";
import { CreateVideoRequest } from "@/lib/types";
import {
  generateImagePrompts,
  generateImages,
  generateNarration,
  generateTtsAudio
} from "@/lib/openai-service";
import { appendAutomationLog } from "@/lib/automation-runner";
import { buildVideoWithEngine } from "@/lib/video-engine-service";

const activeJobs = new Map<string, Promise<void>>();

async function processJob(id: string, payload: CreateVideoRequest, userId?: string): Promise<void> {
  const log = (level: "info" | "error", message: string): void => {
    appendAutomationLog(userId, level, `[${id}] ${message}`);
  };

  try {
    log("info", "Regenerate 시작");
    await upsertRow({
      id,
      status: "generating_script"
    }, userId);

    log("info", "스크립트 준비 시작");
    const narration =
      payload.narration?.trim() ||
      (await generateNarration({
        title: payload.title,
        topic: payload.topic,
        targetLengthSec: payload.videoLengthSec
      }, userId));

    log("info", `이미지 프롬프트 생성 시작 (sceneCount=${payload.sceneCount ?? 5})`);
    const imagePrompts = await generateImagePrompts({
      title: payload.title,
      narration,
      imageStyle: payload.imageStyle,
      imageAspectRatio: payload.imageAspectRatio,
      sceneCount: payload.sceneCount,
      visualPolicy: "news_strict"
    }, userId);
    if (imagePrompts.length < 3) {
      throw new Error(
        `Image prompt generation returned ${imagePrompts.length} scene(s). At least 3 scenes are required.`
      );
    }
    log("info", `이미지 프롬프트 생성 완료 (${imagePrompts.length}개)`);

    await upsertRow({
      id,
      narration,
      imagePrompts,
      status: "generating_images",
      progress: 45
    }, userId);

    log("info", `이미지 생성 시작 (${imagePrompts.length}개)`);
    const imageUrls = await generateImages(id, imagePrompts, {
      imageAspectRatio: payload.imageAspectRatio === "16:9" ? "16:9" : "9:16",
      visualPolicy: "news_strict",
      imageStyle: payload.imageStyle,
      fileNameSuffix: `batch-${Date.now()}`,
      onProgress: async (completed, total) => {
        const progress = Math.min(64, 45 + Math.floor((completed / total) * 19));
        await upsertRow({
          id,
          status: "generating_images",
          progress
        }, userId);
        log("info", `이미지 생성 진행: ${completed}/${total}`);
      }
    }, userId);
    if (imageUrls.length < 3) {
      throw new Error(
        `Image generation returned ${imageUrls.length} image(s). At least 3 images are required for rendering.`
      );
    }
    log("info", `이미지 생성 완료 (${imageUrls.length}개)`);

    await upsertRow({
      id,
      status: "generating_tts"
    }, userId);

    log("info", "TTS 생성 시작");
    const tts = await generateTtsAudio({
      jobId: id,
      narration,
      voice: payload.voice,
      speed: payload.voiceSpeed
    }, userId);
    log("info", "TTS 생성 완료");

    await upsertRow({
      id,
      status: "video_rendering"
    }, userId);

    log("info", "video-engine 렌더링 요청 시작");
    const video = await buildVideoWithEngine({
      jobId: id,
      imageUrls,
      ttsPath: tts.publicUrl,
      subtitlesText: narration,
      titleText: payload.title,
      topicText: payload.topic,
      useSfx: payload.useSfx,
      targetDurationSec: payload.videoLengthSec
    }, userId);
    log("info", "video-engine 렌더링 완료");

    await upsertRow({
      id,
      title: payload.title,
      topic: payload.topic,
      narration,
      imagePrompts,
      status: "ready",
      videoUrl: video.outputUrl || video.outputPath,
      tags: payload.tags ?? [],
      imageStyle: payload.imageStyle,
      voice: payload.voice,
      voiceSpeed: payload.voiceSpeed,
      useSfx: payload.useSfx,
      videoLengthSec: payload.videoLengthSec
    }, userId);
    log("info", "Regenerate 완료");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error";
    await upsertRow({
      id,
      status: "failed",
      error: message
    }, userId);
    log("error", `Regenerate 실패: ${message}`);
  }
}

/**
 * Queue a generation job and return immediately while work continues asynchronously.
 * Status can be polled via `/api/status/:id`.
 */
export async function enqueueGeneration(payload: CreateVideoRequest, userId?: string): Promise<string> {
  const id = payload.id?.trim() || crypto.randomUUID();
  await upsertRow({
    id,
    title: payload.title,
    topic: payload.topic,
    narration: payload.narration || "",
    imagePrompts: [],
    status: "queued",
    tags: payload.tags ?? [],
    imageStyle: payload.imageStyle,
    voice: payload.voice,
    voiceSpeed: payload.voiceSpeed,
    useSfx: payload.useSfx,
    videoLengthSec: payload.videoLengthSec
  }, userId);

  const promise = processJob(id, payload, userId).finally(() => {
    activeJobs.delete(id);
  });

  activeJobs.set(id, promise);
  return id;
}

export function isJobActive(id: string): boolean {
  return activeJobs.has(id);
}

export async function waitForGeneration(id: string): Promise<void> {
  await activeJobs.get(id);
}
