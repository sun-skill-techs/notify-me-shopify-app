// Public privacy policy, linked from the App Store listing and the app's root page.
const DEVELOPER = "Sun Skill Tech";
const CONTACT_EMAIL = "management.sunskilltechs@gmail.com";
const UPDATED = "September 23, 2026";

export default function Privacy() {
  return (
    <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.25rem", lineHeight: 1.6 }}>
      <h1>BackSoon privacy policy</h1>
      <p>Last updated {UPDATED}</p>

      <p>
        BackSoon: Back in Stock Alerts is a Shopify app made by {DEVELOPER}. Merchants install it
        so shoppers can ask to be emailed when a sold-out product variant is back
        in stock. This policy covers the data the app handles for those
        merchants and their shoppers.
      </p>

      <h2>What we collect</h2>
      <p>When a shopper signs up on a store&apos;s product page, we store:</p>
      <ul>
        <li>their email address</li>
        <li>the product and variant they asked about</li>
        <li>when they signed up, when we emailed them, and when they unsubscribed</li>
      </ul>
      <p>
        From the merchant&apos;s store we store the settings they choose in the app
        (sender name, email subject, widget design) and the access token Shopify
        issues at install. The app reads product and variant details and the
        store&apos;s name and contact email through Shopify&apos;s API. It does not read
        orders or the store&apos;s customer records.
      </p>

      <h2>How we use it</h2>
      <p>
        We use a shopper&apos;s email address for one purpose: sending the restock
        email they asked for, once, when that variant is back in stock. We never
        use it for marketing, never sell it, and never share it with other
        merchants. The merchant can see and export the waitlist for their own
        store.
      </p>

      <h2>Who processes it</h2>
      <ul>
        <li>Resend sends the emails.</li>
        <li>Railway hosts the app and its PostgreSQL database.</li>
        <li>Shopify provides the store data and relays storefront signups to the app.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        A waiting request stays until the item is back in stock and we send the
        email. Once a request is sent, unsubscribed or has failed, we delete it
        180 days later. A shopper can unsubscribe from the link in any restock
        email. When Shopify tells us a shopper&apos;s data must be erased, we delete their records for that store.
        When a merchant uninstalls the app, we delete all of that store&apos;s data
        48 hours later, when Shopify sends its shop deletion request.
      </p>

      <h2>Your rights</h2>
      <p>
        Shoppers can ask the store they signed up with for a copy of their data
        or for it to be deleted. The merchant passes that request to us through
        Shopify and we act on it. You can also contact us directly.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}
