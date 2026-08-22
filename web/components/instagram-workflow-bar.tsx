"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  {
    href: "/instagram/templates",
    label: "템플릿",
    detail: "화면 구성"
  },
  {
    href: "/instagram/ideas",
    label: "아이디어",
    detail: "소재 생성"
  },
  {
    href: "/instagram/feed",
    label: "피드",
    detail: "카드 작성 · 업로드"
  }
] as const;

export function InstagramWorkflowBar(): React.JSX.Element {
  const pathname = usePathname();
  // 워크플로우 밖의 화면(뉴스/DM 등)에서는 어떤 단계도 활성화하지 않습니다.
  const activeIndex = WORKFLOW_STEPS.findIndex(
    (step) => pathname === step.href || pathname.startsWith(`${step.href}/`)
  );

  return (
    <div className="mb-4 rounded-lg border border-border/70 bg-card/80 p-2">
      <div className="app-table-scrollbar flex gap-1 overflow-x-auto">
        {WORKFLOW_STEPS.map((step, index) => {
          const active = index === activeIndex;
          const completed = index < activeIndex;
          return (
            <div key={step.href} className="flex min-w-fit items-center gap-1">
              <Link
                href={step.href}
                className={cn(
                  "flex min-w-[132px] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : completed
                      ? "border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15"
                      : "border-transparent bg-background/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    active
                      ? "border-primary-foreground/50 bg-primary-foreground/15"
                      : completed
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-card"
                  )}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{step.label}</span>
                  <span className={cn("block text-xs leading-tight", active ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {step.detail}
                  </span>
                </span>
              </Link>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
