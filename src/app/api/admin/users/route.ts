import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth/api";
import { listUsers } from "@/lib/db/users";

/** Admin: cursor-paginated user list. `?cursor=<id>&limit=<n>`. */
export async function GET(request: Request) {
  const guard = await guardApi("ADMIN");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const page = await listUsers({
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  return NextResponse.json(page);
}
