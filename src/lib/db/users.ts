/**
 * Admin-facing user queries.
 *
 * Listing is cursor-paginated (never OFFSET) and selects explicit columns
 * (never `SELECT *`, never the password hash). The auth write/read path for a
 * single user stays in `@/lib/auth/store`. Server-only.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  phoneVerified: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

export type AdminUserDTO = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

export type UserPage = {
  items: AdminUserDTO[];
  nextCursor: string | null;
};

/** Cursor-paginated user list, newest first. */
export async function listUsers(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<UserPage> {
  const take = Math.min(Math.max(options?.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const rows = await prisma.user.findMany({
    select: adminUserSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
