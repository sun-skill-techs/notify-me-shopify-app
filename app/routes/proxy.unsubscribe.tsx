import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { verifyUnsubscribeToken } from "../notify.server";

// Reached from the link in every restock email: /apps/notify-me/unsubscribe?id=..&token=..
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";

  if (!id || !verifyUnsubscribeToken(id, token)) {
    return new Response("<p>This unsubscribe link is not valid.</p>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  await db.restockSubscription.updateMany({
    where: { id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  return new Response(
    "<p>You're unsubscribed. You won't get restock emails for this item.</p>",
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
};
