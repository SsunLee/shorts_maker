import { InstagramWorkflowBar } from "@/components/instagram-workflow-bar";

export default function InstagramLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <InstagramWorkflowBar />
      {children}
    </section>
  );
}
