// Plan names and monthly restock-email allowances. Shared by the server and the
// admin UI. Keep in step with the plans in the Partner Dashboard.
export const PLANS = {
  free: { name: "Free", emails: 50 },
  basic: { name: "Basic", emails: 1000 },
  grow: { name: "Grow", emails: 5000 },
} as const;

export type PlanId = keyof typeof PLANS;

const RANK: Record<PlanId, number> = { free: 0, basic: 1, grow: 2 };

/** True when `plan` includes everything in `min`. */
export const atLeast = (plan: PlanId, min: PlanId) => RANK[plan] >= RANK[min];
