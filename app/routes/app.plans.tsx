import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Opens Shopify's hosted plan page, where the merchant picks, upgrades or cancels.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // Re-check the plan as soon as they're back in the app, not after the 5-minute cache.
  await db.shopSettings.updateMany({ where: { shop: session.shop }, data: { planCheckedAt: null } });

  // The dev app has its own handle; set SHOPIFY_APP_HANDLE for it.
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "restock-alerts-sun-skill-techs";
  // shopify://admin lets App Bridge switch admin pages without reloading the whole admin.
  return { url: `shopify://admin/charges/${appHandle}/pricing_plans` };
};

// A loader redirect with target _top stalls on "Handling response" when the page is
// reached from the app nav, so the browser navigates instead (App Bridge handles _top).
export default function Plans() {
  const { url } = useLoaderData<typeof loader>();
  useEffect(() => {
    open(url, "_top");
  }, [url]);

  return (
    <s-page heading="Plans">
      <s-section>
        <s-paragraph>
          Opening plans… <s-link href={url} target="_top">Open plans</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
