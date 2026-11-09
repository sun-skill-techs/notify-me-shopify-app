// The restock email's HTML. No server imports, so the settings page can
// render its live preview with the same function that sends.

/** Grow plan email template. Empty fields use the built-in copy. */
export type EmailTemplate = {
  emailHeading: string;
  emailBody: string;
  emailButton: string;
  emailButtonColor: string;
  emailLogoUrl: string;
};

export const TEMPLATE_DEFAULTS: EmailTemplate = {
  emailHeading: "{{product}} is back in stock",
  emailBody: "You asked us to tell you when this came back. It's available now, and stock may not last long.",
  emailButton: "Shop now",
  emailButtonColor: "#1a1a1a",
  emailLogoUrl: "",
};

export type RestockEmail = {
  productTitle: string;
  variantTitle: string;
  productUrl: string;
  imageUrl: string | null;
  storeName: string;
  unsubscribeUrl: string;
  template?: EmailTemplate;
  // Free plan: a small "Sent with BackSoon" line in the footer.
  branded?: boolean;
  // Grow re-notify: the shopper hears about every restock, so say so.
  repeat?: boolean;
};

// Table layout and inline styles: Gmail and Outlook drop <style> blocks and flex.
export function renderEmail(e: RestockEmail) {
  const t = { ...TEMPLATE_DEFAULTS };
  for (const k of Object.keys(t) as (keyof EmailTemplate)[]) if (e.template?.[k]) t[k] = e.template[k];
  // Goes into a style attribute; the settings form checks it too.
  if (!/^#[0-9a-f]{6}$/i.test(t.emailButtonColor)) t.emailButtonColor = TEMPLATE_DEFAULTS.emailButtonColor;
  const title = escapeHtml(e.productTitle);
  const variant = e.variantTitle ? escapeHtml(e.variantTitle) : "";
  const productUrl = escapeHtml(e.productUrl);
  const image = e.imageUrl
    ? `<tr><td style="padding:0 0 20px">
         <a href="${productUrl}"><img src="${e.imageUrl}" width="240" alt="${title}" style="display:block;max-width:240px;border-radius:8px"></a>
       </td></tr>`
    : "";
  const header = t.emailLogoUrl
    ? `<img src="${escapeHtml(t.emailLogoUrl)}" height="40" alt="${escapeHtml(e.storeName)}" style="display:block;max-height:40px;max-width:200px">`
    : escapeHtml(e.storeName);
  const branding = e.branded
    ? `<br><br>Sent with <a href="https://backsoon.sunskilltech.com" style="color:#6b7177">BackSoon</a>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px 16px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
  <tr><td style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7177;padding:0 0 12px">${header}</td></tr>
  <tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding:0 0 8px">${escapeHtml(t.emailHeading).replace("{{product}}", title)}</td></tr>
  ${variant ? `<tr><td style="font-size:14px;color:#6b7177;padding:0 0 20px">${variant}</td></tr>` : `<tr><td style="padding:0 0 12px"></td></tr>`}
  ${image}
  <tr><td style="font-size:15px;line-height:1.5;padding:0 0 24px">${escapeHtml(t.emailBody).replace(/\n/g, "<br>")}</td></tr>
  <tr><td style="padding:0 0 28px">
    <a href="${productUrl}" style="display:inline-block;background:${t.emailButtonColor};color:#fff;font-size:15px;font-weight:600;padding:14px 24px;border-radius:8px;text-decoration:none">${escapeHtml(t.emailButton)}</a>
  </td></tr>
  <tr><td style="font-size:12px;line-height:1.5;color:#6b7177;border-top:1px solid #e3e3e3;padding:16px 0 0">
    ${e.repeat ? "You'll get an email each time this item is restocked." : "You'll only get this one email for this request."} This is not a marketing list.
    <a href="${e.unsubscribeUrl}" style="color:#6b7177">Unsubscribe</a>${branding}
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
