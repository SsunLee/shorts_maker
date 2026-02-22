import type { Metadata } from "next";
import "@/app/globals.css";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "Shorts Maker",
  description: "Generate and publish short-form videos with OpenAI + FFmpeg."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen bg-background text-foreground">
          <AppNav />
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1680px] px-4 pb-8 pt-4 sm:px-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
