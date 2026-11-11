import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { effectivePlan, refreshPlan } from "../plans.server";
import { dropCustomCss } from "../widget.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Keep the cached plan fresh while the merchant is in the app. Shopify adds
  // charge_id when it sends the merchant back from approving a plan: check right away.
  const url = new URL(request.url);
  const chosePlan = url.searchParams.has("charge_id");
  const { settings, refreshed } = await refreshPlan(session.shop, {
    maxAgeMs: chosePlan ? 0 : undefined,
  });
  if (refreshed && effectivePlan(settings) === "free") await dropCustomCss(admin);
  // The page loaded alongside this one read the old plan; load it again.
  if (chosePlan) {
    url.searchParams.delete("charge_id");
    throw redirect(url.pathname + url.search);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        {/* @ts-expect-error rel is App Bridge's (hides the duplicate Home link); polaris-types lacks it */}
        <s-link href="/app" rel="home">Home</s-link>
        <s-link href="/app/waitlist">Waitlist</s-link>
        <s-link href="/app/widget">Widget design</s-link>
        <s-link href="/app/settings">Email settings</s-link>
        <s-link href="/app/plans">Plans</s-link>
        <s-link href="/app/support">Support</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
