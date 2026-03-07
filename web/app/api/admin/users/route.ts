import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminUserId } from "@/lib/auth-server";
import {
  createCodeAccessUser,
  deleteUserAccount,
  issueUserAccessCode,
  listUserAccounts,
  updateUserAccess
} from "@/lib/user-access";

export const runtime = "nodejs";

const updateSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean().optional(),
  expiresAt: z.union([z.string().datetime(), z.literal(""), z.null()]).optional(),
  role: z.enum(["user", "super_admin"]).optional(),
  issueAccessCode: z.boolean().optional()
});

const deleteSchema = z.object({
  userId: z.string().min(1)
});

const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  expiresAt: z.union([z.string().datetime(), z.literal(""), z.null()]).optional()
});

export async function GET(): Promise<NextResponse> {
  await requireSuperAdminUserId();
  const users = await listUserAccounts();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminUserId = await requireSuperAdminUserId();
  try {
    const body = await request.json().catch(() => ({}));
    const payload = createSchema.parse(body);
    const result = await createCodeAccessUser({
      name: payload.name,
      expiresAt: payload.expiresAt,
      createdByUserId: adminUserId
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const adminUserId = await requireSuperAdminUserId();
  try {
    const body = await request.json().catch(() => ({}));
    const payload = updateSchema.parse(body);
    const user = await updateUserAccess({
      userId: payload.userId,
      isActive: payload.isActive,
      expiresAt: payload.expiresAt,
      role: payload.role,
      actorUserId: adminUserId
    });
    if (payload.issueAccessCode) {
      const reissued = await issueUserAccessCode({
        userId: payload.userId,
        createdByUserId: adminUserId,
        expiresAt: payload.expiresAt
      });
      return NextResponse.json(reissued);
    }
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const adminUserId = await requireSuperAdminUserId();
  try {
    const body = await request.json().catch(() => ({}));
    const payload = deleteSchema.parse(body);
    await deleteUserAccount({
      userId: payload.userId,
      actorUserId: adminUserId
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
