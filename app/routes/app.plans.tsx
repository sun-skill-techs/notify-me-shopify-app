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
  free: "Try BackSoon on a small catalog",
  starter: "Make the emails your own",
  growth: "Win back more sales on every restock",
  pro: "For stores with big waitlists",
};

export default function PlansPage() {
  const { current, used, grandfathered, url } = useLoaderData<typeof loader>();
  const plan = PLANS[current];
  const left = Math.max(0, plan.emails - used);
  const usage = Math.min(1, used / plan.emails);

  return (
    <s-page heading="Plans" inlineSize="large">
      <style>{PLANS_CSS}</style>

      {left === 0 && (
        <s-banner
          tone="critical"
          heading="This month's restock emails are used up"
        >
          <s-paragraph>
            New restock emails wait until you upgrade or the month resets. Then
            send them from the Waitlist page.
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
              className={
                usage >= 0.8
                  ? "bs-usage__fill bs-usage__fill--warn"
                  : "bs-usage__fill"
              }
            />
          </div>
          <s-text color="subdued">
            {used.toLocaleString("en")} of {plan.emails.toLocaleString("en")}{" "}
            restock emails sent this month. Resets on the 1st.
          </s-text>
        </s-stack>
      </s-section>

      <div className="bs-plans">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const [first, ...rest] = FEATURES[id];
          const base = first.startsWith("Everything") ? first : null;
          const items = base ? rest : FEATURES[id];
          const isCurrent = id === current;
          const popular = id === "growth";
          return (
            <div
              key={id}
              className={`bs-plan${popular ? " bs-plan--popular" : ""}${isCurrent ? " bs-plan--current" : ""}`}
            >
              {popular && <span className="bs-plan__ribbon">Most popular</span>}
              <div className="bs-plan__head">
                <h2 className="bs-plan__name">{p.name}</h2>
                {isCurrent && <s-badge tone="success">Current plan</s-badge>}
              </div>
              <p className="bs-plan__tagline">{TAGLINES[id]}</p>

              <p className="bs-plan__price">
                {p.price ? (
                  <>
                    <span className="bs-plan__amount">${p.price}</span>
                    <span className="bs-plan__period"> / month</span>
                  </>
                ) : (
                  <span className="bs-plan__amount">Free</span>
                )}
              </p>
              <p className="bs-plan__trial">
                {p.price ? `${TRIAL_DAYS}-day free trial` : "Free forever"}
              </p>

              <div className="bs-plan__cta">
                {isCurrent ? (
                  <s-button inlineSize="fill" disabled>
                    Your current plan
                  </s-button>
                ) : (
                  <s-button
                    href={url}
                    target="_top"
                    inlineSize="fill"
                    variant={popular ? "primary" : "secondary"}
                  >
                    {p.price
                      ? PLANS[current].price < p.price
                        ? `Upgrade to ${p.name}`
                        : `Switch to ${p.name}`
                      : "Switch to Free"}
                  </s-button>
                )}
              </div>

              <div className="bs-plan__quota">
                <strong>{p.emails.toLocaleString("en")}</strong> restock emails
                a month
              </div>

              {base && <p className="bs-plan__base">{base}, plus:</p>}
              <ul className="bs-plan__features">
                {items.map((f) => (
                  <li key={f}>
                    <s-icon type="check" tone="success" size="small" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <s-section>
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
          gap="base"
        >
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Billed by Shopify</s-text>
            <s-text color="subdued">
              Charges show on your Shopify invoice, in USD.
            </s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Signups never capped</s-text>
            <s-text color="subdued">
              Shoppers can always join the waitlist. Plans only limit emails
              sent.
            </s-text>
          </s-stack>
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Change any time</s-text>
            <s-text color="subdued">
              Upgrade, downgrade or cancel in one click.
            </s-text>
          </s-stack>
        </s-grid>
      </s-section>
    </s-page>
  );
}

const PLANS_CSS = `
  .bs-usage { height: 8px; max-width: 360px; border-radius: 4px; background: #e3e3e3; overflow: hidden; }
  .bs-usage__fill { height: 100%; border-radius: 4px; background: #29845a; transition: width 0.3s; }
  .bs-usage__fill--warn { background: #e51c00; }

  .bs-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 16px 0; align-items: stretch; }
  .bs-plan { position: relative; display: flex; flex-direction: column; padding: 24px 20px 20px; background: #fff; border: 1px solid #e3e3e3; border-radius: 12px; box-shadow: 0 1px 0 rgba(26,26,26,0.07); }
  .bs-plan--popular { border: 2px solid #303030; padding: 23px 19px 19px; box-shadow: 0 8px 24px rgba(26,26,26,0.12); }
  .bs-plan--current { background: #f7fbf9; border-color: #29845a; }
  .bs-plan__ribbon { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); padding: 2px 10px; border-radius: 999px; background: #303030; color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .bs-plan__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; }
  .bs-plan__name { margin: 0; font-size: 16px; font-weight: 650; }
  .bs-plan__tagline { margin: 4px 0 0; min-height: 40px; color: #616161; font-size: 13px; line-height: 20px; }
  .bs-plan__price { margin: 16px 0 0; line-height: 1; }
  .bs-plan__amount { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
  .bs-plan__period { color: #616161; font-size: 14px; }
  .bs-plan__trial { margin: 6px 0 0; color: #616161; font-size: 12px; }
  .bs-plan__cta { margin: 16px 0; }
  .bs-plan__quota { padding: 10px 12px; border-radius: 8px; background: #f1f1f1; font-size: 13px; }
  .bs-plan--current .bs-plan__quota { background: #e3f1df; }
  .bs-plan__base { margin: 16px 0 0; color: #616161; font-size: 13px; font-weight: 600; }
  .bs-plan__features { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; font-size: 13px; line-height: 20px; }
  .bs-plan__features li { display: grid; grid-template-columns: 20px 1fr; gap: 6px; align-items: start; }
  .bs-plan__features s-icon { margin-top: 2px; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
