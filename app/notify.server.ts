import crypto from "node:crypto";
import { Resend } from "resend";
import db from "./db.server";

// Unsubscribe links are signed rather than stored: no extra token column, and the
// link stays valid for the life of the row.
export function unsubscribeToken(id: string) {
  return crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(id)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(id: string, token: string) {
  const expected = unsubscribeToken(id);
  // Lengths are fixed by slice(0, 32), so timingSafeEqual is safe to call directly.
  return (
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}

export function unsubscribeUrl(shop: string, id: string) {
  return `https://${shop}/apps/notify-me/unsubscribe?id=${id}&token=${unsubscribeToken(id)}`;
}

export type RestockEmail = {
  productTitle: string;
  variantTitle: string;
  productUrl: string;
  imageUrl: string | null;
  storeName: string;
  unsubscribeUrl: string;
};

// Table layout and inline styles: Gmail and Outlook drop <style> blocks and flex.
export function renderEmail(e: RestockEmail) {
  const title = escapeHtml(e.productTitle);
  const variant = e.variantTitle ? escapeHtml(e.variantTitle) : "";
  const image = e.imageUrl
    ? `<tr><td style="padding:0 0 20px">
         <a href="${e.productUrl}"><img src="${e.imageUrl}" width="240" alt="${title}" style="display:block;max-width:240px;border-radius:8px"></a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px 16px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
  <tr><td style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7177;padding:0 0 12px">${escapeHtml(e.storeName)}</td></tr>
  <tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding:0 0 8px">${title} is back in stock</td></tr>
  ${variant ? `<tr><td style="font-size:14px;color:#6b7177;padding:0 0 20px">${variant}</td></tr>` : `<tr><td style="padding:0 0 12px"></td></tr>`}
  ${image}
  <tr><td style="font-size:15px;line-height:1.5;padding:0 0 24px">You asked us to tell you when this came back. It's available now, and stock may not last long.</td></tr>
  <tr><td style="padding:0 0 28px">
    <a href="${e.productUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:15px;font-weight:600;padding:14px 24px;border-radius:8px;text-decoration:none">Shop now</a>
  </td></tr>
  <tr><td style="font-size:12px;line-height:1.5;color:#6b7177;border-top:1px solid #e3e3e3;padding:16px 0 0">
    You'll only get this one email for this request. This is not a marketing list.
    <a href="${e.unsubscribeUrl}" style="color:#6b7177">Unsubscribe</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

async function sender(shop: string, productTitle: string) {
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const subject = (settings?.emailSubject || "{{product}} is back in stock").replace(
    "{{product}}",
    productTitle,
  );
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const fromHeader = settings?.fromName ? `${settings.fromName} <${from}>` : from;
  const storeName = settings?.fromName || shop.replace(/\.myshopify\.com$/, "");
  return { resend: new Resend(process.env.RESEND_API_KEY), subject, fromHeader, storeName };
}

/**
 * Email every pending subscriber for a variant and mark each row SENT or FAILED.
 * Caller has already confirmed the variant is actually available.
 */
export async function notifyVariant(opts: {
  shop: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  productUrl: string;
  imageUrl: string | null;
}) {
  const { shop, variantId } = opts;

  const pending = await db.restockSubscription.findMany({
    where: { shop, variantId, status: "PENDING" },
    select: { id: true, email: true },
  });
  if (pending.length === 0) return { sent: 0, failed: 0 };

  const { resend, subject, fromHeader, storeName } = await sender(shop, opts.productTitle);

  let sent = 0;
  let failed = 0;
  // ponytail: sequential sends. Resend's free tier is 100/day, so a waitlist
  // large enough to need batching is already past this plan — add p-map if that changes.
  for (const sub of pending) {
    // Shopify retries webhooks, so two handlers can race on the same variant.
    // Claiming the row first means only one of them ever emails this shopper.
    const { count } = await db.restockSubscription.updateMany({
      where: { id: sub.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (count === 0) continue;

    const unsub = unsubscribeUrl(shop, sub.id);
    const { error } = await resend.emails.send({
      from: fromHeader,
      to: [sub.email],
      subject,
      headers: { "List-Unsubscribe": `<${unsub}>` },
      html: renderEmail({
        productTitle: opts.productTitle,
        variantTitle: opts.variantTitle,
        productUrl: opts.productUrl,
        imageUrl: opts.imageUrl,
        storeName,
        unsubscribeUrl: unsub,
      }),
    });

    if (error) {
      failed++;
      console.error(`notify-me: send failed for ${sub.id}`, error);
      await db.restockSubscription.update({
        where: { id: sub.id },
        data: { status: "FAILED" },
      });
    } else {
      sent++;
      await db.restockSubscription.update({
        where: { id: sub.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    }
  }

  return { sent, failed };
}

/** Send a sample restock email so the merchant can check delivery and branding. */
export async function sendTestEmail(shop: string, to: string) {
  const { resend, subject, fromHeader, storeName } = await sender(shop, "Sample product");
  const { error } = await resend.emails.send({
    from: fromHeader,
    to: [to],
    subject: `[Test] ${subject}`,
    html: renderEmail({
      productTitle: "Sample product",
      variantTitle: "Medium / Black",
      productUrl: `https://${shop}`,
      imageUrl: null,
      storeName,
      unsubscribeUrl: `https://${shop}`,
    }),
  });
  return error ? error.message : null;
}

/** Fetch and verify a variant, returning what the email needs or null if not buyable. */
export async function buyableVariant(
  admin: { graphql: (q: string, o?: { variables: Record<string, unknown> }) => Promise<Response> },
  variantGid: string,
) {
  const response = await admin.graphql(
    `#graphql
      query notifyMeVariant($id: ID!) {
        productVariant(id: $id) {
          id
          title
          availableForSale
          image { url }
          product { title onlineStoreUrl featuredImage { url } }
        }
      }`,
    { variables: { id: variantGid } },
  );
  const { data } = await response.json();
  const v = data?.productVariant;
  if (!v?.availableForSale || !v.product?.onlineStoreUrl) return null;

  const variantId = variantGid.split("/").pop()!;
  return {
    variantId,
    productTitle: v.product.title as string,
    variantTitle: v.title === "Default Title" ? "" : (v.title as string),
    productUrl: `${v.product.onlineStoreUrl}?variant=${variantId}`,
    imageUrl: (v.image?.url ?? v.product.featuredImage?.url ?? null) as string | null,
  };
}
