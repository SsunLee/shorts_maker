import { TemplatesClient } from "@/components/templates-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function TemplatesPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <TemplatesClient />;
}
