import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { effectivePlan, refreshPlan } from "../plans.server";
import { dropCustomCss } from "../widget.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Keep the cached plan fresh while the merchant is in the app (Shopify App
  // Pricing sends no webhook on plan changes).
  const { settings, refreshed } = await refreshPlan(session.shop, {
    getShopGid: async () => {
      const res = await admin.graphql(`#graphql
        query notifyMeShopId { shop { id } }`);
      return (await res.json()).data.shop.id;
    },
  });
  if (refreshed && effectivePlan(settings) === "free") await dropCustomCss(admin);

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
