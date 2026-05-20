import { BlogIdeasClient } from "@/components/blog-ideas-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogIdeasPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <BlogIdeasClient />;
}
