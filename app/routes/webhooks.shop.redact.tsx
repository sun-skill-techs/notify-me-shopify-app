import type { ActionFunctionArgs } from "react-router";
import { verifyWebhook } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await verifyWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await db.restockSubscription.deleteMany({ where: { shop } });
  await db.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
