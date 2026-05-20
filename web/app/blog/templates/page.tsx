import { BlogTemplatesClient } from "@/components/blog-templates-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogTemplatesPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <BlogTemplatesClient />;
}
