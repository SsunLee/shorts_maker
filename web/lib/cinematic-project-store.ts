import { promises as fs } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scopedUserId } from "@/lib/user-storage-namespace";
import { CinematicProject } from "@/lib/cinematic-types";

const MAX_PROJECTS = 60;

function resolveProjectFile(): string {
  const explicit = String(process.env.CINEMATIC_PROJECT_FILE || "").trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(process.cwd(), explicit);
  }
  const namespace = String(
    process.env.AUTOMATION_NAMESPACE || process.env.SETTINGS_NAMESPACE || ""
  ).trim();
  const suffix = namespace
    ? `.${namespace.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`
    : "";
  return path.join(process.cwd(), "data", `cinematic-projects${suffix}.json`);
}

function isReadOnlyServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.NEXT_RUNTIME === "edge"
  );
}

function parseProjects(value: unknown): CinematicProject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is CinematicProject => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const row = item as Partial<CinematicProject>;
    return typeof row.id === "string" && row.id.trim().length > 0;
  });
}

function storageUserId(userId?: string): string | undefined {
  const scoped = scopedUserId(userId, "automation");
  return scoped ? `${scoped}::cinematic` : undefined;
}

async function readAll(userId?: string): Promise<CinematicProject[]> {
  const scoped = storageUserId(userId);
  if (prisma && scoped) {
    try {
      const row = await prisma.userCinematicProjectCatalog.findUnique({
        where: { userId: scoped }
      });
      if (row) {
        return parseProjects(row.data);
      }
      if (isReadOnlyServerlessRuntime()) {
        return [];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cinematic-store] DB read failed: ${message}`);
      if (isReadOnlyServerlessRuntime()) {
        throw new Error(`Cinematic project storage read failed: ${message}`);
      }
    }
  }

  if (isReadOnlyServerlessRuntime()) {
    return [];
  }

  const file = resolveProjectFile();
  try {
    return parseProjects(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return [];
  }
}

async function writeAll(items: CinematicProject[], userId?: string): Promise<void> {
  const trimmed = items.slice(0, MAX_PROJECTS);
  const scoped = storageUserId(userId);

  if (prisma && scoped) {
    try {
      await prisma.userCinematicProjectCatalog.upsert({
        where: { userId: scoped },
        update: { data: trimmed as unknown as Prisma.InputJsonValue },
        create: { userId: scoped, data: trimmed as unknown as Prisma.InputJsonValue }
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cinematic-store] DB write failed: ${message}`);
      if (isReadOnlyServerlessRuntime()) {
        throw new Error(`Cinematic project storage write failed: ${message}`);
      }
    }
  }

  if (isReadOnlyServerlessRuntime()) {
    return;
  }

  const file = resolveProjectFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(trimmed, null, 2), "utf8");
}

export async function listCinematicProjects(userId?: string): Promise<CinematicProject[]> {
  const items = await readAll(userId);
  return [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getCinematicProject(
  id: string,
  userId?: string
): Promise<CinematicProject | undefined> {
  const items = await readAll(userId);
  return items.find((item) => item.id === id);
}

export async function upsertCinematicProject(
  project: CinematicProject,
  userId?: string
): Promise<CinematicProject> {
  const items = await readAll(userId);
  const next: CinematicProject = { ...project, updatedAt: new Date().toISOString() };
  const index = items.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.unshift(next);
  }
  await writeAll(items, userId);
  return next;
}

export async function deleteCinematicProject(id: string, userId?: string): Promise<void> {
  const items = await readAll(userId);
  await writeAll(
    items.filter((item) => item.id !== id),
    userId
  );
}
