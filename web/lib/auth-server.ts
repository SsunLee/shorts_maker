import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export async function getAuthenticatedUserId(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || session?.user?.email || undefined;
  return typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : undefined;
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/auth/signin");
  }
  return userId;
}

