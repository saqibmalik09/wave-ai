"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders the current year. The server snapshot is the static `fallback`, so
 * pages stay fully static/prerendered under Next's Cache Components (no dynamic
 * bailout for a copyright line); the client reads the real year after hydration.
 * `useSyncExternalStore` gives separate server/client snapshots without a
 * hydration mismatch and without calling setState inside an effect.
 */
const subscribe = () => () => {};

export function CurrentYear({ fallback = 2026 }: { fallback?: number }) {
  const year = useSyncExternalStore(
    subscribe,
    () => new Date().getFullYear(),
    () => fallback,
  );
  return <>{year}</>;
}
