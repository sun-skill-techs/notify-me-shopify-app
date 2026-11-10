import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { effectivePlan, emailsUsed } from "../plans.server";
import { PLANS, TRIAL_DAYS, type PlanId } from "../plans";

// What each plan adds over the one before. Keep in step with the atLeast() checks.
const FEATURES: Record<PlanId, string[]> = {
  free: [
    "Notify me button and popup on sold-out products",
    "Emails, popup and unsubscribe page in your language",
    "Waitlist with demand charts",
    "Small “Sent with BackSoon” line in emails",
  ],
  starter: [
    "Everything in Free",
    "Emails from your own sender name",
    "No BackSoon line in emails",
    "Custom CSS for the button and popup",
    "Download your waitlist as CSV",
  ],
  growth: [
    "Everything in Starter",
    "Your logo and button color in emails",
    "Email shoppers again on every restock",
    "Clicks, orders and revenue from restock emails",
  ],
  pro: ["Everything in Growth", "Built for stores with big waitlists"],
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // Re-check the plan as soon as they're back from the plan page, not after the 5-minute cache.
  await db.shopSettings.updateMany({ where: { shop: session.shop }, data: { planCheckedAt: null } });
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });

  // The dev app has its own handle; set SHOPIFY_APP_HANDLE for it.
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "restock-alerts-sun-skill-techs";
  return {
    current: effectivePlan(settings),
    used: emailsUsed(settings),
    grandfathered: Boolean(settings?.grandfathered && settings.plan === "free"),
    // Shopify hosts the checkout; shopify://admin opens it without reloading the admin.
    url: `shopify://admin/charges/${appHandle}/pricing_plans`,
  };
};


export default function PlansPage() {
  const { current, used, grandfathered, url } = useLoaderData<typeof loader>();
  const plan = PLANS[current];
  const left = Math.max(0, plan.emails - used);
  const usage = Math.min(1, used / plan.emails);

  return (
    <s-page heading="Plans">
      <style>{PLANS_CSS}</style>

      <s-banner
        tone={left === 0 ? "critical" : usage >= 0.8 ? "warning" : "info"}
        heading={`You're on the ${plan.name} plan${grandfathered ? ", free for early users" : ""}`}
      >
        <s-paragraph>
          {used.toLocaleString("en")} of {plan.emails.toLocaleString("en")} restock emails sent
          this month. Resets on the 1st.{" "}
          {left === 0
            ? "New restock emails wait until you upgrade or the month resets."
            : `Paid plans start with a ${TRIAL_DAYS}-day free trial, billed by Shopify.`}
        </s-paragraph>
      </s-banner>

      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(210px, 1fr))" gap="base">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            const isCurrent = id === current;
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
                      {p.price ? `${TRIAL_DAYS}-day free trial` : "No card needed"}
                    </s-text>
                  </s-stack>

                  {!isCurrent && (
                    <s-stack direction="inline">
                      <s-button
                        href={url}
                        target="_top"
                        variant={id === "growth" ? "primary" : "secondary"}
                      >
                        {`Choose ${p.name}`}
                      </s-button>
                    </s-stack>
                  )}

                  <s-divider />

                  <s-unordered-list>
                    <s-list-item>
                      <s-text type="strong">
                        {p.emails.toLocaleString("en")} restock emails a month
                      </s-text>
                    </s-list-item>
                    {FEATURES[id].map((f) => (
                      <s-list-item key={f}>{f}</s-list-item>
                    ))}
                  </s-unordered-list>
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
