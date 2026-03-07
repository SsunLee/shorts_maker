import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth-server";
import {
  cleanupLocalGeneratedAssets,
  inspectLocalCleanupTargets
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

export async function DELETE(): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await cleanupLocalGeneratedAssets();
    return NextResponse.json({
      ok: true,
      ...summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cleanup local assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
