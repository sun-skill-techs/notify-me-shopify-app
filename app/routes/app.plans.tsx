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

export default function PlansPage() {
  const { current, used, grandfathered, url } = useLoaderData<typeof loader>();
  const plan = PLANS[current];
  const left = Math.max(0, plan.emails - used);

  return (
    <s-page heading="Plans">
      {left === 0 && (
        <s-banner tone="critical" heading="This month's restock emails are used up">
          <s-paragraph>
            New restock emails wait until you upgrade or the month resets. Then send
            them from the Waitlist page.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="This month">
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">
            {used.toLocaleString("en")} of {plan.emails.toLocaleString("en")} restock emails sent
          </s-text>
          <s-text color="subdued">
            {plan.name} plan{grandfathered && ", free for early users"}. The count resets on the 1st
            of each month.
          </s-text>
        </s-stack>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          return (
            <s-section key={id} heading={p.name}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-100">
                  <s-heading>{p.price ? `$${p.price} / month` : "Free"}</s-heading>
                  <s-text type="strong">
                    {p.emails.toLocaleString("en")} restock emails a month
                  </s-text>
                  {FEATURES[id].map((f) => (
                    <s-text key={f} color={f.startsWith("Everything") ? "subdued" : undefined}>
                      {f}
                    </s-text>
                  ))}
                </s-stack>
                {id === current ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : (
                  <s-button
                    href={url}
                    target="_top"
                    variant={id === "growth" ? "primary" : "secondary"}
                  >
                    {p.price ? `Choose ${p.name}` : "Switch to Free"}
                  </s-button>
                )}
              </s-stack>
            </s-section>
          );
        })}
      </s-grid>

      <s-section>
        <s-text color="subdued">
          Paid plans start with a {TRIAL_DAYS}-day free trial. Billed by Shopify in USD on
          your Shopify invoice. Signups are never capped, and you can change or cancel your
          plan any time.
        </s-text>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
