import { NextResponse } from "next/server";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { generateImages } from "@/lib/openai-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  prompt: z.string().trim().min(1, "프롬프트를 입력해 주세요."),
  aiModel: z.string().optional(),
  imageAspectRatio: z.enum(["16:9", "9:16"]).optional(),
  stylePreset: z.string().optional(),
  canvasWidth: z.number().optional(),
  canvasHeight: z.number().optional()
});

type ImageProvider = "openai" | "gemini";

function normalizeStylePreset(raw: string | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "Cinematic photo-real";
  if (value.toLowerCase() === "완전 실사 포토그래퍼") {
    return "Ultra photoreal photographer";
  }
  return value;
}

function resolveCompositionHint(canvasWidth?: number, canvasHeight?: number): string {
  const width = Number(canvasWidth) || 1080;
  const height = Number(canvasHeight) || 1350;
  if (width >= height) {
    return "Landscape composition with clean horizontal framing.";
  }
  return "Vertical composition optimized for mobile social feed.";
}

function resolveAspectRatio(
  imageAspectRatio: "16:9" | "9:16" | undefined,
  canvasWidth?: number,
  canvasHeight?: number
): "16:9" | "9:16" {
  if (imageAspectRatio === "16:9" || imageAspectRatio === "9:16") {
    return imageAspectRatio;
  }
  return (Number(canvasWidth) || 1080) >= (Number(canvasHeight) || 1350) ? "16:9" : "9:16";
}

function resolveModelSelection(rawModel: string | undefined): {
  providerOverride?: ImageProvider;
  modelOverride?: string;
} {
  const normalized = String(rawModel || "").trim();
  if (!normalized || normalized.toLowerCase() === "auto") {
    return {};
  }

  const prefixed = normalized.match(/^(openai|gemini)\s*:\s*(.+)$/i);
  if (prefixed) {
    const provider = prefixed[1].toLowerCase() as ImageProvider;
    const model = String(prefixed[2] || "").trim();
    return model ? { providerOverride: provider, modelOverride: model } : {};
  }

  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("gemini")) {
    return { providerOverride: "gemini", modelOverride: normalized };
  }
  if (lowered.startsWith("gpt-") || lowered.startsWith("dall-e")) {
    return { providerOverride: "openai", modelOverride: normalized };
  }

  return { modelOverride: normalized };
}

function guessMimeTypeFromPath(sourcePath: string): string {
  const normalized = String(sourcePath || "").toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function resolveLocalGeneratedImageDataUrl(publicUrl: string): Promise<string | undefined> {
  const source = String(publicUrl || "").trim();
  if (!source.startsWith("/generated/")) {
    return undefined;
  }
  const relativeSegments = source
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (relativeSegments.length === 0 || relativeSegments.some((segment) => segment === "..")) {
    return undefined;
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, ...relativeSegments);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    return undefined;
  }

  const file = await fs.readFile(absolutePath);
  const mimeType = guessMimeTypeFromPath(source);
  return `data:${mimeType};base64,${file.toString("base64")}`;
}

/** Generate one AI image and return the stored public URL. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = payloadSchema.parse(await request.json());
    const stylePreset = normalizeStylePreset(body.stylePreset);
    const composedPrompt =
      `${stylePreset}. ${body.prompt}. ${resolveCompositionHint(body.canvasWidth, body.canvasHeight)} ` +
      "High detail, clean lighting, no text, no watermark.";
    const imageAspectRatio = resolveAspectRatio(body.imageAspectRatio, body.canvasWidth, body.canvasHeight);
    const modelSelection = resolveModelSelection(body.aiModel);
    const jobId = `instagram-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const urls = await generateImages(
      jobId,
      [composedPrompt],
      {
        startIndex: 0,
        imageAspectRatio,
        providerOverride: modelSelection.providerOverride,
        imageModelOverride: modelSelection.modelOverride
      },
      userId
    );
    const imageUrl = urls[0];
    if (!imageUrl) {
      throw new Error("이미지 생성 결과를 받지 못했습니다.");
    }
    const localDataUrl = await resolveLocalGeneratedImageDataUrl(imageUrl).catch(() => undefined);

    return NextResponse.json({
      imageUrl: localDataUrl || imageUrl,
      model: modelSelection.modelOverride || "auto",
      stylePreset,
      usedPrompt: composedPrompt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 생성에 실패했습니다.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
