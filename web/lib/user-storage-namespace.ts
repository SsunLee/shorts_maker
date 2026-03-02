function sanitizeNamespace(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "default";
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

export function resolveStorageNamespace(scope: "settings" | "automation"): string | undefined {
  const isProd = process.env.NODE_ENV === "production";
  if (scope === "settings") {
    const raw = firstNonEmpty([
      process.env.SETTINGS_NAMESPACE,
      process.env.NEXT_DIST_NAMESPACE,
      !isProd ? process.env.PORT : undefined
    ]);
    return raw ? sanitizeNamespace(raw) : undefined;
  }

  const raw = firstNonEmpty([
    process.env.AUTOMATION_NAMESPACE,
    process.env.SETTINGS_NAMESPACE,
    process.env.NEXT_DIST_NAMESPACE,
    !isProd ? process.env.PORT : undefined
  ]);
  return raw ? sanitizeNamespace(raw) : undefined;
}

export function scopedUserId(
  userId: string | undefined,
  scope: "settings" | "automation"
): string | undefined {
  const base = String(userId || "").trim();
  if (!base) {
    return undefined;
  }
  const namespace = resolveStorageNamespace(scope);
  if (!namespace) {
    return base;
  }
  return `${base}::${namespace}`;
}

