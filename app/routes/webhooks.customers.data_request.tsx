import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendDataRequest } from "../notify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = (payload as { customer?: { email?: string } }).customer?.email;
  const rows = email
    ? await db.restockSubscription.findMany({
        where: { shop, email: email.toLowerCase() },
        select: {
          email: true,
          productId: true,
          variantId: true,
          status: true,
          createdAt: true,
          sentAt: true,
          unsubscribedAt: true,
        },
      })
    : [];
  // Counts only: the records themselves are personal data and don't belong in logs.
  console.log(`notify-me: data request, ${rows.length} record(s)`);

  // Nothing held, or no session left to look up the merchant's address.
  if (!email || rows.length === 0 || !admin) return new Response();

  const res = await admin.graphql(`#graphql
    query notifyMeOwnerEmail { shop { email } }`);
  const { data } = await res.json();
  const to = data?.shop?.email as string | undefined;
  if (!to) return new Response();

  const error = await sendDataRequest(to, shop, email, rows);
  if (error) {
    console.error("notify-me: data request email failed", error);
    // Shopify retries a failed delivery, which retries the email.
    return new Response(null, { status: 500 });
  }
  return new Response();
};
