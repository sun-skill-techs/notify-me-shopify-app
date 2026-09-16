import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { notifyVariant } from "../notify.server";

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
  const response = await admin.graphql(
    `#graphql
      query notifyMeVariant($id: ID!) {
        productVariant(id: $id) {
          id
          availableForSale
          product { title onlineStoreUrl }
        }
      }`,
    { variables: { id: variantGid } },
  );
  const { data } = await response.json();
  const variant = data?.productVariant;

  if (!variant?.availableForSale || !variant.product?.onlineStoreUrl) {
    return new Response();
  }

  const result = await notifyVariant({
    shop,
    variantId: variantGid.split("/").pop()!,
    productTitle: variant.product.title,
    productUrl: `${variant.product.onlineStoreUrl}?variant=${variantGid.split("/").pop()}`,
  });
  console.log(`notify-me: ${result.sent} sent, ${result.failed} failed`);

  return new Response();
};
