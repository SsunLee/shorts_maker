import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BlockedPage(): React.JSX.Element {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>접근이 제한되었습니다</CardTitle>
          <CardDescription>
            계정이 비활성화되었거나 사용 기간이 만료되었습니다. 관리자에게 문의해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/auth/signin">로그인 화면으로</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

