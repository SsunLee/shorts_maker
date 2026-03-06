import { NextRequest, NextResponse } from "next/server";
import {
  cleanupJobAssetsFromStorage,
  listJobAssetsFromStorage
} from "@/lib/object-storage";
import { getAuthenticatedUserId } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = String(request.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id query parameter." }, { status: 400 });
  }

  try {
    const result = await listJobAssetsFromStorage(id);
    return NextResponse.json({
      id,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list S3 assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = String(request.nextUrl.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id query parameter." }, { status: 400 });
  }

  try {
    await cleanupJobAssetsFromStorage(id);
    return NextResponse.json({
      ok: true,
      id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cleanup S3 assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

