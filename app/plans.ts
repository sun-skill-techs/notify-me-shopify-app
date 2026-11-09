// Pricing. Plans differ only in how many restock emails go out per calendar
// month; every feature is on every plan. Paid plans bill through Shopify
// (billing config in shopify.server.ts) and start with a free trial.

export const TRIAL_DAYS = 7;

export const PLANS = [
  { name: "Free", price: 0, emails: 50 },
  { name: "Starter", price: 7.99, emails: 500 },
  { name: "Growth", price: 14.99, emails: 3000 },
  { name: "Pro", price: 29.99, emails: 15000 },
] as const;

export type Plan = (typeof PLANS)[number];
export type PaidPlanName = Exclude<Plan["name"], "Free">;

/** The plan behind a shop's active Shopify subscriptions; none means Free. */
export function planFor(subscriptionNames: string[]): Plan {
  return PLANS.find((p) => subscriptionNames.includes(p.name)) ?? PLANS[0];
}

/** Usage resets on the 1st of each month, UTC. */
export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
