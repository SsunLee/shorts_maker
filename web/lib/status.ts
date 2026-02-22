import { VideoStatus } from "@/lib/types";

export const STATUS_LABELS: Record<VideoStatus, string> = {
  queued: "Queued",
  generating_script: "Generating Script",
  generating_images: "Generating Images",
  generating_tts: "Generating TTS",
  video_rendering: "Rendering Video",
  ready: "Ready",
  uploading: "Uploading to YouTube",
  uploaded: "Uploaded",
  failed: "Failed"
};

const STATUS_PROGRESS: Record<VideoStatus, number> = {
  queued: 5,
  generating_script: 20,
  generating_images: 45,
  generating_tts: 65,
  video_rendering: 85,
  ready: 100,
  uploading: 95,
  uploaded: 100,
  failed: 100
};

export function statusTone(status: VideoStatus): "default" | "muted" | "destructive" {
  if (status === "failed") {
    return "destructive";
  }

  if (status === "queued") {
    return "muted";
  }

  return "default";
}

export function progressFromStatus(status: VideoStatus): number {
  return STATUS_PROGRESS[status];
}
