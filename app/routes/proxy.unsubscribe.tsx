import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { verifyUnsubscribeToken } from "../notify.server";

// Shopify renders application/liquid proxy responses inside the store's own
// theme layout, so the shopper lands on a page that looks like the shop.
const page = (heading: string, body: string, status = 200) =>
  new Response(
    `<div style="max-width:32rem;margin:4rem auto;padding:0 1.5rem;text-align:center">
      <h1 style="margin:0 0 .75rem">${heading}</h1>
      <p style="margin:0 0 1.5rem;opacity:.75">${body}</p>
      <a href="/" style="text-decoration:underline">Continue shopping</a>
    </div>`,
    { status, headers: { "Content-Type": "application/liquid" } },
  );

// Reached from the link in every restock email: /apps/notify-me/unsubscribe?id=..&token=..
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!id || !verifyUnsubscribeToken(id, token)) {
    return page(
      "This link isn't valid",
      "It may have been copied incompletely. Open the link from your email again.",
      400,
    );
  }

  await db.restockSubscription.updateMany({
    where: { id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  return page(
    "You're unsubscribed",
    "You won't get another restock email for this item. You can sign up again from the product page any time.",
  );
};
