"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Home,
  LayoutTemplate,
  Lightbulb,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  Settings,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [theme, setTheme] = useState<AppTheme>("light");

  useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem("shorts-maker:nav-collapsed");
      setCollapsed(savedCollapsed === "1");
    } catch {
      setCollapsed(false);
    }
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
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

  const navWidthClass = useMemo(() => (collapsed ? "w-[78px]" : "w-[248px]"), [collapsed]);

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
            "inline-flex h-9 items-center rounded-md px-2 text-sm font-semibold text-foreground",
            collapsed ? "w-9 justify-center" : "w-auto"
          )}
          title="Shorts Maker"
        >
          {collapsed ? <Menu className="h-4 w-4" /> : "Shorts Maker"}
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
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
              collapsed ? "justify-center px-2" : ""
            )}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {collapsed ? null : <span>{label}</span>}
          </Link>
        ))}
      </nav>

      <div className="mt-3 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleTheme}
          className={cn("w-full", collapsed ? "px-0" : "")}
          title={theme === "dark" ? "Light Mode" : "Dark Mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {collapsed ? null : <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </Button>
      </div>
    </aside>
  );
}
