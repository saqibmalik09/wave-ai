/**
 * Idempotent database seed — safe to run on every deploy.
 * Plain .mjs so it runs on Node 20+ without --experimental-strip-types.
 *
 * Seeds BrandConfig, Free + Promo plans, and optional SUPERADMIN from env.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedBrand() {
  const appName = process.env.APP_NAME?.trim() || "AiWave";
  await prisma.brandConfig.upsert({
    where: { id: 1 },
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

async function seedPlans() {
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

async function seedSuperAdmin() {
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

async function main() {
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
