"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface UserAccountItem {
  userId: string;
  email?: string;
  name?: string;
  role: string;
  isActive: boolean;
  expiresAt?: string;
  accessCodeHint?: string;
  accessCodeIssuedAt?: string;
  accessCodeLastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  users?: UserAccountItem[];
  error?: string;
}

interface UserMutationResponse {
  user?: UserAccountItem;
  accessCode?: string;
  error?: string;
}

interface AdminUsersClientProps {
  currentUserId: string;
}

function toDatetimeLocal(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function maskCode(code: string): string {
  if (code.length <= 4) {
    return "•".repeat(code.length);
  }
  return `${code.slice(0, 2)}${"•".repeat(Math.max(1, code.length - 4))}${code.slice(-2)}`;
}

export function AdminUsersClient({
  currentUserId
}: AdminUsersClientProps): React.JSX.Element {
  const [users, setUsers] = useState<UserAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [savingUserId, setSavingUserId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [draftExpireByUser, setDraftExpireByUser] = useState<Record<string, string>>({});
  const [newUserName, setNewUserName] = useState("");
  const [newUserExpiresAt, setNewUserExpiresAt] = useState("");
  const [search, setSearch] = useState("");
  const [latestIssuedCode, setLatestIssuedCode] = useState<{
    userId: string;
    ownerLabel: string;
    code: string;
  }>();
  const [showLatestIssuedCode, setShowLatestIssuedCode] = useState(false);

  async function load(): Promise<void> {
    setError(undefined);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await parseJson<ListResponse>(response);
    if (!response.ok) {
      throw new Error(data.error || "사용자 목록을 불러오지 못했습니다.");
    }
    const nextUsers = data.users || [];
    setUsers(nextUsers);
    setDraftExpireByUser((prev) => {
      const next: Record<string, string> = {};
      nextUsers.forEach((user) => {
        next[user.userId] = prev[user.userId] ?? toDatetimeLocal(user.expiresAt);
      });
      return next;
    });
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function saveUser(
    user: UserAccountItem,
    patch: { isActive?: boolean; expiresAt?: string | null; role?: "user" | "super_admin" }
  ): Promise<void> {
    setSavingUserId(user.userId);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          ...patch
        })
      });
      const data = await parseJson<UserMutationResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "사용자 갱신에 실패했습니다.");
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unknown error");
    } finally {
      setSavingUserId(undefined);
    }
  }

  async function createUser(): Promise<void> {
    setCreating(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName.trim() || undefined,
          expiresAt: fromDatetimeLocal(newUserExpiresAt)
        })
      });
      const data = await parseJson<UserMutationResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "사용자 추가에 실패했습니다.");
      }
      const ownerLabel = data.user?.name || data.user?.email || data.user?.userId || "새 사용자";
      setLatestIssuedCode({
        userId: data.user?.userId || "",
        ownerLabel,
        code: data.accessCode || ""
      });
      setShowLatestIssuedCode(true);
      setNewUserName("");
      setNewUserExpiresAt("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function reissueCode(user: UserAccountItem): Promise<void> {
    setSavingUserId(user.userId);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          issueAccessCode: true
        })
      });
      const data = await parseJson<UserMutationResponse>(response);
      if (!response.ok) {
        throw new Error(data.error || "접속 코드 발급에 실패했습니다.");
      }
      setLatestIssuedCode({
        userId: user.userId,
        ownerLabel: user.name || user.email || user.userId,
        code: data.accessCode || ""
      });
      setShowLatestIssuedCode(true);
      await load();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Unknown error");
    } finally {
      setSavingUserId(undefined);
    }
  }

  async function deleteUser(user: UserAccountItem): Promise<void> {
    const confirmed = window.confirm(
      `${user.name || user.email || user.userId} 사용자를 삭제할까요?\n관련 설정/스케줄/템플릿/접속 코드도 함께 삭제됩니다.`
    );
    if (!confirmed) {
      return;
    }

    setSavingUserId(user.userId);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId
        })
      });
      const data = await parseJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "사용자 삭제에 실패했습니다.");
      }
      if (latestIssuedCode?.userId === user.userId) {
        setLatestIssuedCode(undefined);
      }
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unknown error");
    } finally {
      setSavingUserId(undefined);
    }
  }

  async function copyCode(code: string): Promise<void> {
    if (!code || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      setError("코드 복사에 실패했습니다.");
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return users;
    }
    return users.filter((user) =>
      [user.name, user.email, user.userId, user.role]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(keyword))
    );
  }, [users, search]);

  const summary = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((user) => user.isActive).length,
      inactive: users.filter((user) => !user.isActive).length,
      superAdmins: users.filter((user) => user.role === "super_admin").length
    };
  }, [users]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">전체 사용자</p>
          <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">활성</p>
          <p className="mt-1 text-2xl font-semibold">{summary.active}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">비활성</p>
          <p className="mt-1 text-2xl font-semibold">{summary.inactive}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">super_admin</p>
          <p className="mt-1 text-2xl font-semibold">{summary.superAdmins}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-semibold">코드 기반 사용자 추가</p>
            <p className="text-sm text-muted-foreground">
              새 사용자를 만들면 바로 로그인 가능한 접속 코드가 발급됩니다.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            새로고침
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr,220px,auto]">
          <Input
            value={newUserName}
            onChange={(event) => setNewUserName(event.target.value)}
            placeholder="사용자 표시명(선택)"
          />
          <Input
            type="datetime-local"
            value={newUserExpiresAt}
            onChange={(event) => setNewUserExpiresAt(event.target.value)}
          />
          <Button type="button" onClick={() => void createUser()} disabled={creating}>
            {creating ? "발급 중..." : "사용자 추가하기"}
          </Button>
        </div>
        {latestIssuedCode ? (
          <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-sm font-medium">{latestIssuedCode.ownerLabel} 접속 코드</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-background px-3 py-1.5 text-base font-semibold tracking-[0.22em]">
                {showLatestIssuedCode ? latestIssuedCode.code : maskCode(latestIssuedCode.code)}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowLatestIssuedCode((prev) => !prev)}
              >
                {showLatestIssuedCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{showLatestIssuedCode ? "코드 숨기기" : "코드 보이기"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyCode(latestIssuedCode.code)}
              >
                클립보드 복사
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              보안상 기존 코드는 복구할 수 없습니다. 다시 확인하려면 `새 코드 발급`을 사용하세요.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold">사용자 관리</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름, 이메일, userId 검색"
              className="w-[240px]"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">User ID</th>
                <th className="px-3 py-2">권한</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">접속 코드</th>
                <th className="px-3 py-2">마지막 코드 사용</th>
                <th className="px-3 py-2">만료 시각</th>
                <th className="px-3 py-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isCurrentUser = user.userId === currentUserId;
                const canChangeRole = !isCurrentUser;
                const canDeactivate = !isCurrentUser;
                const canDelete = !isCurrentUser;

                return (
                  <tr key={user.userId} className="border-t align-middle">
                    <td className="px-3 py-2">{user.name || "-"}</td>
                    <td className="px-3 py-2">{user.email || "-"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2" title={user.userId}>
                      {user.userId}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={user.role === "super_admin" ? "super_admin" : "user"}
                        onValueChange={(value) =>
                          void saveUser(user, { role: value === "super_admin" ? "super_admin" : "user" })
                        }
                        disabled={savingUserId === user.userId || !canChangeRole}
                      >
                        <SelectTrigger className="w-[150px] bg-card dark:bg-zinc-900">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="super_admin">super_admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {isCurrentUser ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">현재 로그인 계정</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={user.isActive}
                          onCheckedChange={(checked) => void saveUser(user, { isActive: checked })}
                          disabled={savingUserId === user.userId || !canDeactivate}
                        />
                        <span>{user.isActive ? "활성" : "비활성"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <p>{user.accessCodeHint || "-"}</p>
                        <p className="text-xs text-muted-foreground">
                          발급: {formatDateTime(user.accessCodeIssuedAt)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2">{formatDateTime(user.accessCodeLastUsedAt)}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="datetime-local"
                        value={draftExpireByUser[user.userId] || ""}
                        onChange={(event) =>
                          setDraftExpireByUser((prev) => ({
                            ...prev,
                            [user.userId]: event.target.value
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingUserId === user.userId}
                          onClick={() =>
                            void saveUser(user, {
                              expiresAt: fromDatetimeLocal(draftExpireByUser[user.userId] || "")
                            })
                          }
                        >
                          만료 저장
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingUserId === user.userId}
                          onClick={() => {
                            setDraftExpireByUser((prev) => ({ ...prev, [user.userId]: "" }));
                            void saveUser(user, { expiresAt: null });
                          }}
                        >
                          만료 해제
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingUserId === user.userId}
                          onClick={() => void reissueCode(user)}
                        >
                          새 코드 발급
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={savingUserId === user.userId || !canDelete}
                          onClick={() => void deleteUser(user)}
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    조건에 맞는 사용자가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
