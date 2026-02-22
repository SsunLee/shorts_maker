import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage(): React.JSX.Element {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm />
    </section>
  );
}
