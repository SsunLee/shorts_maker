import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserMenuVisibility, isSuperAdminUser } from "@/lib/user-access";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ authenticated: false, isSuperAdmin: false });
  }

  const email = String(session.user.email || "").trim();
  const userId = String(session.user.id || session.user.email || "").trim();
  const isSuperAdmin = await isSuperAdminUser({ userId, email });
  const menuVisibility = await getUserMenuVisibility({ userId, email });
  return NextResponse.json({
    authenticated: true,
    email,
    name: session.user.name || undefined,
    isSuperAdmin,
    menuVisibility
  });
}
