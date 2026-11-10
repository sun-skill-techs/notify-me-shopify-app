// Plan names and monthly restock-email allowances. Shared by the server and the
// admin UI. Keep in step with the plans in the Partner Dashboard.
export const PLANS = {
  free: { name: "Free", emails: 50 },
  starter: { name: "Starter", emails: 500 },
  growth: { name: "Growth", emails: 3000 },
  pro: { name: "Pro", emails: 15000 },
} as const;

export type PlanId = keyof typeof PLANS;

const RANK: Record<PlanId, number> = { free: 0, starter: 1, growth: 2, pro: 3 };

/** True when `plan` includes everything in `min`. */
export const atLeast = (plan: PlanId, min: PlanId) => RANK[plan] >= RANK[min];
