import { InstagramIdeasClient } from "@/components/instagram-ideas-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramIdeasPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">Instagram 아이디어</h1>
      <p className="text-sm text-muted-foreground">
        인스타그램 피드/릴스용 소재를 시트에서 검색하고 생성합니다.
      </p>
      <InstagramIdeasClient />
    </section>
  );
}
