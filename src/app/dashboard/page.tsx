import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { DashboardShell } from "./DashboardShell";

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
  return <DashboardShell user={user} />;
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
