import { BlogStockQueueClient } from "@/components/blog-stock-queue-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogStocksPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <BlogStockQueueClient />;
}
