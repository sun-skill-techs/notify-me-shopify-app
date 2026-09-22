import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { buyableVariant, notifyVariant } from "../notify.server";
import { activity } from "../activity.server";
import { CHART_CSS, RankedBars, Stat, StatusBreakdown, TrendChart } from "../waitlist-charts";

const RANGES = [7, 30, 90];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const requested = Number(new URL(request.url).searchParams.get("days"));
  const days = RANGES.includes(requested) ? requested : 30;

  const shopResponse = await admin.graphql(
    `#graphql
      query notifyMeShopTimezone { shop { ianaTimezone } }`,
  );
  const timezone = (await shopResponse.json()).data?.shop?.ianaTimezone ?? "UTC";

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
    // SENDING rows are still waiting from the merchant's point of view.
    const key = (row.status === "SENDING" ? "pending" : row.status.toLowerCase()) as keyof typeof entry;
    if (key in entry && typeof entry[key] === "number") {
      (entry[key] as number) += row._count._all;
    }
    byVariant.set(row.variantId, entry);
  }

  const variants = [...byVariant.values()].sort((a, b) => b.pending - a.pending);

  // Look up titles so the table reads as products, not IDs. nodes() caps at 250
  // ids per call, so chunk well under it.
  for (let i = 0; i < variants.length; i += 100) {
    const chunk = variants.slice(i, i + 100);
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
          ids: chunk.map((v) => `gid://shopify/ProductVariant/${v.variantId}`),
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

  return { variants, totals, storeHandle, days, activity: await activity(session.shop, timezone, days) };
};

// "Retry failed": put a variant's failed rows back in the queue and, if it is in
// stock right now, send them immediately.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const variantId = String(form.get("variantId") ?? "");
  if (!/^\d+$/.test(variantId)) return { ok: false, message: "Unknown variant" };

  const { count } = await db.restockSubscription.updateMany({
    where: { shop: session.shop, variantId, status: "FAILED" },
    data: { status: "PENDING" },
  });
  if (count === 0) return { ok: true, message: "Nothing to retry" };

  const variant = await buyableVariant(admin, `gid://shopify/ProductVariant/${variantId}`);
  if (!variant) {
    return {
      ok: true,
      message: `${count} moved back to waiting. They'll be emailed when it's in stock.`,
    };
  }
  const r = await notifyVariant({ shop: session.shop, ...variant });
  return {
    ok: r.failed === 0,
    message: r.failed ? `${r.sent} sent, ${r.failed} failed again` : `${r.sent} sent`,
  };
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

/** Downloads the CSV through App Bridge's fetch so the request is authenticated. */
function ExportButton() {
  const [busy, setBusy] = useState(false);
  const shopify = useAppBridge();
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch("/app/waitlist/export");
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `waitlist-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      shopify.toast.show("Export failed. Try again.", { isError: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <s-button slot="secondary-actions" icon="export" onClick={download} disabled={busy}>
      Export CSV
    </s-button>
  );
}

export default function WaitlistPage() {
  const { variants, totals, storeHandle, days, activity } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  // Keep the old charts on screen, dimmed, while a new range loads.
  const refreshing =
    navigation.state === "loading" && navigation.location.pathname === "/app/waitlist";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

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
                variants collect signups here, ranked by how many shoppers are
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

  const mostRequested = variants.filter((v) => v.pending > 0).slice(0, 5);
  const retrying = fetcher.state !== "idle" ? fetcher.formData?.get("variantId") : null;

  return (
    <s-page heading="Waitlist">
      <ExportButton />
      <s-button slot="secondary-actions" href="/app" variant="secondary">
        Back to overview
      </s-button>

      <style>{CHART_CSS}</style>
      <s-section heading="Activity">
        <s-stack direction="block" gap="base">
          <s-box inlineSize="200px">
            <s-select
              label="Date range"
              labelAccessibilityVisibility="exclusive"
              value={String(days)}
              onChange={(e: { currentTarget: { value: string } }) =>
                setSearchParams({ days: e.currentTarget.value }, { preventScrollReset: true })
              }
            >
              <s-option value="7">Last 7 days</s-option>
              <s-option value="30">Last 30 days</s-option>
              <s-option value="90">Last 90 days</s-option>
            </s-select>
          </s-box>
          <div style={{ opacity: refreshing ? 0.5 : 1, transition: "opacity 0.15s" }}>
            <s-stack direction="block" gap="large">
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
                <Stat
                  label="New signups"
                  value={activity.current.signups}
                  previous={activity.previous.signups}
                  days={days}
                />
                <Stat
                  label="Emails sent"
                  value={activity.current.sent}
                  previous={activity.previous.sent}
                  days={days}
                />
                <Stat label="Waiting now" value={totals.pending} />
              </s-grid>
              <TrendChart days={activity.daily} />
            </s-stack>
          </div>
        </s-stack>
      </s-section>

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
              <s-table-header listSlot="secondary"></s-table-header>
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
                  <s-table-cell>
                    {variant.failed > 0 && (
                      <s-button
                        variant="tertiary"
                        icon="reset"
                        disabled={retrying === variant.variantId}
                        onClick={() =>
                          fetcher.submit(
                            { variantId: variant.variantId },
                            { method: "post" },
                          )
                        }
                      >
                        Retry failed
                      </s-button>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Most requested">
        {mostRequested.length ? (
          <RankedBars
            bars={mostRequested.map((v) => ({
              id: v.variantId,
              label: v.product,
              detail: v.variant,
              value: v.pending,
            }))}
          />
        ) : (
          <s-text color="subdued">No one is waiting right now.</s-text>
        )}
      </s-section>

      <s-section slot="aside" heading="All statuses">
        {/* Status colors, ordered so no two neighbors clash under color blindness. */}
        <StatusBreakdown
          slices={[
            { key: "sent", label: "Notified", value: totals.sent, color: "#0ca30c" },
            { key: "pending", label: "Waiting", value: totals.pending, color: "#2a78d6" },
            { key: "failed", label: "Failed", value: totals.failed, color: "#d03b3b" },
            { key: "unsubscribed", label: "Unsubscribed", value: totals.unsubscribed, color: "#898781" },
          ]}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
