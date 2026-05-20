import { BlogDashboardClient } from "@/components/blog-dashboard-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogDashboardPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <BlogDashboardClient />;
}
