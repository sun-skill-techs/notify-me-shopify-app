import type { ActionFunctionArgs } from "react-router";
import { verifyWebhook } from "../shopify.server";
import db from "../db.server";
import { emailHash } from "../crypto.server";

// A restock email "made" a sale when the same shopper orders that variant within this window.
export const ATTRIBUTION_DAYS = 7;

type Order = {
  id: number;
  email?: string | null;
  contact_email?: string | null;
  currency?: string;
  line_items?: { variant_id: number | null; price: string; quantity: number }[];
};

// Growth analytics: ties an order back to the restock email that preceded it.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await verifyWebhook(request);
  const order = payload as Order;
  const email = order.email || order.contact_email;
  if (!email || !order.line_items?.length) return new Response();

  const hash = emailHash(email);
  const since = new Date(Date.now() - ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);
  for (const line of order.line_items) {
    if (!line.variant_id) continue;
    await db.restockSubscription.updateMany({
      where: {
        shop,
        variantId: String(line.variant_id),
        emailHash: hash,
        sentAt: { gte: since },
        orderId: null,
      },
      data: {
        orderId: String(order.id),
        orderValue: (Number(line.price) * line.quantity).toFixed(2),
        orderCurrency: order.currency ?? null,
        orderedAt: new Date(),
      },
    });
  }

  return new Response();
};
