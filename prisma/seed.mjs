/**
 * Idempotent database seed — safe to run on every deploy.
 * Plain .mjs so it runs on Node 20+ without --experimental-strip-types.
 *
 * Seeds BrandConfig, the plan catalogue (free / promo / pro), the model price
 * catalogue, and an optional SUPERADMIN from env.
 *
 * Credits convention everywhere below: 1 credit = $0.0001, so 10,000 credits
 * = $1. `credits` on a price row is PER UNIT — per second of video, per image.
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
  // The seed owns the CREDIT numbers of the plans it defines (they are platform
  // entitlements, not copy), so those two columns are re-applied on every run.
  // Everything an admin may legitimately edit — name, price, features, active —
  // is only written when the row is first created.
  await prisma.plan.upsert({
    where: { code: "free" },
    update: { creditsPerPeriod: 5_000, weeklyCredits: 0 },
    create: {
      code: "free",
      name: "Free Plan",
      priceCents: 0,
      currency: "usd",
      interval: "FREE",
      messageQuota: 10,
      creditsPerPeriod: 5_000,
      weeklyCredits: 0,
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

  await prisma.plan.upsert({
    where: { code: "pro_1m" },
    update: { creditsPerPeriod: 112_000, weeklyCredits: 26_000 },
    create: {
      code: "pro_1m",
      name: "Pro — Monthly",
      priceCents: 1_200, // $12
      currency: "usd",
      interval: "MONTH",
      messageQuota: 0,
      creditsPerPeriod: 112_000,
      // Weekly cap keeps one user from burning a month of GPU time in a day.
      weeklyCredits: 26_000,
      isPromo: false,
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

  await prisma.plan.upsert({
    where: { code: "pro_3m" },
    update: { creditsPerPeriod: 285_000, weeklyCredits: 21_900 },
    create: {
      code: "pro_3m",
      name: "Pro — Quarterly",
      priceCents: 3_000, // $30
      currency: "usd",
      interval: "QUARTER",
      messageQuota: 0,
      creditsPerPeriod: 285_000,
      weeklyCredits: 21_900,
      isPromo: false,
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

  console.log(
    '  plans: ensured ("free" 5k credits, "promo", "pro_1m" 112k, "pro_3m" 285k)'
  );
}

/**
 * Model price catalogue. The cheapest capable row wins automatically in
 * `quote()`, which is what makes Kie primary and xAI a real fallback — no code
 * decides that, these numbers do.
 *
 * `resolution` is nullable and MySQL treats NULLs as distinct, so the compound
 * unique index cannot dedupe image rows: match by hand, then update or create.
 *
 * `active` is written only on CREATE. An operator who deactivates a provider's
 * rows (step 3 of removing a provider) keeps that decision across deploys.
 */
const MODEL_PRICES = [
  // provider, model, modality, resolution, unit, credits, reference?, label
  ["kie", "grok-imagine-video-1.5", "VIDEO", "480p", "SECOND", 120, true, "Standard"],
  ["kie", "grok-imagine-video-1.5", "VIDEO", "720p", "SECOND", 225, true, "Standard"],
  ["kie", "gpt-image-2.5", "IMAGE", null, "IMAGE", 300, true, "Standard"],
  ["xai", "grok-imagine-video-1.5-lite", "VIDEO", "480p", "SECOND", 200, false, "Fallback"],
  ["xai", "grok-imagine-video-1.5-lite", "VIDEO", "720p", "SECOND", 300, false, "Fallback"],
  ["xai", "grok-imagine-video-1.5", "VIDEO", "480p", "SECOND", 800, true, "Fallback HQ"],
  ["xai", "grok-imagine-video-1.5", "VIDEO", "720p", "SECOND", 1_400, true, "Fallback HQ"],
  ["xai", "grok-imagine-image", "IMAGE", null, "IMAGE", 200, true, "Fallback"],
];

async function seedModelPrices() {
  for (const [
    providerId,
    modelId,
    modality,
    resolution,
    unit,
    credits,
    supportsReference,
    label,
  ] of MODEL_PRICES) {
    const existing = await prisma.modelPrice.findFirst({
      where: { providerId, modelId, resolution },
      select: { id: true },
    });

    if (existing) {
      await prisma.modelPrice.update({
        where: { id: existing.id },
        data: { modality, unit, credits, supportsReference, label },
      });
    } else {
      await prisma.modelPrice.create({
        data: {
          providerId,
          modelId,
          modality,
          resolution,
          unit,
          credits,
          supportsReference,
          label,
          active: true,
        },
      });
    }
  }
  console.log(`  model prices: ensured (${MODEL_PRICES.length} rows)`);
}

/**
 * One-time-ish backfill for subscriptions granted BEFORE credits existed: they
 * carry creditsGranted = 0, which (correctly) refuses every generation. Only
 * pristine rows (nothing granted, nothing used) are touched, so an admin
 * clawback to zero is never silently reversed.
 */
async function backfillSubscriptionCredits() {
  const plans = await prisma.plan.findMany({
    where: { creditsPerPeriod: { gt: 0 } },
    select: { id: true, creditsPerPeriod: true },
  });

  let backfilled = 0;
  for (const plan of plans) {
    const result = await prisma.subscription.updateMany({
      where: {
        planId: plan.id,
        status: "ACTIVE",
        creditsGranted: 0,
        creditsUsed: 0,
      },
      data: { creditsGranted: plan.creditsPerPeriod },
    });
    backfilled += result.count;
  }
  console.log(`  subscriptions: ${backfilled} active row(s) given plan credits`);
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
  await seedModelPrices();
  await backfillSubscriptionCredits();
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
