import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/user-access";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ authenticated: false, isSuperAdmin: false });
  }

  const email = String(session.user.email || "").trim();
  return NextResponse.json({
    authenticated: true,
    email,
    name: session.user.name || undefined,
    isSuperAdmin: isSuperAdminEmail(email)
  });
}

