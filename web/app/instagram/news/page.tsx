import { InstagramNewsClient } from "@/components/instagram-news-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramNewsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">뉴스 정보 가져오기</h1>
      <p className="text-sm text-muted-foreground">
        Google News 최신 헤드라인을 국가별로 조회하고 바로 확인합니다.
      </p>
      <InstagramNewsClient />
    </section>
  );
}
