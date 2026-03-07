import { createHash, randomBytes, randomUUID } from "crypto";
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
  accessCodeHint?: string;
  accessCodeIssuedAt?: string;
  accessCodeLastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function isDbSuperAdminRole(role: string | null | undefined): boolean {
  return String(role || "").trim().toLowerCase() === "super_admin";
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

export async function isSuperAdminUser(args: {
  userId?: string;
  email?: string;
}): Promise<boolean> {
  if (isSuperAdminEmail(args.email)) {
    return true;
  }

  if (!prisma) {
    return false;
  }

  const normalizedUserId = String(args.userId || "").trim();
  const normalizedEmail = String(args.email || "").trim().toLowerCase();

  try {
    if (normalizedUserId) {
      const direct = await prisma.userAccount.findUnique({
        where: { userId: normalizedUserId },
        select: { role: true }
      });
      if (direct?.role === "super_admin") {
        return true;
      }
    }

    if (normalizedEmail) {
      const byEmail = await prisma.userAccount.findFirst({
        where: { email: normalizedEmail },
        select: { role: true }
      });
      if (byEmail?.role === "super_admin") {
        return true;
      }
    }

    return false;
  } catch (error) {
    if (isMissingTableError(error)) {
      return false;
    }
    throw error;
  }
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
  accessCode?: {
    codeHint: string;
    createdAt: Date;
    lastUsedAt: Date | null;
  } | null;
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
    accessCodeHint: row.accessCode?.codeHint || undefined,
    accessCodeIssuedAt: toIso(row.accessCode?.createdAt),
    accessCodeLastUsedAt: toIso(row.accessCode?.lastUsedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isEmailLikeId(value: string): boolean {
  return value.includes("@");
}

const ACCESS_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeAccessCode(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hashAccessCode(value: string): string {
  return createHash("sha256")
    .update(`shorts-maker:${normalizeAccessCode(value)}`)
    .digest("hex");
}

function createAccessCode(length = 7): string {
  const bytes = randomBytes(length * 2);
  let code = "";
  for (const byte of bytes) {
    code += ACCESS_CODE_CHARS[byte % ACCESS_CODE_CHARS.length];
    if (code.length >= length) {
      return code;
    }
  }
  return code.padEnd(length, "A");
}

function toAccessCodeHint(value: string): string {
  const normalized = normalizeAccessCode(value);
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

function parseExpiresAtInput(value: string | null | undefined): Date | null | undefined {
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("expiresAt must be a valid ISO datetime.");
  }
  return parsed;
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
      include: {
        accessCode: true
      },
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
  role?: string;
  actorUserId?: string;
}): Promise<UserAccountRecord> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for admin user management.");
  }
  const userId = String(args.userId || "").trim();
  if (!userId) {
    throw new Error("userId is required.");
  }

  const parsedExpiresAt = parseExpiresAtInput(args.expiresAt);
  const normalizedRole =
    typeof args.role === "string" && args.role.trim().length > 0 ? args.role.trim() : undefined;

  try {
    const existing = await prisma.userAccount.findUnique({
      where: { userId },
      select: { role: true, isActive: true }
    });
    const currentRole = existing?.role || "user";

    if (args.actorUserId && args.actorUserId === userId) {
      if (typeof args.isActive === "boolean" && !args.isActive) {
        throw new Error("현재 로그인한 관리자 계정은 비활성화할 수 없습니다.");
      }
      if (normalizedRole && !isDbSuperAdminRole(normalizedRole)) {
        throw new Error("현재 로그인한 관리자 계정의 super_admin 권한은 해제할 수 없습니다.");
      }
    }

    const roleWillChange =
      normalizedRole !== undefined && normalizedRole.trim().toLowerCase() !== currentRole.toLowerCase();
    if (isDbSuperAdminRole(currentRole) && roleWillChange && !isDbSuperAdminRole(normalizedRole)) {
      const superAdminCount = await prisma.userAccount.count({
        where: { role: "super_admin" }
      });
      if (superAdminCount <= 1) {
        throw new Error("마지막 super_admin 권한은 해제할 수 없습니다.");
      }
    }

    await prisma.userAccount.upsert({
      where: { userId },
      update: {
        isActive: typeof args.isActive === "boolean" ? args.isActive : undefined,
        expiresAt: parsedExpiresAt,
        role: normalizedRole
      },
      create: {
        userId,
        isActive: typeof args.isActive === "boolean" ? args.isActive : true,
        expiresAt: parsedExpiresAt ?? null,
        role: normalizedRole || "user"
      }
    });
    const row = await prisma.userAccount.findUnique({
      where: { userId },
      include: {
        accessCode: true
      }
    });
    if (!row) {
      throw new Error("사용자 계정을 찾지 못했습니다.");
    }
    return mapAccount(row);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Run `npx prisma db push` first (UserAccount table is missing).");
    }
    throw error;
  }
}

export async function deleteUserAccount(args: {
  userId: string;
  actorUserId?: string;
}): Promise<void> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for admin user management.");
  }

  const userId = String(args.userId || "").trim();
  if (!userId) {
    throw new Error("userId is required.");
  }
  if (args.actorUserId && args.actorUserId === userId) {
    throw new Error("현재 로그인한 관리자 계정은 삭제할 수 없습니다.");
  }

  try {
    const existing = await prisma.userAccount.findUnique({
      where: { userId },
      select: { role: true }
    });
    if (existing && isDbSuperAdminRole(existing.role)) {
      const superAdminCount = await prisma.userAccount.count({
        where: { role: "super_admin" }
      });
      if (superAdminCount <= 1) {
        throw new Error("마지막 super_admin 계정은 삭제할 수 없습니다.");
      }
    }

    await prisma.$transaction([
      prisma.userAccessCode.deleteMany({ where: { userId } }),
      prisma.userSettings.deleteMany({ where: { userId } }),
      prisma.userAutomationTemplateCatalog.deleteMany({ where: { userId } }),
      prisma.userAutomationScheduleState.deleteMany({ where: { userId } }),
      prisma.userWorkflowCatalog.deleteMany({ where: { userId } }),
      prisma.userAccount.deleteMany({ where: { userId } })
    ]);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Run `npx prisma db push` first (required user tables are missing).");
    }
    throw error;
  }
}

async function generateUniqueAccessCode(): Promise<string> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for access code management.");
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = createAccessCode();
    const existing = await prisma.userAccessCode.findUnique({
      where: { codeHash: hashAccessCode(candidate) },
      select: { userId: true }
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("고유한 접속 코드를 생성하지 못했습니다. 다시 시도해 주세요.");
}

export async function issueUserAccessCode(args: {
  userId: string;
  createdByUserId?: string;
  expiresAt?: string | null;
}): Promise<{ user: UserAccountRecord; accessCode: string }> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for access code management.");
  }
  const userId = String(args.userId || "").trim();
  if (!userId) {
    throw new Error("userId is required.");
  }

  try {
    const account = await prisma.userAccount.findUnique({
      where: { userId },
      include: {
        accessCode: true
      }
    });
    if (!account) {
      throw new Error("사용자 계정을 먼저 생성해야 합니다.");
    }

    const accessCode = await generateUniqueAccessCode();
    const parsedExpiresAt = parseExpiresAtInput(args.expiresAt);
    const nextExpiresAt =
      parsedExpiresAt !== undefined
        ? parsedExpiresAt
        : account.accessCode?.expiresAt || account.expiresAt || null;

    await prisma.userAccessCode.upsert({
      where: { userId },
      update: {
        codeHash: hashAccessCode(accessCode),
        codeHint: toAccessCodeHint(accessCode),
        createdByUserId: args.createdByUserId || null,
        isActive: true,
        expiresAt: nextExpiresAt,
        lastUsedAt: null
      },
      create: {
        userId,
        codeHash: hashAccessCode(accessCode),
        codeHint: toAccessCodeHint(accessCode),
        createdByUserId: args.createdByUserId || null,
        isActive: true,
        expiresAt: nextExpiresAt
      }
    });

    const nextAccount = await prisma.userAccount.findUnique({
      where: { userId },
      include: {
        accessCode: true
      }
    });
    if (!nextAccount) {
      throw new Error("사용자 계정을 다시 불러오지 못했습니다.");
    }

    return {
      user: mapAccount(nextAccount),
      accessCode
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Run `npx prisma db push` first (UserAccessCode table is missing).");
    }
    throw error;
  }
}

export async function createCodeAccessUser(args: {
  name?: string;
  expiresAt?: string | null;
  createdByUserId?: string;
}): Promise<{ user: UserAccountRecord; accessCode: string }> {
  if (!prisma) {
    throw new Error("DATABASE_URL is required for admin user management.");
  }

  const parsedExpiresAt = parseExpiresAtInput(args.expiresAt);
  const trimmedName = String(args.name || "").trim();
  const userId = `code_${randomUUID().replace(/-/g, "")}`;

  try {
    await prisma.userAccount.create({
      data: {
        userId,
        name: trimmedName || null,
        role: "user",
        isActive: true,
        expiresAt: parsedExpiresAt ?? null
      }
    });
    return issueUserAccessCode({
      userId,
      createdByUserId: args.createdByUserId,
      expiresAt: args.expiresAt
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Run `npx prisma db push` first (UserAccount/UserAccessCode table is missing).");
    }
    throw error;
  }
}

export async function authenticateWithAccessCode(code: string): Promise<{
  userId: string;
  name?: string;
  email?: string;
} | null> {
  if (!prisma) {
    return null;
  }

  const normalizedCode = normalizeAccessCode(code);
  if (!normalizedCode) {
    return null;
  }

  try {
    const row = await prisma.userAccessCode.findUnique({
      where: { codeHash: hashAccessCode(normalizedCode) },
      include: {
        account: true
      }
    });
    if (!row || !row.isActive) {
      return null;
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (!row.account || !row.account.isActive) {
      return null;
    }
    if (row.account.expiresAt && row.account.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    await prisma.userAccessCode.update({
      where: { userId: row.userId },
      data: { lastUsedAt: new Date() }
    });

    return {
      userId: row.account.userId,
      name: row.account.name || undefined,
      email: row.account.email || undefined
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}
