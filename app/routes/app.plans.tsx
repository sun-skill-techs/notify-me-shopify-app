import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { emailsThisMonth } from "../notify.server";
import { PLANS, TRIAL_DAYS, planFor, type PaidPlanName } from "../plans";

const DAY = 24 * 60 * 60 * 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const [{ appSubscriptions }, used, settings] = await Promise.all([
    billing.check(),
    emailsThisMonth(shop),
    db.shopSettings.findUnique({ where: { shop } }),
  ]);
  const plan = planFor(appSubscriptions.map((s) => s.name));
  const subscription = appSubscriptions.find((s) => s.name === plan.name);

  // The first paid plan uses up the trial, so cancelling and re-subscribing
  // doesn't hand out another free week.
  let trialUsed = Boolean(settings?.trialUsedAt);
  if (subscription && !trialUsed) {
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, trialUsedAt: new Date() },
      update: { trialUsedAt: new Date() },
    });
    trialUsed = true;
  }

  const trialEnds =
    subscription?.trialDays && subscription.createdAt
      ? new Date(new Date(subscription.createdAt).getTime() + subscription.trialDays * DAY)
      : null;
  const now = new Date();

  return {
    current: plan.name,
    used,
    resetsOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    trialAvailable: !trialUsed,
    trialEnds: trialEnds && trialEnds > now ? trialEnds.toISOString() : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const { appSubscriptions } = await billing.check();

  if (intent === "free") {
    for (const sub of appSubscriptions) {
      await billing.cancel({ subscriptionId: sub.id, isTest: sub.test, prorate: true });
    }
    return { ok: true, message: "You're on the Free plan" };
  }

  const plan = PLANS.find((p) => p.name === intent && p.price > 0);
  if (!plan) return { ok: false, message: "Unknown plan" };

  // Development stores (including Shopify's app review store) can't be charged,
  // so they get a test subscription that behaves the same and bills nothing.
  const res = await admin.graphql(`#graphql
    query backSoonShopPlan { shop { plan { partnerDevelopment } } }`);
  const isTest = Boolean((await res.json()).data?.shop?.plan?.partnerDevelopment);
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");

  // Throws a redirect to Shopify's approval page; the merchant comes back to this page.
  return billing.request({
    plan: plan.name as PaidPlanName,
    isTest,
    trialDays: settings?.trialUsedAt ? 0 : TRIAL_DAYS,
    returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${process.env.SHOPIFY_API_KEY}/app/plans`,
  });
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export default function PlansPage() {
  const { current, used, resetsOn, trialAvailable, trialEnds } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const plan = PLANS.find((p) => p.name === current)!;
  const left = Math.max(0, plan.emails - used);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const choose = (intent: string) => fetcher.submit({ intent }, { method: "post" });

  return (
    <s-page heading="Plans">
      {left === 0 && (
        <s-banner tone="critical" heading="This month's restock emails are used up">
          <s-paragraph>
            New restock emails are held until you upgrade or the allowance resets on{" "}
            {date(resetsOn)}. Then use Retry on the Waitlist page to send the held ones.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="This month">
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">
            {used.toLocaleString()} of {plan.emails.toLocaleString()} restock emails sent
          </s-text>
          <s-text color="subdued">
            {current} plan. Your allowance resets on {date(resetsOn)}.
            {trialEnds && ` Free trial ends ${date(trialEnds)}.`}
          </s-text>
        </s-stack>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
        {PLANS.map((p) => {
          const isCurrent = p.name === current;
          return (
            <s-section key={p.name} heading={p.name}>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-100">
                  <s-heading>{p.price ? `$${p.price} / month` : "Free"}</s-heading>
                  <s-text>{p.emails.toLocaleString()} restock emails a month</s-text>
                  <s-text color="subdued">
                    {p.price ? "No BackSoon branding in emails" : "Small “Sent with BackSoon” line in emails"}
                  </s-text>
                </s-stack>
                {isCurrent ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : p.price ? (
                  <s-button
                    variant={p.name === "Growth" ? "primary" : "secondary"}
                    disabled={busy}
                    onClick={() => choose(p.name)}
                  >
                    {trialAvailable ? `Start ${TRIAL_DAYS}-day free trial` : `Switch to ${p.name}`}
                  </s-button>
                ) : (
                  <s-button disabled={busy} onClick={() => choose("free")}>
                    Switch to Free
                  </s-button>
                )}
              </s-stack>
            </s-section>
          );
        })}
      </s-grid>

      <s-section heading="Every plan includes">
        <s-stack direction="block" gap="small-100">
          <s-text>Notify me button and popup, designed to match your store</s-text>
          <s-text>Emails, popup and unsubscribe page in your language</s-text>
          <s-text>Waitlist with demand charts and CSV export</s-text>
          <s-text>Signups added to your Shopify customers</s-text>
          <s-text color="subdued">
            Signups are never capped. When a month&apos;s emails run out, new restock
            emails are held; send them with Retry on the Waitlist page after you upgrade
            or the allowance resets. Billed by Shopify in USD; cancel any time by
            switching to Free.
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
