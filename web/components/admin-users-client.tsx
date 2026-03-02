"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface UserAccountItem {
  userId: string;
  email?: string;
  name?: string;
  role: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  users?: UserAccountItem[];
  error?: string;
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

export function AdminUsersClient(): React.JSX.Element {
  const [users, setUsers] = useState<UserAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [savingUserId, setSavingUserId] = useState<string>();
  const [draftExpireByUser, setDraftExpireByUser] = useState<Record<string, string>>({});

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

  async function saveUser(user: UserAccountItem, patch: { isActive?: boolean; expiresAt?: string | null }): Promise<void> {
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
      const data = await parseJson<{ user?: UserAccountItem; error?: string }>(response);
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

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">총 {users.length}명</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">User ID</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">활성</th>
              <th className="px-3 py-2">만료 시각</th>
              <th className="px-3 py-2">동작</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className="border-t align-middle">
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">{user.name || "-"}</td>
                <td className="max-w-[240px] truncate px-3 py-2" title={user.userId}>
                  {user.userId}
                </td>
                <td className="px-3 py-2">{user.role}</td>
                <td className="px-3 py-2">
                  <Switch
                    checked={user.isActive}
                    onCheckedChange={(checked) => void saveUser(user, { isActive: checked })}
                    disabled={savingUserId === user.userId}
                  />
                </td>
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
                  <div className="flex gap-2">
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

