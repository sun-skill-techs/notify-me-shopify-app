import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = (payload as { customer?: { email?: string } }).customer?.email;
  if (email) {
    const { count } = await db.restockSubscription.deleteMany({
      where: { shop, email: email.toLowerCase() },
    });
    console.log(`notify-me: redacted ${count} subscription(s)`);
  }

  return new Response();
};
