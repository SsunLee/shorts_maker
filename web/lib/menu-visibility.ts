export type ManagedMenuSectionId = "youtube" | "instagram";

export type UserMenuVisibility = Record<ManagedMenuSectionId, Record<string, boolean>>;

type ManagedMenuItem = {
  href: string;
  label: string;
};

type ManagedMenuSection = {
  id: ManagedMenuSectionId;
  label: string;
  items: ManagedMenuItem[];
};

export const MANAGED_MENU_SECTIONS: ManagedMenuSection[] = [
  {
    id: "youtube",
    label: "유튜브",
    items: [
      { href: "/templates", label: "템플릿" },
      { href: "/ideas", label: "아이디어" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/create", label: "영상 생성 (단건)" }
    ]
  },
  {
    id: "instagram",
    label: "인스타그램",
    items: [
      { href: "/instagram/templates", label: "템플릿" },
      { href: "/instagram/ideas", label: "아이디어" },
      { href: "/instagram/news", label: "뉴스 정보 가져오기" },
      { href: "/instagram/dm", label: "DM 자동 전송" },
      { href: "/instagram/feed", label: "피드" },
      { href: "/instagram/reels", label: "릴스" },
      { href: "/instagram/dashboard", label: "Dashboard" }
    ]
  }
];

export function isManagedMenuSectionId(value: string): value is ManagedMenuSectionId {
  return value === "youtube" || value === "instagram";
}

export function getDefaultUserMenuVisibility(): UserMenuVisibility {
  const defaults = {} as UserMenuVisibility;
  MANAGED_MENU_SECTIONS.forEach((section) => {
    defaults[section.id] = {};
    section.items.forEach((item) => {
      defaults[section.id][item.href] = true;
    });
  });
  return defaults;
}

export function normalizeUserMenuVisibility(raw: unknown): UserMenuVisibility {
  const defaults = getDefaultUserMenuVisibility();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const input = raw as Record<string, unknown>;
  MANAGED_MENU_SECTIONS.forEach((section) => {
    const sectionRaw = input[section.id];
    if (!sectionRaw || typeof sectionRaw !== "object" || Array.isArray(sectionRaw)) {
      return;
    }
    const sectionInput = sectionRaw as Record<string, unknown>;
    section.items.forEach((item) => {
      const value = sectionInput[item.href];
      if (typeof value === "boolean") {
        defaults[section.id][item.href] = value;
      }
    });
  });
  return defaults;
}

export function isMenuItemVisible(
  visibility: UserMenuVisibility | undefined,
  sectionId: ManagedMenuSectionId,
  href: string
): boolean {
  if (!visibility) {
    return true;
  }
  return visibility[sectionId]?.[href] !== false;
}
