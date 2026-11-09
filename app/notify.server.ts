import crypto from "node:crypto";
import { Resend } from "resend";
import db from "./db.server";
import { decryptEmail } from "./crypto.server";
import { countEmailSent, effectivePlan, emailsUsed, refreshPlan } from "./plans.server";
import { atLeast, PLANS } from "./plans";
import { renderEmail } from "./email";

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

// The Shop now link goes through the app first so the click is recorded
// (routes/c.$id.tsx). Signed so the route can't be used as an open redirect.
export function clickToken(id: string, url: string) {
  return unsubscribeToken(`${id}\n${url}`);
}

export function trackedUrl(id: string, url: string) {
  return `${process.env.SHOPIFY_APP_URL}/c/${id}?u=${encodeURIComponent(url)}&t=${clickToken(id, url)}`;
}

// A display name goes inside a quoted-string, so it can't carry the characters
// that end one (or a header). "Smith, Jones & Co" is valid only once quoted.
export function fromHeader(name: string, address: string) {
  const clean = name.replace(/["<>\\\r\n]/g, "").trim();
  return clean ? `"${clean}" <${address}>` : address;
}

/** What the email needs from the store itself: its name, and where shopper replies go. */
export type ShopInfo = { shopName: string; shopContactEmail: string | null };

async function sender(shop: string, info: ShopInfo, productTitle: string) {
  // Sending runs from webhooks, where no merchant is around to refresh the plan,
  // so a day-old plan is good enough here; the admin refreshes it every 5 minutes.
  const { settings } = await refreshPlan(shop, { maxAgeMs: 24 * 60 * 60 * 1000 });
  const plan = effectivePlan(settings);
  // Subject and sender name are Basic features; Free sends the defaults.
  const custom = atLeast(plan, "basic") ? settings : null;
  const grow = atLeast(plan, "grow") ? settings : null;
  const subject = (custom?.emailSubject || "{{product}} is back in stock").replace(
    "{{product}}",
    productTitle,
  );
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const storeName =
    custom?.fromName || info.shopName || shop.replace(/\.myshopify\.com$/, "");
  return {
    resend: new Resend(process.env.RESEND_API_KEY),
    subject,
    fromHeader: fromHeader(storeName, from),
    // Shoppers reply to the store, not to the app's shared sending address.
    replyTo: info.shopContactEmail || undefined,
    storeName,
    look: {
      template: grow ?? undefined,
      branded: plan === "free",
      repeat: Boolean(grow?.renotify),
    },
    limit: PLANS[plan].emails,
    used: emailsUsed(settings),
  };
}

// A row whose sender died mid-send (a redeploy during a restock) would sit in
// SENDING forever. After this long it's claimable again. If the crash came
// after Resend accepted the email, that shopper gets it twice, which beats never.
const STALE_SENDING_MS = 10 * 60 * 1000;
// Re-notify (Grow) also picks up shoppers already emailed, but not twice in a
// day, so a variant flapping in and out of stock doesn't flood them.
const RENOTIFY_GAP_MS = 24 * 60 * 60 * 1000;
const claimable = (renotify = false) => ({
  OR: [
    { status: "PENDING" },
    { status: "SENDING", claimedAt: null },
    { status: "SENDING", claimedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
    ...(renotify ? [{ status: "SENT", sentAt: { lt: new Date(Date.now() - RENOTIFY_GAP_MS) } }] : []),
  ],
});

/**
 * Email every pending subscriber for a variant and mark each row SENT or FAILED.
 * Caller has already confirmed the variant is actually available. Once the
 * plan's monthly allowance is used up the rest stay PENDING (counted as `held`)
 * and go out on the variant's next restock.
 */
export async function notifyVariant(opts: ShopInfo & {
  shop: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  productUrl: string;
  imageUrl: string | null;
}) {
  const { shop, variantId } = opts;

  const { resend, subject, fromHeader, replyTo, storeName, look, limit, used } = await sender(
    shop,
    opts,
    opts.productTitle,
  );

  const pending = await db.restockSubscription.findMany({
    where: { shop, variantId, ...claimable(look.repeat) },
    select: { id: true, email: true },
  });
  if (pending.length === 0) return { sent: 0, failed: 0, held: 0 };

  let sent = 0;
  let failed = 0;
  let held = 0;
  // ponytail: sequential sends. Resend's free tier is 100/day, so a waitlist
  // large enough to need batching is already past this plan — add p-map if that changes.
  for (const sub of pending) {
    // ponytail: the allowance is read once per restock, so two variants restocking
    // at the same moment can overshoot it by a few emails.
    if (used + sent >= limit) {
      held++;
      continue;
    }
    // Shopify retries webhooks, so two handlers can race on the same variant.
    // Claiming the row first means only one of them ever emails this shopper.
    const { count } = await db.restockSubscription.updateMany({
      where: { id: sub.id, ...claimable(look.repeat) },
      data: { status: "SENDING", claimedAt: new Date() },
    });
    if (count === 0) continue;

    const unsub = unsubscribeUrl(shop, sub.id);
    const { error } = await resend.emails.send({
      from: fromHeader,
      to: [decryptEmail(sub.email)],
      replyTo,
      subject,
      // One-click (RFC 8058): Gmail and Yahoo POST to the link; proxy.unsubscribe handles it.
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      html: renderEmail({
        productTitle: opts.productTitle,
        variantTitle: opts.variantTitle,
        productUrl: trackedUrl(sub.id, opts.productUrl),
        imageUrl: opts.imageUrl,
        storeName,
        unsubscribeUrl: unsub,
        ...look,
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
      await countEmailSent(shop);
    }
  }

  return { sent, failed, held };
}

/** Send a sample restock email so the merchant can check delivery and branding. */
export async function sendTestEmail(shop: string, info: ShopInfo, to: string) {
  const { resend, subject, fromHeader, replyTo, storeName, look } = await sender(
    shop,
    info,
    "Sample product",
  );
  const { error } = await resend.emails.send({
    from: fromHeader,
    to: [to],
    replyTo,
    subject: `[Test] ${subject}`,
    html: renderEmail({
      productTitle: "Sample product",
      variantTitle: "Medium / Black",
      productUrl: `https://${shop}`,
      imageUrl: null,
      storeName,
      unsubscribeUrl: `https://${shop}`,
      ...look,
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
        shop { name contactEmail primaryDomain { url } }
        productVariant(id: $id) {
          id
          title
          availableForSale
          media(first: 1) { nodes { preview { image { url } } } }
          product { title handle status onlineStoreUrl featuredMedia { preview { image { url } } } }
        }
      }`,
    { variables: { id: variantGid } },
  );
  const { data } = await response.json();
  const v = data?.productVariant;
  if (!v?.availableForSale || v.product?.status !== "ACTIVE") return null;
  // onlineStoreUrl is null while the storefront is password-protected (every dev store),
  // so build the link from the handle; the ACTIVE check keeps drafts from being linked.
  const productPage =
    v.product.onlineStoreUrl ?? `${data.shop.primaryDomain.url}/products/${v.product.handle}`;

  const variantId = variantGid.split("/").pop()!;
  return {
    variantId,
    productTitle: v.product.title as string,
    variantTitle: v.title === "Default Title" ? "" : (v.title as string),
    productUrl: `${productPage}?variant=${variantId}`,
    imageUrl: (v.media?.nodes?.[0]?.preview?.image?.url ??
      v.product.featuredMedia?.preview?.image?.url ??
      null) as string | null,
    shopName: (data.shop?.name ?? "") as string,
    shopContactEmail: (data.shop?.contactEmail ?? null) as string | null,
  };
}

export const CUSTOMER_TAG = "backsoon-waitlist";

/**
 * App Store requirement 5.1.5: an email collected on the storefront goes into the
 * store's own customer list. Tagged so the merchant can find waitlist signups.
 * Marketing consent is left alone: a restock request isn't a marketing opt-in.
 */
export async function syncCustomer(
  admin: { graphql: (q: string, o?: { variables: Record<string, unknown> }) => Promise<Response> },
  email: string,
) {
  const found = await admin.graphql(
    `#graphql
      query backSoonCustomer($email: String!) {
        customerByIdentifier(identifier: { emailAddress: $email }) { id }
      }`,
    { variables: { email } },
  );
  const id = (await found.json()).data?.customerByIdentifier?.id;

  // tagsAdd keeps the customer's existing tags; customerCreate's tags would replace them.
  const res = id
    ? await admin.graphql(
        `#graphql
          mutation backSoonTag($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
          }`,
        { variables: { id, tags: [CUSTOMER_TAG] } },
      )
    : await admin.graphql(
        `#graphql
          mutation backSoonCustomerCreate($input: CustomerInput!) {
            customerCreate(input: $input) { userErrors { field message } }
          }`,
        { variables: { input: { email, tags: [CUSTOMER_TAG] } } },
      );
  const { data, errors } = await res.json();
  const userErrors = errors ?? (id ? data?.tagsAdd : data?.customerCreate)?.userErrors;
  if (userErrors?.length) throw new Error(JSON.stringify(userErrors));
}

/**
 * customers/data_request: email the merchant every record held for that shopper,
 * so they can pass it on. Returns an error message, or null once sent.
 */
export async function sendDataRequest(to: string, shop: string, customerEmail: string, rows: unknown[]) {
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: [to],
    subject: `Customer data request: ${customerEmail}`,
    text: `Shopify sent a data request for ${customerEmail} on ${shop}.

These are all the restock-alert records stored for that address. Forward them to the customer to complete the request.

${JSON.stringify(rows, null, 2)}
`,
  });
  return error ? error.message : null;
}
