import { requireSuperAdminUserId } from "@/lib/auth-server";
import { AdminUsersClient } from "@/components/admin-users-client";

export default async function AdminUsersPage(): Promise<React.JSX.Element> {
  const currentUserId = await requireSuperAdminUserId();
  return (
    <section className="mx-auto w-full max-w-[1320px] space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">관리자 · 사용자/접속 코드 관리</h1>
      <p className="text-sm text-muted-foreground">
        사용자 활성/만료 관리와 코드 로그인용 접속 코드를 발급합니다.
      </p>
      <AdminUsersClient currentUserId={currentUserId} />
    </section>
  );
}
