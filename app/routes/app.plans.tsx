import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Opens Shopify's hosted plan page, where the merchant picks, upgrades or cancels.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  // Re-check the plan as soon as they're back in the app, not after the 5-minute cache.
  await db.shopSettings.updateMany({ where: { shop: session.shop }, data: { planCheckedAt: null } });

  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");
  // The dev app has its own handle; set SHOPIFY_APP_HANDLE for it.
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "restock-alerts-sun-skill-techs";
  return redirect(`https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`, {
    target: "_top",
  });
};
