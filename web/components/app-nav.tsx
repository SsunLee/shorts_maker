"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Home,
  LayoutTemplate,
  Lightbulb,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  Settings,
  Sun,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppTheme, applyTheme, getStoredTheme, normalizeTheme, setStoredTheme, THEME_CHANGED_EVENT } from "@/lib/theme";

const links = [
  { href: "/templates", label: "템플릿", icon: LayoutTemplate },
  { href: "/ideas", label: "아이디어", icon: Lightbulb },
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/longform-to-shorts", label: "롱폼 → 숏폼 변환", icon: Scissors },
  { href: "/create", label: "영상 생성", icon: Clapperboard },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppNav(): React.JSX.Element {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("light");
  const [accountLabel, setAccountLabel] = useState("계정");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem("shorts-maker:nav-collapsed");
      if (savedCollapsed === null) {
        setCollapsed(window.innerWidth <= 900);
      } else {
        setCollapsed(savedCollapsed === "1");
      }
    } catch {
      setCollapsed(false);
    }
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const applyCompact = () => setIsCompactViewport(media.matches);
    applyCompact();
    const listener = () => applyCompact();
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    const onThemeChanged = (event: Event) => {
      const custom = event as CustomEvent<{ theme?: AppTheme }>;
      const nextTheme = normalizeTheme(custom.detail?.theme);
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };
    window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const session = await getSession();
        const rawId =
          session?.user?.accessCodeDisplay?.trim() ||
          session?.user?.email?.split("@")[0]?.trim() ||
          session?.user?.name?.trim() ||
          session?.user?.email?.trim() ||
          session?.user?.id?.trim() ||
          "계정";
        const meResponse = await fetch("/api/me", { cache: "no-store" });
        const meData = (await meResponse.json().catch(() => ({}))) as { isSuperAdmin?: boolean };
        if (mounted) {
          setAccountLabel(rawId);
          setIsSuperAdmin(Boolean(meData.isSuperAdmin));
        }
      } catch {
        if (mounted) {
          setAccountLabel("계정");
          setIsSuperAdmin(false);
        }
      }
    };
    void loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const collapsedEffective = collapsed || isCompactViewport;
  const navWidthClass = useMemo(
    () => (collapsedEffective ? "w-[78px]" : "w-[248px]"),
    [collapsedEffective]
  );
  const hideForAuthRoute = pathname.startsWith("/auth");
  const visibleLinks = useMemo(() => {
    if (!isSuperAdmin) {
      return links;
    }
    return [...links, { href: "/admin/users", label: "관리자", icon: UserRound }];
  }, [isSuperAdmin]);

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("shorts-maker:nav-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleTheme(): void {
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
  }

  async function onLogout(): Promise<void> {
    await signOut({ callbackUrl: "/auth/signin" });
  }

  if (hideForAuthRoute) {
    return <></>;
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r bg-card p-3 transition-all duration-200",
        navWidthClass
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href="/create"
          className={cn(
            "inline-flex h-11 items-center rounded-md px-1.5 text-sm font-semibold text-foreground",
            collapsedEffective ? "w-11 justify-center" : "w-auto"
          )}
          title="Shorts Maker"
        >
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-background/80 p-1 shadow-sm">
            <Image src="/favicon_ssun.png" alt="ssunEdu" fill sizes="36px" className="object-contain" />
          </span>
          {collapsedEffective ? null : <span className="ml-2.5 text-xl leading-none">Shorts Maker</span>}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className="h-8 w-8 p-0"
          title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {visibleLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent hover:text-accent-foreground",
              collapsedEffective ? "justify-center px-2" : ""
            )}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {collapsedEffective ? null : <span>{label}</span>}
          </Link>
        ))}
      </nav>

      <div className="mt-3 border-t pt-3">
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground",
              collapsedEffective ? "flex items-center justify-center px-0" : ""
            )}
            title={`${accountLabel} (로그인됨)`}
          >
            {collapsedEffective ? (
              <UserRound className="h-4 w-4 text-emerald-400" />
            ) : (
              <span className="truncate">{accountLabel} (로그인됨)</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className={cn("w-full", collapsedEffective ? "px-0" : "")}
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {collapsedEffective ? null : <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLogout}
            className={cn("w-full", collapsedEffective ? "px-0" : "")}
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" />
            {collapsedEffective ? null : <span>로그아웃</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}
