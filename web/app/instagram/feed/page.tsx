import { InstagramFeedClient } from "@/components/instagram-feed-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramFeedPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <InstagramFeedClient />;
}
