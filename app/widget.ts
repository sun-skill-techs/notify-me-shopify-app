// Storefront widget design, edited on /app/widget and read by the theme block
// from an app-data metafield (app.metafields.notify_me.widget in Liquid).

export const METAFIELD = { namespace: "notify_me", key: "widget" } as const;

export const DEFAULTS = {
  // Button on the product page
  buttonText: "Notify me when available",
  buttonBg: "#ffffff",
  buttonFg: "#1f1c17",
  buttonBorder: "#d6d3cc",
  buttonFontSize: 15,
  buttonWeight: "600",
  buttonUppercase: false,
  buttonPadY: 12,
  buttonPadX: 24,
  buttonMarginTop: 16,
  buttonMarginBottom: 16,
  buttonRadius: 7,
  buttonFullWidth: true,
  buttonIcon: true,

  // Popup look
  popupBg: "#fbfaf7",
  popupFg: "#1f1c17",
  popupAccent: "#a9812f",
  popupButtonBg: "#1f1c17",
  popupButtonFg: "#fbfaf7",
  popupRadius: 10,
  headingFont: "serif",
  headingSize: 28,
  showImage: true,

  // Popup text
  eyebrow: "Restock notice",
  heading: "Email me when this is back",
  subheading: "We'll let you know the moment it's back in stock.",
  variantLabel: "Option",
  emailLabel: "Email address",
  placeholder: "you@example.com",
  submitText: "Notify me",
  finePrint: "One email when this item returns. Not a marketing list.",
  privacyUrl: "",
  successHeading: "You're on the list",
  successDetail: "We'll send one email the moment it's back in stock.",
  doneText: "Done",
  invalidText: "Enter a valid email address.",
  errorText: "Something went wrong. Try again.",
};

export type WidgetSettings = typeof DEFAULTS;

// Pixel ranges double as the admin fields' min/max.
export const RANGES = {
  buttonFontSize: [11, 24],
  buttonPadY: [4, 32],
  buttonPadX: [0, 64],
  buttonMarginTop: [0, 64],
  buttonMarginBottom: [0, 64],
  buttonRadius: [0, 40],
  popupRadius: [0, 32],
  headingSize: [18, 44],
} satisfies Partial<Record<keyof WidgetSettings, [number, number]>>;

export const CHOICES = {
  buttonWeight: ["400", "500", "600", "700"],
  headingFont: ["serif", "theme"],
} satisfies Partial<Record<keyof WidgetSettings, string[]>>;

// Text the merchant may clear to hide that line; everything else falls back
// to its default when left empty.
const OPTIONAL = new Set(["eyebrow", "subheading", "finePrint", "privacyUrl"]);

const HEX = /^#[0-9a-f]{6}$/i;

// Trust boundary: the admin form's values end up in the storefront's style
// attribute and markup, so every field is checked against its default's type.
export function sanitize(input: unknown): WidgetSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULTS };

  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const value = raw[key];
    if (typeof fallback === "boolean") {
      if (typeof value === "boolean") out[key] = value;
    } else if (typeof fallback === "number") {
      const [min, max] = RANGES[key as keyof typeof RANGES];
      const n = Math.round(Number(value));
      if (value !== "" && value !== null && Number.isFinite(n)) out[key] = Math.min(max, Math.max(min, n));
    } else if (key in CHOICES) {
      if (CHOICES[key as keyof typeof CHOICES].includes(value as never)) out[key] = value;
    } else if (HEX.test(fallback)) {
      if (typeof value === "string" && HEX.test(value)) out[key] = value.toLowerCase();
    } else if (typeof value === "string") {
      const text = value.trim().slice(0, 200);
      if (text || OPTIONAL.has(key)) out[key] = text;
    }
  }

  if (!/^https?:\/\/\S+$/i.test(out.privacyUrl as string)) out.privacyUrl = "";
  return out as WidgetSettings;
}

// CSS custom properties consumed by extensions/notify-me/assets/notify-me.css.
// Shared by the storefront (as a style string) and the admin live preview.
export function styleVars(s: WidgetSettings): Record<string, string> {
  return {
    "--notify-me-mt": `${s.buttonMarginTop}px`,
    "--notify-me-mb": `${s.buttonMarginBottom}px`,
    "--notify-me-trigger-bg": s.buttonBg,
    "--notify-me-trigger-fg": s.buttonFg,
    "--notify-me-trigger-border": s.buttonBorder,
    "--notify-me-trigger-size": `${s.buttonFontSize}px`,
    "--notify-me-trigger-weight": s.buttonWeight,
    "--notify-me-trigger-case": s.buttonUppercase ? "uppercase" : "none",
    "--notify-me-trigger-tracking": s.buttonUppercase ? "0.08em" : "-0.005em",
    "--notify-me-trigger-py": `${s.buttonPadY}px`,
    "--notify-me-trigger-px": `${s.buttonPadX}px`,
    "--notify-me-trigger-radius": `${s.buttonRadius}px`,
    "--notify-me-trigger-width": s.buttonFullWidth ? "100%" : "auto",
    "--notify-me-icon": s.buttonIcon ? "block" : "none",
    "--notify-me-bg": s.popupBg,
    "--notify-me-fg": s.popupFg,
    "--notify-me-gold": s.popupAccent,
    "--notify-me-cta-bg": s.popupButtonBg,
    "--notify-me-cta-fg": s.popupButtonFg,
    "--notify-me-radius": `${s.popupRadius}px`,
    "--notify-me-heading-font": s.headingFont === "serif" ? 'Georgia, "Times New Roman", serif' : "inherit",
    "--notify-me-heading-size": `${s.headingSize}px`,
  };
}

export const toStyle = (s: WidgetSettings) =>
  Object.entries(styleVars(s))
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
