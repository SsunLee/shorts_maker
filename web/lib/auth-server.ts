import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUserAccessStatusReadOnly, isSuperAdminUser } from "@/lib/user-access";

type AccessCacheValue = {
  allowed: boolean;
  reason?: "inactive" | "expired";
  expiresAtMs: number;
};

type SuperAdminCacheValue = {
  allowed: boolean;
  expiresAtMs: number;
};

const ACCESS_CACHE_TTL_MS = Math.max(
  1000,
  Number.parseInt(String(process.env.AUTH_ACCESS_CACHE_TTL_MS || "60000"), 10) || 60000
);
const SUPER_ADMIN_CACHE_TTL_MS = Math.max(
  1000,
  Number.parseInt(String(process.env.AUTH_SUPER_ADMIN_CACHE_TTL_MS || "60000"), 10) || 60000
);

const accessCache = new Map<string, AccessCacheValue>();
const superAdminCache = new Map<string, SuperAdminCacheValue>();

function normalizeKey(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function buildAccessCacheKey(args: { userId?: string; email?: string }): string {
  return `${normalizeKey(args.userId)}|${normalizeKey(args.email)}`;
}

function readAccessCache(key: string): { allowed: boolean; reason?: "inactive" | "expired" } | undefined {
  const cached = accessCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAtMs <= Date.now()) {
    accessCache.delete(key);
    return undefined;
  }
  return {
    allowed: cached.allowed,
    reason: cached.reason
  };
}

function writeAccessCache(
  key: string,
  value: { allowed: boolean; reason?: "inactive" | "expired" }
): void {
  accessCache.set(key, {
    ...value,
    expiresAtMs: Date.now() + ACCESS_CACHE_TTL_MS
  });
}

function buildSuperAdminCacheKey(args: { userId?: string; email?: string }): string {
  return `${normalizeKey(args.userId)}|${normalizeKey(args.email)}`;
}

function readSuperAdminCache(key: string): boolean | undefined {
  const cached = superAdminCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAtMs <= Date.now()) {
    superAdminCache.delete(key);
    return undefined;
  }
  return cached.allowed;
}

function writeSuperAdminCache(key: string, allowed: boolean): void {
  superAdminCache.set(key, {
    allowed,
    expiresAtMs: Date.now() + SUPER_ADMIN_CACHE_TTL_MS
  });
}

async function resolveUserAccess(args: {
  userId: string;
  email?: string;
}): Promise<{ allowed: boolean; reason?: "inactive" | "expired" }> {
  const cacheKey = buildAccessCacheKey(args);
  const cached = readAccessCache(cacheKey);
  if (cached) {
    return cached;
  }
  const access = await getUserAccessStatusReadOnly(args);
  writeAccessCache(cacheKey, access);
  return access;
}

export async function getAuthenticatedUserId(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || session?.user?.email || undefined;
  const normalizedUserId =
    typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
  if (!normalizedUserId) {
    return undefined;
  }

  const access = await resolveUserAccess({
    userId: normalizedUserId,
    email: session?.user?.email || undefined
  });
  if (!access.allowed) {
    return undefined;
  }
  return normalizedUserId;
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || session?.user?.email || undefined;
  const normalizedUserId =
    typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
  if (!normalizedUserId) {
    redirect("/auth/signin");
  }

  const access = await resolveUserAccess({
    userId: normalizedUserId,
    email: session?.user?.email || undefined
  });
  if (!access.allowed) {
    redirect("/auth/blocked");
  }
  return normalizedUserId;
}

export async function requireSuperAdminUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim();
  const userId = String(session?.user?.id || session?.user?.email || "").trim();

  if (!userId) {
    redirect("/auth/signin");
  }
  const cacheKey = buildSuperAdminCacheKey({ userId, email });
  const cached = readSuperAdminCache(cacheKey);
  const allowed =
    typeof cached === "boolean" ? cached : await isSuperAdminUser({ userId, email });
  if (typeof cached !== "boolean") {
    writeSuperAdminCache(cacheKey, allowed);
  }
  if (!allowed) {
    redirect("/dashboard");
  }
  return userId;
}

