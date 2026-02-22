import { promises as fs } from "fs";
import path from "path";
import { VideoWorkflow } from "@/lib/types";

const workflowFile = path.join(process.cwd(), "data", "workflows.json");

async function ensureWorkflowFile(): Promise<void> {
  await fs.mkdir(path.dirname(workflowFile), { recursive: true });
  try {
    await fs.access(workflowFile);
  } catch {
    await fs.writeFile(workflowFile, JSON.stringify([], null, 2), "utf8");
  }
}

async function readAll(): Promise<VideoWorkflow[]> {
  await ensureWorkflowFile();
  const raw = await fs.readFile(workflowFile, "utf8");
  try {
    return JSON.parse(raw) as VideoWorkflow[];
  } catch {
    return [];
  }
}

async function writeAll(items: VideoWorkflow[]): Promise<void> {
  await ensureWorkflowFile();
  await fs.writeFile(workflowFile, JSON.stringify(items, null, 2), "utf8");
}

export async function getWorkflow(id: string): Promise<VideoWorkflow | undefined> {
  const items = await readAll();
  return items.find((item) => item.id === id);
}

export async function upsertWorkflow(workflow: VideoWorkflow): Promise<VideoWorkflow> {
  const items = await readAll();
  const index = items.findIndex((item) => item.id === workflow.id);
  if (index >= 0) {
    items[index] = workflow;
  } else {
    items.push(workflow);
  }
  await writeAll(items);
  return workflow;
}

/** List workflows sorted by most recently updated first. */
export async function listWorkflows(): Promise<VideoWorkflow[]> {
  const items = await readAll();
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete workflow by ID. Returns true when deleted. */
export async function deleteWorkflow(id: string): Promise<boolean> {
  const items = await readAll();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) {
    return false;
  }
  await writeAll(next);
  return true;
}
