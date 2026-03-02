import { LongformToShortsClient } from "@/components/longform-to-shorts-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function LongformToShortsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <LongformToShortsClient />;
}
