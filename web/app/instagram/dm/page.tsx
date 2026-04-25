import { InstagramDmClient } from "@/components/instagram-dm-client";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function InstagramDmPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">인스타 DM 자동 전송</h1>
      <p className="text-sm text-muted-foreground">
        데이터 테이블 + 변수 템플릿 기반으로 DM을 안전하게 순차 발송하고 결과를 추적합니다.
      </p>
      <InstagramDmClient />
    </section>
  );
}

