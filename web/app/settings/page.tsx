import { SettingsForm } from "@/components/settings-form";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm />
    </section>
  );
}
