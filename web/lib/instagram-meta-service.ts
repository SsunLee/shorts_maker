import { getSettings } from "@/lib/settings-store";

export type MetaConfig = {
  accessToken: string;
  instagramAccountId: string;
  graphVersion: string;
};

type MetaApiError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

function normalizeGraphVersion(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "v23.0";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function toMetaErrorMessage(raw: string, fallback: string): string {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as MetaApiError;
    const message = parsed.error?.message;
    const code = parsed.error?.code;
    if (message) {
      return code ? `${message} (code: ${code})` : message;
    }
  } catch {
    // noop
  }
  return text;
}

function graphBase(version: string): string {
  return `https://graph.facebook.com/${normalizeGraphVersion(version)}`;
}

function objectRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function readString(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function extractContainerStatusCode(payload: Record<string, unknown>): string {
  const direct = readString(payload.status_code || payload.status, "").trim();
  if (direct) {
    return direct.toUpperCase();
  }
  const videoStatus = objectRecord(payload.video_status);
  const nested = readString(videoStatus.status, "").trim();
  if (nested) {
    return nested.toUpperCase();
  }
  return "";
}

function extractContainerDiagnostic(payload: Record<string, unknown>): string {
  const messages: string[] = [];
  const statusMessage = readString(payload.status_message, "").trim();
  if (statusMessage) {
    messages.push(statusMessage);
  }
  const errorMessage = readString(payload.error_message, "").trim();
  if (errorMessage) {
    messages.push(errorMessage);
  }
  const videoStatus = objectRecord(payload.video_status);
  const videoStatusMessage = readString(videoStatus.status_message, "").trim();
  if (videoStatusMessage) {
    messages.push(videoStatusMessage);
  }
  const videoError = objectRecord(videoStatus.error);
  const videoErrorMessage = readString(videoError.message, "").trim();
  if (videoErrorMessage) {
    messages.push(videoErrorMessage);
  }
  const unique = Array.from(new Set(messages.filter(Boolean)));
  return unique.join(" | ");
}

async function loadContainerStatus(args: {
  config: MetaConfig;
  containerId: string;
}): Promise<Record<string, unknown>> {
  const fieldSets = [
    "status_code,status,video_status,status_message",
    "status_code,status,video_status",
    "status_code,status",
    "id,status_code,status"
  ];
  for (const fields of fieldSets) {
    try {
      const response = await metaGet({
        config: args.config,
        path: `/${encodeURIComponent(args.containerId)}`,
        params: { fields }
      });
      return objectRecord(response);
    } catch {
      // Try narrower field list.
    }
  }
  const fallback = await metaGet({
    config: args.config,
    path: `/${encodeURIComponent(args.containerId)}`
  });
  return objectRecord(fallback);
}

export async function resolveMetaConfig(userId?: string): Promise<MetaConfig> {
  const settings = await getSettings(userId);
  const accessToken = String(settings.metaAccessToken || "").trim();
  const instagramAccountId = String(settings.metaInstagramAccountId || "").trim();
  const graphVersion = normalizeGraphVersion(String(settings.metaGraphVersion || ""));
  return {
    accessToken,
    instagramAccountId,
    graphVersion
  };
}

export function validateMetaConfig(config: MetaConfig): string[] {
  const missing: string[] = [];
  if (!config.accessToken) missing.push("metaAccessToken");
  if (!config.instagramAccountId) missing.push("metaInstagramAccountId");
  return missing;
}

export async function metaGet(args: {
  config: MetaConfig;
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
}): Promise<unknown> {
  const query = new URLSearchParams();
  query.set("access_token", args.config.accessToken);
  Object.entries(args.params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.set(key, String(value));
  });
  const url = `${graphBase(args.config.graphVersion)}${args.path}?${query.toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(toMetaErrorMessage(raw, `Meta GET failed with HTTP ${response.status}.`));
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

export async function metaPost(args: {
  config: MetaConfig;
  path: string;
  body?: Record<string, string | number | boolean | undefined>;
}): Promise<unknown> {
  const payload = new URLSearchParams();
  payload.set("access_token", args.config.accessToken);
  Object.entries(args.body || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    payload.set(key, String(value));
  });
  const url = `${graphBase(args.config.graphVersion)}${args.path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
    cache: "no-store"
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(toMetaErrorMessage(raw, `Meta POST failed with HTTP ${response.status}.`));
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

export async function waitForContainerReady(args: {
  config: MetaConfig;
  containerId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<void> {
  const timeoutMs = Math.max(5000, Number(args.timeoutMs) || 120000);
  const intervalMs = Math.max(500, Number(args.intervalMs) || 2500);
  const startedAt = Date.now();

  while (true) {
    const response = await loadContainerStatus({
      config: args.config,
      containerId: args.containerId
    });
    const statusCode = extractContainerStatusCode(response);
    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return;
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      const diagnostic = extractContainerDiagnostic(response);
      const detailSuffix = diagnostic ? ` · ${diagnostic}` : "";
      throw new Error(`Meta container failed: ${statusCode} (id=${args.containerId})${detailSuffix}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Meta container processing timeout: ${args.containerId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
