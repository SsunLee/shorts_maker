import type { VideoWorkflow } from "@/lib/types";

const WORKFLOW_MEDIA_PROXY_PATH = "/api/instagram/media-proxy";

function toWorkflowMediaProxyUrl(source: string): string {
  const params = new URLSearchParams();
  params.set("source", source);
  return `${WORKFLOW_MEDIA_PROXY_PATH}?${params.toString()}`;
}

export async function toReadableWorkflowMediaUrl(raw?: string): Promise<string | undefined> {
  const source = String(raw || "").trim();
  if (!source) {
    return undefined;
  }

  if (source.startsWith(WORKFLOW_MEDIA_PROXY_PATH)) {
    return source;
  }

  // Keep data URLs untouched.
  if (source.startsWith("data:")) {
    return source;
  }

  if (source.startsWith("/")) {
    return toWorkflowMediaProxyUrl(source);
  }

  if (/^https?:\/\//i.test(source)) {
    return toWorkflowMediaProxyUrl(source);
  }

  return source;
}

export async function withReadableWorkflowMediaUrls(
  workflow: VideoWorkflow
): Promise<VideoWorkflow> {
  const [scenes, ttsUrl, previewVideoUrl, finalVideoUrl] = await Promise.all([
    Promise.all(
      workflow.scenes.map(async (scene) => ({
        ...scene,
        imageUrl: await toReadableWorkflowMediaUrl(scene.imageUrl)
      }))
    ),
    toReadableWorkflowMediaUrl(workflow.ttsUrl),
    toReadableWorkflowMediaUrl(workflow.previewVideoUrl),
    toReadableWorkflowMediaUrl(workflow.finalVideoUrl)
  ]);

  return {
    ...workflow,
    scenes,
    ttsUrl,
    previewVideoUrl,
    finalVideoUrl
  };
}
