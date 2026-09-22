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
import {
  DEFAULTS,
  METAFIELD,
  sanitize,
  styleVars,
  toStyle,
  type WidgetSettings,
} from "../widget";
// The storefront block's own stylesheet, so the preview is the real thing.
// Inlined via the loader: in dev the Shopify CLI proxy owns /extensions/*,
// so linking the file by URL 404s and the preview renders unstyled.
import widgetCss from "../../extensions/notify-me/assets/notify-me.css?raw";

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
  return {
    settings: sanitize(data?.currentAppInstallation?.metafield?.jsonValue),
    widgetCss,
  };
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
type Tab = "button" | "popup";
type View = "form" | "success";

// Keys whose field, when focused, flips the preview to the state it affects.
const SUCCESS_KEYS = new Set<Key>(["successHeading", "successDetail", "doneText"]);

// Dropdown choices. Each one sets one or more settings; a saved combination
// that matches none of them shows as "Custom" until another is picked.
type Preset = [label: string, values: Partial<WidgetSettings>];

const BUTTON_SIZES: Preset[] = [
  ["Small", { buttonFontSize: 13, buttonPadY: 8, buttonPadX: 16 }],
  ["Medium", { buttonFontSize: 15, buttonPadY: 12, buttonPadX: 24 }],
  ["Large", { buttonFontSize: 17, buttonPadY: 16, buttonPadX: 32 }],
];
const BUTTON_WEIGHTS: Preset[] = [
  ["Regular", { buttonWeight: "400" }],
  ["Medium", { buttonWeight: "500" }],
  ["Semibold", { buttonWeight: "600" }],
  ["Bold", { buttonWeight: "700" }],
];
const BUTTON_CORNERS: Preset[] = [
  ["Square", { buttonRadius: 0 }],
  ["Slightly rounded", { buttonRadius: 4 }],
  ["Rounded", { buttonRadius: 7 }],
  ["Very rounded", { buttonRadius: 12 }],
  ["Pill", { buttonRadius: 40 }],
];
const BUTTON_WIDTHS: Preset[] = [
  ["Full width", { buttonFullWidth: true }],
  ["Fit to text", { buttonFullWidth: false }],
];
const BUTTON_CASES: Preset[] = [
  ["As typed", { buttonUppercase: false }],
  ["UPPERCASE", { buttonUppercase: true }],
];
const BUTTON_SPACING: Preset[] = [
  ["None", { buttonMarginTop: 0, buttonMarginBottom: 0 }],
  ["Tight", { buttonMarginTop: 8, buttonMarginBottom: 8 }],
  ["Normal", { buttonMarginTop: 16, buttonMarginBottom: 16 }],
  ["Roomy", { buttonMarginTop: 24, buttonMarginBottom: 24 }],
];
const POPUP_THEMES: Preset[] = [
  ["Cream", { popupBg: "#fbfaf7", popupFg: "#1f1c17", popupAccent: "#a9812f", popupButtonBg: "#1f1c17", popupButtonFg: "#fbfaf7" }],
  ["White", { popupBg: "#ffffff", popupFg: "#1a1a1a", popupAccent: "#1a1a1a", popupButtonBg: "#1a1a1a", popupButtonFg: "#ffffff" }],
  ["Dark", { popupBg: "#1f1c17", popupFg: "#f5f2ec", popupAccent: "#d4b26a", popupButtonBg: "#f5f2ec", popupButtonFg: "#1f1c17" }],
];
const HEADING_FONTS: Preset[] = [
  ["Serif", { headingFont: "serif" }],
  ["Same as your theme", { headingFont: "theme" }],
];
const HEADING_SIZES: Preset[] = [
  ["Small", { headingSize: 22 }],
  ["Medium", { headingSize: 28 }],
  ["Large", { headingSize: 34 }],
];
const POPUP_CORNERS: Preset[] = [
  ["Square", { popupRadius: 0 }],
  ["Slightly rounded", { popupRadius: 4 }],
  ["Rounded", { popupRadius: 10 }],
  ["Very rounded", { popupRadius: 16 }],
];

export default function WidgetPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [s, setS] = useState<WidgetSettings>(data.settings);
  const [tab, setTab] = useState<Tab>("button");
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
  const toggle = (key: Key, label: string) => (
    <s-switch
      label={label}
      checked={Boolean(s[key])}
      onChange={(e: FieldEvent) => set(key, Boolean(e.currentTarget.checked) as never)}
    />
  );
  // Colors compare case-insensitively: the color field may emit uppercase hex.
  const choose = (label: string, presets: Preset[]) => {
    const current = presets.findIndex(([, values]) =>
      Object.entries(values).every(
        ([k, v]) => String(s[k as Key]).toLowerCase() === String(v).toLowerCase(),
      ),
    );
    return (
      <s-select
        label={label}
        value={String(current)}
        onChange={(e: FieldEvent) => {
          const preset = presets[Number(e.currentTarget.value)];
          if (preset) setS((prev) => ({ ...prev, ...preset[1] }));
        }}
      >
        {current < 0 && <s-option value="-1">Custom</s-option>}
        {presets.map(([name], i) => (
          <s-option key={name} value={String(i)}>
            {name}
          </s-option>
        ))}
      </s-select>
    );
  };

  // One button of a segmented control. The press button flips its own pressed
  // state on every click, so re-press it to stay in step with React state.
  const segment = <T extends string>(value: T, current: T, pick: (v: T) => void, label: string) => (
    <s-press-button
      slot="secondary-actions"
      pressed={value === current}
      onClick={(e: { currentTarget: { pressed?: boolean } }) => {
        e.currentTarget.pressed = true;
        pick(value);
      }}
    >
      {label}
    </s-press-button>
  );

  const buttonTab = (
    <s-stack direction="block" gap="base">
      <s-section heading="Text">
        <s-stack direction="block" gap="base">
          {text("buttonText", "Button label")}
          {choose("Letter case", BUTTON_CASES)}
          {toggle("buttonIcon", "Show bell icon")}
        </s-stack>
      </s-section>

      <s-section heading="Colors">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          {color("buttonBg", "Background")}
          {color("buttonFg", "Text")}
          {color("buttonBorder", "Border")}
        </s-grid>
      </s-section>

      <s-section heading="Size and shape">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {choose("Size", BUTTON_SIZES)}
          {choose("Font weight", BUTTON_WEIGHTS)}
          {choose("Corners", BUTTON_CORNERS)}
          {choose("Width", BUTTON_WIDTHS)}
          {choose("Space above and below", BUTTON_SPACING)}
        </s-grid>
      </s-section>
    </s-stack>
  );

  const popupTab = (
    <s-stack direction="block" gap="base">
      <s-section heading="Style">
        <s-stack direction="block" gap="base">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {choose("Color theme", POPUP_THEMES)}
            {choose("Corners", POPUP_CORNERS)}
            {choose("Heading font", HEADING_FONTS)}
            {choose("Heading size", HEADING_SIZES)}
          </s-grid>
          <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
            {color("popupBg", "Background")}
            {color("popupFg", "Text")}
            {color("popupAccent", "Accent")}
            {color("popupButtonBg", "Button")}
            {color("popupButtonFg", "Button text")}
          </s-grid>
          {toggle("showImage", "Show product image")}
        </s-stack>
      </s-section>

      <s-section heading="Signup form">
        <s-stack direction="block" gap="base">
          {text("eyebrow", "Label above product name", "Leave empty to hide.")}
          {text("heading", "Heading")}
          {text("subheading", "Subheading", "Leave empty to hide.")}
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {text("variantLabel", "Variant field label")}
            {text("emailLabel", "Email field label")}
            {text("placeholder", "Email placeholder")}
            {text("submitText", "Submit button text")}
          </s-grid>
          {text("finePrint", "Fine print", "Leave empty to hide.")}
          <s-url-field
            label="Privacy policy link"
            value={s.privacyUrl}
            placeholder="https://"
            details="Adds a link after the fine print."
            onFocus={() => setView("form")}
            onInput={(e: FieldEvent) => set("privacyUrl", e.currentTarget.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="After signing up">
        <s-stack direction="block" gap="base">
          {text("successHeading", "Heading", "Also shown on the product page button once the shopper has joined.")}
          {text("successDetail", "Message")}
          {text("doneText", "Close button text")}
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {text("invalidText", "Error: invalid email")}
            {text("errorText", "Error: signup failed")}
          </s-grid>
        </s-stack>
      </s-section>
    </s-stack>
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

      <style>{data.widgetCss}</style>
      <style>{LAYOUT_CSS}</style>
      <s-stack direction="block" gap="base">
        <s-button-group gap="none" accessibilityLabel="Part of the widget to design">
          {segment("button", tab, setTab, "Product page button")}
          {segment("popup", tab, setTab, "Signup popup")}
        </s-button-group>

        <div className="nm-layout">
          {tab === "button" ? buttonTab : popupTab}

          <div className="nm-sticky">
            <s-section heading="Preview">
              <s-stack direction="block" gap="base">
                {tab === "popup" && (
                  <s-button-group gap="none" accessibilityLabel="Popup state">
                    {segment("form", view, setView, "Signup form")}
                    {segment("success", view, setView, "After signing up")}
                  </s-button-group>
                )}
                {tab === "button" ? <ButtonPreview s={s} /> : <PopupPreview s={s} view={view} />}
                <s-text color="subdued">
                  Fonts follow your theme on the storefront.
                </s-text>
              </s-stack>
            </s-section>
          </div>
        </div>
      </s-stack>
    </s-page>
  );
}

/** A sold-out product page with the button, rendered with the storefront CSS. */
function ButtonPreview({ s }: { s: WidgetSettings }) {
  return (
    <div className="nm-stage nm-product">
      <div className="nm-bar" style={{ width: "70%" }} />
      <div className="nm-bar" style={{ width: "30%" }} />
      <div className="nm-soldout">Sold out</div>
      <div className="notify-me" style={styleVars(s) as React.CSSProperties}>
        <button type="button" className="notify-me__trigger">
          {s.buttonText}
        </button>
      </div>
      <div className="nm-bar" style={{ width: "90%" }} />
      <div className="nm-bar" style={{ width: "60%" }} />
    </div>
  );
}

/** The popup over a dimmed page, rendered with the storefront CSS. */
function PopupPreview({ s, view }: { s: WidgetSettings; view: View }) {
  return (
    <div className="nm-stage nm-backdrop">
      <div className="notify-me" style={{ ...(styleVars(s) as React.CSSProperties), margin: 0 }}>
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
