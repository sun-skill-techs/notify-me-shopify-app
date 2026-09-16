import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Shoppers POST here through the app proxy: /apps/notify-me/subscribe
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies Shopify's HMAC signature; throws a 401 Response if the request wasn't proxied.
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop ?? new URL(request.url).searchParams.get("shop");
  if (!shop) return Response.json({ error: "Unknown shop" }, { status: 401 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const variantId = String(form.get("variantId") ?? "");
  const productId = String(form.get("productId") ?? "");

  // Trust boundary: this input comes straight from a storefront visitor.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!/^\d+$/.test(variantId) || !/^\d+$/.test(productId)) {
    return Response.json({ error: "Missing product details." }, { status: 400 });
  }

  // Re-subscribing after a previous notification resets the row to PENDING.
  await db.restockSubscription.upsert({
    where: { shop_variantId_email: { shop, variantId, email } },
    create: { shop, variantId, productId, email },
    update: { status: "PENDING", sentAt: null, unsubscribedAt: null },
  });

  return Response.json({ ok: true });
};
