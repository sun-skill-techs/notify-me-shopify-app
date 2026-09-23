import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

// Public face of the app URL. App Store rules forbid asking for a shop domain
// here, so there's no login form: installs start from the App Store listing.
export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>BackSoon: Back in Stock Alerts</h1>
        <p className={styles.text}>
          Shoppers leave their email on a sold-out variant. When it comes back in
          stock, each of them gets one email with a link straight to it, and you
          see which variants people are waiting for.
        </p>
        <p>
          Install it from the Shopify App Store, then open it from your Shopify
          admin. <a href="/privacy">Privacy policy</a>
        </p>
      </div>
    </div>
  );
}
