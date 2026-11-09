import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getBrand } from "@/lib/brand.server";
import { getCurrentSubscription } from "@/lib/db/subscriptions";
import { DashboardShell, type DashboardPlan } from "./DashboardShell";
import { getInitialWallet } from "./initialWallet";

/**
 * Shared dashboard chrome. Every route under /dashboard renders inside the
 * sidebar, mobile drawer and user menu, and reads one wallet resolved here —
 * so navigating between the chat and Imagine never re-mounts the sidebar or
 * re-fetches the balance.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // With Cache Components enabled, reading cookies() must sit behind a
  // <Suspense> boundary; the session read happens inside <DashboardFrame/>.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardFrame>{children}</DashboardFrame>
    </Suspense>
  );
}

async function DashboardFrame({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Authoritative guard (Proxy is only an optimistic pre-check). Guests have a
  // valid session too, so they pass here and reach the dashboard.
  if (!user) redirect("/login");

  // Independent reads — brand, entitlement and balance resolve in parallel so
  // the credits seed doesn't add a serial hop to first paint.
  const [{ appName }, plan, initialWallet] = await Promise.all([
    getBrand(),
    resolvePlan(user),
    getInitialWallet(),
  ]);

  return (
    <DashboardShell
      user={user}
      appName={appName}
      plan={plan}
      initialWallet={initialWallet}
    >
      {children}
    </DashboardShell>
  );
}

/** Guests have no DB row, so no subscription — fall back to the free defaults. */
async function resolvePlan(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
): Promise<DashboardPlan | null> {
  if (user.role === "guest" || user.email === null) return null;
  const sub = await getCurrentSubscription(user.id);
  if (!sub) return null;
  return { name: sub.plan.name, messageQuota: sub.plan.messageQuota };
}

function DashboardSkeleton() {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <div className="hidden w-[260px] shrink-0 border-r border-border bg-surface md:block" />
      <div className="flex flex-1 items-center justify-center">
        <div className="h-7 w-56 animate-pulse rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}
