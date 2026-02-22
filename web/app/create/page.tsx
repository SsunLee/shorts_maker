import { CreateVideoForm } from "@/components/create-video-form";

export default function CreatePage(): React.JSX.Element {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Create</h1>
      <CreateVideoForm />
    </section>
  );
}
