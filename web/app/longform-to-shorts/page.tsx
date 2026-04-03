import { redirect } from "next/navigation";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function LongformToShortsPage(): Promise<never> {
  await requireAuthenticatedUserId();
  redirect("/create");
}
