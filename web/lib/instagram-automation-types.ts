import type { IdeaLanguage } from "@/lib/types";

export type InstagramAutomationScheduleCadence = "interval_hours" | "daily";

export interface InstagramAutomationScheduleConfig {
  enabled: boolean;
  cadence: InstagramAutomationScheduleCadence;
  intervalHours: number;
  dailyTime: string;
  timeZone?: string;
  itemsPerRun: number;
  sheetName?: string;
  autoIdeaEnabled: boolean;
  autoIdeaKeywords?: string;
  autoIdeaLanguage?: IdeaLanguage;
  autoUploadEnabled: boolean;
}

export interface InstagramAutomationScheduleState {
  config: InstagramAutomationScheduleConfig;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: "started" | "skipped_running" | "skipped_noop" | "failed";
  lastError?: string;
  updatedAt: string;
}
