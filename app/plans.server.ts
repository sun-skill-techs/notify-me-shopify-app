import db from "./db.server";
import { PLANS, type PlanId } from "./plans";

import { unauthenticated } from "./shopify.server";

// Paid plans bill through the Shopify Billing API (billing config in
// shopify.server.ts). The app reads which plan a store is on from its active
// app subscriptions and caches it, so webhooks don't query Shopify every send.

type Settings = Awaited<ReturnType<typeof db.shopSettings.findUnique>>;

// Subscription names are the billing keys in shopify.server.ts ("Starter", ...).
// Match loosely so a renamed plan ("Starter plan") still counts.
export function planFromNames(names: string[]): PlanId {
  const h = names.join(" ").toLowerCase();
  if (/\bpro\b/.test(h)) return "pro";
  return h.includes("growth") ? "growth" : h.includes("starter") ? "starter" : "free";
}

// Stores installed before paid plans launched get every feature free until this
// date, then fall to Free like anyone else.
export const EARLY_USERS_UNTIL = new Date("2026-12-11T00:00:00Z");

/** True while a grandfathered store with no paid plan is in its free month. */
export function earlyFree(s: Pick<NonNullable<Settings>, "plan" | "grandfathered"> | null, now = new Date()) {
  return Boolean(s?.grandfathered && !(s.plan in PLANS && s.plan !== "free") && now < EARLY_USERS_UNTIL);
}

/** The plan whose features apply. Grandfathered stores get Pro during their free month. */
export function effectivePlan(s: Pick<NonNullable<Settings>, "plan" | "grandfathered"> | null, now = new Date()): PlanId {
  if (earlyFree(s, now)) return "pro";
  return s && s.plan in PLANS ? (s.plan as PlanId) : "free";
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

async function fetchPlan(shop: string): Promise<PlanId> {
  // Throws when the shop has no session (uninstalled) or the call fails, so a
  // failed check never downgrades a paying store.
  const { admin } = await unauthenticated.admin(shop);
  const res = await admin.graphql(`#graphql
    query notifyMePlan { currentAppInstallation { activeSubscriptions { name } } }`);
  const { data } = await res.json();
  const subs: { name: string }[] = data?.currentAppInstallation?.activeSubscriptions ?? [];
  return planFromNames(subs.map((s) => s.name));
}

/** The shop's settings with a plan no older than maxAgeMs. On a failed check the cached plan stands. */
export async function refreshPlan(shop: string, { maxAgeMs = 5 * 60 * 1000 }: { maxAgeMs?: number } = {}) {
  const s = await db.shopSettings.findUnique({ where: { shop } });
  if (s?.planCheckedAt && Date.now() - s.planCheckedAt.getTime() < maxAgeMs) {
    return { settings: s, refreshed: false };
  }
  try {
    const plan = await fetchPlan(shop);
    const data = {
      plan,
      planCheckedAt: new Date(),
      // The first paid plan uses up the trial, so cancelling and re-subscribing
      // doesn't hand out another free week.
      ...(plan !== "free" && !s?.trialUsedAt ? { trialUsedAt: new Date() } : {}),
    };
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
