import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  cleanupSelectedLocalGeneratedAssets,
  cleanupLocalGeneratedAssets,
  inspectLocalCleanupTargets,
  LocalCleanupTargetKey
} from "@/lib/local-asset-cleanup";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await inspectLocalCleanupTargets();
    return NextResponse.json({
      ok: true,
      ...summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to inspect local assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

interface LocalCleanupDeletePayload {
  all?: boolean;
  keys?: LocalCleanupTargetKey[];
}

function normalizeSelectedKeys(payload: LocalCleanupDeletePayload): LocalCleanupTargetKey[] {
  const raw = Array.isArray(payload.keys) ? payload.keys : [];
  const valid: LocalCleanupTargetKey[] = [];
  raw.forEach((item) => {
    if (item === "web_generated" || item === "video_engine_outputs") {
      valid.push(item);
    }
  });
  return Array.from(new Set(valid));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let payload: LocalCleanupDeletePayload = {};
    try {
      payload = (await request.json()) as LocalCleanupDeletePayload;
    } catch {
      payload = {};
    }

    const selectedKeys = normalizeSelectedKeys(payload);
    const cleanupAll = Boolean(payload.all) || selectedKeys.length === 0;
    const summary = cleanupAll
      ? await cleanupLocalGeneratedAssets()
      : await cleanupSelectedLocalGeneratedAssets(selectedKeys);
    return NextResponse.json({
      ok: true,
      cleanedAll: cleanupAll,
      cleanedKeys: cleanupAll ? ["web_generated", "video_engine_outputs"] : selectedKeys,
      ...summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cleanup local assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
