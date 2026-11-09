import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { listActivePrices } from "@/lib/db/modelPrices";
import { filterServablePrices } from "@/lib/ai/providers";

/**
 * The price catalogue the composer quotes against.
 *
 * Rows whose provider cannot serve traffic right now (not in
 * `AI_PROVIDER_ORDER`, or missing its API key) are filtered out here using the
 * SAME filter the generate route applies before it re-quotes — otherwise the
 * browser could show a price the server would never honour.
 *
 * Cheap and shared: `listActivePrices()` is cached in-process with a short TTL
 * and the response is browser-cacheable for a minute (private — the servable
 * set depends on server config, not on the user).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const prices = filterServablePrices(await listActivePrices());
  return NextResponse.json(
    { prices },
    {
      headers: {
        "cache-control": "private, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
