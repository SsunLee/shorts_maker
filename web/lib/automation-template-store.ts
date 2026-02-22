import { promises as fs } from "fs";
import path from "path";
import { RenderOptions } from "@/lib/types";

const automationTemplateFile = path.join(
  process.cwd(),
  "data",
  "automation-template.json"
);

export interface AutomationTemplateSnapshot {
  renderOptions: RenderOptions;
  sourceTitle?: string;
  sourceTopic?: string;
  templateName?: string;
  updatedAt: string;
}

async function ensureAutomationTemplateFile(): Promise<void> {
  await fs.mkdir(path.dirname(automationTemplateFile), { recursive: true });
  try {
    await fs.access(automationTemplateFile);
  } catch {
    await fs.writeFile(automationTemplateFile, JSON.stringify({}, null, 2), "utf8");
  }
}

export async function getAutomationTemplateSnapshot(): Promise<AutomationTemplateSnapshot | undefined> {
  await ensureAutomationTemplateFile();
  const raw = await fs.readFile(automationTemplateFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationTemplateSnapshot>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    if (!parsed.renderOptions || typeof parsed.renderOptions !== "object") {
      return undefined;
    }
    return {
      renderOptions: parsed.renderOptions as RenderOptions,
      sourceTitle: typeof parsed.sourceTitle === "string" ? parsed.sourceTitle : undefined,
      sourceTopic: typeof parsed.sourceTopic === "string" ? parsed.sourceTopic : undefined,
      templateName: typeof parsed.templateName === "string" ? parsed.templateName : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt
          ? parsed.updatedAt
          : new Date().toISOString()
    };
  } catch {
    return undefined;
  }
}

export async function saveAutomationTemplateSnapshot(
  value: Omit<AutomationTemplateSnapshot, "updatedAt"> & { updatedAt?: string }
): Promise<AutomationTemplateSnapshot> {
  await ensureAutomationTemplateFile();
  const snapshot: AutomationTemplateSnapshot = {
    renderOptions: value.renderOptions,
    sourceTitle: value.sourceTitle,
    sourceTopic: value.sourceTopic,
    templateName: value.templateName,
    updatedAt: value.updatedAt || new Date().toISOString()
  };
  await fs.writeFile(automationTemplateFile, JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}
