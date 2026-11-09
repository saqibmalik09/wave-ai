"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronUp,
  Crown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/cn";
import type { WalletDTO } from "@/lib/ai/types";
import type { SessionUser } from "@/lib/auth/types";
import { ChromeProvider, type DashboardChrome } from "./chrome-context";
import { NAV_ITEMS } from "./nav";
import { useWallet } from "./useWallet";

/** The user's current plan/quota, resolved server-side. Null => free default. */
export type DashboardPlan = {
  name: string;
  messageQuota: number;
};

/** Fallback plan name used before a subscription row exists. */
const DEFAULT_PLAN_NAME = "Free Plan";
const COLLAPSE_KEY = "aw:dashboard:collapsed";

/** Where the local-state nav tabs live; selecting one returns to it. */
const CHAT_HREF = "/dashboard";

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

/**
 * Persistent dashboard chrome: sidebar, mobile drawer, user menu and the one
 * wallet. Rendered by the layout so every dashboard route sits inside it.
 */
export function DashboardShell({
  user,
  appName,
  plan,
  initialWallet = null,
  children,
}: {
  user: SessionUser;
  appName: string;
  plan: DashboardPlan | null;
  /** Balance resolved server-side so the sidebar's first paint isn't empty. */
  initialWallet?: WalletDTO | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isGuest = user.role === "guest";
  const planName = plan?.name ?? DEFAULT_PLAN_NAME;
  const {
    wallet,
    loading: walletLoading,
    apply: applyWallet,
    refresh: refreshWallet,
  } = useWallet(initialWallet);

  const [collapsed, toggleCollapsed] = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tab, setTab] = useState("New Chat");

  // A routed surface owns the highlight; otherwise it's the local tab.
  const routeLabel =
    NAV_ITEMS.find((item) => item.href && item.href === pathname)?.label ??
    null;
  const active = routeLabel ?? tab;

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const select = useCallback(
    (label: string, paid?: boolean) => {
      setTab(label);
      setMobileOpen(false);
      // These tabs have no route of their own — they live on the chat surface,
      // so a selection made from a routed page goes back to it.
      if (routeLabel) router.push(CHAT_HREF);
      if (paid) {
        toast.info(`${label} is a paid feature.`, {
          description: isGuest
            ? "Create an account and upgrade to generate video."
            : "Upgrade your plan to unlock video generation.",
        });
      }
    },
    [isGuest, routeLabel, router]
  );

  const chrome = useMemo<DashboardChrome>(
    () => ({
      user,
      isGuest,
      appName,
      active,
      select,
      wallet,
      walletLoading,
      applyWallet,
      refreshWallet,
    }),
    [
      user,
      isGuest,
      appName,
      active,
      select,
      wallet,
      walletLoading,
      applyWallet,
      refreshWallet,
    ]
  );

  return (
    <ChromeProvider value={chrome}>
      <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
        <Toaster richColors position="top-center" closeButton />
        {/* Mobile overlay */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeMobile}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}

        <Sidebar
          user={user}
          isGuest={isGuest}
          appName={appName}
          planName={planName}
          wallet={wallet}
          walletLoading={walletLoading}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          active={active}
          onSelect={select}
          onToggleCollapsed={toggleCollapsed}
          onCloseMobile={closeMobile}
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

          {/* Each surface brings its own padding and vertical rhythm. */}
          <main className="flex flex-1 flex-col overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ChromeProvider>
  );
}

function Sidebar({
  user,
  isGuest,
  appName,
  planName,
  wallet,
  walletLoading,
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
  wallet: WalletDTO | null;
  walletLoading: boolean;
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
            const className = cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-medium transition-colors",
              collapsed && "md:justify-center",
              isActive
                ? "bg-accent-tint text-accent-dark"
                : "text-foreground hover:bg-surface-muted"
            );
            const inner = (
              <>
                <item.icon size={19} className="shrink-0" />
                <span className={cn(collapsed && "md:hidden")}>
                  {item.label}
                </span>
              </>
            );
            return (
              <li key={item.label}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={onCloseMobile}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={className}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(item.label, item.paid)}
                    title={collapsed ? item.label : undefined}
                    className={className}
                  >
                    {inner}
                  </button>
                )}
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
              {planName}
            </div>
            <CreditsMeter wallet={wallet} loading={walletLoading} />
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
        planName={planName}
        collapsed={collapsed}
        router={router}
      />
    </aside>
  );
}

const creditsFormat = new Intl.NumberFormat("en-US");

/**
 * Real credit balance for the plan card. Shows a neutral placeholder until the
 * wallet is known — never a stand-in number the user could act on.
 */
function CreditsMeter({
  wallet,
  loading,
}: {
  wallet: WalletDTO | null;
  loading: boolean;
}) {
  if (!wallet) {
    return (
      <>
        <p className="mt-1 text-xs text-muted">
          {loading ? "Loading credits…" : "Credits unavailable"}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border" />
      </>
    );
  }

  const percent = Math.min(100, Math.max(0, wallet.percentUsed));

  return (
    <>
      <p className="mt-1 text-xs text-muted">
        {creditsFormat.format(wallet.used)} of{" "}
        {creditsFormat.format(wallet.granted)} credits
      </p>
      <div
        role="progressbar"
        aria-label="Credits used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{percent}% used</p>
      {wallet.weeklyLimit > 0 && (
        <p className="text-[11px] text-muted">
          This week: {creditsFormat.format(wallet.weeklyUsed)} of{" "}
          {creditsFormat.format(wallet.weeklyLimit)}
        </p>
      )}
    </>
  );
}

function UserMenu({
  user,
  isGuest,
  planName,
  collapsed,
  router,
}: {
  user: SessionUser;
  isGuest: boolean;
  planName: string;
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
            {isGuest ? "Not signed in" : planName}
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
