"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

interface GoogleSignInButtonProps {
  callbackUrl?: string;
}

export function GoogleSignInButton({
  callbackUrl = "/create"
}: GoogleSignInButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      className="w-full"
      onClick={() => void signIn("google", { callbackUrl })}
    >
      Google로 로그인
    </Button>
  );
}

