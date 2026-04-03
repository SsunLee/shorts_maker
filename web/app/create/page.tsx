import { CreateVideoForm } from "@/components/create-video-form";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function CreatePage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="mx-auto w-full max-w-[1320px] space-y-4">
      <h1 className="text-2xl font-bold">영상 생성 (단건)</h1>
      <CreateVideoForm />
    </section>
  );
}
