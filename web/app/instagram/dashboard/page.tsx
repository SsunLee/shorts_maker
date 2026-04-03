import { InstagramDashboardClient } from "@/components/instagram-dashboard-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramDashboardPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <InstagramDashboardClient />;
}
