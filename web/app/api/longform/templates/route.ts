import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteLongformTemplate,
  listLongformTemplates,
  saveLongformTemplate,
  updateLongformTemplate
} from "@/lib/longform-template-store";

export const runtime = "nodejs";

const trackSchema = z.object({
  type: z.enum(["video", "audio", "text", "effect"]),
  start: z.number(),
  duration: z.number(),
  label: z.string().optional(),
  text: z.string().optional(),
  animation: z.enum(["none", "fade", "slide", "scale", "bounce"]).optional(),
  style: z.record(z.any()).optional()
});

const payloadSchema = z.object({
  tracks: z.array(trackSchema)
});

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  previewLabel: z.string().optional(),
  payload: payloadSchema
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  category: z.string().optional(),
  previewLabel: z.string().optional(),
  payload: payloadSchema
});

const deleteSchema = z.object({
  id: z.string().min(1)
});

export async function GET(): Promise<NextResponse> {
  const templates = await listLongformTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = createSchema.parse(body);
    const saved = await saveLongformTemplate(payload);
    const templates = await listLongformTemplates();
    return NextResponse.json({ saved, templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = updateSchema.parse(body);
    const updated = await updateLongformTemplate(payload);
    const templates = await listLongformTemplates();
    return NextResponse.json({ updated, templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = deleteSchema.parse(body);
    await deleteLongformTemplate(payload.id);
    const templates = await listLongformTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

