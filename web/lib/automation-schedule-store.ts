import { promises as fs } from "fs";
import path from "path";
import { AutomationScheduleState } from "@/lib/types";

const scheduleFile = path.join(process.cwd(), "data", "automation-schedule.json");

async function ensureScheduleFile(): Promise<void> {
  await fs.mkdir(path.dirname(scheduleFile), { recursive: true });
  try {
    await fs.access(scheduleFile);
  } catch {
    await fs.writeFile(scheduleFile, JSON.stringify({}, null, 2), "utf8");
  }
}

export async function readAutomationScheduleState(): Promise<Partial<AutomationScheduleState> | undefined> {
  await ensureScheduleFile();
  const raw = await fs.readFile(scheduleFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationScheduleState>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeAutomationScheduleState(state: AutomationScheduleState): Promise<AutomationScheduleState> {
  await ensureScheduleFile();
  await fs.writeFile(scheduleFile, JSON.stringify(state, null, 2), "utf8");
  return state;
}
