import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminUserId } from "@/lib/auth-server";
import { listUserAccounts, updateUserAccess } from "@/lib/user-access";

export const runtime = "nodejs";

const updateSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean().optional(),
  expiresAt: z.union([z.string().datetime(), z.literal(""), z.null()]).optional()
});

export async function GET(): Promise<NextResponse> {
  await requireSuperAdminUserId();
  const users = await listUserAccounts();
  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  await requireSuperAdminUserId();
  try {
    const body = await request.json().catch(() => ({}));
    const payload = updateSchema.parse(body);
    const user = await updateUserAccess({
      userId: payload.userId,
      isActive: payload.isActive,
      expiresAt: payload.expiresAt
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

