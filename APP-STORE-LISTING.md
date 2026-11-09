# BackSoon: App Store submission text

Copy each block into the matching field of the submission form. Character counts are next to the limited fields. Replace everything in `<angle brackets>` first.

## Listing

### App name
```
BackSoon: Back in Stock Alerts
```
Must match the name in the Dev Dashboard exactly.

### App card subtitle (55 / 62)
```
Email shoppers when a sold-out variant is back in stock
```

### App introduction (97 / 100)
```
Let shoppers sign up on sold-out variants and get one email the moment the item is back in stock.
```

### App details (479 / 500)
```
When a variant sells out, BackSoon adds a "Notify me" button to the product page. Shoppers leave their email in a short popup. As soon as that variant is back in stock online, each of them gets one email with a link straight to it, sent in your store's name. Replies go to your store's contact email. The waitlist shows which variants people are waiting for, so you know what to reorder. Each signup is also added to your Shopify customers, without subscribing them to marketing.
```

### Feature list (each max 80)
```
Notify me button appears only on sold-out variants, with a popup signup form
One email per request when the variant is back, with a link straight to it
See which variants shoppers are waiting for, and the sales restock emails made
Style the button and popup to match your theme, no code editing
Signups are added to your Shopify customers, tagged backsoon-waitlist
```

### Other listing fields
- Pricing: Recurring charge, with Free marked as the free plan. Plans are set under Pricing content (Shopify App Pricing). 14-day free trial on paid plans; Shopify stops a store that reinstalls from getting a fresh trial.
  - **Free** $0: 50 restock emails a month, Notify me button and popup, waitlist and demand charts, emails carry a small "Sent with BackSoon" line.
  - **Basic** $9/month: 1,000 emails a month, your own sender name and subject, no BackSoon line, Custom CSS, CSV export.
  - **Grow** $19/month: 5,000 emails a month, everything in Basic, email design (heading, message, button, logo), an email on every restock, and clicks, orders and revenue from restock emails.
  - Plan handles must contain "basic" or "grow" (for example `basic`, `grow-yearly`): the app reads the plan from the handle (`app/plans.server.ts`).
- Category: Stock alerts (back in stock).
- Languages: English.
- Requirements: tick "Online Store sales channel". Add: "Needs an Online Store 2.0 theme (app blocks)."
- Privacy policy URL: `https://backsoon.sunskilltech.com/privacy`
- Support email: `management.sunskilltechs@gmail.com`

### Screenshots (1600 x 900, 3 to 6)
1. Home dashboard with the setup guide.
2. Waitlist with a few test signups. Use test addresses, never real ones.
3. Widget design page with the live preview.
4. The storefront popup on a sold-out variant.
5. The restock email in an inbox.

No browser frame, no pricing, no reviews. Give each one alt text that says what it shows, for example "Waitlist page listing variants shoppers are waiting for".

## Protected customer data (Dev Dashboard, API access)

The app now reads and writes the Customer object, so this form must be filled before customer sync works, even on a dev store.

- Protected customer data: yes. Reason: app functionality. The app adds emails that shoppers type into its storefront form to the store's customer list, as App Store requirement 5.1.5 asks.
- Protected customer fields: email only. Not name, phone or address.
- Orders (`read_orders`, `orders/create` webhook): reason "app functionality / analytics". The app compares the order email's keyed hash with waitlist rows to credit a sale to a restock email (Grow). Nothing is kept from orders that don't match.
- Data protection questions: answer truthfully. What's true today:
  - The app only processes the minimum data it needs: email, variant and dates. Yes.
  - Merchants are told what is collected and why, in the privacy policy. Yes.
  - Retention: finished records are deleted 180 days after their last activity, and all of a store's data 48 hours after uninstall.
  - Encrypted in transit: yes, HTTPS everywhere.
  - Encrypted at rest and backups: check the Hetzner server first. Backups are not set up yet.

## Review instructions

Paste this into "Testing instructions" after filling in the placeholders.

```
BackSoon emails shoppers when a sold-out variant comes back in stock. No login or account is needed. Plans: Free, Basic and Grow, picked on Shopify's plan page (Plans in the app menu). On a development store plans are free to pick, so try Grow to see every feature.

Test store: <dev store URL>
Storefront password: <password>
Sold-out product to use: <product name>, variant <variant name>

1. Install the app. You land on the Home page with a setup guide.
2. Click "Add to theme". The theme editor opens with the BackSoon block added to the product page. Click Save.
3. Open the sold-out product on the storefront and select the sold-out variant. A "Notify me when available" button appears. It only shows on sold-out variants, so it is hidden on in-stock ones.
4. Click it, enter your email and submit. The Waitlist page in the app now shows the signup, and Customers in the Shopify admin shows a customer with the tag "backsoon-waitlist".
5. Restock the variant: Products > <product name> > <variant name> > set inventory above 0 > Save.
6. Within a few seconds an email arrives from <RESEND_FROM address>. Check spam if it's not in the inbox. The Waitlist row moves to Sent.
7. The Unsubscribe link in the email opens a confirm page on the store. On a password-protected dev store, enter the storefront password first.

Email settings > Send test sends a sample email to any address.
Plans (app menu) opens the plan page. On Free, Email settings, Custom CSS and CSV export show what Basic and Grow unlock. On Grow, Email settings has the email design and "Email shoppers every time the item is restocked", and Home shows clicks, orders and revenue from restock emails.
```

### Screencast
English, about 3 minutes, following the same steps: install, setup guide, theme editor, save, storefront signup on a sold-out variant, the customer in Shopify, restock, the email arriving, then the waitlist and CSV export.
