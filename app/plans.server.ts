import db from "./db.server";
import { PLANS, type PlanId } from "./plans";

// Plans, prices and trials live in the Partner Dashboard (Shopify App Pricing).
// Shopify hosts the plan page and the trial; it already stops a store that
// reinstalls from getting a fresh trial (trial days are tracked for 180 days).
// The app only reads which plan a store is on, from the Partner API.

type Settings = Awaited<ReturnType<typeof db.shopSettings.findUnique>>;

// Plan handles come from the Partner Dashboard, so match on the name:
// "starter", "starter-yearly" and "Starter plan" all count as Starter.
export function planFromHandles(handles: (string | null | undefined)[]): PlanId {
  const h = handles.join(" ").toLowerCase();
  if (/\bpro\b/.test(h)) return "pro";
  return h.includes("growth") ? "growth" : h.includes("starter") ? "starter" : "free";
}

/** The plan whose features apply. Grandfathered stores get at least Starter. */
export function effectivePlan(s: Pick<NonNullable<Settings>, "plan" | "grandfathered"> | null): PlanId {
  const plan: PlanId = s && s.plan in PLANS ? (s.plan as PlanId) : "free";
  return s?.grandfathered && plan === "free" ? "starter" : plan;
}

const month = (now = new Date()) => now.toISOString().slice(0, 7);

/** Restock emails sent this calendar month (UTC). */
export function emailsUsed(s: Pick<NonNullable<Settings>, "usageMonth" | "usageCount"> | null) {
  return s?.usageMonth === month() ? s.usageCount : 0;
}

export async function countEmailSent(shop: string) {
  const m = month();
  const { count } = await db.shopSettings.updateMany({
    where: { shop, usageMonth: m },
    data: { usageCount: { increment: 1 } },
  });
  if (count) return;
  // First send this month (or the first ever): start the count over.
  await db.shopSettings.upsert({
    where: { shop },
    create: { shop, usageMonth: m, usageCount: 1 },
    update: { usageMonth: m, usageCount: 1 },
  });
}

const partnerApiConfigured = Boolean(
  process.env.SHOPIFY_PARTNER_ORG_ID &&
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN &&
    process.env.SHOPIFY_APP_GID,
);
if (!partnerApiConfigured && process.env.NODE_ENV !== "test") {
  console.warn(
    "notify-me: SHOPIFY_PARTNER_ORG_ID, SHOPIFY_PARTNER_API_ACCESS_TOKEN and SHOPIFY_APP_GID are not set; paid plans won't be detected",
  );
}

async function fetchPlan(shopGid: string): Promise<PlanId> {
  const { SHOPIFY_PARTNER_ORG_ID, SHOPIFY_PARTNER_API_ACCESS_TOKEN, SHOPIFY_APP_GID } = process.env;
  const res = await fetch(
    `https://partners.shopify.com/${SHOPIFY_PARTNER_ORG_ID}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_PARTNER_API_ACCESS_TOKEN ?? "",
      },
      body: JSON.stringify({
        query: `query ($appId: ID!, $shopId: ID!) {
          activeSubscription(appId: $appId, shopId: $shopId) { items { handle } }
        }`,
        variables: { appId: SHOPIFY_APP_GID, shopId: shopGid },
      }),
    },
  );
  const { data, errors } = await res.json();
  // Throw rather than fall back to Free, so a throttled call never downgrades a paying store.
  if (!res.ok || errors) throw new Error(`Partner API: ${JSON.stringify(errors ?? res.status)}`);
  const items: { handle: string | null }[] = data?.activeSubscription?.items ?? [];
  return planFromHandles(items.map((i) => i.handle));
}

/**
 * The shop's settings with a plan no older than maxAgeMs. getShopGid is only
 * called when the shop GID isn't stored yet. On a Partner API failure the
 * cached plan stands.
 */
export async function refreshPlan(
  shop: string,
  { maxAgeMs = 5 * 60 * 1000, getShopGid }: { maxAgeMs?: number; getShopGid?: () => Promise<string> } = {},
) {
  const s = await db.shopSettings.findUnique({ where: { shop } });
  // Without Partner API credentials every store stays on its stored plan (Free,
  // or Starter if grandfathered). Warned about once at startup, below.
  if (!partnerApiConfigured) return { settings: s, refreshed: false };
  if (s?.planCheckedAt && Date.now() - s.planCheckedAt.getTime() < maxAgeMs) {
    return { settings: s, refreshed: false };
  }
  try {
    const shopGid = s?.shopGid ?? (await getShopGid?.());
    if (!shopGid) return { settings: s, refreshed: false };
    const plan = await fetchPlan(shopGid);
    const data = { plan, shopGid, planCheckedAt: new Date() };
    const settings = await db.shopSettings.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });
    return { settings, refreshed: true };
  } catch (e) {
    console.error("notify-me: plan check failed", e);
    return { settings: s, refreshed: false };
  }
}

/** The shop's plan as last checked. Admin pages use this; app.tsx keeps it fresh. */
export async function shopPlan(shop: string) {
  return effectivePlan(await db.shopSettings.findUnique({ where: { shop } }));
}
