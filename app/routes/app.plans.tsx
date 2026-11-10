import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { effectivePlan, emailsUsed } from "../plans.server";
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
  ["Re-email on every restock", "growth"],
  ["Revenue tracking", "growth"],
];

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

      {left === 0 && (
        <s-banner tone="critical" heading="This month's restock emails are used up">
          <s-paragraph>
            New restock emails wait until you upgrade or the month resets. Then send
            them from the Waitlist page.
          </s-paragraph>
        </s-banner>
      )}

      <s-section>
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">
            You&apos;re on {plan.name}
            {grandfathered && ", free for early users"}
          </s-text>
          <div
            role="progressbar"
            aria-label="Restock emails sent this month"
            aria-valuemin={0}
            aria-valuemax={plan.emails}
            aria-valuenow={used}
            className="bs-usage"
          >
            <div
              style={{ width: `${usage * 100}%` }}
              className={usage >= 0.8 ? "bs-usage__fill bs-usage__fill--warn" : "bs-usage__fill"}
            />
          </div>
          <s-text color="subdued">
            {used.toLocaleString("en")} of {plan.emails.toLocaleString("en")} restock emails
            sent this month. Resets on the 1st.
          </s-text>
        </s-stack>
      </s-section>

      <div className="bs-plans">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            const isCurrent = id === current;
            return (
              <s-section key={id}>
                <div className="bs-card">
                  <s-stack direction="block" gap="small-300">
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-heading>{p.name}</s-heading>
                      {isCurrent ? (
                        <s-badge tone="success">Current plan</s-badge>
                      ) : (
                        id === "growth" && <s-badge tone="info">Recommended</s-badge>
                      )}
                    </s-stack>
                    <p className="bs-price">
                      ${p.price}
                      <span>/month</span>
                    </p>
                    <s-text color="subdued">
                      {p.price ? `${TRIAL_DAYS}-day free trial` : "Free forever"}
                    </s-text>
                  </s-stack>

                  <div className="bs-quota">
                    <s-text type="strong">{p.emails.toLocaleString("en")}</s-text>{" "}
                    <s-text color="subdued">emails / month</s-text>
                  </div>

                  {isCurrent ? (
                    <s-button inlineSize="fill" disabled>
                      Current plan
                    </s-button>
                  ) : (
                    <s-button
                      href={url}
                      target="_top"
                      inlineSize="fill"
                      variant={id === "growth" ? "primary" : "secondary"}
                    >
                      {plan.price < p.price ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                    </s-button>
                  )}

                  <s-stack direction="block" gap="small-200">
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
                </div>
              </s-section>
            );
          })}
        </s-grid>
      </div>

      <s-text color="subdued">
        Paid plans start with a {TRIAL_DAYS}-day free trial. Billed by Shopify in USD. Signups
        are never capped. Change or cancel any time.
      </s-text>
    </s-page>
  );
}

const PLANS_CSS = `
  .bs-usage { height: 8px; border-radius: 4px; background: #e3e3e3; overflow: hidden; }
  .bs-usage__fill { height: 100%; border-radius: 4px; background: #29845a; transition: width 0.3s; }
  .bs-usage__fill--warn { background: #e51c00; }
  .bs-plans { margin-block: 16px; }
  .bs-card { display: flex; flex-direction: column; gap: 16px; height: 100%; }
  .bs-price { display: flex; align-items: baseline; gap: 4px; height: 36px; margin: 8px 0 0; font-size: 30px; font-weight: 700; line-height: 36px; letter-spacing: -0.5px; }
  .bs-price span { font-size: 14px; font-weight: 450; color: #616161; letter-spacing: 0; }
  .bs-quota { padding: 10px 12px; border-radius: 8px; background: #f1f1f1; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
