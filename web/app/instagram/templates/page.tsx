import { InstagramTemplatesClient } from "@/components/instagram-templates-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramTemplatesPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <InstagramTemplatesClient />;
}
