"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Clapperboard,
  Film,
  Home,
  Images,
  Instagram,
  LayoutTemplate,
  Lightbulb,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AppTheme, applyTheme, getStoredTheme, normalizeTheme, setStoredTheme, THEME_CHANGED_EVENT } from "@/lib/theme";

type NavLinkItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes?: string[];
};

type NavSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  links: NavLinkItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "youtube",
    label: "유튜브",
    icon: Film,
    links: [
      { href: "/templates", label: "템플릿", icon: LayoutTemplate },
      { href: "/ideas", label: "아이디어", icon: Lightbulb },
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/create", label: "영상 생성 (단건)", icon: Clapperboard }
    ]
  },
  {
    id: "instagram",
    label: "인스타그램",
    icon: Instagram,
    links: [
      { href: "/instagram/templates", label: "템플릿", icon: LayoutTemplate },
      { href: "/instagram/ideas", label: "아이디어", icon: Lightbulb },
      { href: "/instagram/feed", label: "피드", icon: Images },
      { href: "/instagram/reels", label: "릴스", icon: Clapperboard },
      { href: "/instagram/dashboard", label: "Dashboard", icon: Home, matchPrefixes: ["/instagram/dashboard"] }
    ]
  }
];

export function AppNav(): React.JSX.Element {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [navSearch, setNavSearch] = useState("");
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
  const sections = useMemo(() => {
    const base = [...NAV_SECTIONS];
    const globalLinks: NavLinkItem[] = [{ href: "/settings", label: "Settings", icon: Settings }];
    if (isSuperAdmin) {
      globalLinks.push({ href: "/admin/users", label: "관리자", icon: UserRound });
    }
    base.push({
      id: "global",
      label: "공통",
      icon: Settings,
      links: globalLinks
    });
    return base;
  }, [isSuperAdmin]);

  const filteredSections = useMemo(() => {
    const query = navSearch.trim().toLowerCase();
    if (!query) return sections;
    return sections
      .map((section) => {
        const sectionMatched = section.label.toLowerCase().includes(query);
        const links = sectionMatched
          ? section.links
          : section.links.filter((link) => link.label.toLowerCase().includes(query));
        return { ...section, links };
      })
      .filter((section) => section.links.length > 0);
  }, [navSearch, sections]);

  const isLinkActive = useMemo(() => {
    return (item: NavLinkItem): boolean => {
      if (pathname === item.href) {
        return true;
      }
      const prefixes = item.matchPrefixes || [];
      return prefixes.some((prefix) => pathname.startsWith(prefix));
    };
  }, [pathname]);

  useEffect(() => {
    setExpandedSections((current) => {
      const next: Record<string, boolean> = {};
      sections.forEach((section) => {
        next[section.id] = typeof current[section.id] === "boolean" ? current[section.id] : true;
      });
      return next;
    });
  }, [sections]);

  useEffect(() => {
    setExpandedSections((current) => {
      const next = { ...current };
      let changed = false;
      sections.forEach((section) => {
        if (section.links.some((item) => isLinkActive(item)) && next[section.id] === false) {
          next[section.id] = true;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [sections, isLinkActive, pathname]);

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

  function toggleSection(sectionId: string): void {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !(current[sectionId] ?? true)
    }));
  }

  if (hideForAuthRoute) {
    return <></>;
  }

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r bg-card/90 p-3 backdrop-blur-sm transition-all duration-300 ease-out",
        navWidthClass
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href="/create"
          className={cn(
            "inline-flex items-center rounded-xl px-1.5 py-1.5 text-sm font-semibold text-foreground",
            collapsedEffective ? "w-11 justify-center" : "w-auto"
          )}
          title="Shorts Maker"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-background/80 p-1 shadow-sm">
            <Image src="/favicon_ssun.png" alt="ssunEdu" fill sizes="36px" className="object-contain" />
          </span>
          {collapsedEffective ? null : (
            <span className="ml-2.5 flex flex-col leading-tight">
              <span className="text-[31px] font-black tracking-tight">Shorts</span>
              <span className="-mt-1 text-[31px] font-black tracking-tight">Maker</span>
            </span>
          )}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleCollapsed}
          className="h-8 w-8 p-0"
          disabled={isCompactViewport}
          title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsedEffective ? (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={navSearch}
            onChange={(event) => setNavSearch(event.target.value)}
            placeholder="메뉴 검색..."
            className="h-10 rounded-full border-border/70 bg-background/70 pl-9 text-sm"
          />
        </div>
      ) : null}

      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {filteredSections.map((section) => {
          const isExpanded = expandedSections[section.id] ?? true;
          const sectionActive = section.links.some((item) => isLinkActive(item));
          return (
          <div key={section.id} className="space-y-1">
            {collapsedEffective ? (
              <div
                className={cn(
                  "inline-flex h-9 w-full items-center justify-center rounded-lg border border-border/60 text-muted-foreground",
                  sectionActive ? "border-primary/60 text-primary" : ""
                )}
                title={section.label}
              >
                <section.icon className="h-4 w-4" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-sm font-semibold transition-all duration-200",
                  sectionActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-accent/40 hover:text-accent-foreground"
                )}
                aria-expanded={isExpanded}
                title={isExpanded ? `${section.label} 접기` : `${section.label} 펼치기`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80">
                    <section.icon className="h-4 w-4" />
                  </span>
                  <span>{section.label}</span>
                  <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] leading-none text-muted-foreground">
                    {section.links.length}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-300 ease-out",
                    isExpanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
            )}
            {collapsedEffective ? (
              section.links.map((item) => {
                const { href, label, icon: Icon } = item;
                return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isLinkActive(item)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent hover:text-accent-foreground",
                    "justify-center px-2"
                  )}
                  title={label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </Link>
                );
              })
            ) : (
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
                  isExpanded ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-1"
                )}
              >
                <div className="overflow-hidden">
                  <div className="ml-4 space-y-1 border-l border-border/60 pl-3 pt-1">
                    {section.links.map((item) => {
                      const { href, label, icon: Icon } = item;
                      return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                          isLinkActive(item)
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        title={label}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-85" />
                        <span className="truncate">{label}</span>
                      </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        })}
        {!collapsedEffective && filteredSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            검색 결과가 없습니다.
          </div>
        ) : null}
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
