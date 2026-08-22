import { InstagramFeedClient } from "@/components/instagram-feed-client";
import { InstagramSchedulePanel } from "@/components/instagram-schedule-panel";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramFeedPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <div className="space-y-4">
      <InstagramFeedClient />
      <InstagramSchedulePanel />
    </div>
  );
}
