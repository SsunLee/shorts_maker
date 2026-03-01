import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAutomationTemplate,
  getAutomationTemplateSnapshot,
  listAutomationTemplates,
  saveAutomationTemplateSnapshot,
  updateAutomationTemplate,
  setActiveAutomationTemplate
} from "@/lib/automation-template-store";
import { RenderOptions } from "@/lib/types";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

const schema = z.object({
  renderOptions: z.record(z.any()),
  imageStyle: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceTopic: z.string().optional(),
  templateName: z.string().optional(),
  voice: z.string().min(1).optional(),
  voiceSpeed: z.number().min(0.5).max(2).optional()
});
const selectSchema = z.object({
  templateId: z.string().min(1)
});
const updateSchema = z.object({
  templateId: z.string().min(1),
  renderOptions: z.record(z.any()),
  imageStyle: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceTopic: z.string().optional(),
  templateName: z.string().optional(),
  voice: z.string().min(1).optional(),
  voiceSpeed: z.number().min(0.5).max(2).optional()
});

/** Get latest automation template snapshot persisted by [템플릿 적용]. */
export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catalog = await listAutomationTemplates(userId);
  const snapshot = await getAutomationTemplateSnapshot(userId);
  return NextResponse.json({
    snapshot,
    templates: catalog.templates,
    activeTemplateId: catalog.activeTemplateId
  });
}

/** Persist automation template snapshot to be used by batch automation. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = schema.parse(body);
    const saved = await saveAutomationTemplateSnapshot({
      renderOptions: payload.renderOptions as RenderOptions,
      imageStyle: payload.imageStyle,
      sourceTitle: payload.sourceTitle,
      sourceTopic: payload.sourceTopic,
      templateName: payload.templateName,
      voice: payload.voice,
      voiceSpeed: payload.voiceSpeed,
      userId
    });
    const catalog = await listAutomationTemplates(userId);
    return NextResponse.json({
      snapshot: saved,
      templates: catalog.templates,
      activeTemplateId: catalog.activeTemplateId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Select active automation template by ID. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = selectSchema.parse(body);
    const snapshot = await setActiveAutomationTemplate(payload.templateId, userId);
    const catalog = await listAutomationTemplates(userId);
    return NextResponse.json({
      snapshot,
      templates: catalog.templates,
      activeTemplateId: catalog.activeTemplateId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Update an existing automation template by ID. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = updateSchema.parse(body);
    const snapshot = await updateAutomationTemplate({
      templateId: payload.templateId,
      renderOptions: payload.renderOptions as RenderOptions,
      imageStyle: payload.imageStyle,
      sourceTitle: payload.sourceTitle,
      sourceTopic: payload.sourceTopic,
      templateName: payload.templateName,
      voice: payload.voice,
      voiceSpeed: payload.voiceSpeed,
      userId
    });
    const catalog = await listAutomationTemplates(userId);
    return NextResponse.json({
      snapshot,
      templates: catalog.templates,
      activeTemplateId: catalog.activeTemplateId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Delete one automation template by ID. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const payload = selectSchema.parse(body);
    const catalog = await deleteAutomationTemplate(payload.templateId, userId);
    const snapshot = await getAutomationTemplateSnapshot(userId);
    return NextResponse.json({
      snapshot,
      templates: catalog.templates,
      activeTemplateId: catalog.activeTemplateId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
