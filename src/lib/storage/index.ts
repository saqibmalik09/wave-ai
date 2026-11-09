/**
 * Object-store registry.
 *
 * The only module that names a storage driver. Routes ask for "the store" and
 * get whatever `STORAGE_DRIVER` selects, so moving reference images to a
 * bucket is three steps and no route edit:
 *
 *   1. add `src/lib/storage/<driver>.ts` implementing `ObjectStore`,
 *   2. add its single line to `DRIVERS` below,
 *   3. set `STORAGE_DRIVER=<driver>` (plus that driver's own credentials).
 *
 * Fails CLOSED on an unknown driver: returning the local disk when an operator
 * asked for S3 would silently write production uploads somewhere nobody is
 * looking for them, so the upload route refuses with 503 instead.
 *
 * Server-only.
 */
import { localObjectStore } from "./local";
import type { ObjectStore } from "./types";

/** One line per driver. */
const DRIVERS: readonly ObjectStore[] = [localObjectStore];

const DEFAULT_DRIVER = localObjectStore.id;

/**
 * The configured store, or null when `STORAGE_DRIVER` names a driver that is
 * not installed.
 */
export function getObjectStore(): ObjectStore | null {
  const requested = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  const id = requested && requested.length > 0 ? requested : DEFAULT_DRIVER;
  return DRIVERS.find((driver) => driver.id === id) ?? null;
}

export type { ObjectStore } from "./types";
