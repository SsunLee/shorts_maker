import { promises as fs } from "fs";
import path from "path";

export interface LocalCleanupTarget {
  key: "web_generated" | "video_engine_outputs";
  label: string;
  absolutePath: string;
  exists: boolean;
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
}

export interface LocalCleanupSummary {
  targets: LocalCleanupTarget[];
  totalFileCount: number;
  totalDirectoryCount: number;
  totalSizeBytes: number;
}

interface ScanTotals {
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
}

function getCleanupTargetPaths(): Array<{
  key: LocalCleanupTarget["key"];
  label: string;
  absolutePath: string;
}> {
  const appRoot = process.cwd();
  const repoRoot = path.resolve(appRoot, "..");
  return [
    {
      key: "web_generated",
      label: "Web generated assets",
      absolutePath: path.join(appRoot, "public", "generated")
    },
    {
      key: "video_engine_outputs",
      label: "Video engine outputs",
      absolutePath: path.join(repoRoot, "video-engine", "outputs")
    }
  ];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function scanDirectory(targetPath: string): Promise<ScanTotals> {
  const exists = await pathExists(targetPath);
  if (!exists) {
    return {
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0
    };
  }

  const totals: ScanTotals = {
    fileCount: 0,
    directoryCount: 0,
    totalSizeBytes: 0
  };

  async function walk(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (fullPath !== targetPath) {
            totals.directoryCount += 1;
          }
          await walk(fullPath);
          return;
        }
        if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            totals.fileCount += 1;
            totals.totalSizeBytes += stat.size;
          } catch {
            // Ignore unreadable files during summary scan.
          }
        }
      })
    );
  }

  await walk(targetPath);
  return totals;
}

async function emptyDirectory(targetPath: string): Promise<void> {
  const exists = await pathExists(targetPath);
  if (!exists) {
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      try {
        await fs.rm(path.join(targetPath, entry.name), { recursive: true, force: true });
      } catch {
        // Best-effort local cleanup only.
      }
    })
  );
}

export async function inspectLocalCleanupTargets(): Promise<LocalCleanupSummary> {
  const targets = await Promise.all(
    getCleanupTargetPaths().map(async (target) => {
      const exists = await pathExists(target.absolutePath);
      const stats = await scanDirectory(target.absolutePath);
      return {
        ...target,
        exists,
        ...stats
      } satisfies LocalCleanupTarget;
    })
  );

  return {
    targets,
    totalFileCount: targets.reduce((sum, item) => sum + item.fileCount, 0),
    totalDirectoryCount: targets.reduce((sum, item) => sum + item.directoryCount, 0),
    totalSizeBytes: targets.reduce((sum, item) => sum + item.totalSizeBytes, 0)
  };
}

export async function cleanupLocalGeneratedAssets(): Promise<LocalCleanupSummary> {
  const targets = getCleanupTargetPaths();
  await Promise.all(targets.map((target) => emptyDirectory(target.absolutePath)));
  return inspectLocalCleanupTargets();
}
