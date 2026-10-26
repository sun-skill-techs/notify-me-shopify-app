import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { CONTACT_EMAIL, loadTawk, requestReview } from "../public-page";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const FAQ = [
  {
    q: "The Notify me button doesn't show on my product page",
    a: "It only shows on sold-out variants, so in-stock products look the same. Check that the BackSoon block is added to your product template from Home → Add to theme, then pick a sold-out variant.",
  },
  {
    q: "When do shoppers get their email?",
    a: "Within seconds of the variant coming back in stock online. Each signup gets one email.",
  },
  {
    q: "Some emails failed to send",
    a: "Send yourself a test from Email settings to check delivery, then retry the failed ones from the waitlist.",
  },
  {
    q: "Can shoppers stop the emails?",
    a: "Yes. Every notification includes an unsubscribe link.",
  },
];

export default function Support() {
  useEffect(loadTawk, []);
  const openChat = () => {
    const api = (window as unknown as { Tawk_API?: { maximize?: () => void } }).Tawk_API;
    api?.maximize?.();
  };

  return (
    <s-page heading="Support">
      <s-section heading="Contact us">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Stuck on setup or seeing something odd? Message us and a real person
            replies, usually within one business day.
          </s-paragraph>
          <s-stack direction="inline" gap="small-200">
            <s-button variant="primary" icon="chat" onClick={openChat}>
              Live chat
            </s-button>
            <s-button icon="email" href={`mailto:${CONTACT_EMAIL}`} target="_blank">
              Email {CONTACT_EMAIL}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Common questions">
        <s-stack direction="block" gap="base">
          {FAQ.map((item) => (
            <s-stack key={item.q} direction="block" gap="small-100">
              <s-text type="strong">{item.q}</s-text>
              <s-text color="subdued">{item.a}</s-text>
            </s-stack>
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Enjoying BackSoon?">
        <s-stack direction="block" gap="base">
          <s-paragraph>A quick review helps other merchants find the app.</s-paragraph>
          <s-button icon="star" onClick={requestReview}>
            Leave a review
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Policies">
        <s-stack direction="block" gap="small-100">
          <s-link href="/privacy" target="_blank">Privacy policy</s-link>
          <s-link href="/dpa" target="_blank">Data processing terms</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
