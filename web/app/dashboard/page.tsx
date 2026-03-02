import { DashboardClient } from "@/components/dashboard-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-4">
      <DashboardClient />
    </section>
  );
}
