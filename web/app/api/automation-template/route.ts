import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAutomationTemplateSnapshot,
  saveAutomationTemplateSnapshot
} from "@/lib/automation-template-store";
import { RenderOptions } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  renderOptions: z.record(z.any()),
  sourceTitle: z.string().optional(),
  sourceTopic: z.string().optional(),
  templateName: z.string().optional()
});

/** Get latest automation template snapshot persisted by [템플릿 적용]. */
export async function GET(): Promise<NextResponse> {
  const snapshot = await getAutomationTemplateSnapshot();
  return NextResponse.json({ snapshot });
}

/** Persist automation template snapshot to be used by batch automation. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    const saved = await saveAutomationTemplateSnapshot({
      renderOptions: payload.renderOptions as RenderOptions,
      sourceTitle: payload.sourceTitle,
      sourceTopic: payload.sourceTopic,
      templateName: payload.templateName
    });
    return NextResponse.json({ snapshot: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
