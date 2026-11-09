import {
  Clapperboard,
  Folder,
  GitCompare,
  Globe,
  Image as ImageIcon,
  Library,
  Presentation,
  Sparkles,
  SquarePen,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Dashboard navigation, shared by the sidebar (in the layout) and the chat
 * surface's quick actions.
 *
 * `href` turns a row into a route link; rows without one stay local-state tabs
 * owned by the chat surface, exactly as they were before the layout split.
 */
export type NavItem = {
  label: string;
  icon: LucideIcon;
  paid?: boolean;
  href?: string;
};

/** One combined image + video surface, Grok-style. */
export const IMAGINE_HREF = "/dashboard/imagine";

export const NAV_ITEMS: NavItem[] = [
  { label: "New Chat", icon: SquarePen },
  { label: "Imagine", icon: Sparkles, href: IMAGINE_HREF },
  { label: "Slides", icon: Presentation },
  { label: "Websites", icon: Globe },
  { label: "Experts", icon: Users },
  { label: "Projects", icon: Folder },
  { label: "Library", icon: Library },
];

export const QUICK_ACTIONS: NavItem[] = [
  { label: "Websites", icon: Globe },
  { label: "Videos", icon: Clapperboard, href: IMAGINE_HREF },
  { label: "Slides", icon: Presentation },
  { label: "Images", icon: ImageIcon, href: IMAGINE_HREF },
  { label: "Compare", icon: GitCompare },
];
