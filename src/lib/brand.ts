/**
 * Brand config. Kept in one place so the name, tagline and links can later be
 * served from the backend (`/v1/config`) and changed from the admin dashboard
 * without touching components. For now these are the build-time defaults.
 */
export const brand = {
  name: "AiWave",
  tagline: "World's Best AI Models & Tools. One Subscription.",
  description:
    "Use 100+ AI models with dedicated tools for chat, images, videos, presentations and websites — all for a fraction of the cost.",
  email: "support@aiwave.ai",
  // Pricing shown on the landing page (display only; real prices come from the
  // backend plan catalog later).
  priceMonthly: 12,
  priceYearly: 89,
} as const;

export type Brand = typeof brand;
