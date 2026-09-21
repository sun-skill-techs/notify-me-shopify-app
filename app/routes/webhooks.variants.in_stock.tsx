import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buyableVariant, notifyVariant } from "../notify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Session is gone once the app is uninstalled; nothing to send.
  if (!admin) return new Response();

  const variantGid = (payload as { admin_graphql_api_id?: string })
    .admin_graphql_api_id;
  if (!variantGid) return new Response();

  // The webhook only says stock changed. Confirm it's really buyable before emailing,
  // since a failed send can't be taken back.
  const variant = await buyableVariant(admin, variantGid);
  if (!variant) return new Response();

  // Shopify retries the webhook if we take longer than 5s, and a long waitlist
  // does. Respond now; notifyVariant claims each row so a retry can't double-send.
  void notifyVariant({ shop, ...variant })
    .then((r) => console.log(`notify-me: ${r.sent} sent, ${r.failed} failed`))
    .catch((e) => console.error("notify-me: notify failed", e));

  return new Response();
};
