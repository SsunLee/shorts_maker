import { CreateVideoForm } from "@/components/create-video-form";

export default function CreatePage(): React.JSX.Element {
  return (
    <section className="mx-auto w-full max-w-[1320px] space-y-4">
      <h1 className="text-2xl font-bold">영상 생성</h1>
      <CreateVideoForm />
    </section>
  );
}
