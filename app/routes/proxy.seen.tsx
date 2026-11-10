import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// The block POSTs here from the theme editor: /apps/notify-me/seen. Home's setup
// guide then shows "Add the button" as done, before any shopper signs up.
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies Shopify's HMAC signature; the signed shop param can be trusted.
  const { session } = await authenticate.public.appProxy(request);
  const shop = session?.shop ?? new URL(request.url).searchParams.get("shop");
  if (!shop) return new Response(null, { status: 401 });

  await db.shopSettings.upsert({
    where: { shop },
    create: { shop, blockSeenAt: new Date() },
    update: { blockSeenAt: new Date() },
  });
  return new Response(null, { status: 204 });
};
