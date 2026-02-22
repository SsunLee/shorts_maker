import { BuildVideoPayload } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";

export interface BuildVideoResult {
  outputPath: string;
  outputUrl?: string;
  srtPath?: string;
  ffmpegSteps?: string[];
}

function parsePathname(source: string): string | null {
  if (!source) {
    return null;
  }
  if (source.startsWith("/")) {
    return source;
  }
  try {
    const parsed = new URL(source);
    return parsed.pathname || null;
  } catch {
    return null;
  }
}

async function toEngineReadableAsset(source: string): Promise<string> {
  const pathname = parsePathname(source);
  if (!pathname || !pathname.startsWith("/generated/")) {
    return source;
  }

  const localPath = path.join(
    process.cwd(),
    "public",
    ...pathname.replace(/^\/+/, "").split("/").filter(Boolean)
  );

  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    return source;
  }
}

/** Send render instructions to the external FastAPI video engine. */
export async function buildVideoWithEngine(
  payload: BuildVideoPayload
): Promise<BuildVideoResult> {
  const baseUrl = process.env.VIDEO_ENGINE_URL || "http://localhost:8000";
  const imageUrls = await Promise.all(
    payload.imageUrls.map((source) => toEngineReadableAsset(source))
  );
  const ttsPath = await toEngineReadableAsset(payload.ttsPath);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/build-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        imageUrls,
        ttsPath
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    throw new Error(
      `Cannot connect to video engine at ${baseUrl}. ` +
        `Start FastAPI engine (uvicorn app.main:app --reload --port 8000). Cause: ${message}`
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Video engine error (${response.status}): ${message}`);
  }

  return (await response.json()) as BuildVideoResult;
}
