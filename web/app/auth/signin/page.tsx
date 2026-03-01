import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleSignInButton } from "@/components/google-signin-button";
import { authOptions } from "@/lib/auth";

export default async function SignInPage(): Promise<React.JSX.Element> {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/create");
  }

  const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>Google 계정으로 로그인 후 작업을 시작하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasGoogleOAuth ? (
            <GoogleSignInButton />
          ) : (
            <p className="text-sm text-destructive">
              GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수가 설정되지 않았습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

