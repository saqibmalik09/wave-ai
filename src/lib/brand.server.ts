/**
 * Server-side brand resolution.
 *
 * The brand (app name, tagline, theme) is editable DATA: it lives in the single
 * `BrandConfig` row and is changed from the admin surface. This module is the
 * read side.
 *
 * `getBrand()` is a cached server function (`"use cache"`), tagged so an admin
 * edit can invalidate it with `revalidateTag(BRAND_CACHE_TAG)`. It never does a
 * DB read per request on a hot page, and it falls back — DB row → `APP_NAME`
 * env → the build-time static `brand` — so the first paint never breaks even
 * before the row exists or if the DB is briefly unreachable.
 *
 * Server-only: imports the Prisma client. Do not import from a Client
 * Component — pass the resolved values down as props instead.
 */
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { brand as staticBrand } from "@/lib/brand";

/** Cache tag for the resolved brand; revalidated when an admin updates it. */
export const BRAND_CACHE_TAG = "brand-config";

export type ResolvedBrand = {
  appName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
};

export async function getBrand(): Promise<ResolvedBrand> {
  "use cache";
  cacheTag(BRAND_CACHE_TAG);
  cacheLife("hours");

  const envName = process.env.APP_NAME?.trim();

  try {
    const row = await prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: {
        appName: true,
        tagline: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (row) {
      return {
        appName: row.appName?.trim() || envName || staticBrand.name,
        tagline: row.tagline?.trim() || staticBrand.tagline,
        logoUrl: row.logoUrl,
        primaryColor: row.primaryColor || "#30a66d",
      };
    }
  } catch {
    // DB unavailable or not migrated yet — degrade gracefully to env/static so
    // the UI still renders a sensible brand name.
  }

  return {
    appName: envName || staticBrand.name,
    tagline: staticBrand.tagline,
    logoUrl: null,
    primaryColor: "#30a66d",
  };
}
