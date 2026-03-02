import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUserAccessStatus, isSuperAdminEmail } from "@/lib/user-access";

export async function getAuthenticatedUserId(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email || session?.user?.id || undefined;
  const normalizedUserId =
    typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
  if (!normalizedUserId) {
    return undefined;
  }

  const access = await getUserAccessStatus({
    userId: normalizedUserId,
    email: session?.user?.email || undefined,
    name: session?.user?.name || undefined
  });
  if (!access.allowed) {
    return undefined;
  }
  return normalizedUserId;
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email || session?.user?.id || undefined;
  const normalizedUserId =
    typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
  if (!normalizedUserId) {
    redirect("/auth/signin");
  }

  const access = await getUserAccessStatus({
    userId: normalizedUserId,
    email: session?.user?.email || undefined,
    name: session?.user?.name || undefined
  });
  if (!access.allowed) {
    redirect("/auth/blocked");
  }
  return normalizedUserId;
}

export async function requireSuperAdminUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim();
  const userId = String(session?.user?.email || session?.user?.id || "").trim();

  if (!userId) {
    redirect("/auth/signin");
  }
  if (!isSuperAdminEmail(email)) {
    redirect("/dashboard");
  }
  return userId;
}

