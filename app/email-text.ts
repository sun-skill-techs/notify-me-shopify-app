// Shopper-facing words in the restock email and the unsubscribe page, edited on
// /app/settings so a store can write them in its own language.

export const EMAIL_TEXT = {
  heading: "{{product}} is back in stock",
  body: "You asked us to tell you when this came back. It's available now, and stock may not last long.",
  button: "Shop now",
  footer: "You'll only get this one email for this request. This is not a marketing list.",
  unsubscribe: "Unsubscribe",
  unsubHeading: "Unsubscribe from this restock alert?",
  unsubBody: "You won't get another email about this item.",
  unsubDoneHeading: "You're unsubscribed",
  unsubDoneBody:
    "You won't get another restock email for this item. You can sign up again from the product page any time.",
  continueShopping: "Continue shopping",
};

export type EmailText = typeof EMAIL_TEXT;

// Trust boundary: the admin form's values land in emails and storefront pages.
// Unknown keys are dropped; a blank field falls back to its default.
export function sanitizeEmailText(input: unknown): EmailText {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { ...EMAIL_TEXT };
  for (const key of Object.keys(EMAIL_TEXT) as (keyof EmailText)[]) {
    const value = raw[key];
    const text = typeof value === "string" ? value.trim().slice(0, 300) : "";
    if (text) out[key] = text;
  }
  return out;
}
