import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { escapeHtml, verifyUnsubscribeToken } from "../notify.server";
import { sanitizeEmailText, type EmailText } from "../email-text";

// Merchant-written words are printed into Liquid, so braces are escaped too:
// a "{{" in the text must show as text, not run as Liquid.
const safe = (s: string) => escapeHtml(s).replace(/[{}]/g, (c) => (c === "{" ? "&#123;" : "&#125;"));

// Shopify renders application/liquid proxy responses inside the store's own
// theme layout, so the shopper lands on a page that looks like the shop.
const page = (heading: string, body: string, continueText: string, status = 200, form = "") =>
  new Response(
    `<div style="max-width:32rem;margin:4rem auto;padding:0 1.5rem;text-align:center">
      <h1 style="margin:0 0 .75rem">${safe(heading)}</h1>
      <p style="margin:0 0 1.5rem;opacity:.75">${safe(body)}</p>
      ${form}
      <a href="/" style="text-decoration:underline">${safe(continueText)}</a>
    </div>`,
    { status, headers: { "Content-Type": "application/liquid" } },
  );

// ponytail: the invalid-link page stays English; it only shows for a mangled link.
const invalid = (t: EmailText) =>
  page(
    "This link isn't valid",
    "It may have been copied incompletely. Open the link from your email again.",
    t.continueShopping,
    400,
  );

const verified = async (request: Request) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  // The proxy signature covers the shop param, so it can be trusted here.
  const shop = url.searchParams.get("shop") ?? "";
  const settings = shop ? await db.shopSettings.findUnique({ where: { shop } }) : null;
  const t = sanitizeEmailText(settings?.emailText);
  return { id: id && verifyUnsubscribeToken(id, token) ? id : null, t };
};

// Reached from the link in every restock email: /apps/notify-me/unsubscribe?id=..&token=..
// GET only asks. Link scanners in corporate inboxes open every URL, and a GET
// that unsubscribed would flip rows the shopper never touched.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { id, t } = await verified(request);
  if (!id) return invalid(t);

  // No action attribute: the form posts back to this same URL, id and token included.
  return page(
    t.unsubHeading,
    t.unsubBody,
    t.continueShopping,
    200,
    `<form method="post" style="margin:0 0 1.5rem">
      <button type="submit" class="button">${safe(t.unsubscribe)}</button>
    </form>`,
  );
};

// The confirm button above, and one-click unsubscribe from Gmail and Yahoo
// (List-Unsubscribe-Post), both POST here.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { id, t } = await verified(request);
  if (!id) return invalid(t);

  await db.restockSubscription.updateMany({
    where: { id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  return page(t.unsubDoneHeading, t.unsubDoneBody, t.continueShopping);
};
