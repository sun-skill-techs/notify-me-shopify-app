// Public data processing terms, linked from the privacy policy. They apply to every
// merchant who installs the app; SECURITY.md is the internal policy behind them.
const DEVELOPER = "Sun Skill Tech";
const CONTACT_EMAIL = "management.sunskilltechs@gmail.com";
const UPDATED = "October 7, 2026";

export default function Dpa() {
  return (
    <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "3rem 1.25rem", lineHeight: 1.6 }}>
      <h1>BackSoon data processing terms</h1>
      <p>Last updated {UPDATED}</p>

      <p>
        These terms apply between {DEVELOPER} (&quot;we&quot;) and each merchant who installs
        BackSoon: Back in Stock Alerts (&quot;you&quot;). By installing the app you agree to
        them. They cover the personal data of your shoppers that the app processes for
        you. The <a href="/privacy">privacy policy</a> describes that data in detail.
      </p>

      <h2>Roles</h2>
      <p>
        You are the controller of your shoppers&apos; personal data. We process it as your
        processor, only to run the app for your store: storing back-in-stock requests,
        sending the one email each shopper asked for, adding signups to your Shopify
        customer list, and showing you your waitlist. We don&apos;t use it for anything else.
      </p>

      <h2>Data processed</h2>
      <ul>
        <li>Shopper email addresses, the product and variant requested, and dates.</li>
        <li>Your store&apos;s app settings and the access token Shopify issues at install.</li>
      </ul>

      <h2>Security</h2>
      <ul>
        <li>All traffic is encrypted with HTTPS.</li>
        <li>Shopper email addresses are encrypted in our database (AES-256).</li>
        <li>Backups are encrypted and kept for 14 days.</li>
        <li>Only our developer can access production systems, using key-based login and two-factor authentication.</li>
        <li>Access to shopper emails, such as waitlist exports, is logged.</li>
        <li>Anyone who works on the app is bound to keep the data confidential.</li>
      </ul>

      <h2>Subprocessors</h2>
      <ul>
        <li>Hetzner Online GmbH (Germany) hosts the app and its database.</li>
        <li>Resend (United States) sends the emails.</li>
        <li>Shopify provides store data and relays storefront signups.</li>
      </ul>
      <p>We&apos;ll update this page before adding or replacing a subprocessor.</p>

      <h2>Shopper requests</h2>
      <p>
        When a shopper asks you to see or delete their data, Shopify passes the request to
        us. We email you their records, or delete them, as Shopify requires.
      </p>

      <h2>Security incidents</h2>
      <p>
        If a breach affects your shoppers&apos; data, we&apos;ll tell you without undue delay and
        within 72 hours of becoming aware of it, with what we know about the data affected
        and the steps we&apos;re taking.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Finished requests are deleted 180 days after their last activity. When you
        uninstall the app, all of your store&apos;s data is deleted 48 hours later, when
        Shopify sends its deletion request. Copies in backups expire within 14 days after that.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}
