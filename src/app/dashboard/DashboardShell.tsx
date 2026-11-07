"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Clapperboard,
  ChevronUp,
  Crown,
  Folder,
  GitCompare,
  Globe,
  Image as ImageIcon,
  Library,
  LogOut,
  Menu,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  Search,
  Settings,
  SquarePen,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/lib/auth/types";

/** The user's current plan/quota, resolved server-side. Null => free default. */
export type DashboardPlan = {
  name: string;
  messageQuota: number;
};

type NavItem = { label: string; icon: LucideIcon; paid?: boolean };

const NAV_ITEMS: NavItem[] = [
  { label: "New Chat", icon: SquarePen },
  { label: "Image Studio", icon: ImageIcon },
  { label: "Video Studio", icon: Clapperboard, paid: true },
  { label: "Slides", icon: Presentation },
  { label: "Websites", icon: Globe },
  { label: "Experts", icon: Users },
  { label: "Projects", icon: Folder },
  { label: "Library", icon: Library },
];

type QuickAction = { label: string; icon: LucideIcon; paid?: boolean };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Websites", icon: Globe },
  { label: "Videos", icon: Clapperboard, paid: true },
  { label: "Slides", icon: Presentation },
  { label: "Images", icon: ImageIcon },
  { label: "Compare", icon: GitCompare },
];

/** Fallback quota / plan name used before a subscription row exists. */
const DEFAULT_MESSAGE_LIMIT = 10;
const DEFAULT_PLAN_NAME = "Free Plan";
const COLLAPSE_KEY = "aw:dashboard:collapsed";

/**
 * Sidebar collapse preference, persisted in localStorage and read via
 * useSyncExternalStore. This keeps the server snapshot (`false`) stable, avoids
 * a hydration mismatch, and never calls setState inside an effect.
 */
const collapseListeners = new Set<() => void>();

function readCollapse(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapse(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* ignore storage errors */
  }
  collapseListeners.forEach((listener) => listener());
}

function subscribeCollapse(callback: () => void): () => void {
  collapseListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    collapseListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function useCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    readCollapse,
    () => false
  );
  const toggle = useCallback(() => writeCollapse(!readCollapse()), []);
  return [collapsed, toggle];
}

export function DashboardShell({
  user,
  appName,
  plan,
}: {
  user: SessionUser;
  appName: string;
  plan: DashboardPlan | null;
}) {
  const router = useRouter();
  const isGuest = user.role === "guest";
  const planName = plan?.name ?? DEFAULT_PLAN_NAME;
  const messageQuota = plan?.messageQuota ?? DEFAULT_MESSAGE_LIMIT;

  const [collapsed, toggleCollapsed] = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState("New Chat");
  const [prompt, setPrompt] = useState("");

  function handleSelect(label: string, paid?: boolean) {
    setActive(label);
    setMobileOpen(false);
    if (paid) {
      toast.info(`${label} is a paid feature.`, {
        description: isGuest
          ? "Create an account and upgrade to generate video."
          : "Upgrade your plan to unlock video generation.",
      });
    }
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <Sidebar
        user={user}
        isGuest={isGuest}
        appName={appName}
        planName={planName}
        messageQuota={messageQuota}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        active={active}
        onSelect={handleSelect}
        onToggleCollapsed={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
        router={router}
      />

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-surface-muted"
          >
            <Menu size={20} />
          </button>
          <BrandMark name={appName} />
        </header>

        <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 sm:px-6">
          <div className="w-full max-w-2xl">
            <h1 className="text-center text-2xl font-extrabold tracking-tight text-heading sm:text-[32px] sm:leading-tight">
              Hi {firstName(user.name)}, how can I help you today?
            </h1>

            <PromptBox
              value={prompt}
              onChange={setPrompt}
              placeholder={promptPlaceholder(active, appName)}
            />

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => handleSelect(a.label, a.paid)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    active === a.label
                      ? "border-accent-border bg-accent-tint text-accent-dark"
                      : "border-border-strong bg-surface text-foreground hover:bg-surface-muted"
                  )}
                >
                  <a.icon size={16} />
                  {a.label}
                </button>
              ))}
            </div>

            {isGuest && (
              <p className="mt-8 text-center text-sm text-muted">
                You&apos;re exploring as a guest.{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-accent-dark hover:underline"
                >
                  Create a free account
                </Link>{" "}
                to save your work.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  user,
  isGuest,
  appName,
  planName,
  messageQuota,
  collapsed,
  mobileOpen,
  active,
  onSelect,
  onToggleCollapsed,
  onCloseMobile,
  router,
}: {
  user: SessionUser;
  isGuest: boolean;
  appName: string;
  planName: string;
  messageQuota: number;
  collapsed: boolean;
  mobileOpen: boolean;
  active: string;
  onSelect: (label: string, paid?: boolean) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <aside
      className={cn(
        // Mobile: off-canvas drawer. Desktop: static column.
        "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "md:w-[72px]" : "md:w-[264px]"
      )}
    >
      {/* Top: brand + controls */}
      <div className="flex h-14 items-center justify-between px-3">
        <Link
          href="/"
          aria-label={`${appName} home`}
          className={cn("overflow-hidden", collapsed && "md:w-8")}
        >
          <BrandMark showName={!collapsed} name={appName} />
        </Link>
        <div className="flex items-center gap-1">
          {!collapsed && (
            <button
              type="button"
              aria-label="Search"
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted md:inline-flex"
            >
              <Search size={18} />
            </button>
          )}
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted md:inline-flex"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMobile}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-muted md:hidden"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.label;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => onSelect(item.label, item.paid)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-medium transition-colors",
                    collapsed && "md:justify-center",
                    isActive
                      ? "bg-accent-tint text-accent-dark"
                      : "text-foreground hover:bg-surface-muted"
                  )}
                >
                  <item.icon size={19} className="shrink-0" />
                  <span className={cn(collapsed && "md:hidden")}>
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Free plan card */}
      <div className="px-2.5">
        {collapsed ? (
          <button
            type="button"
            aria-label="Upgrade"
            onClick={() => toast.info("Upgrade coming soon.")}
            className="mx-auto hidden h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground md:flex"
          >
            <Crown size={18} />
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-muted p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-heading">
              <Crown size={15} className="text-accent" />
              Free Plan
            </div>
            <p className="mt-1 text-xs text-muted">
              0 out of {MESSAGE_LIMIT} messages used
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
            <button
              type="button"
              onClick={() => toast.info("Upgrade coming soon.")}
              className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-black"
            >
              <Crown size={14} />
              Upgrade Now
            </button>
          </div>
        )}
      </div>

      {/* User menu */}
      <UserMenu
        user={user}
        isGuest={isGuest}
        collapsed={collapsed}
        router={router}
      />
    </aside>
  );
}

function UserMenu({
  user,
  isGuest,
  collapsed,
  router,
}: {
  user: SessionUser;
  isGuest: boolean;
  collapsed: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* clearing the cookie is best-effort; navigate regardless */
    }
    router.push("/login");
    router.refresh();
  }

  const initial = (user.name?.trim()?.[0] ?? "G").toUpperCase();

  return (
    <div ref={ref} className="relative p-2.5">
      {open && (
        <div className="absolute bottom-full left-2.5 right-2.5 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              toast.info("Settings coming soon.");
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-surface-muted"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 hover:bg-surface-muted disabled:opacity-60"
          >
            <LogOut size={16} />
            {isGuest ? "Exit guest session" : "Log out"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? user.name : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-muted",
          collapsed && "md:justify-center"
        )}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
          {isGuest ? <UserRound size={16} /> : initial}
        </span>
        <span className={cn("min-w-0 flex-1 text-left", collapsed && "md:hidden")}>
          <span className="block truncate text-sm font-semibold text-heading">
            {isGuest ? "Guest" : user.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {isGuest ? "Not signed in" : "Free"}
          </span>
        </span>
        <ChevronUp
          size={16}
          className={cn("text-muted", collapsed && "md:hidden")}
        />
      </button>
    </div>
  );
}

function PromptBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-7 rounded-3xl border border-border-strong bg-surface p-2.5 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted/70"
      />
      <div className="mt-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Add attachment"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-muted"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted sm:inline-flex">
            Auto
          </span>
          <button
            type="button"
            aria-label="Voice input"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            aria-label="Send"
            disabled={value.trim().length === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-black disabled:opacity-40"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function firstName(name: string): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function promptPlaceholder(active: string): string {
  switch (active) {
    case "Image Studio":
    case "Images":
      return "Describe an image to create…";
    case "Video Studio":
    case "Videos":
      return "Describe a video to generate…";
    case "Slides":
      return "Describe a presentation to build…";
    case "Websites":
      return "Describe a website to generate…";
    case "Compare":
      return "Ask something to compare across models…";
    default:
      return `Message ${brand.name}…`;
  }
}
