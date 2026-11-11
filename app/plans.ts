// Plan names, monthly prices (USD) and restock-email allowances. Shared by the
// server, the billing config (shopify.server.ts) and the admin UI.
export const PLANS = {
  free: { name: "Free", price: 0, emails: 50 },
  starter: { name: "Starter", price: 7.99, emails: 1000 },
  growth: { name: "Growth", price: 14.99, emails: 3000 },
  pro: { name: "Pro", price: 29.99, emails: 15000 },
} as const;

export const TRIAL_DAYS = 7;

export type PlanId = keyof typeof PLANS;

const RANK: Record<PlanId, number> = { free: 0, starter: 1, growth: 2, pro: 3 };

/** True when `plan` includes everything in `min`. */
export const atLeast = (plan: PlanId, min: PlanId) => RANK[plan] >= RANK[min];
