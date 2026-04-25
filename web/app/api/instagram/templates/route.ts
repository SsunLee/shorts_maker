import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  deleteInstagramTemplate,
  listInstagramTemplates,
  saveInstagramTemplate,
  setActiveInstagramTemplate
} from "@/lib/instagram-template-store";
import type { InstagramTemplate } from "@/lib/instagram-types";

export const runtime = "nodejs";

const baseElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "shape", "image"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  opacity: z.number(),
  zIndex: z.number()
});

const textElementSchema = baseElementSchema.extend({
  type: z.literal("text"),
  textMode: z.enum(["variable", "plain"]).optional(),
  bindingKey: z.string().optional(),
  text: z.string(),
  autoWrap: z.boolean().optional(),
  color: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  lineHeight: z.number(),
  letterSpacing: z.number(),
  textAlign: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strikeThrough: z.boolean().optional(),
  shadowEnabled: z.boolean().optional(),
  shadowColor: z.string().optional(),
  shadowBlur: z.number().optional(),
  shadowX: z.number().optional(),
  shadowY: z.number().optional(),
  backgroundColor: z.string(),
  backgroundOpacity: z.number().optional(),
  padding: z.number()
});

const shapeElementSchema = baseElementSchema.extend({
  type: z.literal("shape"),
  shape: z.enum([
    "rectangle",
    "roundedRectangle",
    "circle",
    "triangle",
    "diamond",
    "pentagon",
    "hexagon",
    "star",
    "arrowRight",
    "arrowLeft",
    "line"
  ]),
  fillEnabled: z.boolean().optional(),
  fillColor: z.string(),
  fillOpacity: z.number().optional(),
  strokeColor: z.string(),
  strokeWidth: z.number(),
  cornerRadius: z.number()
});

const imageElementSchema = baseElementSchema.extend({
  type: z.literal("image"),
  imageUrl: z.string(),
  mediaType: z.enum(["image", "video"]).optional(),
  fit: z.enum(["cover", "contain"]),
  borderRadius: z.number(),
  overlayColor: z.string(),
  overlayOpacity: z.number(),
  aiGenerateEnabled: z.boolean().optional(),
  aiModel: z.string().optional(),
  aiPrompt: z.string().optional(),
  aiStylePreset: z.string().optional(),
  aiImageOrientation: z.enum(["vertical", "horizontal"]).optional()
});

const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  backgroundColor: z.string(),
  backgroundImageUrl: z.string().optional(),
  backgroundFit: z.enum(["cover", "contain"]).optional(),
  durationSec: z.number(),
  audioEnabled: z.boolean().optional(),
  audioProvider: z.enum(["auto", "openai", "gemini"]).optional(),
  audioVoice: z.string().optional(),
  audioSpeed: z.number().optional(),
  audioUrl: z.string().optional(),
  audioPrompt: z.string().optional(),
  elements: z.array(z.union([textElementSchema, shapeElementSchema, imageElementSchema]))
});

const templateSchema = z.object({
  id: z.string().min(1),
  templateName: z.string().min(1),
  mode: z.enum(["general", "news"]).optional(),
  sourceTitle: z.string(),
  sourceTopic: z.string(),
  canvasPreset: z.string().optional(),
  canvasWidth: z.number().optional(),
  canvasHeight: z.number().optional(),
  pageDurationSec: z.number(),
  pageCount: z.number(),
  pages: z.array(pageSchema),
  customFonts: z
    .array(
      z.object({
        id: z.string().min(1),
        family: z.string().min(1),
        fileName: z.string().min(1),
        sourceUrl: z.string().min(1),
        mimeType: z.string().optional(),
        uploadedAt: z.string().min(1)
      })
    )
    .optional(),
  updatedAt: z.string()
});

const postSchema = z.object({
  template: templateSchema
});

const patchSchema = z.object({
  templateId: z.string().min(1)
});

/** 인스타그램 템플릿 목록/활성값 조회 */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catalog = await listInstagramTemplates(userId);
  return NextResponse.json(catalog);
}

/** 인스타그램 템플릿 저장(신규/수정 공통) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = postSchema.parse(body);
    const catalog = await saveInstagramTemplate({
      template: payload.template as InstagramTemplate,
      userId
    });
    return NextResponse.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** 인스타그램 활성 템플릿 변경 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = patchSchema.parse(body);
    const catalog = await setActiveInstagramTemplate(payload.templateId, userId);
    return NextResponse.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** 인스타그램 템플릿 삭제 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = patchSchema.parse(body);
    const catalog = await deleteInstagramTemplate(payload.templateId, userId);
    return NextResponse.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
