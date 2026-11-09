import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sendTestEmail } from "../notify.server";
import { EMAIL_TEXT, sanitizeEmailText, type EmailText } from "../email-text";
import { LANGUAGES } from "../languages";
import { planFor } from "../plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [settings, shopRes] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop: session.shop } }),
    admin.graphql(`#graphql
      query notifyMeShop { shop { name email contactEmail } }`),
  ]);
  const { data } = await shopRes.json();

  return {
    fromName: settings?.fromName ?? "",
    emailSubject: settings?.emailSubject ?? "{{product}} is back in stock",
    emailText: sanitizeEmailText(settings?.emailText),
    testSentAt: settings?.testSentAt?.toISOString() ?? null,
    shopName: (data?.shop?.name as string) ?? "",
    shopEmail: (data?.shop?.email as string) ?? "",
    replyTo: (data?.shop?.contactEmail as string) ?? "",
    fromAddress: process.env.RESEND_FROM || "onboarding@resend.dev",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const fromName = String(form.get("fromName") ?? "").trim().slice(0, 80);
    const emailSubject =
      String(form.get("emailSubject") ?? "").trim().slice(0, 200) ||
      "{{product}} is back in stock";
    let emailText: EmailText;
    try {
      emailText = sanitizeEmailText(JSON.parse(String(form.get("emailText") ?? "{}")));
    } catch {
      emailText = sanitizeEmailText(null);
    }
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, fromName, emailSubject, emailText },
      update: { fromName, emailSubject, emailText },
    });
    return { ok: true, message: "Settings saved" };
  }

  if (intent === "test") {
    const to = String(form.get("to") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    const shopRes = await admin.graphql(`#graphql
      query notifyMeTestShop { shop { name contactEmail } }`);
    const { data } = await shopRes.json();
    const { appSubscriptions } = await billing.check();
    const error = await sendTestEmail(
      shop,
      { shopName: data?.shop?.name ?? "", shopContactEmail: data?.shop?.contactEmail ?? null },
      to,
      planFor(appSubscriptions.map((s) => s.name)).price === 0,
    );
    if (error) return { ok: false, message: `Could not send: ${error}` };
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, testSentAt: new Date() },
      update: { testSentAt: new Date() },
    });
    return { ok: true, message: `Test email sent to ${to}` };
  }

  return { ok: false, message: "Unknown action" };
};

type FieldEvent = { currentTarget: { value: string } };

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [fromName, setFromName] = useState(data.fromName);
  const [emailSubject, setEmailSubject] = useState(data.emailSubject);
  const [text, setText] = useState(data.emailText);
  const [testTo, setTestTo] = useState(data.shopEmail);

  // After a save the loader re-runs; adopt its sanitized values (blanks become defaults).
  useEffect(() => setText(data.emailText), [data.emailText]);

  const busy = fetcher.state !== "idle";
  const dirty =
    fromName !== data.fromName ||
    emailSubject !== data.emailSubject ||
    JSON.stringify(text) !== JSON.stringify(data.emailText);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () =>
    fetcher.submit(
      { intent: "save", fromName, emailSubject, emailText: JSON.stringify(text) },
      { method: "post" },
    );
  // Matches the saved words against each language; anything edited shows as Custom.
  const language = LANGUAGES.findIndex(
    (l) => l.subject === emailSubject && JSON.stringify(l.email) === JSON.stringify(text),
  );
  const pickLanguage = (i: number) => {
    const l = LANGUAGES[i];
    if (!l) return;
    setEmailSubject(l.subject);
    setText(l.email);
  };
  const field = (key: keyof EmailText, label: string, details?: string) => (
    <s-text-field
      label={label}
      value={text[key]}
      placeholder={EMAIL_TEXT[key]}
      details={details}
      onInput={(e: FieldEvent) => {
        const value = e.currentTarget.value;
        setText((prev) => ({ ...prev, [key]: value }));
      }}
    />
  );
  const test = () =>
    fetcher.submit({ intent: "test", to: testTo }, { method: "post" });

  const previewSubject = emailSubject.replace("{{product}}", "Linen shirt");
  // With no sender name saved, emails use the store name (see sender() in notify.server).
  const previewName = fromName || data.shopName;
  const previewFrom = previewName ? `${previewName} <${data.fromAddress}>` : data.fromAddress;

  return (
    <s-page heading="Email settings">
      <s-button slot="secondary-actions" href="/app">
        Back to overview
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!dirty || busy}
        onClick={save}
      >
        Save
      </s-button>

      <s-section heading="Sender and subject">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Sender name"
            name="fromName"
            value={fromName}
            placeholder={data.shopName}
            details="Shown as the 'From' name in the shopper's inbox."
            onInput={(e: FieldEvent) => setFromName(e.currentTarget.value)}
          />
          <s-text-field
            label="Subject line"
            name="emailSubject"
            value={emailSubject}
            details="Use {{product}} where the product title should go."
            onInput={(e: FieldEvent) => setEmailSubject(e.currentTarget.value)}
          />
          <s-box
            padding="base"
            borderRadius="base"
            background="subdued"
            borderWidth="base"
            borderColor="base"
          >
            <s-stack direction="block" gap="small-300">
              <s-text color="subdued">Preview</s-text>
              <s-text type="strong">{previewSubject}</s-text>
              <s-text color="subdued">{previewFrom}</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Email text">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Pick your store&apos;s language to fill in the subject and every line
            below, then edit any of them. Leave a field empty to use the English
            default.
          </s-paragraph>
          <s-select
            label="Language"
            value={String(language)}
            onChange={(e: FieldEvent) => pickLanguage(Number(e.currentTarget.value))}
          >
            {language < 0 && <s-option value="-1">Custom</s-option>}
            {LANGUAGES.map((l, i) => (
              <s-option key={l.name} value={String(i)}>
                {l.name}
              </s-option>
            ))}
          </s-select>
          {field("heading", "Heading", "Use {{product}} where the product title should go.")}
          {field("body", "Message")}
          {field("button", "Button")}
          {field("footer", "Footer note")}
          {field("unsubscribe", "Unsubscribe link and button")}
        </s-stack>
      </s-section>

      <s-section heading="Unsubscribe page">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Shown on your store when a shopper opens the unsubscribe link.
          </s-paragraph>
          {field("unsubHeading", "Heading")}
          {field("unsubBody", "Message")}
          {field("unsubDoneHeading", "Heading after unsubscribing")}
          {field("unsubDoneBody", "Message after unsubscribing")}
          {field("continueShopping", "Continue shopping link")}
        </s-stack>
      </s-section>

      <s-section heading="Send a test">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Sends a sample restock email so you can check delivery, sender name
            and subject before a shopper gets one.
            {dirty && " Save your changes first to test them."}
          </s-paragraph>
          <s-stack direction="inline" gap="small-100" alignItems="end">
            <s-email-field
              label="Send to"
              name="to"
              value={testTo}
              onInput={(e: FieldEvent) => setTestTo(e.currentTarget.value)}
            />
            <s-button onClick={test} disabled={busy || !testTo} icon="send">
              Send test
            </s-button>
          </s-stack>
          {data.testSentAt && (
            <s-text color="subdued">
              Last test sent {new Date(data.testSentAt).toLocaleString()}
            </s-text>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="What shoppers receive">
        <s-stack direction="block" gap="small-100">
          <s-text>Product image, variant and a button back to the product.</s-text>
          <s-text color="subdued">
            One email per request. Every email carries an unsubscribe link and a
            List-Unsubscribe header so inboxes treat it as transactional.
          </s-text>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Sending address">
        <s-text color="subdued">
          Emails are sent from {data.fromAddress}.{" "}
          {data.replyTo
            ? `Shopper replies go to your store's contact email, ${data.replyTo}.`
            : "Add a contact email in Settings > Store details so shopper replies reach you."}
        </s-text>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
