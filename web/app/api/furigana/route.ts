import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateFuriganaMarkup } from "@/lib/furigana";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().min(1).max(10000)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const text = await generateFuriganaMarkup(payload.text);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate furigana";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
