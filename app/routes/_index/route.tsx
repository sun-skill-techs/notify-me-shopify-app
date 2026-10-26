import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { PublicPage, publicStyles as styles } from "../../public-page";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export const meta = () => [{ title: "BackSoon: Back in Stock Alerts" }];

// Public face of the app URL. App Store rules forbid asking for a shop domain
// here, so there's no login form: installs start from the App Store listing.
export default function App() {
  return (
    <PublicPage>
      <section className={styles.hero}>
        <img className={styles.heroIcon} src="/app-icon.png" alt="BackSoon" />
        <h1>
          Turn sold-out products into <span>sales waiting to happen</span>
        </h1>
        <p className={styles.lead}>
          Shoppers leave their email on a sold-out variant. When it comes back
          in stock, each of them gets one email with a link straight to it, and
          you see which variants people are waiting for.
        </p>
        <a
          className={styles.cta}
          href="https://apps.shopify.com/search?q=BackSoon"
        >
          Get it on the Shopify App Store
        </a>
        <p className={styles.note}>
          Already installed? Open BackSoon from your Shopify admin.
        </p>
      </section>

      <section className={styles.section}>
        <h2>How it works</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.step}>1</div>
            <h3>Shopper asks</h3>
            <p>
              A &quot;Notify me&quot; button appears on sold-out variants.
              Shoppers leave their email in one click.
            </p>
          </div>
          <div className={styles.card}>
            <div className={styles.step}>2</div>
            <h3>You restock</h3>
            <p>
              Update inventory as usual. BackSoon notices the moment a variant
              is back in stock.
            </p>
          </div>
          <div className={styles.card}>
            <div className={styles.step}>3</div>
            <h3>They buy</h3>
            <p>
              Each shopper gets one email with a direct link to the product,
              ready to check out.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.alt}>
        <div className={styles.section}>
          <h2>Built for your store</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Matches your theme</h3>
              <p>
                Pick colors and text for the button and popup so it looks like
                part of your store.
              </p>
            </div>
            <div className={styles.card}>
              <h3>See real demand</h3>
              <p>
                Know which variants shoppers are waiting for before you place
                your next order.
              </p>
            </div>
            <div className={styles.card}>
              <h3>Privacy first</h3>
              <p>
                Emails are encrypted, used once for the restock alert and never
                for marketing.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
