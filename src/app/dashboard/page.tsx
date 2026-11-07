import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getBrand } from "@/lib/brand.server";
import { getCurrentSubscription } from "@/lib/db/subscriptions";
import { DashboardShell, type DashboardPlan } from "./DashboardShell";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  // The session read happens inside <DashboardEntry/>. With Cache Components
  // enabled, reading cookies() must sit behind a <Suspense> boundary so the
  // rest of the shell can stream; this also satisfies the build-time check.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardEntry />
    </Suspense>
  );
}

async function DashboardEntry() {
  const user = await getCurrentUser();
  // Authoritative guard (Proxy is only an optimistic pre-check). Guests have a
  // valid session too, so they pass here and reach the dashboard.
  if (!user) redirect("/login");

  const { appName } = await getBrand();

  // Guests have no DB row, so no subscription — fall back to the free defaults.
  let plan: DashboardPlan | null = null;
  if (user.role !== "guest" && user.email !== null) {
    const sub = await getCurrentSubscription(user.id);
    if (sub) {
      plan = { name: sub.plan.name, messageQuota: sub.plan.messageQuota };
    }
  }

  return <DashboardShell user={user} appName={appName} plan={plan} />;
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
