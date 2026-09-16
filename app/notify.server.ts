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

function renderEmail(opts: {
  productTitle: string;
  productUrl: string;
  unsubscribeUrl: string;
}) {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">
      <h2 style="margin:0 0 12px">${escapeHtml(opts.productTitle)} is back in stock</h2>
      <p style="margin:0 0 20px">The item you asked about is available again.</p>
      <p style="margin:0 0 24px">
        <a href="${opts.productUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
          View product
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin:0">
        You asked to be told when this item returned. This is not a marketing list.
        <a href="${opts.unsubscribeUrl}">Unsubscribe</a>.
      </p>
    </div>`;
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

/**
 * Email every pending subscriber for a variant and mark each row SENT or FAILED.
 * Caller has already confirmed the variant is actually available.
 */
export async function notifyVariant(opts: {
  shop: string;
  variantId: string;
  productTitle: string;
  productUrl: string;
}) {
  const { shop, variantId } = opts;

  const pending = await db.restockSubscription.findMany({
    where: { shop, variantId, status: "PENDING" },
  });
  if (pending.length === 0) return { sent: 0, failed: 0 };

  const settings = await db.shopSettings.findUnique({ where: { shop } });
  const subject = (settings?.emailSubject ?? "{{product}} is back in stock")
    .replace("{{product}}", opts.productTitle);
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const fromHeader = settings?.fromName
    ? `${settings.fromName} <${from}>`
    : from;

  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;
  // ponytail: sequential sends. Resend's free tier is 100/day, so a waitlist
  // large enough to need batching is already past this plan — add p-map if that changes.
  for (const sub of pending) {
    const { error } = await resend.emails.send({
      from: fromHeader,
      to: [sub.email],
      subject,
      html: renderEmail({
        productTitle: opts.productTitle,
        productUrl: opts.productUrl,
        unsubscribeUrl: unsubscribeUrl(shop, sub.id),
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
