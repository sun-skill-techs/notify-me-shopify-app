import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { activity } from "../activity.server";
import { METAFIELD } from "../widget";
import { CHART_CSS, RankedBars, Stat, StatusBreakdown, TrendChart } from "../waitlist-charts";

const DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [shopRes, byStatus, demand, top, settings] = await Promise.all([
    admin.graphql(
      `#graphql
        query notifyMeHome($namespace: String!, $key: String!) {
          shop { ianaTimezone }
          currentAppInstallation { metafield(namespace: $namespace, key: $key) { id } }
        }`,
      { variables: METAFIELD },
    ),
    db.restockSubscription.groupBy({
      by: ["status"],
      where: { shop },
      _count: { _all: true },
    }),
    db.restockSubscription.findMany({
      where: { shop, status: "PENDING" },
      distinct: ["variantId"],
      select: { variantId: true },
    }),
    db.restockSubscription.groupBy({
      by: ["variantId"],
      where: { shop, status: { in: ["PENDING", "SENDING"] } },
      _count: { _all: true },
      orderBy: { _count: { variantId: "desc" } },
      take: 5,
    }),
    db.shopSettings.findUnique({ where: { shop } }),
  ]);
  const { data } = await shopRes.json();

  // Titles for the top five, so the chart reads as products, not IDs.
  const titles = new Map<string, { label: string; detail: string }>();
  if (top.length) {
    const res = await admin.graphql(
      `#graphql
        query notifyMeTopVariants($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant { id title product { title } }
          }
        }`,
      { variables: { ids: top.map((t) => `gid://shopify/ProductVariant/${t.variantId}`) } },
    );
    const { data: nodes } = await res.json();
    for (const node of nodes?.nodes ?? []) {
      if (!node?.id) continue;
      titles.set(node.id.split("/").pop()!, {
        label: node.product?.title ?? "Product",
        detail: node.title === "Default Title" ? "" : (node.title ?? ""),
      });
    }
  }

  const count = (status: string) =>
    byStatus.find((r) => r.status === status)?._count._all ?? 0;

  // Adds the block to the main product section in one click, no theme editing.
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=${process.env.SHOPIFY_API_KEY}/notify-me&target=mainSection`;

  return {
    pending: count("PENDING") + count("SENDING"),
    sent: count("SENT"),
    failed: count("FAILED"),
    unsubscribed: count("UNSUBSCRIBED"),
    variantsWithDemand: demand.length,
    topVariants: top.map((t) => ({
      id: t.variantId,
      label: titles.get(t.variantId)?.label ?? `Variant ${t.variantId}`,
      detail: titles.get(t.variantId)?.detail ?? "",
      value: t._count._all,
    })),
    trend: await activity(shop, data?.shop?.ianaTimezone ?? "UTC", DAYS),
    emailTested: Boolean(settings?.testSentAt),
    widgetStyled: Boolean(data?.currentAppInstallation?.metafield),
    setupDismissed: Boolean(settings?.setupDismissedAt),
    themeEditorUrl,
  };
};

// The only action here is hiding the setup guide.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, setupDismissedAt: new Date() },
    update: { setupDismissedAt: new Date() },
  });
  return { ok: true };
};

type Task = {
  id: string;
  done: boolean;
  title: string;
  body: string;
  action?: React.ReactNode;
};

/** Shopify-style setup guide: progress, one task open at a time, done tasks checked. */
function SetupGuide({ tasks, onDismiss }: { tasks: Task[]; onDismiss: () => void }) {
  const [open, setOpen] = useState(tasks.find((t) => !t.done)?.id);
  const done = tasks.filter((t) => t.done).length;

  return (
    <s-section accessibilityLabel="Setup guide">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-heading>Setup guide</s-heading>
          <s-button variant="tertiary" onClick={onDismiss}>
            Dismiss
          </s-button>
        </s-stack>
        <s-paragraph color="subdued">
          Finish these to start collecting demand on sold-out variants and
          emailing shoppers the moment stock returns.
        </s-paragraph>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text color="subdued">
            {done} of {tasks.length} tasks complete
          </s-text>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-valuenow={done}
            className="nm-progress"
          >
            <div style={{ width: `${(done / tasks.length) * 100}%` }} />
          </div>
        </s-stack>

        <s-stack direction="block" gap="small-100">
          {tasks.map((task) => {
            const isOpen = task.id === open;
            return (
              <s-box
                key={task.id}
                padding="small-100"
                borderRadius="base"
                background={isOpen ? "subdued" : "transparent"}
              >
                <s-grid gridTemplateColumns="auto 1fr" gap="small-200" alignItems="center">
                  <s-icon
                    type={task.done ? "check-circle-filled" : "circle-dashed"}
                    tone={task.done ? "success" : "neutral"}
                  />
                  <s-clickable onClick={() => setOpen(task.id)}>
                    <s-text type={isOpen ? "strong" : "generic"} color={task.done ? "subdued" : "base"}>
                      {task.title}
                    </s-text>
                  </s-clickable>
                  {isOpen && (
                    <>
                      <div />
                      <s-stack direction="block" gap="small-200">
                        <s-text color="subdued">{task.body}</s-text>
                        {!task.done && task.action}
                      </s-stack>
                    </>
                  )}
                </s-grid>
              </s-box>
            );
          })}
        </s-stack>
      </s-stack>
    </s-section>
  );
}

export default function Index() {
  const {
    pending,
    sent,
    failed,
    unsubscribed,
    variantsWithDemand,
    topVariants,
    trend,
    emailTested,
    widgetStyled,
    setupDismissed,
    themeEditorUrl,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const hasSignups = pending + sent + failed + unsubscribed > 0;
  const hasSent = sent > 0;

  const tasks: Task[] = [
    {
      id: "block",
      done: hasSignups,
      title: "Add the button to your product page",
      body: "Opens the theme editor with the block already placed. Press Save. The button only shows on sold-out variants, so in-stock products look the same. This checks off when your first shopper signs up.",
      action: (
        <s-button href={themeEditorUrl} target="_blank" variant="primary" icon="theme-template">
          Open theme editor
        </s-button>
      ),
    },
    {
      id: "widget",
      done: widgetStyled,
      title: "Match the button to your store",
      body: "Set the button and popup colors, fonts and copy. The preview is the real storefront block.",
      action: (
        <s-button href="/app/widget" icon="paint-brush-flat">
          Customize widget
        </s-button>
      ),
    },
    {
      id: "email",
      done: emailTested || hasSent,
      title: "Send yourself a test email",
      body: "Check the sender name and subject line before a real shopper gets one.",
      action: (
        <s-button href="/app/settings" icon="email">
          Email settings
        </s-button>
      ),
    },
    {
      id: "first",
      done: hasSent,
      title: "Watch the first one go out",
      body: "Sell out a variant, sign up on the storefront, then restock it. The email goes out within seconds of stock returning.",
      action: hasSignups ? <s-button href="/app/waitlist">View waitlist</s-button> : undefined,
    },
  ];
  const showGuide =
    !setupDismissed && fetcher.state === "idle" && !fetcher.data && tasks.some((t) => !t.done);

  const attempted = sent + failed;
  const deliveryRate = attempted ? `${Math.round((sent / attempted) * 100)}%` : "—";

  return (
    <s-page heading="Notify Me">
      <s-button slot="primary-action" href="/app/waitlist" variant="primary">
        View waitlist
      </s-button>
      <s-button slot="secondary-actions" href="/app/settings">
        Email settings
      </s-button>
      <style>{CHART_CSS + PROGRESS_CSS}</style>

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

      {showGuide && (
        <SetupGuide
          tasks={tasks}
          onDismiss={() => fetcher.submit({}, { method: "post" })}
        />
      )}

      <s-section heading="Overview">
        <s-stack direction="block" gap="large">
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap="base">
            <Stat
              label="Waiting now"
              value={pending}
              note={
                variantsWithDemand
                  ? `Across ${variantsWithDemand.toLocaleString()} variant${variantsWithDemand === 1 ? "" : "s"}`
                  : "No one waiting"
              }
            />
            <Stat
              label="New signups"
              value={trend.current.signups}
              previous={trend.previous.signups}
              days={DAYS}
            />
            <Stat
              label="Emails sent"
              value={trend.current.sent}
              previous={trend.previous.sent}
              days={DAYS}
            />
            <Stat
              label="Delivery rate"
              value={deliveryRate}
              note={
                failed
                  ? `${failed.toLocaleString()} of ${attempted.toLocaleString()} failed`
                  : hasSent
                    ? "All delivered"
                    : "No emails sent yet"
              }
            />
          </s-grid>

          {hasSignups ? (
            <TrendChart days={trend.daily} />
          ) : (
            <s-box padding="large" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small-200" alignItems="center">
                <s-icon type="chart-line" tone="neutral" />
                <s-text color="subdued">
                  Daily signups and emails sent will chart here once your
                  first shopper joins a waitlist.
                </s-text>
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Most requested">
        <s-stack direction="block" gap="base">
          {topVariants.length ? (
            <RankedBars bars={topVariants} />
          ) : (
            <s-text color="subdued">No one is waiting right now.</s-text>
          )}
          {hasSignups && (
            <s-link href="/app/waitlist">See which variants to reorder</s-link>
          )}
        </s-stack>
      </s-section>

      {hasSignups && (
        <s-section slot="aside" heading="All subscribers">
          <StatusBreakdown
            slices={[
              { key: "sent", label: "Notified", value: sent, color: "#0ca30c" },
              { key: "pending", label: "Waiting", value: pending, color: "#2a78d6" },
              { key: "failed", label: "Failed", value: failed, color: "#d03b3b" },
              { key: "unsubscribed", label: "Unsubscribed", value: unsubscribed, color: "#898781" },
            ]}
          />
        </s-section>
      )}

      {showGuide && (
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
      )}

      <s-section slot="aside" heading="Privacy">
        <s-paragraph color="subdued">
          Only the email address, selected variant, and subscription state are
          stored. Every notification includes an unsubscribe link.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

const PROGRESS_CSS = `
  .nm-progress { flex: 1; max-width: 160px; height: 6px; border-radius: 3px; background: #e3e3e3; overflow: hidden; }
  .nm-progress > div { height: 100%; border-radius: 3px; background: #29845a; transition: width 0.3s; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
