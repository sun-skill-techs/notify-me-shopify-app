import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { earlyFree, effectivePlan, emailsUsed, refreshPlan } from "../plans.server";
import { dropCustomCss } from "../widget.server";
import { PLANS, TRIAL_DAYS, atLeast, type PlanId } from "../plans";

// Every card lists every feature, ticked from the plan that unlocks it.
// Keep in step with the atLeast() checks.
const FEATURES: [string, PlanId][] = [
  ["Notify me button & popup", "free"],
  ["Emails in your language", "free"],
  ["Waitlist & demand charts", "free"],
  ["Your own sender name", "starter"],
  ["No BackSoon branding", "starter"],
  ["Custom CSS", "starter"],
  ["Waitlist CSV export", "starter"],
  ["Logo & button color", "growth"],
  ["Email on every restock", "growth"],
  ["Revenue tracking", "growth"],
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // Re-check the plan as soon as they're back from the plan page, not after the 5-minute cache.
  await db.shopSettings.updateMany({ where: { shop: session.shop }, data: { planCheckedAt: null } });
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });

  return {
    current: effectivePlan(settings),
    used: emailsUsed(settings),
    grandfathered: earlyFree(settings),
    trialAvailable: !settings?.trialUsedAt,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const id = String((await request.formData()).get("plan") ?? "") as PlanId;
  if (!(id in PLANS)) return { ok: false, message: "Unknown plan" };

  if (id === "free") {
    const { appSubscriptions } = await billing.check();
    for (const sub of appSubscriptions) {
      await billing.cancel({ subscriptionId: sub.id, isTest: sub.test, prorate: true });
    }
    const { settings } = await refreshPlan(session.shop, { maxAgeMs: 0 });
    if (effectivePlan(settings) === "free") await dropCustomCss(admin);
    return { ok: true, message: "You're on the Free plan" };
  }

  // Development stores (including Shopify's app review store) can't be charged,
  // so they get a test subscription that behaves the same and bills nothing.
  const res = await admin.graphql(`#graphql
    query notifyMeShopPlan { shop { plan { partnerDevelopment } } }`);
  const isTest = Boolean((await res.json()).data?.shop?.plan?.partnerDevelopment);
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");

  try {
    // Throws a redirect to Shopify's approval page for this plan; app.tsx
    // re-checks the plan when Shopify sends the merchant back with charge_id.
    return await billing.request({
      plan: PLANS[id].name,
      isTest,
      trialDays: settings?.trialUsedAt ? 0 : TRIAL_DAYS,
      returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${process.env.SHOPIFY_API_KEY}/app/plans`,
    });
  } catch (e) {
    if (e instanceof Response) throw e;
    console.error("notify-me: billing request failed", e);
    return { ok: false, message: "Couldn't open Shopify's approval page. Try again." };
  }
};


export default function PlansPage() {
  const { current, used, grandfathered, trialAvailable } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const plan = PLANS[current];
  const left = Math.max(0, plan.emails - used);
  const usage = Math.min(1, used / plan.emails);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <s-page heading="Plans">
      <style>{PLANS_CSS}</style>

      <s-banner
        tone={left === 0 ? "critical" : usage >= 0.8 ? "warning" : "info"}
        heading={`You're on the ${plan.name} plan${grandfathered ? ", free for early users until December 11" : ""}`}
      >
        <s-paragraph>
          {used.toLocaleString("en")} of {plan.emails.toLocaleString("en")} restock emails sent
          this month. Resets on the 1st.{" "}
          {left === 0
            ? "New restock emails wait until you upgrade or the month resets."
            : trialAvailable
              ? `Paid plans start with a ${TRIAL_DAYS}-day free trial, billed by Shopify.`
              : "Paid plans are billed monthly by Shopify."}
        </s-paragraph>
      </s-banner>

      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(210px, 1fr))" gap="base">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            // Early users aren't subscribed to Pro, so every paid plan stays choosable.
            const isCurrent = !grandfathered && id === current;
            return (
              <s-box
                key={id}
                border="base"
                borderRadius="large"
                padding="base"
                background={isCurrent ? "subdued" : "base"}
                blockSize="100%"
              >
                <s-stack direction="block" gap="base">
                  <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                    <s-text type="strong">{p.name}</s-text>
                    {isCurrent ? (
                      <s-badge tone="success">Current plan</s-badge>
                    ) : (
                      id === "growth" && <s-badge tone="info">Most popular</s-badge>
                    )}
                  </s-grid>

                  <s-stack direction="block" gap="small-200">
                    <p className="bs-price">
                      ${p.price}
                      <span>{p.price ? "/ month" : "forever"}</span>
                    </p>
                    <s-text color="subdued">
                      {!p.price ? "No card needed" : trialAvailable ? `${TRIAL_DAYS}-day free trial` : "Billed monthly"}
                    </s-text>
                  </s-stack>

                  {!isCurrent && !(grandfathered && id === "free") && (
                    <s-stack direction="inline">
                      <s-button
                        variant={id === "growth" ? "primary" : "secondary"}
                        disabled={busy}
                        onClick={() => fetcher.submit({ plan: id }, { method: "post" })}
                      >
                        {`Choose ${p.name}`}
                      </s-button>
                    </s-stack>
                  )}

                  <s-divider />

                  <s-stack direction="block" gap="small-200">
                    <s-text type="strong">
                      {p.emails.toLocaleString("en")} emails a month
                    </s-text>
                    {FEATURES.map(([f, min]) => {
                      const has = atLeast(id, min);
                      return (
                        <s-grid key={f} gridTemplateColumns="auto 1fr" gap="small-200">
                          <s-icon type={has ? "check" : "x"} tone={has ? "success" : "neutral"} />
                          <s-text color={has ? "base" : "subdued"}>{f}</s-text>
                        </s-grid>
                      );
                    })}
                  </s-stack>
                </s-stack>
              </s-box>
            );
          })}
        </s-grid>
      </s-section>
    </s-page>
  );
}

const PLANS_CSS = `
  .bs-price { display: flex; align-items: baseline; gap: 6px; margin: 0; font-size: 30px; font-weight: 700; line-height: 36px; }
  .bs-price span { font-size: 14px; font-weight: 450; color: #616161; white-space: nowrap; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
