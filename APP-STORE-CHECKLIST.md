# App Store ship checklist

App: Restock Alerts (`restock-alerts-sun-skill-techs`, repo `notify-me-shopify-app`)
Reviewed: 2026-09-23, against the current [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements).

## Verdict

The core loop works. Signup, restock webhook, email, unsubscribe, retry, CSV export and GDPR webhooks all behave correctly in tests. If you submitted today, I'd expect a first-round rejection. The reasons are mostly around the app rather than in it: the app URL contains the word "shopify", the public root URL is still the template placeholder with a shop-domain login form, the block is invisible in the theme editor on in-stock products, and there is no privacy policy. Fix the P0 list, run the manual script, fill the submission form as below, and the remaining risk is mostly the reviewer's own test run.

Shopify doesn't publish approval rates, so nobody can promise you 90%. What you can control is removing every known rejection reason before submitting. That is what this list is for.

## What was run

| Check | Result |
|---|---|
| Existing tests (`app/*.test.mjs`, 3 files) | Pass |
| New behaviour tests against the real modules, with Prisma/Resend mocked (12 tests) | 9 pass on correct behaviour, 3 confirm the defects listed under P1 |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Builds |
| `shopify theme check --config theme-check:theme-app-extension` | No offenses |
| All 8 Admin GraphQL operations validated against the current schema | Valid. `ProductVariant.image` and `Product.featuredImage` are deprecated but still work |
| Production probe: TLS | Valid certificate |
| Production probe: 5 webhook endpoints with a bad HMAC | All return 401 (the automated check wants this) |
| Production probe: app proxy without Shopify signature | Rejected (400) |
| Production probe: `GET /` | Template placeholder "A short heading about [your app]" plus a shop-domain login form |
| Production probe: `GET /privacy` | 404 |
| `npm audit --omit=dev` | 4 high, all `deepmerge-ts` inside the Prisma CLI config loader. Not reachable from requests. No action |

Behaviour the new tests confirmed:

- Signup stores the email lowercased. A repeat signup reuses the row. Bad email, non-numeric ids and honeypot hits store nothing.
- `notifyVariant` emails each pending shopper once and marks the row SENT. It escapes HTML in the product title and adds a List-Unsubscribe header.
- Two webhook deliveries racing on the same variant send each email exactly once.
- A failed send marks FAILED and the rest still go out. Re-subscribing after a send resets the row to PENDING.
- Unsubscribe tokens only verify for their own row.
- The activity chart buckets by the shop's timezone and compares against the previous period correctly.

## P0: fix before submitting

- [ ] **App URL contains "shopify".** `notify-me-shopify-app-production.up.railway.app` breaks Shopify's rule that app URLs must not include "Shopify" or "Example". Move to a custom domain (for example `restock.sunskilltech.com`) or rename the Railway domain. Then update `application_url`, `[app_proxy] url` and `redirect_urls` in [shopify.app.toml](shopify.app.toml#L6), update `SHOPIFY_APP_URL` on Railway, and run `npm run deploy`.
- [x] **Public root page is the template placeholder with a shop-domain form.** [app/routes/_index/route.tsx:24-53](app/routes/_index/route.tsx#L24-L53) shows "A short heading about [your app]" and asks for a myshopify domain. Requirement 2.3.1 forbids asking for the shop domain, and reviewers do open the app URL directly. Replace it with a one-paragraph description of the app and an "Install from the Shopify App Store" note, with no form. Keep the existing `?shop=` redirect. *Done: description, install note and privacy link, no form. `?shop=` redirect kept.*
- [x] **Block renders nothing in the theme editor when the previewed product is in stock.** The whole block sits inside `{% if sold_out_count > 0 %}` ([notify-me.liquid:26](extensions/notify-me/blocks/notify-me.liquid#L26)), and the JS re-hides it ([notify-me.js:143](extensions/notify-me/assets/notify-me.js#L143)). A reviewer who adds the block on a normal product sees an empty slot, which reads as requirement 5.1.2 ("widget must be displayed properly in the Theme Editor"). Render it when `request.design_mode` is true (skip `hidden`), and skip the hide in JS when `window.Shopify?.designMode` is set. *Done in Liquid and JS.*
- [x] **No privacy policy.** The listing form requires a URL. Cover: shopper email, variant and timestamps stored per shop. Resend is the email subprocessor, Railway the host, Postgres the database. Data is deleted on `customers/redact` and 48 hours after uninstall (`shop/redact`). No marketing use. Host it on your own domain, not on a URL containing "shopify". *Drafted at `/privacy` ([privacy.tsx](app/routes/privacy.tsx)). Developer name and contact email still need filling in, see the end of this file.*
- [x] **App icon has rounded, transparent corners.** Shopify's spec is a square 1200 x 1200 PNG/JPG with no rounded corners. Re-export [public/app-icon-1200.png](public/app-icon-1200.png) as a full-bleed square on the dark background. The bell already sits inside the 750-900 px safe area. *Done: flattened onto the dark background, square and opaque.*
- [x] **Pick one app name and use it everywhere.** The config says "Restock Alerts". The home page heading is "Notify Me" ([app._index.tsx:259](app/routes/app._index.tsx#L259)). The theme editor paragraph says "in the Notify Me app" ([notify-me.liquid:176](extensions/notify-me/blocks/notify-me.liquid#L176)), an app the merchant can't find. Requirement 4.1.2 also rejects names confusingly similar to existing apps, and "Alert Me! Restock Alerts" and "Ordersify: Restocked Alerts" are already listed. Pick a distinct brand name, then match it in the Dev Dashboard, the submission form, the page heading and the block text. *Done: "BackSoon: Back in Stock Alerts" (30 characters, the maximum) in `shopify.app.toml` and on the public and privacy pages. The admin heading and block text say "BackSoon". Use the full name exactly in the submission form.*
- [ ] **Production email is actually configured.** On Railway, confirm `RESEND_API_KEY` is set and `RESEND_FROM` uses a domain verified in Resend (SPF and DKIM green). Without `RESEND_FROM` the app falls back to `onboarding@resend.dev`, which only delivers to the Resend account owner, so the reviewer's restock email would never arrive. Without `RESEND_API_KEY`, the Send test button returns a 500. Verify by sending a test email to a Gmail address that isn't yours.
- [ ] **Resend plan covers review plus beta.** The free tier is 100 emails a day, shared by every merchant on the app. Upgrade before real stores install.
- [ ] **Keep the reviewer's app pointed at production.** `automatically_update_urls_on_dev = true` sits in the only config file. Don't run `shopify app dev` against this app while it's in review. Create a separate dev app (`shopify app config link` into `shopify.app.dev.toml`) for local work.

## P1: bugs to fix before real merchants

These won't usually fail review, but merchants will hit them.

- [x] **Shopper replies go to your inbox.** No `reply_to` is set ([notify.server.ts:129](app/notify.server.ts#L129)), so a reply to a restock email lands at `RESEND_FROM`, your address, not the merchant's. The settings page even says "Replies go there too." Pass `replyTo` set to the shop's contact email (`shop { email }`). *Done: `replyTo` is the store's contact email (`shop.contactEmail`), and the settings page says so.*
- [x] **Sender name is inserted unquoted into the From header** ([notify.server.ts:88](app/notify.server.ts#L88)). A name like `Smith, Jones & Co` produces `Smith, Jones & Co <alerts@...>`, which isn't a valid RFC 5322 address. Resend may reject every send for that shop. Strip `"<>\` and wrap the name in double quotes. *Done, plus CR/LF stripped.*
- [x] **CSV formula injection.** A shopper can sign up as `=HYPERLINK("//evil.co")@x.co`: the proxy accepts it, and [app.waitlist.export.tsx:5](app/routes/app.waitlist.export.tsx#L5) writes it as a live formula into the merchant's spreadsheet (confirmed by test). Prefix `'` to any cell starting with `= + - @` or a tab. *Done.*
- [x] **Signup URL is absolute.** `data-proxy="{{ shop.url }}/apps/notify-me"` ([notify-me.liquid:38](extensions/notify-me/blocks/notify-me.liquid#L38)) points at the primary domain. A shopper on another domain (market domains, preview domains) makes a cross-origin POST that fails, and sees "Something went wrong". Use the relative `/apps/notify-me`. *Done.*
- [x] **Rows can get stuck in SENDING.** If the process restarts between claiming a row and sending (a Railway redeploy during a restock), the row stays SENDING forever. Nothing retries it, and Retry failed only picks up FAILED rows (confirmed by test). Let `notifyVariant` also reclaim SENDING rows older than about 10 minutes. *Done: new `claimedAt` column. Stale rows go out on the next restock or Retry failed.*
- [x] **No rate limit on signups.** Anyone can script POSTs through the storefront and add any address to a waitlist. On restock, the app then emails people who never asked, from one sending domain shared by every merchant. A simple per-shop cap per hour, or per-variant cap, limits the blast radius. *Done: 500 new signups per shop per hour, then 429.*
- [x] **Setup guide can't come back.** After Dismiss ([app._index.tsx:253](app/routes/app._index.tsx#L253)), the theme editor deep link is gone. The waitlist empty state's "Finish setup" button then lands on a home page with no guide. Keep an "Add to theme" button on the home page permanently. *Done: "Add to theme" is a permanent secondary action on the home page.*
- [x] **Default sender name is the shop handle.** With no sender name saved, emails say `my-store-123` ([notify.server.ts:89](app/notify.server.ts#L89)). Fall back to the shop's name instead. *Done: falls back to the store name.*
- [x] **Data requests are only logged.** `customers/data_request` ([webhooks.customers.data_request.tsx:18](app/routes/webhooks.customers.data_request.tsx#L18)) writes the shopper's full rows to Railway logs, and the merchant never receives them. Log the count only, and email the merchant the records (or show them in the admin). *Done: logs the count only and emails the records to the shop owner's email. Returns 500 if the email fails, so Shopify retries.*
- [x] **Unsubscribe is a GET with side effects** ([proxy.unsubscribe.tsx:34](app/routes/proxy.unsubscribe.tsx#L34)). Corporate link scanners open it automatically, which flips SENT rows to UNSUBSCRIBED and skews the "Notified" stat. Low impact, since the email has already been sent by then. *Done: GET shows a confirm button, POST unsubscribes.*
- [x] **App nav shows "Home" twice.** Add `rel="home"` to the `/app` link in [app.tsx:21](app/routes/app.tsx#L21), per the `s-app-nav` docs. *Done.*

## P2: cleanup, no rush

- [x] Swap `image` / `featuredImage` for `media` / `featuredMedia` in [notify.server.ts:194-195](app/notify.server.ts#L194-L195) and [app.waitlist.tsx:83-84](app/routes/app.waitlist.tsx#L83-L84) before Shopify removes them. *Done.*
- [x] Theme extension `api_version = "2026-10"` doesn't match the app's `2026-07`. Align them. *Done: both on 2026-07.*
- [x] `ShopSettings.buttonText` is no longer read (button text lives in the widget metafield). Drop it in a later migration. *Done: dropped in migration `20260924000000_claimed_at`.*
- [x] `notify.test.mjs` and `variant-toggle.test.mjs` copy the code they test instead of importing it, so they can pass while the real code drifts. *Done for `notify.test.mjs`: it now runs the real module with `npx vite-node app/notify.test.mjs`. `variant-toggle.test.mjs` still mirrors, since `notify-me.js` is a plain theme script with no exports.*
- [x] `{{ product.title }}` and `{{ variant.title }}` in the block aren't piped through `| escape`. They're merchant-controlled, so the risk is low. *Done.*
- [x] Add a retention rule (for example, delete SENT and UNSUBSCRIBED rows after 180 days) and state it in the privacy policy. *Done: [retention.server.ts](app/retention.server.ts) runs daily and deletes SENT, UNSUBSCRIBED and FAILED rows 180 days after their last activity. Waiting rows stay. The privacy policy says the same.*
- [x] Add a `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header plus a POST handler once volume grows. Gmail and Yahoo require it from bulk senders. *Done: header added, and the unsubscribe POST handler serves it.*

## Manual test script

Use a fresh dev store, a Dawn theme, and Chrome incognito. Incognito covers requirement 1.1.1, which requires the app to work without third-party cookies.

Install and auth
- [ ] Install from the Dev Dashboard. OAuth shows first, then you land in the app. No login screen and no domain prompt.
- [ ] Uninstall, then reinstall. OAuth shows again and existing waitlist data is still there, since the reinstall is inside 48 hours.
- [ ] Every page loads with no 404 or 500: Home, Waitlist (empty and populated), Widget design, Email settings.
- [ ] Open the admin on a phone. The layout is usable.

Theme
- [ ] Setup guide, then "Open theme editor". The block appears in the product section, on an in-stock product too. Save.
- [ ] On the storefront, an in-stock product shows no button.
- [ ] A product with one sold-out variant among several: the button appears only while that variant is selected. Switching variants toggles it without a reload.
- [ ] A product with several sold-out variants: the popup shows the variant picker, preselected to the current variant.
- [ ] A single-variant product that's sold out: no picker.
- [ ] Popup: focus lands on the email field. Escape closes it, and so do the backdrop and the X. An invalid email shows the error, a valid one shows success, and the button changes to "You're on the list" and stays that way after a reload.

Widget design
- [ ] Change colours, text and size. The preview updates. Save, then the storefront reflects it after a refresh. Reset to defaults works.

Email
- [ ] Email settings: set a sender name and subject, save, send a test to Gmail and to Outlook. Check the inbox (not spam), the From name and the subject.
- [ ] Restock the sold-out variant. The email arrives within seconds, the image and "Shop now" link point to the right variant, and the waitlist moves the row to Sent.
- [ ] Click Unsubscribe in the email. A confirm page appears in the store theme. Press Unsubscribe, and the waitlist moves the row to Unsubscribed.
- [ ] Force a failure (temporarily set a bad `RESEND_API_KEY`), restock, and see Failed plus the home banner. Restore the key, click Retry failed, and the email is delivered.
- [ ] Export CSV downloads from inside the admin iframe and opens in Excel and Google Sheets.

Compliance
- [ ] `shopify app webhook trigger` for `customers/data_request`, `customers/redact` and `shop/redact` all return 200. A bad HMAC returns 401 (already verified on production).

## Submission form

Listing
- [ ] Name is "BackSoon: Back in Stock Alerts", matching the Dev Dashboard exactly (it updates there on `npm run deploy`).
- [ ] Icon: 1200 x 1200, square, no rounded corners, no text, no Shopify logo.
- [ ] Subtitle and introduction (100 characters): a benefit, with no stats, "best", "first" or "only". For example: "Email shoppers the moment a sold-out variant is back, so waiting customers come back to buy."
- [ ] Details: explain the flow in prose (shopper signs up on a sold-out variant, one email on restock, waitlist shows demand per variant, CSV export). Don't submit only a feature list.
- [ ] 3-6 screenshots at 1600 x 900: home dashboard, waitlist, widget design, storefront popup, the email. No browser chrome, no real shopper emails (use test addresses), alt text on each, no pricing, no reviews.
- [ ] Pricing: Free. The code has no billing, and requirement 1.2.1 means any future paid plan must go through Shopify Managed Pricing or the Billing API.
- [ ] Category and tags: Stock alerts / back in stock.
- [ ] Select "Merchant must have online store". State that it needs an Online Store 2.0 theme, since app blocks don't work in vintage themes.
- [ ] Languages: English only.
- [ ] Privacy policy URL, support email, and optionally an FAQ or docs URL.

Configuration
- [ ] Compliance webhooks show as subscribed. They come from `shopify.app.toml` via `npm run deploy`.
- [ ] Protected customer data: opt out. The app reads no customer data through the Admin API. Disclose the storefront-collected emails in the privacy policy.
- [ ] Emergency developer contact (email and phone) is filled in.
- [ ] API contact email doesn't contain "shopify".
- [ ] The released app version is the one with the production (non-"shopify") URLs.

Review instructions (the reviewer follows these literally)
- [ ] English screencast of about 3 minutes: install, setup guide, theme editor deep link, save, storefront signup on a sold-out variant, restock in the admin, email arriving in the inbox, waitlist and CSV.
- [ ] Written steps that include the dev store URL and storefront password, which sold-out product to use, and how to restock it (Products, variant, set inventory above 0).
- [ ] Say plainly that the button only appears on sold-out variants, and that the email comes from `<your RESEND_FROM>` within seconds of restocking.
- [ ] Mention that the unsubscribe link needs the storefront password on a password-protected dev store.

## Still open

Everything in code is done. Typecheck, lint, build, theme check and all three test files pass. Decisions made on 2026-09-23:

- Name "BackSoon: Back in Stock Alerts". I checked the App Store first: "Restockly" is taken, and "Backly" and "Bell: Back In Stock Notifier" are close enough to avoid.
- Privacy policy lists Sun Skill Tech and management.sunskilltechs@gmail.com.
- Retention is 180 days after the last activity for finished records. Waiting requests stay.
- Signup cap stays at 500 new signups per shop per hour.
- `/auth/login` no longer has a form. It sends a known shop on to OAuth and everyone else to the public page.

Left to do, in order:

1. **Get the app off the "shopify" URL.** Either rename the Railway domain (service, then Settings, then Networking, edit the `*.up.railway.app` name to something like `backsoon-production`) or attach a domain you own. Send me the new URL and I'll update `shopify.app.toml`. Then set `SHOPIFY_APP_URL` to it on Railway (service, then Variables).
2. **Get a domain for sending email.** Resend only delivers to arbitrary inboxes from a domain you've verified, so `RESEND_FROM` needs one (for example `alerts@yourdomain.com`). If you buy one, it can also serve as the app URL in step 1.
3. **Resend.** Send me the API key. It goes on Railway as `RESEND_API_KEY`, next to `RESEND_FROM`. Upgrade off the free plan (100 emails a day) before beta stores install.
4. **Separate dev app.** Run `shopify app config link` into `shopify.app.dev.toml` before any more `shopify app dev`, so the reviewer's app keeps pointing at production.
5. **Deploy once, after steps 1 to 3.** Push to GitHub so Railway rebuilds (the new migration runs on boot), then `npm run deploy` for the name, URLs and theme block.
6. **Check the icon** in [public/app-icon-1200.png](public/app-icon-1200.png) before uploading it.
