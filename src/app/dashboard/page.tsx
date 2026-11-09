import type { Metadata } from "next";
import { ChatSurface } from "./ChatSurface";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * The chat surface only — the sidebar, drawer, user menu and credits card live
 * in `layout.tsx`, which also runs the session guard for this route.
 */
export default function DashboardPage() {
  return <ChatSurface />;
}
