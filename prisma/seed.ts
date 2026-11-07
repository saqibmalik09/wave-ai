/**
 * Idempotent database seed — safe to run on every deploy.
 *
 * Seeds:
 *   1. BrandConfig (single row, id = 1) — appName from APP_NAME env, else "AiWave".
 *   2. Default plans — a "free" plan whose messageQuota matches the dashboard's
 *      "X out of 10 messages", plus an example promotional plan.
 *   3. The super-admin (role SUPERADMIN) from SUPERADMIN_* env, only if a hash
 *      is provided. Existing rows are never overwritten (password/role kept).
 *
 * Run via `prisma db seed` (configured in package.json), or directly from the
 * deploy script. Reads DATABASE_URL + SUPERADMIN_* from the environment.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedBrand(): Promise<void> {
  const appName = process.env.APP_NAME?.trim() || "AiWave";
  await prisma.brandConfig.upsert({
    where: { id: 1 },
    // Only fill the row when it doesn't exist; never clobber an admin's edits.
    update: {},
    create: {
      id: 1,
      appName,
      tagline: "World's Best AI Models & Tools. One Subscription.",
      logoUrl: null,
      primaryColor: "#30a66d",
    },
  });
  console.log(`  brand: ensured (appName="${appName}")`);
}

async function seedPlans(): Promise<void> {
  // Free plan — quota matches the dashboard "0 out of 10 messages used".
  await prisma.plan.upsert({
    where: { code: "free" },
    update: {},
    create: {
      code: "free",
      name: "Free Plan",
      priceCents: 0,
      currency: "usd",
      interval: "FREE",
      messageQuota: 10,
      isPromo: false,
      active: true,
      features: {
        chat: true,
        imageStudio: true,
        videoStudio: false,
        slides: true,
        websites: true,
      },
    },
  });

  // Example promotional plan — comped by an admin, not sold. Higher quota.
  await prisma.plan.upsert({
    where: { code: "promo" },
    update: {},
    create: {
      code: "promo",
      name: "Promo — Early Access",
      priceCents: 0,
      currency: "usd",
      interval: "MONTH",
      messageQuota: 100,
      isPromo: true,
      active: true,
      features: {
        chat: true,
        imageStudio: true,
        videoStudio: true,
        slides: true,
        websites: true,
      },
    },
  });

  console.log('  plans: ensured ("free" quota 10, "promo" quota 100)');
}

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.SUPERADMIN_PASSWORD_HASH?.trim();
  const name = process.env.SUPERADMIN_NAME?.trim() || "Admin";

  if (!email || !passwordHash) {
    console.log(
      "  super-admin: skipped (SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD_HASH not set)"
    );
    return;
  }

  await prisma.user.upsert({
    where: { email },
    // Never overwrite an existing account's password or role.
    update: {},
    create: {
      email,
      name,
      passwordHash,
      role: "SUPERADMIN",
    },
  });
  console.log(`  super-admin: ensured (${email})`);
}

async function main(): Promise<void> {
  console.log("Seeding database (idempotent)...");
  await seedBrand();
  await seedPlans();
  await seedSuperAdmin();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
