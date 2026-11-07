import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { guardApi } from "@/lib/auth/api";
import { getBrandConfig, upsertBrand } from "@/lib/db/brand";
import { BRAND_CACHE_TAG } from "@/lib/brand.server";

/** Admin: read the current brand config. */
export async function GET() {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  const config = await getBrandConfig();
  return NextResponse.json({ config });
}

/**
 * Admin: update the brand config (single pinned row). Accepts any subset of
 * appName / tagline / logoUrl / primaryColor. Invalidates the cached brand so
 * every surface reflects the change without a redeploy.
 *
 * `logoUrl` must be a same-origin / self-hosted path — hotlinked external
 * images are rejected (project rule: no external images in the UI).
 */
export async function PATCH(request: Request) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as {
    appName?: unknown;
    tagline?: unknown;
    logoUrl?: unknown;
    primaryColor?: unknown;
  };

  const input: {
    appName?: string;
    tagline?: string;
    logoUrl?: string | null;
    primaryColor?: string;
  } = {};

  if (data.appName !== undefined) {
    const v = String(data.appName).trim();
    if (v.length === 0 || v.length > 60) {
      return NextResponse.json(
        { error: "appName must be 1–60 characters." },
        { status: 400 }
      );
    }
    input.appName = v;
  }
  if (data.tagline !== undefined) {
    input.tagline = String(data.tagline).trim().slice(0, 160);
  }
  if (data.logoUrl !== undefined) {
    if (data.logoUrl === null || data.logoUrl === "") {
      input.logoUrl = null;
    } else {
      const v = String(data.logoUrl).trim();
      // Only self-hosted, same-origin paths — never an external URL.
      if (!v.startsWith("/") || v.startsWith("//")) {
        return NextResponse.json(
          { error: "logoUrl must be a self-hosted path starting with '/'." },
          { status: 400 }
        );
      }
      input.logoUrl = v;
    }
  }
  if (data.primaryColor !== undefined) {
    const v = String(data.primaryColor).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
      return NextResponse.json(
        { error: "primaryColor must be a #RRGGBB hex color." },
        { status: 400 }
      );
    }
    input.primaryColor = v;
  }

  const config = await upsertBrand(input);
  // Brand changed → drop the cached value so getBrand() re-reads it.
  revalidateTag(BRAND_CACHE_TAG, "max");

  return NextResponse.json({ config });
}
