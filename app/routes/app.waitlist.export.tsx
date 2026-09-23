import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Excel and Sheets run a cell starting with = + - @ (or tab/CR) as a formula, and
// shopper emails are storefront input. A leading ' keeps it as text.
export const cell = (raw: string) => {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// GET /app/waitlist/export -> CSV of every subscriber. Fetched from the waitlist
// page with App Bridge's fetch so the session token comes along.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const rows = await db.restockSubscription.findMany({
    where: { shop: session.shop },
    orderBy: [{ variantId: "asc" }, { createdAt: "desc" }],
    select: {
      email: true,
      productId: true,
      variantId: true,
      status: true,
      createdAt: true,
      sentAt: true,
    },
  });

  const lines = [
    "email,product_id,variant_id,status,subscribed_at,notified_at",
    ...rows.map((r) =>
      [
        r.email,
        r.productId,
        r.variantId,
        r.status,
        r.createdAt.toISOString(),
        r.sentAt?.toISOString() ?? "",
      ]
        .map(cell)
        .join(","),
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
