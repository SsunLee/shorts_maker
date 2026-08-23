import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import { getHiggsfieldStatus, listHiggsfieldVideoModels } from "@/lib/higgsfield-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getHiggsfieldStatus();
  if (!status.available) {
    return NextResponse.json({ status, models: [] });
  }

  try {
    const models = await listHiggsfieldVideoModels();
    return NextResponse.json({ status, models });
  } catch (error) {
    return NextResponse.json({
      status,
      models: [],
      modelsError: error instanceof Error ? error.message : String(error)
    });
  }
}
