"use client";

/**
 * Client reads of the credits contract.
 *
 * `useWallet` keeps the signed-in user's balance; `useModelPrices` loads the
 * price catalogue once so the composer can quote locally with `quote()` instead
 * of asking the server per keystroke. Both degrade to "not loaded" on any
 * failure — the UI renders a neutral placeholder rather than a wrong number.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelPriceDTO, WalletDTO } from "@/lib/ai/types";

/** Give up rather than leave the sidebar spinning on a stalled network. */
const REQUEST_TIMEOUT_MS = 8000;

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

export type WalletState = {
  wallet: WalletDTO | null;
  /** True until the first fetch settles (false when seeded server-side). */
  loading: boolean;
  /** Re-reads the balance, e.g. after a generation settles. */
  refresh: () => void;
  /** Applies a wallet the server already returned, skipping a round trip. */
  apply: (next: WalletDTO) => void;
};

/** Reads the balance. Resolves to null on any failure — never throws. */
async function fetchWallet(): Promise<WalletDTO | null> {
  try {
    const res = await fetch("/api/me/credits", {
      cache: "no-store",
      signal: timeoutSignal(),
    });
    if (!res.ok) return null;
    return (await res.json()) as WalletDTO;
  } catch {
    // Offline, timed out, or the endpoint isn't live yet — keep the last
    // known balance and let the UI show its placeholder.
    return null;
  }
}

export function useWallet(initial: WalletDTO | null = null): WalletState {
  const [wallet, setWallet] = useState<WalletDTO | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  /** Guards every setState so an in-flight read can never touch a dead tree. */
  const aliveRef = useRef(true);

  const applyLatest = useCallback(async () => {
    const data = await fetchWallet();
    if (aliveRef.current && data) setWallet(data);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      await applyLatest();
      if (aliveRef.current) setLoading(false);
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [applyLatest]);

  const refresh = useCallback(() => {
    void applyLatest();
  }, [applyLatest]);

  const apply = useCallback((next: WalletDTO) => {
    if (aliveRef.current) setWallet(next);
  }, []);

  return { wallet, loading, refresh, apply };
}

export type PricesState = {
  prices: readonly ModelPriceDTO[];
  /** True until the catalogue has been fetched at least once. */
  loading: boolean;
};

const NO_PRICES: readonly ModelPriceDTO[] = [];

export function useModelPrices(): PricesState {
  const [prices, setPrices] = useState<readonly ModelPriceDTO[]>(NO_PRICES);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/ai/prices", { signal: timeoutSignal() });
        if (!res.ok) return;
        const data = (await res.json()) as { prices?: ModelPriceDTO[] };
        if (aliveRef.current && Array.isArray(data.prices)) {
          setPrices(data.prices);
        }
      } catch {
        // Catalogue unavailable — the composer shows "pricing unavailable".
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    })();

    return () => {
      aliveRef.current = false;
    };
  }, []);

  return { prices, loading };
}
