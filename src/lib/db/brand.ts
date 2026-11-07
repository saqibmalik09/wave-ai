/**
 * Brand configuration write side (admin).
 *
 * The brand lives in a single pinned row (id = 1). `upsertBrand` creates it on
 * first write and updates it thereafter, so it is safe to call repeatedly. The
 * READ side and its cache invalidation live in `@/lib/brand.server`
 * (`getBrand` / `BRAND_CACHE_TAG`). Server-only.
 */
import { prisma } from "@/lib/db/prisma";

const BRAND_ROW_ID = 1;

const brandSelect = {
  id: true,
  appName: true,
  tagline: true,
  logoUrl: true,
  primaryColor: true,
  updatedAt: true,
} as const;

export type BrandConfigDTO = {
  id: number;
  appName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
  updatedAt: Date;
};

export async function getBrandConfig(): Promise<BrandConfigDTO | null> {
  return prisma.brandConfig.findUnique({
    where: { id: BRAND_ROW_ID },
    select: brandSelect,
  });
}

export type UpsertBrandInput = {
  appName?: string;
  tagline?: string;
  logoUrl?: string | null;
  primaryColor?: string;
};

/**
 * Creates or updates the single brand row. On create, sensible defaults fill
 * any field the caller omitted (appName falls back to `APP_NAME` then
 * "AiWave").
 */
export async function upsertBrand(
  input: UpsertBrandInput
): Promise<BrandConfigDTO> {
  const envName = process.env.APP_NAME?.trim();
  return prisma.brandConfig.upsert({
    where: { id: BRAND_ROW_ID },
    create: {
      id: BRAND_ROW_ID,
      appName: input.appName?.trim() || envName || "AiWave",
      tagline:
        input.tagline?.trim() ||
        "World's Best AI Models & Tools. One Subscription.",
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor?.trim() || "#30a66d",
    },
    update: {
      ...(input.appName !== undefined
        ? { appName: input.appName.trim() }
        : {}),
      ...(input.tagline !== undefined
        ? { tagline: input.tagline.trim() }
        : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.primaryColor !== undefined
        ? { primaryColor: input.primaryColor.trim() }
        : {}),
    },
    select: brandSelect,
  });
}
