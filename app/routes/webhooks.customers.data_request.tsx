import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = (payload as { customer?: { email?: string } }).customer?.email;
  const rows = email
    ? await db.restockSubscription.findMany({
        where: { shop, email: email.toLowerCase() },
      })
    : [];

  // The merchant must forward this to the shopper; logging is the delivery
  // channel until a beta client needs something richer.
  console.log(
    `notify-me: data request for ${email ?? "unknown"} — ${rows.length} record(s)`,
    JSON.stringify(rows),
  );

  return new Response();
};
