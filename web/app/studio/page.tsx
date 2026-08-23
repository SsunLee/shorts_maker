import { CinematicStudioClient } from "@/components/cinematic-studio-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function StudioPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return <CinematicStudioClient />;
}
