import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { deleteRow } from "@/lib/repository";
import { deleteWorkflow } from "@/lib/workflow-store";

export const runtime = "nodejs";

async function removeDirectoryIfExists(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}

/** Delete dashboard row + workflow record + generated local assets for this ID. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const deletedRow = await deleteRow(id);
    await deleteWorkflow(id);

    // Clean web-generated assets.
    await removeDirectoryIfExists(path.join(process.cwd(), "public", "generated", id));

    // Clean local video engine outputs if running in monorepo.
    const repoRoot = path.resolve(process.cwd(), "..");
    await removeDirectoryIfExists(path.join(repoRoot, "video-engine", "outputs", id));
    await removeDirectoryIfExists(path.join(repoRoot, "video-engine", "outputs", `${id}-preview`));
    await removeDirectoryIfExists(path.join(repoRoot, "video-engine", "outputs", `${id}-final`));

    return NextResponse.json({
      deleted: deletedRow
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete row";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
