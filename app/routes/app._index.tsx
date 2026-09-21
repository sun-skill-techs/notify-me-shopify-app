import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [byStatus, recent, demand, settings] = await Promise.all([
    db.restockSubscription.groupBy({
      by: ["status"],
      where: { shop },
      _count: { _all: true },
    }),
    db.restockSubscription.count({
      where: { shop, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    db.restockSubscription.findMany({
      where: { shop, status: "PENDING" },
      distinct: ["variantId"],
      select: { variantId: true },
    }),
    db.shopSettings.findUnique({ where: { shop } }),
  ]);

  const count = (status: string) =>
    byStatus.find((r) => r.status === status)?._count._all ?? 0;

  // Adds the block to the main product section in one click, no theme editing.
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=${process.env.SHOPIFY_API_KEY}/notify-me&target=mainSection`;

  return {
    pending: count("PENDING") + count("SENDING"),
    sent: count("SENT"),
    failed: count("FAILED"),
    unsubscribed: count("UNSUBSCRIBED"),
    recent,
    variantsWithDemand: demand.length,
    emailTested: Boolean(settings?.testSentAt),
    themeEditorUrl,
  };
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

/** A setup step that reports whether it is already satisfied and offers the action. */
function Step({
  done,
  title,
  action,
  children,
}: {
  done: boolean;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <s-stack direction="inline" gap="small-100" alignItems="start">
      <s-icon
        type={done ? "check-circle-filled" : "circle-dashed"}
        tone={done ? "success" : "neutral"}
        size="small"
      />
      <s-stack direction="block" gap="small-300">
        <s-text type={done ? "redundant" : "strong"}>{title}</s-text>
        <s-text color="subdued">{children}</s-text>
        {!done && action}
      </s-stack>
    </s-stack>
  );
}

export default function Index() {
  const {
    pending,
    sent,
    failed,
    unsubscribed,
    recent,
    variantsWithDemand,
    emailTested,
    themeEditorUrl,
  } = useLoaderData<typeof loader>();

  const hasSignups = pending + sent + failed + unsubscribed > 0;
  const hasSent = sent > 0;
  const setupDone = hasSignups && (emailTested || hasSent);

  return (
    <s-page heading="Notify Me">
      <s-button slot="primary-action" href="/app/waitlist" variant="primary">
        View waitlist
      </s-button>
      <s-button slot="secondary-actions" href="/app/settings">
        Email settings
      </s-button>

      {failed > 0 && (
        <s-banner tone="warning" heading="Some emails could not be delivered">
          <s-paragraph>
            {failed.toLocaleString()} notification
            {failed === 1 ? "" : "s"} failed to send. Send yourself a test from{" "}
            <s-link href="/app/settings">Email settings</s-link> to check
            delivery, then retry them from the waitlist.
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

      {!setupDone && (
        <s-section heading="Setup" accessibilityLabel="Setup checklist">
          <s-stack direction="block" gap="base">
            <Step
              done={hasSignups}
              title="Add the button to your product page"
              action={
                <s-button href={themeEditorUrl} target="_blank" icon="theme-template">
                  Open theme editor
                </s-button>
              }
            >
              This opens the theme editor with the block already placed. Press
              Save. It only shows on sold-out variants, so in-stock products
              look unchanged.
            </Step>
            <s-divider />
            <Step
              done={emailTested || hasSent}
              title="Send yourself a test email"
              action={
                <s-button href="/app/settings" icon="email">
                  Email settings
                </s-button>
              }
            >
              Check the sender name and subject line land the way you want
              before a real shopper gets one.
            </Step>
            <s-divider />
            <Step done={hasSent} title="Watch the first one go out">
              Sell out a variant, sign up on the storefront, then restock it.
              The email is sent within seconds of stock returning.
            </Step>
          </s-stack>
        </s-section>
      )}

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
