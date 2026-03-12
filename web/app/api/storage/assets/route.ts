import { NextRequest, NextResponse } from "next/server";
import {
  cleanupAllAssetsFromStorage,
  cleanupJobAssetsFromStorage,
  cleanupSelectedJobAssetsFromStorage,
  listAllStorageJobAssets,
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
    try {
      const summary = await listAllStorageJobAssets(userId);
      return NextResponse.json({
        ok: true,
        ...summary
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list S3 assets.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    const result = await listJobAssetsFromStorage(id, userId);
    return NextResponse.json({
      id,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list S3 assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

interface StorageDeletePayload {
  all?: boolean;
  jobIds?: string[];
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = String(request.nextUrl.searchParams.get("id") || "").trim();
  if (id) {
    try {
      await cleanupJobAssetsFromStorage(id, userId);
      return NextResponse.json({
        ok: true,
        id
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cleanup S3 assets.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    let payload: StorageDeletePayload = {};
    try {
      payload = (await request.json()) as StorageDeletePayload;
    } catch {
      payload = {};
    }
    const jobIds = Array.isArray(payload.jobIds)
      ? Array.from(new Set(payload.jobIds.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
    if (Boolean(payload.all)) {
      await cleanupAllAssetsFromStorage(userId);
      return NextResponse.json({
        ok: true,
        cleanedAll: true
      });
    }
    if (jobIds.length === 0) {
      return NextResponse.json(
        { error: "Missing id query parameter or jobIds payload." },
        { status: 400 }
      );
    }
    const cleanedJobIds = await cleanupSelectedJobAssetsFromStorage(jobIds, userId);
    return NextResponse.json({
      ok: true,
      cleanedAll: false,
      cleanedJobIds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cleanup S3 assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
