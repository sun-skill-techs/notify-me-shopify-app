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
import { renderEmail, TEMPLATE_DEFAULTS, type EmailTemplate } from "../email";
import { effectivePlan } from "../plans.server";
import { atLeast } from "../plans";

const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFAULTS) as (keyof EmailTemplate)[];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [settings, shopRes] = await Promise.all([
    db.shopSettings.findUnique({ where: { shop: session.shop } }),
    admin.graphql(`#graphql
      query notifyMeShop { shop { name email contactEmail } }`),
  ]);
  const { data } = await shopRes.json();

  const plan = effectivePlan(settings);
  return {
    basic: atLeast(plan, "starter"),
    grow: atLeast(plan, "growth"),
    template: Object.fromEntries(
      TEMPLATE_KEYS.map((k) => [k, settings?.[k] ?? ""]),
    ) as EmailTemplate,
    renotify: settings?.renotify ?? false,
    fromName: settings?.fromName ?? "",
    emailSubject: settings?.emailSubject ?? "{{product}} is back in stock",
    testSentAt: settings?.testSentAt?.toISOString() ?? null,
    shopName: (data?.shop?.name as string) ?? "",
    shopEmail: (data?.shop?.email as string) ?? "",
    replyTo: (data?.shop?.contactEmail as string) ?? "",
    fromAddress: process.env.RESEND_FROM || "onboarding@resend.dev",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save") {
    const plan = effectivePlan(await db.shopSettings.findUnique({ where: { shop } }));
    const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
    const data: Record<string, string | boolean> = {};
    // Plan features are enforced here too, not just greyed out in the form.
    if (atLeast(plan, "starter")) {
      data.fromName = text("fromName", 80);
      data.emailSubject = text("emailSubject", 200) || "{{product}} is back in stock";
    }
    if (atLeast(plan, "growth")) {
      data.emailHeading = text("emailHeading", 200);
      data.emailBody = text("emailBody", 1000);
      data.emailButton = text("emailButton", 40);
      const color = text("emailButtonColor", 7);
      data.emailButtonColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
      const logo = text("emailLogoUrl", 500);
      if (logo && !/^https:\/\/\S+$/i.test(logo)) {
        return { ok: false, message: "Logo URL must start with https://" };
      }
      data.emailLogoUrl = logo;
      data.renotify = form.get("renotify") === "true";
    }
    await db.shopSettings.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
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
    const error = await sendTestEmail(
      shop,
      { shopName: data?.shop?.name ?? "", shopContactEmail: data?.shop?.contactEmail ?? null },
      to,
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

type FieldEvent = { currentTarget: { value: string; checked?: boolean } };

function Upgrade({ plan, children }: { plan: string; children: React.ReactNode }) {
  return (
    <s-banner tone="info">
      <s-stack direction="block" gap="small-200">
        <s-text>{children}</s-text>
        <s-button href="/app/plans">Upgrade to {plan}</s-button>
      </s-stack>
    </s-banner>
  );
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [fromName, setFromName] = useState(data.fromName);
  const [emailSubject, setEmailSubject] = useState(data.emailSubject);
  const [template, setTemplate] = useState(data.template);
  const [renotify, setRenotify] = useState(data.renotify);
  const [testTo, setTestTo] = useState(data.shopEmail);

  const busy = fetcher.state !== "idle";
  const dirty =
    fromName !== data.fromName ||
    emailSubject !== data.emailSubject ||
    renotify !== data.renotify ||
    TEMPLATE_KEYS.some((k) => template[k] !== data.template[k]);
  const setField = (key: keyof EmailTemplate) => (e: FieldEvent) =>
    setTemplate((t) => ({ ...t, [key]: e.currentTarget.value }));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () =>
    fetcher.submit(
      { intent: "save", fromName, emailSubject, ...template, renotify: String(renotify) },
      { method: "post" },
    );
  const test = () =>
    fetcher.submit({ intent: "test", to: testTo }, { method: "post" });

  const previewSubject = emailSubject.replace("{{product}}", "Linen shirt");
  // With no sender name saved, emails use the store name (see sender() in notify.server).
  const previewName = fromName || data.shopName;
  const previewFrom = previewName ? `${previewName} <${data.fromAddress}>` : data.fromAddress;
  const previewHtml = renderEmail({
    productTitle: "Linen shirt",
    variantTitle: "Medium / Sand",
    productUrl: "#",
    imageUrl: null,
    storeName: previewName || "Your store",
    unsubscribeUrl: "#",
    template: data.grow ? template : undefined,
    branded: !data.basic,
    repeat: data.grow && renotify,
  });

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
          {!data.basic && (
            <Upgrade plan="Starter">
              Set your own sender name and subject line, and remove the
              &ldquo;Sent with BackSoon&rdquo; line, on the Starter plan.
            </Upgrade>
          )}
          <s-text-field
            label="Sender name"
            name="fromName"
            value={fromName}
            placeholder={data.shopName}
            disabled={!data.basic}
            details="Shown as the 'From' name in the shopper's inbox."
            onInput={(e: FieldEvent) => setFromName(e.currentTarget.value)}
          />
          <s-text-field
            label="Subject line"
            name="emailSubject"
            value={emailSubject}
            disabled={!data.basic}
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

      <s-section heading="Email design">
        <s-stack direction="block" gap="base">
          {!data.grow && (
            <Upgrade plan="Growth">
              Change the heading, message, button and logo, and email shoppers
              on every restock, on the Growth plan.
            </Upgrade>
          )}
          <s-text-field
            label="Heading"
            value={template.emailHeading}
            placeholder={TEMPLATE_DEFAULTS.emailHeading}
            disabled={!data.grow}
            details="Use {{product}} where the product title should go."
            onInput={setField("emailHeading")}
          />
          <s-text-area
            label="Message"
            rows={3}
            value={template.emailBody}
            placeholder={TEMPLATE_DEFAULTS.emailBody}
            disabled={!data.grow}
            onInput={setField("emailBody")}
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-text-field
              label="Button text"
              value={template.emailButton}
              placeholder={TEMPLATE_DEFAULTS.emailButton}
              disabled={!data.grow}
              onInput={setField("emailButton")}
            />
            <s-color-field
              label="Button color"
              value={template.emailButtonColor || TEMPLATE_DEFAULTS.emailButtonColor}
              disabled={!data.grow}
              onInput={setField("emailButtonColor")}
              onChange={setField("emailButtonColor")}
            />
          </s-grid>
          <s-url-field
            label="Logo URL"
            value={template.emailLogoUrl}
            placeholder="https://cdn.shopify.com/.../logo.png"
            disabled={!data.grow}
            details="Shown instead of your store name at the top. Leave empty to use the name."
            onInput={setField("emailLogoUrl")}
          />
          <s-switch
            label="Email shoppers every time the item is restocked"
            details="Off: one email per signup. On: shoppers hear about each restock until they unsubscribe, at most once a day."
            checked={renotify}
            disabled={!data.grow}
            onChange={(e: FieldEvent) => setRenotify(Boolean(e.currentTarget.checked))}
          />
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            style={{ width: "100%", height: 560, border: "1px solid #e3e3e3", borderRadius: 8 }}
          />
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
