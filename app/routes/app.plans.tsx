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
    "Notify me button and popup",
    "Emails, popup and unsubscribe page in your language",
    "Waitlist with demand charts",
    "Small “Sent with BackSoon” line in emails",
  ],
  starter: [
    "Everything in Free",
    "Your own sender name",
    "No BackSoon line in emails",
    "Custom CSS for the button and popup",
    "Waitlist CSV export",
  ],
  growth: [
    "Everything in Starter",
    "Email button color and your logo",
    "Email shoppers on every restock",
    "Clicks, orders and revenue from restock emails",
  ],
  pro: ["Everything in Growth", "For stores with big waitlists"],
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

// One line under each plan name: who it's for.
const TAGLINES: Record<PlanId, string> = {
  free: "For small catalogs",
  starter: "Make the emails your own",
  growth: "Win back more sales",
  pro: "For high-volume stores",
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
          const [first, ...rest] = FEATURES[id];
          const base = first.startsWith("Everything") ? first : null;
          const items = base ? rest : FEATURES[id];
          const isCurrent = id === current;
          return (
            <s-section key={id}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-heading>{p.name}</s-heading>
                    {isCurrent ? (
                      <s-badge tone="success">Current</s-badge>
                    ) : (
                      id === "growth" && <s-badge tone="info">Most popular</s-badge>
                    )}
                  </s-stack>
                  <s-text color="subdued">{TAGLINES[id]}</s-text>
                </s-stack>

                <s-stack direction="block" gap="small-100">
                  <p className="bs-price">
                    {p.price ? `$${p.price}` : "Free"}
                    {p.price > 0 && <span> / month</span>}
                  </p>
                  <s-text color="subdued">
                    {p.price ? `${TRIAL_DAYS}-day free trial` : "Free forever"}
                  </s-text>
                </s-stack>

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

                <s-divider />

                <s-stack direction="block" gap="small-200">
                  <s-text type="strong">
                    {p.emails.toLocaleString("en")} restock emails a month
                  </s-text>
                  {base && <s-text color="subdued">{base}, plus:</s-text>}
                  {items.map((f) => (
                    <s-grid key={f} gridTemplateColumns="auto 1fr" gap="small-200">
                      <s-icon type="check" tone="success" />
                      <s-text>{f}</s-text>
                    </s-grid>
                  ))}
                </s-stack>
              </s-stack>
            </s-section>
          );
        })}
      </s-grid>
      </div>

      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Billed by Shopify</s-text>
            <s-text color="subdued">Charges show on your Shopify invoice, in USD.</s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Signups never capped</s-text>
            <s-text color="subdued">
              Shoppers can always join the waitlist. Plans only limit emails sent.
            </s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Change any time</s-text>
            <s-text color="subdued">Upgrade, downgrade or cancel in one click.</s-text>
          </s-stack>
        </s-grid>
      </s-section>
    </s-page>
  );
}

const PLANS_CSS = `
  .bs-usage { height: 8px; border-radius: 4px; background: #e3e3e3; overflow: hidden; }
  .bs-usage__fill { height: 100%; border-radius: 4px; background: #29845a; transition: width 0.3s; }
  .bs-usage__fill--warn { background: #e51c00; }
  .bs-plans { margin-block: 16px; }
  .bs-price { margin: 0; font-size: 28px; font-weight: 700; line-height: 32px; }
  .bs-price span { font-size: 14px; font-weight: 450; color: #616161; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
