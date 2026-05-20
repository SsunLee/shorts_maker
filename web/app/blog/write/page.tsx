import { BlogWriteClient } from "@/components/blog-write-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogWritePage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <BlogWriteClient />;
}
