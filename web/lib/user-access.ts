import { prisma } from "@/lib/prisma";

export interface UserAccessStatus {
  allowed: boolean;
  reason?: "inactive" | "expired";
}

export interface UserAccountRecord {
  userId: string;
  email?: string;
  name?: string;
  role: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

function parseEmailAllowList(raw: string | undefined): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdminEmail(email: string | undefined): boolean {
  const value = String(email || "").trim().toLowerCase();
  if (!value) {
    return false;
  }
  const direct = parseEmailAllowList(process.env.SUPER_ADMIN_EMAILS);
  const clientVisible = parseEmailAllowList(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS);
  return direct.has(value) || clientVisible.has(value);
}

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("does not exist") ||
      error.message.includes("Unknown arg") ||
      error.message.includes("P2021"))
  );
}

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function mapAccount(row: {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserAccountRecord {
  return {
    userId: row.userId,
    email: row.email || undefined,
    name: row.name || undefined,
    role: row.role,
    isActive: row.isActive,
    expiresAt: toIso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isEmailLikeId(value: string): boolean {
  return value.includes("@");
}

export async function ensureUserAccount(args: {
  userId: string;
  email?: string;
  name?: string;
}): Promise<void> {
  if (!prisma) {
    return;
  }

  try {
    const normalizedEmail = String(args.email || "").trim().toLowerCase();
    const shouldMigrateLegacyEmailId =
      normalizedEmail && normalizedEmail !== args.userId.toLowerCase();

    if (shouldMigrateLegacyEmailId) {
      const legacy = await prisma.userAccount.findUnique({
        where: { userId: normalizedEmail }
      });

      if (legacy) {
        await prisma.userAccount.upsert({
          where: { userId: args.userId },
          update: {
            email: args.email || legacy.email || null,
            name: args.name || legacy.name || null,
            role: legacy.role,
            isActive: legacy.isActive,
            expiresAt: legacy.expiresAt
          },
          create: {
            userId: args.userId,
            email: args.email || legacy.email || null,
            name: args.name || legacy.name || null,
            role: legacy.role || (isSuperAdminEmail(args.email) ? "super_admin" : "user"),
            isActive: legacy.isActive,
            expiresAt: legacy.expiresAt
          }
        });
        await prisma.userAccount.delete({
          where: { userId: normalizedEmail }
        });
        return;
      }
    }

    await prisma.userAccount.upsert({
      where: { userId: args.userId },
      update: {
        email: args.email || null,
        name: args.name || null
      },
      create: {
        userId: args.userId,
        email: args.email || null,
        name: args.name || null,
        role: isSuperAdminEmail(args.email) ? "super_admin" : "user",
        isActive: true
      }
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
}

export async function getUserAccessStatus(args: {
  userId: string;
  email?: string;
  name?: string;
}): Promise<UserAccessStatus> {
  if (!prisma) {
    return { allowed: true };
  }

  try {
    await ensureUserAccount(args);
    const row = await prisma.userAccount.findUnique({
      where: { userId: args.userId }
    });
    if (!row) {
      return { allowed: true };
    }
    if (!row.isActive) {
      return { allowed: false, reason: "inactive" };
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return { allowed: false, reason: "expired" };
    }
    return { allowed: true };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { allowed: true };
    }
    throw error;
  }
}

export async function listUserAccounts(): Promise<UserAccountRecord[]> {
  if (!prisma) {
    return [];
  }
  try {
    const rows = await prisma.userAccount.findMany({
      orderBy: { updatedAt: "desc" }
    });
    const grouped = new Map<string, (typeof rows)[number]>();

    rows.forEach((row) => {
      const key = String(row.email || row.userId).trim().toLowerCase();
      const prev = grouped.get(key);
      if (!prev) {
        grouped.set(key, row);
        return;
      }

      // Prefer stable provider subject ID over legacy email-as-id rows.
      const prevIsEmailId = isEmailLikeId(prev.userId);
      const nextIsEmailId = isEmailLikeId(row.userId);
      if (prevIsEmailId && !nextIsEmailId) {
        grouped.set(key, row);
        return;
      }
      if (!prevIsEmailId && nextIsEmailId) {
        return;
      }

      if (row.updatedAt.getTime() > prev.updatedAt.getTime()) {
        grouped.set(key, row);
      }
    });

    return Array.from(grouped.values()).map(mapAccount);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function updateUserAccess(args: {
  userId: string;
  isActive?: boolean;
  expiresAt?: string | null;
}): Promise<UserAccountRecord> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for admin user management.");
  }
  const userId = String(args.userId || "").trim();
  if (!userId) {
    throw new Error("userId is required.");
  }

  let parsedExpiresAt: Date | null | undefined;
  if (args.expiresAt === null || args.expiresAt === "") {
    parsedExpiresAt = null;
  } else if (typeof args.expiresAt === "string") {
    const value = new Date(args.expiresAt);
    if (!Number.isFinite(value.getTime())) {
      throw new Error("expiresAt must be a valid ISO datetime.");
    }
    parsedExpiresAt = value;
  }

  try {
    const row = await prisma.userAccount.upsert({
      where: { userId },
      update: {
        isActive: typeof args.isActive === "boolean" ? args.isActive : undefined,
        expiresAt: parsedExpiresAt
      },
      create: {
        userId,
        isActive: typeof args.isActive === "boolean" ? args.isActive : true,
        expiresAt: parsedExpiresAt ?? null,
        role: "user"
      }
    });
    return mapAccount(row);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Run `npx prisma db push` first (UserAccount table is missing).");
    }
    throw error;
  }
}
