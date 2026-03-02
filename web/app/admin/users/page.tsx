import { requireSuperAdminUserId } from "@/lib/auth-server";
import { AdminUsersClient } from "@/components/admin-users-client";

export default async function AdminUsersPage(): Promise<React.JSX.Element> {
  await requireSuperAdminUserId();
  return (
    <section className="mx-auto w-full max-w-[1320px] space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">관리자 · 사용자 만료 관리</h1>
      <p className="text-sm text-muted-foreground">
        사용자 계정의 활성/비활성 및 만료 시각을 설정합니다.
      </p>
      <AdminUsersClient />
    </section>
  );
}

