import type { ActionFunctionArgs } from "react-router";
import { verifyWebhook } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await verifyWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times; deleteMany is a no-op once the sessions are gone.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
