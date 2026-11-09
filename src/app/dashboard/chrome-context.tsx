"use client";

/**
 * What the dashboard chrome (layout) shares with the surface rendered inside
 * it: who the user is, which nav tab is highlighted, and the one wallet.
 *
 * The wallet lives here so the sidebar card and the Imagine cost line read the
 * same balance: Imagine pushes the wallet the generate call returned with
 * `applyWallet`, then `refreshWallet` reconciles against the server.
 */
import { createContext, useContext } from "react";
import type { WalletDTO } from "@/lib/ai/types";
import type { SessionUser } from "@/lib/auth/types";

export type DashboardChrome = {
  user: SessionUser;
  isGuest: boolean;
  appName: string;
  /** Highlighted nav label — route-derived on routed pages. */
  active: string;
  /** Selects a local-state tab (and shows the paid-feature toast). */
  select: (label: string, paid?: boolean) => void;
  wallet: WalletDTO | null;
  walletLoading: boolean;
  /** Applies a balance the server already returned, skipping a round trip. */
  applyWallet: (wallet: WalletDTO) => void;
  /** Re-reads the balance from the server. */
  refreshWallet: () => void;
};

const ChromeContext = createContext<DashboardChrome | null>(null);

export const ChromeProvider = ChromeContext.Provider;

export function useDashboardChrome(): DashboardChrome {
  const value = useContext(ChromeContext);
  if (!value) {
    throw new Error(
      "useDashboardChrome must be used inside the dashboard layout."
    );
  }
  return value;
}
