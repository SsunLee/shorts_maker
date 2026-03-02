import { IdeasClient } from "@/components/ideas-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function IdeasPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-4">
      <IdeasClient />
    </section>
  );
}
