"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AccessCodeSignInFormProps {
  callbackUrl?: string;
}

export function AccessCodeSignInForm({
  callbackUrl = "/create"
}: AccessCodeSignInFormProps): React.JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) {
      setError("접속 코드를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      const result = await signIn("access-code", {
        code: normalized,
        callbackUrl,
        redirect: false
      });
      if (!result || result.error) {
        setError("유효한 접속 코드가 아닙니다.");
        return;
      }
      router.push(result.url || callbackUrl);
      router.refresh();
    } catch {
      setError("코드 로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
      <div className="space-y-2">
        <p className="text-sm font-medium">코드로 접속하기</p>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="예: E30A12E"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="outline" className="w-full" disabled={submitting}>
        {submitting ? "확인 중..." : "코드로 접속하기"}
      </Button>
    </form>
  );
}
