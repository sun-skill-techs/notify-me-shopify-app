import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ponytail: one cap per shop, not per visitor; Shopify's proxy doesn't pass a
// client IP we can trust. It bounds how many strangers a scripted run can add to
// the waitlist in an hour. Raise it if a big store hits it on a real launch.
const SIGNUPS_PER_HOUR = 500;

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

  // Honeypot: real shoppers never see this field. Bots that fill it get a quiet
  // "ok" so they stop, and nothing is stored.
  if (String(form.get("website") ?? "")) return Response.json({ ok: true });

  // Trust boundary: this input comes straight from a storefront visitor.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!/^\d+$/.test(variantId) || !/^\d+$/.test(productId)) {
    return Response.json({ error: "Missing product details." }, { status: 400 });
  }

  const recent = await db.restockSubscription.count({
    where: { shop, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= SIGNUPS_PER_HOUR) {
    return Response.json({ error: "Too many signups right now. Try again later." }, { status: 429 });
  }

  // Re-subscribing after a previous notification resets the row to PENDING.
  await db.restockSubscription.upsert({
    where: { shop_variantId_email: { shop, variantId, email } },
    create: { shop, variantId, productId, email },
    update: { status: "PENDING", sentAt: null, unsubscribedAt: null },
  });

  return Response.json({ ok: true });
};
