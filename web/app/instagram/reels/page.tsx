import { InstagramReelsPlaceholder } from "@/components/instagram-reels-placeholder";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramReelsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <InstagramReelsPlaceholder />;
}
