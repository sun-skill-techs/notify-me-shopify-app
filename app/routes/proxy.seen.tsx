import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// The block POSTs here from the theme editor or the live store: /apps/notify-me/seen.
// Home's setup guide then shows "Add the button" as done, before any shopper signs up.
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies Shopify's HMAC signature; the signed shop param can be trusted.
  const { session, admin } = await authenticate.public.appProxy(request);
  const shop = session?.shop ?? new URL(request.url).searchParams.get("shop");
  if (!shop) return new Response(null, { status: 401 });

  await db.shopSettings.upsert({
    where: { shop },
    create: { shop, blockSeenAt: new Date() },
    update: { blockSeenAt: new Date() },
  });

  // The block reads this flag and stops pinging from the live store.
  if (admin) {
    const res = await admin.graphql(`#graphql
      query notifyMeInstallation { currentAppInstallation { id } }`);
    const ownerId = (await res.json()).data?.currentAppInstallation?.id;
    if (ownerId) {
      await admin.graphql(
        `#graphql
          mutation notifyMeSeen($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) { userErrors { message } }
          }`,
        {
          variables: {
            metafields: [{ ownerId, namespace: "notify_me", key: "seen", type: "boolean", value: "true" }],
          },
        },
      );
    }
  }
  return new Response(null, { status: 204 });
};
