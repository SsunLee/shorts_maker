import { upsertRow } from "@/lib/repository";
import { CreateVideoRequest } from "@/lib/types";
import {
  generateImagePrompts,
  generateImages,
  generateNarration,
  generateTtsAudio
} from "@/lib/openai-service";
import { buildVideoWithEngine } from "@/lib/video-engine-service";

const activeJobs = new Map<string, Promise<void>>();

async function processJob(id: string, payload: CreateVideoRequest): Promise<void> {
  try {
    await upsertRow({
      id,
      status: "generating_script"
    });

    const narration =
      payload.narration?.trim() ||
      (await generateNarration({
        title: payload.title,
        topic: payload.topic,
        targetLengthSec: payload.videoLengthSec
      }));

    const imagePrompts = await generateImagePrompts({
      title: payload.title,
      narration,
      imageStyle: payload.imageStyle,
      imageAspectRatio: payload.imageAspectRatio,
      sceneCount: payload.sceneCount
    });

    await upsertRow({
      id,
      narration,
      imagePrompts,
      status: "generating_images",
      progress: 45
    });

    const imageUrls = await generateImages(id, imagePrompts, {
      imageAspectRatio: payload.imageAspectRatio === "16:9" ? "16:9" : "9:16",
      onProgress: async (completed, total) => {
        const progress = Math.min(64, 45 + Math.floor((completed / total) * 19));
        await upsertRow({
          id,
          status: "generating_images",
          progress
        });
      }
    });

    await upsertRow({
      id,
      status: "generating_tts"
    });

    const tts = await generateTtsAudio({
      jobId: id,
      narration,
      voice: payload.voice,
      speed: payload.voiceSpeed
    });

    await upsertRow({
      id,
      status: "video_rendering"
    });

    const video = await buildVideoWithEngine({
      jobId: id,
      imageUrls,
      ttsPath: tts.publicUrl,
      subtitlesText: narration,
      titleText: payload.title,
      useSfx: payload.useSfx,
      targetDurationSec: payload.videoLengthSec
    });

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
    });
  } catch (error) {
    await upsertRow({
      id,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown generation error"
    });
  }
}

/**
 * Queue a generation job and return immediately while work continues asynchronously.
 * Status can be polled via `/api/status/:id`.
 */
export async function enqueueGeneration(payload: CreateVideoRequest): Promise<string> {
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
  });

  const promise = processJob(id, payload).finally(() => {
    activeJobs.delete(id);
  });

  activeJobs.set(id, promise);
  return id;
}

export function isJobActive(id: string): boolean {
  return activeJobs.has(id);
}
