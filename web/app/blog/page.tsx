import Link from "next/link";
import { BarChart3, FileText, ListChecks, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUserId } from "@/lib/auth-server";

export default async function BlogPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedUserId();
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">블로그</h1>
        <p className="text-sm text-muted-foreground">글 양식을 저장하고, 뉴스/자료를 바탕으로 블로그 글을 작성합니다.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Dashboard
            </CardTitle>
            <CardDescription>아이디어, 종목 큐, 작성 draft 상태를 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/blog/dashboard">Dashboard 열기</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              아이디어
            </CardTitle>
            <CardDescription>키워드나 종목을 완성형 Markdown 글 초안으로 만듭니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/blog/ideas">아이디어 생성</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              종목 큐
            </CardTitle>
            <CardDescription>KOSPI/KOSDAQ 종목을 순서대로 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/blog/stocks">큐 관리</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              템플릿
            </CardTitle>
            <CardDescription>뉴스, 일상 등 반복해서 쓰는 글 양식을 저장합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/blog/templates">템플릿 관리</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5" />
              글작성
            </CardTitle>
            <CardDescription>템플릿을 적용한 작성 결과를 만들고 복사합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/blog/write">글작성 열기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
