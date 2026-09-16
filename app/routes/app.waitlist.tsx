import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const rows = await db.restockSubscription.groupBy({
    by: ["variantId", "productId", "status"],
    where: { shop: session.shop },
    _count: { _all: true },
  });

  // Roll the per-status counts up into one row per variant.
  const byVariant = new Map<
    string,
    {
      variantId: string;
      productId: string;
      pending: number;
      sent: number;
      failed: number;
      unsubscribed: number;
      product: string;
      variant: string;
      image: string | null;
    }
  >();
  for (const row of rows) {
    const entry = byVariant.get(row.variantId) ?? {
      variantId: row.variantId,
      productId: row.productId,
      pending: 0,
      sent: 0,
      failed: 0,
      unsubscribed: 0,
      product: `Variant ${row.variantId}`,
      variant: "",
      image: null,
    };
    const key = row.status.toLowerCase() as keyof typeof entry;
    if (key in entry && typeof entry[key] === "number") {
      (entry[key] as number) += row._count._all;
    }
    byVariant.set(row.variantId, entry);
  }

  const variants = [...byVariant.values()].sort((a, b) => b.pending - a.pending);

  // Look up titles in one request so the table reads as products, not IDs.
  if (variants.length > 0) {
    const response = await admin.graphql(
      `#graphql
        query notifyMeWaitlistTitles($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              image { url }
              product { title featuredImage { url } }
            }
          }
        }`,
      {
        variables: {
          ids: variants.map((v) => `gid://shopify/ProductVariant/${v.variantId}`),
        },
      },
    );
    const { data } = await response.json();
    for (const node of data?.nodes ?? []) {
      if (!node?.id) continue;
      const target = byVariant.get(node.id.split("/").pop()!);
      if (target) {
        target.product = node.product?.title ?? "Product";
        target.variant = node.title === "Default Title" ? "" : (node.title ?? "");
        target.image = node.image?.url ?? node.product?.featuredImage?.url ?? null;
      }
    }
  }

  const totals = variants.reduce(
    (acc, v) => ({
      pending: acc.pending + v.pending,
      sent: acc.sent + v.sent,
      failed: acc.failed + v.failed,
      unsubscribed: acc.unsubscribed + v.unsubscribed,
    }),
    { pending: 0, sent: 0, failed: 0, unsubscribed: 0 },
  );

  // "my-store.myshopify.com" -> the store handle admin.shopify.com expects.
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");

  return { variants, totals, storeHandle };
};

/** Zero counts stay quiet so the eye lands on real demand. */
function Count({
  value,
  tone,
}: {
  value: number;
  tone: "info" | "success" | "critical" | "neutral";
}) {
  if (value === 0) {
    return <s-text color="subdued">—</s-text>;
  }
  return (
    <s-badge tone={tone} size="base">
      {value.toLocaleString()}
    </s-badge>
  );
}

export default function WaitlistPage() {
  const { variants, totals, storeHandle } = useLoaderData<typeof loader>();

  if (variants.length === 0) {
    return (
      <s-page heading="Waitlist">
        <s-button slot="secondary-actions" href="/app" variant="secondary">
          Back to overview
        </s-button>

        <s-section accessibilityLabel="No signups yet">
          <s-box padding="large-300">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-icon type="person-list" tone="neutral" size="base" />
              <s-heading>No one is waiting yet</s-heading>
              <s-paragraph color="subdued">
                Once the app block is live on your product template, sold-out
                variants collect signups here — ranked by how many shoppers are
                waiting.
              </s-paragraph>
              <s-button href="/app" variant="primary" icon="theme-template">
                Finish setup
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    );
  }

  const top = variants[0];

  return (
    <s-page heading="Waitlist">
      <s-button slot="secondary-actions" href="/app" variant="secondary">
        Back to overview
      </s-button>

      <s-section
        heading="Demand by variant"
        accessibilityLabel="Demand by variant"
      >
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-badge tone="info" size="large-100" icon="person-list">
              {totals.pending.toLocaleString()} waiting
            </s-badge>
            <s-text color="subdued">
              across {variants.length.toLocaleString()} variant
              {variants.length === 1 ? "" : "s"}
            </s-text>
          </s-stack>

          {/* variant="list" collapses to stacked cards on narrow viewports. */}
          <s-table variant="list">
            <s-table-header-row>
              <s-table-header listSlot="kicker">Product</s-table-header>
              <s-table-header listSlot="primary">Variant</s-table-header>
              <s-table-header listSlot="inline" format="numeric">
                Waiting
              </s-table-header>
              <s-table-header format="numeric">Sent</s-table-header>
              <s-table-header format="numeric">Failed</s-table-header>
              <s-table-header format="numeric">Unsubscribed</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {variants.map((variant) => (
                <s-table-row key={variant.variantId}>
                  <s-table-cell>
                    <s-stack
                      direction="inline"
                      gap="small-100"
                      alignItems="center"
                    >
                      {variant.image && (
                        <s-thumbnail
                          size="small"
                          src={variant.image}
                          alt={variant.product}
                        />
                      )}
                      <s-link
                        href={`https://admin.shopify.com/store/${storeHandle}/products/${variant.productId}`}
                        target="_blank"
                        tone="neutral"
                      >
                        {variant.product}
                      </s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text>{variant.variant || "Default"}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <Count value={variant.pending} tone="info" />
                  </s-table-cell>
                  <s-table-cell>
                    <Count value={variant.sent} tone="success" />
                  </s-table-cell>
                  <s-table-cell>
                    <Count value={variant.failed} tone="critical" />
                  </s-table-cell>
                  <s-table-cell>
                    <Count value={variant.unsubscribed} tone="neutral" />
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Reorder first">
        <s-stack direction="block" gap="small-100">
          <s-text type="strong">{top.product}</s-text>
          {top.variant && <s-text color="subdued">{top.variant}</s-text>}
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-badge tone="info" size="large">
              {top.pending.toLocaleString()}
            </s-badge>
            <s-text color="subdued">
              shopper{top.pending === 1 ? "" : "s"} waiting
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="All statuses">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Waiting</s-text>
            <s-text type="strong" fontVariantNumeric="tabular-nums">
              {totals.pending.toLocaleString()}
            </s-text>
          </s-stack>
          <s-divider />
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Notified</s-text>
            <s-text type="strong" fontVariantNumeric="tabular-nums">
              {totals.sent.toLocaleString()}
            </s-text>
          </s-stack>
          <s-divider />
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Failed</s-text>
            <s-text
              type="strong"
              tone={totals.failed > 0 ? "critical" : "auto"}
              fontVariantNumeric="tabular-nums"
            >
              {totals.failed.toLocaleString()}
            </s-text>
          </s-stack>
          <s-divider />
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Unsubscribed</s-text>
            <s-text type="strong" fontVariantNumeric="tabular-nums">
              {totals.unsubscribed.toLocaleString()}
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
