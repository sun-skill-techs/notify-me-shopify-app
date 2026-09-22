import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LinksFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  CHOICES,
  DEFAULTS,
  METAFIELD,
  RANGES,
  sanitize,
  styleVars,
  toStyle,
  type WidgetSettings,
} from "../widget";
// The storefront block's own stylesheet, so the preview is the real thing.
import widgetCss from "../../extensions/notify-me/assets/notify-me.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: widgetCss }];

const INSTALLATION_QUERY = `#graphql
  query notifyMeWidget($namespace: String!, $key: String!) {
    currentAppInstallation {
      id
      metafield(namespace: $namespace, key: $key) { jsonValue }
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(INSTALLATION_QUERY, { variables: METAFIELD });
  const { data } = await res.json();
  return { settings: sanitize(data?.currentAppInstallation?.metafield?.jsonValue) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const settings = sanitize(await request.json().catch(() => null));

  const res = await admin.graphql(INSTALLATION_QUERY, { variables: METAFIELD });
  const { data } = await res.json();
  const ownerId = data?.currentAppInstallation?.id;
  if (!ownerId) return { ok: false, message: "Could not find the app installation." };

  // The block reads this in Liquid; `style` is precomputed so the theme
  // doesn't have to rebuild CSS from individual values.
  const save = await admin.graphql(
    `#graphql
      mutation notifyMeSaveWidget($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { message } }
      }`,
    {
      variables: {
        metafields: [
          {
            ...METAFIELD,
            ownerId,
            type: "json",
            value: JSON.stringify({ ...settings, style: toStyle(settings) }),
          },
        ],
      },
    },
  );
  const result = await save.json();
  const error = result.data?.metafieldsSet?.userErrors?.[0]?.message;
  if (error) return { ok: false, message: `Could not save: ${error}` };
  return { ok: true, message: "Widget saved" };
};

type Key = keyof WidgetSettings;
type FieldEvent = { currentTarget: { value: string; checked?: boolean } };
type View = "form" | "success";

// Keys whose field, when focused, flips the preview to the state it affects.
const SUCCESS_KEYS = new Set<Key>(["successHeading", "successDetail", "doneText"]);

export default function WidgetPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [s, setS] = useState<WidgetSettings>(data.settings);
  const [view, setView] = useState<View>("form");

  // After a save the loader re-runs; adopt its sanitized values.
  useEffect(() => setS(data.settings), [data.settings]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const busy = fetcher.state !== "idle";
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const set = <K extends Key>(key: K, value: WidgetSettings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));
  const save = () =>
    fetcher.submit(s, { method: "post", encType: "application/json" });

  const text = (key: Key, label: string, details?: string) => (
    <s-text-field
      label={label}
      value={String(s[key])}
      details={details}
      onFocus={() => setView(SUCCESS_KEYS.has(key) ? "success" : "form")}
      onInput={(e: FieldEvent) => set(key, e.currentTarget.value as never)}
    />
  );
  const color = (key: Key, label: string) => (
    <s-color-field
      label={label}
      value={String(s[key])}
      onInput={(e: FieldEvent) => set(key, e.currentTarget.value as never)}
      onChange={(e: FieldEvent) => set(key, e.currentTarget.value as never)}
    />
  );
  const px = (key: keyof typeof RANGES, label: string) => (
    <s-number-field
      label={label}
      value={String(s[key])}
      min={RANGES[key][0]}
      max={RANGES[key][1]}
      suffix="px"
      onInput={(e: FieldEvent) => set(key, Number(e.currentTarget.value))}
    />
  );
  const check = (key: Key, label: string) => (
    <s-checkbox
      label={label}
      checked={Boolean(s[key])}
      onChange={(e: FieldEvent) => set(key, Boolean(e.currentTarget.checked) as never)}
    />
  );

  return (
    <s-page heading="Widget design" inlineSize="large">
      <s-button slot="secondary-actions" onClick={() => setS(DEFAULTS)}>
        Reset to defaults
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!dirty || busy}
        onClick={save}
      >
        Save
      </s-button>

      <style>{LAYOUT_CSS}</style>
      <div className="nm-layout">
        <s-stack direction="block" gap="base">
          <s-section heading="Button">
            <s-stack direction="block" gap="base">
              {text("buttonText", "Button text")}
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                {color("buttonBg", "Background")}
                {color("buttonFg", "Text")}
                {color("buttonBorder", "Border")}
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {px("buttonFontSize", "Font size")}
                <s-select
                  label="Font weight"
                  value={s.buttonWeight}
                  onChange={(e: FieldEvent) => set("buttonWeight", e.currentTarget.value)}
                >
                  {CHOICES.buttonWeight.map((w) => (
                    <s-option key={w} value={w}>
                      {{ "400": "Regular", "500": "Medium", "600": "Semibold", "700": "Bold" }[w]}
                    </s-option>
                  ))}
                </s-select>
                {px("buttonPadY", "Padding top and bottom")}
                {px("buttonPadX", "Padding left and right")}
                {px("buttonMarginTop", "Space above")}
                {px("buttonMarginBottom", "Space below")}
                {px("buttonRadius", "Corner radius")}
              </s-grid>
              <s-stack direction="block" gap="small-200">
                {check("buttonFullWidth", "Full width")}
                {check("buttonIcon", "Show bell icon")}
                {check("buttonUppercase", "Uppercase text")}
              </s-stack>
            </s-stack>
          </s-section>

          <s-section heading="Popup style">
            <s-stack direction="block" gap="base">
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                {color("popupBg", "Background")}
                {color("popupFg", "Text")}
                {color("popupAccent", "Accent")}
                {color("popupButtonBg", "Button")}
                {color("popupButtonFg", "Button text")}
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-select
                  label="Heading font"
                  value={s.headingFont}
                  onChange={(e: FieldEvent) => set("headingFont", e.currentTarget.value)}
                >
                  <s-option value="serif">Serif</s-option>
                  <s-option value="theme">Theme font</s-option>
                </s-select>
                {px("headingSize", "Heading size")}
                {px("popupRadius", "Corner radius")}
              </s-grid>
              {check("showImage", "Show product image")}
            </s-stack>
          </s-section>

          <s-section heading="Popup text">
            <s-stack direction="block" gap="base">
              {text("eyebrow", "Label above product name", "Leave empty to hide.")}
              {text("heading", "Heading")}
              {text("subheading", "Subheading", "Leave empty to hide.")}
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {text("variantLabel", "Variant field label")}
                {text("emailLabel", "Email field label")}
                {text("placeholder", "Email placeholder")}
                {text("submitText", "Button text")}
              </s-grid>
              {text("finePrint", "Fine print", "Leave empty to hide.")}
              <s-url-field
                label="Privacy policy link"
                value={s.privacyUrl}
                placeholder="https://"
                details="Adds a link after the fine print."
                onInput={(e: FieldEvent) => set("privacyUrl", e.currentTarget.value)}
              />
            </s-stack>
          </s-section>

          <s-section heading="Messages">
            <s-stack direction="block" gap="base">
              {text("successHeading", "After signing up", "Also shown on the button once the shopper has joined.")}
              {text("successDetail", "Detail after signing up")}
              {text("doneText", "Close button after signing up")}
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {text("invalidText", "Invalid email")}
                {text("errorText", "Something went wrong")}
              </s-grid>
            </s-stack>
          </s-section>
        </s-stack>

        <div className="nm-sticky">
          <s-section heading="Live preview">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant={view === "form" ? "primary" : "secondary"}
                  onClick={() => setView("form")}
                >
                  Signup form
                </s-button>
                <s-button
                  variant={view === "success" ? "primary" : "secondary"}
                  onClick={() => setView("success")}
                >
                  After signing up
                </s-button>
              </s-stack>
              <Preview s={s} view={view} />
              <s-text color="subdued">
                Fonts follow your theme on the storefront.
              </s-text>
            </s-stack>
          </s-section>
        </div>
      </div>
    </s-page>
  );
}

/** The product page button and the popup, rendered with the storefront CSS. */
function Preview({ s, view }: { s: WidgetSettings; view: View }) {
  const vars = styleVars(s) as React.CSSProperties;
  return (
    <div className="nm-stage">
      <div className="nm-product">
        <div className="nm-bar" style={{ width: "70%" }} />
        <div className="nm-bar" style={{ width: "30%" }} />
        <div className="nm-soldout">Sold out</div>
        <div className="notify-me" style={vars}>
          <button type="button" className="notify-me__trigger">
            {s.buttonText}
          </button>
        </div>
        <div className="nm-bar" style={{ width: "90%" }} />
        <div className="nm-bar" style={{ width: "60%" }} />
      </div>

      <div className="nm-backdrop">
        <div className="notify-me" style={{ ...vars, margin: 0 }}>
          <div className="notify-me__dialog nm-dialog">
            <div className="notify-me__panel">
              <span className="notify-me__close" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </span>
              <div className="notify-me__product">
                {s.showImage && <div className="notify-me__thumb nm-thumb" />}
                <div className="notify-me__product-text">
                  {s.eyebrow && <p className="notify-me__eyebrow">{s.eyebrow}</p>}
                  <p className="notify-me__product-title">Linen shirt</p>
                </div>
              </div>

              {view === "form" ? (
                <div>
                  <h2 className="notify-me__heading">{s.heading}</h2>
                  {s.subheading && <p className="notify-me__subheading">{s.subheading}</p>}
                  <div className="notify-me__group">
                    <span className="notify-me__label">{s.variantLabel}</span>
                    <div className="notify-me__select-wrap">
                      <div className="notify-me__control notify-me__select">M / Sand</div>
                    </div>
                  </div>
                  <div className="notify-me__group">
                    <span className="notify-me__label">{s.emailLabel}</span>
                    <div className="notify-me__control nm-placeholder">{s.placeholder}</div>
                  </div>
                  <div className="notify-me__button">{s.submitText}</div>
                  {(s.finePrint || s.privacyUrl) && (
                    <p className="notify-me__fine-print">
                      {s.finePrint}{" "}
                      {s.privacyUrl && <span className="notify-me__link nm-link">Privacy policy</span>}
                    </p>
                  )}
                </div>
              ) : (
                <div className="notify-me__success">
                  <span className="notify-me__check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 12.5 4 4 8-9" />
                    </svg>
                  </span>
                  <p className="notify-me__heading">{s.successHeading}</p>
                  <p className="notify-me__subheading">{s.successDetail}</p>
                  <div className="notify-me__button">{s.doneText}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Page layout only; the widget itself is styled by the storefront stylesheet.
const LAYOUT_CSS = `
  .nm-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 460px); gap: 16px; align-items: start; }
  .nm-sticky { position: sticky; top: 16px; }
  @media (max-width: 1000px) {
    .nm-layout { grid-template-columns: minmax(0, 1fr); }
    .nm-sticky { position: static; }
  }
  .nm-stage { border-radius: 12px; overflow: hidden; border: 1px solid #e3e3e3; background: #fff; color: #1f1c17; }
  .nm-product { padding: 20px 20px 16px; }
  .nm-bar { height: 10px; margin: 8px 0; border-radius: 5px; background: #ececec; }
  .nm-soldout { margin-top: 16px; padding: 12px; border-radius: 6px; text-align: center; font-size: 13px; color: #8a8a8a; background: #f1f1f1; }
  .nm-backdrop { padding: 24px 20px; background: rgb(24 20 14 / 0.5); }
  .nm-dialog { position: static; display: block; width: 100%; max-height: none; margin: 0; animation: none; }
  .nm-dialog .notify-me__success, .nm-dialog .notify-me__check svg { animation: none; stroke-dashoffset: 0; }
  .nm-thumb { background: linear-gradient(135deg, #d9cbb0, #a38c6a); }
  .nm-placeholder { display: flex; align-items: center; opacity: 1; color: color-mix(in srgb, currentColor 40%, transparent); }
  .nm-link { text-decoration: underline; }
  .nm-dialog .notify-me__select { display: flex; align-items: center; }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
