import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkflow } from "@/lib/workflow-store";
import { updateSceneSplit } from "@/lib/staged-workflow";

export const runtime = "nodejs";

const sceneSchema = z.object({
  index: z.number().int().min(1).max(12),
  sceneTitle: z.string().min(1),
  narrationText: z.string().min(1),
  imagePrompt: z.string().min(1),
  imageUrl: z.string().optional()
});

const patchSchema = z.object({
  narration: z.string().optional(),
  scenes: z.array(sceneSchema).min(3).max(12).optional(),
  stage: z
    .enum(["scene_split_review", "assets_review", "video_review", "final_ready"])
    .optional(),
  renderOptions: z
    .object({
      subtitle: z
        .object({
          fontName: z.string().min(1).optional(),
          fontSize: z.number().int().min(10).max(80).optional(),
          primaryColor: z.string().min(4).max(16).optional(),
          outlineColor: z.string().min(4).max(16).optional(),
          outline: z.number().int().min(0).max(8).optional(),
          shadow: z.number().int().min(0).max(8).optional(),
          shadowOpacity: z.number().min(0).max(1).optional(),
          fontThickness: z.number().int().min(0).max(8).optional(),
          subtitleDelayMs: z.number().int().min(-500).max(1500).optional(),
          manualCues: z
            .array(
              z.object({
                id: z.string().min(1),
                startMs: z.number().int().min(0).max(3600000),
                endMs: z.number().int().min(1).max(3600000),
                text: z.string().max(300)
              })
            )
            .max(400)
            .optional(),
          position: z.enum(["top", "middle", "bottom"]).optional(),
          subtitleYPercent: z.number().min(0).max(100).optional(),
          wordsPerCaption: z.number().int().min(2).max(10).optional()
        })
        .optional(),
      overlay: z
        .object({
          showTitle: z.boolean().optional(),
          titleText: z.string().optional(),
          titlePosition: z.enum(["top", "bottom"]).optional(),
          titleFontSize: z.number().int().min(16).max(120).optional(),
          titleColor: z.string().min(4).max(16).optional(),
          titleFontName: z.string().min(1).max(80).optional(),
          titleFontFile: z.string().max(260).optional(),
          sceneMotionPreset: z
            .enum(["gentle_zoom", "up_down", "left_right", "random", "focus_smooth"])
            .optional(),
          motionSpeedPercent: z.number().min(60).max(220).optional(),
          focusXPercent: z.number().min(0).max(100).optional(),
          focusYPercent: z.number().min(0).max(100).optional(),
          focusDriftPercent: z.number().min(0).max(20).optional(),
          focusZoomPercent: z.number().min(3).max(20).optional(),
          outputFps: z.union([z.literal(30), z.literal(60)]).optional(),
          videoLayout: z.enum(["fill_9_16", "panel_16_9"]).optional(),
          usePreviewAsFinal: z.boolean().optional(),
          panelTopPercent: z.number().min(0).max(85).optional(),
          panelWidthPercent: z.number().min(60).max(100).optional(),
          titleTemplates: z
            .array(
              z.object({
                id: z.string().min(1),
                text: z.string().max(200),
                x: z.number().min(0).max(100),
                y: z.number().min(0).max(100),
                width: z.number().min(10).max(95),
                fontSize: z.number().int().min(12).max(120),
                color: z.string().min(4).max(16),
                paddingX: z.number().int().min(0).max(80).optional(),
                paddingY: z.number().int().min(0).max(80).optional(),
                shadowX: z.number().int().min(-20).max(20).optional(),
                shadowY: z.number().int().min(-20).max(20).optional(),
                shadowColor: z.string().min(4).max(16).optional(),
                shadowOpacity: z.number().min(0).max(1).optional(),
                fontThickness: z.number().int().min(0).max(8).optional(),
                fontName: z.string().max(80).optional(),
                fontFile: z.string().max(260).optional()
              })
            )
            .max(12)
            .optional()
        })
        .optional()
    })
    .optional()
});

/** Fetch workflow detail by ID. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const workflow = await getWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json(workflow);
}

/** Update narration/split scene prompts before moving to next stage. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const payload = patchSchema.parse(body);
    const workflow = await updateSceneSplit(id, payload);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update workflow";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
