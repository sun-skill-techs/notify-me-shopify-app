import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [pending, sent, failed, unsubscribed, recent, variantsWithDemand] =
    await Promise.all([
      db.restockSubscription.count({
        where: { shop: session.shop, status: "PENDING" },
      }),
      db.restockSubscription.count({
        where: { shop: session.shop, status: "SENT" },
      }),
      db.restockSubscription.count({
        where: { shop: session.shop, status: "FAILED" },
      }),
      db.restockSubscription.count({
        where: { shop: session.shop, status: "UNSUBSCRIBED" },
      }),
      db.restockSubscription.count({
        where: {
          shop: session.shop,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.restockSubscription
        .findMany({
          where: { shop: session.shop, status: "PENDING" },
          distinct: ["variantId"],
          select: { variantId: true },
        })
        .then((r) => r.length),
    ]);

  return { pending, sent, failed, unsubscribed, recent, variantsWithDemand };
};

/** A status line: label on the left, value on the right, tone on the value. */
function Stat({
  label,
  value,
  tone = "auto",
}: {
  label: string;
  value: number;
  tone?: "auto" | "critical" | "success" | "info";
}) {
  return (
    <s-stack direction="inline" justifyContent="space-between" gap="base">
      <s-text color="subdued">{label}</s-text>
      <s-text type="strong" tone={tone} fontVariantNumeric="tabular-nums">
        {value.toLocaleString()}
      </s-text>
    </s-stack>
  );
}

/** A setup step that reports whether it is already satisfied. */
function Step({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <s-stack direction="inline" gap="small-100" alignItems="start">
      <s-icon
        type={done ? "check-circle-filled" : "circle-dashed"}
        tone={done ? "success" : "neutral"}
        size="small"
      />
      <s-stack direction="block" gap="small-500">
        <s-text type={done ? "redundant" : "strong"}>{title}</s-text>
        <s-text color="subdued">{children}</s-text>
      </s-stack>
    </s-stack>
  );
}

export default function Index() {
  const { pending, sent, failed, unsubscribed, recent, variantsWithDemand } =
    useLoaderData<typeof loader>();

  const hasSignups = pending + sent + failed + unsubscribed > 0;
  const hasSent = sent > 0;

  return (
    <s-page heading="Notify Me">
      <s-button slot="primary-action" href="/app/waitlist" variant="primary">
        View waitlist
      </s-button>

      {failed > 0 && (
        <s-banner tone="warning" heading="Some emails could not be delivered">
          <s-paragraph>
            {failed.toLocaleString()} notification
            {failed === 1 ? "" : "s"} failed to send. Confirm{" "}
            <s-text type="strong">RESEND_API_KEY</s-text> and{" "}
            <s-text type="strong">RESEND_FROM</s-text> are set correctly in your
            app environment, then restock a variant to retry.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Demand" accessibilityLabel="Current demand">
        <s-stack direction="block" gap="base">
          {hasSignups ? (
            <s-stack direction="inline" gap="small-100" alignItems="center">
              <s-badge tone="info" size="large-100" icon="person-list">
                {pending.toLocaleString()} waiting
              </s-badge>
              <s-text color="subdued">
                {variantsWithDemand > 0
                  ? `across ${variantsWithDemand.toLocaleString()} sold-out variant${
                      variantsWithDemand === 1 ? "" : "s"
                    }`
                  : "no variants currently sold out"}
              </s-text>
            </s-stack>
          ) : (
            <s-paragraph color="subdued">
              No signups yet. Finish the steps below and the first sold-out
              variant will start collecting demand.
            </s-paragraph>
          )}

          <s-divider />

          <s-stack direction="block" gap="small-200">
            <Stat label="Notified" value={sent} tone={hasSent ? "success" : "auto"} />
            <s-divider />
            <Stat
              label="Failed"
              value={failed}
              tone={failed > 0 ? "critical" : "auto"}
            />
            <s-divider />
            <Stat label="Unsubscribed" value={unsubscribed} />
            <s-divider />
            <Stat label="New in last 7 days" value={recent} />
          </s-stack>

          {hasSignups && (
            <s-button href="/app/waitlist" variant="secondary" icon="chart-vertical">
              See which variants to reorder
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Setup" accessibilityLabel="Setup checklist">
        <s-stack direction="block" gap="base">
          <Step done={hasSignups} title="Add the app block to your theme">
            In the theme editor, open a product template and add the{" "}
            <s-text type="strong">Notify me</s-text> block. It renders only on
            sold-out variants.
          </Step>
          <s-divider />
          <Step done={hasSent} title="Connect email delivery">
            Set <s-text type="strong">RESEND_API_KEY</s-text> and{" "}
            <s-text type="strong">RESEND_FROM</s-text> in your app environment
            so notifications can send.
          </Step>
          <s-divider />
          <Step done={hasSent} title="Run one end-to-end test">
            Sell out a variant, submit the storefront form, then restock it and
            confirm the email arrives.
          </Step>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-stack direction="block" gap="small-100">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-icon type="product-unavailable" tone="neutral" size="small" />
            <s-text>Variant sells out</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-icon type="person-add" tone="neutral" size="small" />
            <s-text>Shopper joins the waitlist</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-icon type="inventory-updated" tone="neutral" size="small" />
            <s-text>Stock returns</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-icon type="send" tone="success" size="small" />
            <s-text>One email goes out</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Privacy">
        <s-paragraph color="subdued">
          Only the email address, selected variant, and subscription state are
          stored. Every notification includes an unsubscribe link.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
