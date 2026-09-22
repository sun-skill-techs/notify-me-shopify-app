// Run: node app/widget.test.mjs
// Guards the widget sanitizer: admin input lands in the storefront's style
// attribute, so anything that isn't a clean value must fall back to a default.
import assert from "node:assert/strict";
import { DEFAULTS, sanitize, toStyle } from "./widget.ts";

// Nothing saved yet: every default.
assert.deepEqual(sanitize(undefined), DEFAULTS);

const s = sanitize({
  buttonBg: "#ABCDEF",
  buttonFg: "red; background: url(x)", // CSS injection attempt
  buttonFontSize: "999", // clamped to the max
  buttonPadY: -5, // clamped to the min
  buttonMarginTop: "", // cleared field keeps the default
  buttonWeight: "900", // not an offered weight
  buttonFullWidth: "yes", // not a boolean
  heading: "   ", // required text can't be blanked
  eyebrow: "", // optional text can
  privacyUrl: "javascript:alert(1)",
  unknownKey: "ignored",
});
assert.equal(s.buttonBg, "#abcdef");
assert.equal(s.buttonFg, DEFAULTS.buttonFg);
assert.equal(s.buttonFontSize, 24);
assert.equal(s.buttonPadY, 4);
assert.equal(s.buttonMarginTop, DEFAULTS.buttonMarginTop);
assert.equal(s.buttonWeight, DEFAULTS.buttonWeight);
assert.equal(s.buttonFullWidth, true);
assert.equal(s.heading, DEFAULTS.heading);
assert.equal(s.eyebrow, "");
assert.equal(s.privacyUrl, "");
assert.ok(!("unknownKey" in s));
assert.equal(sanitize({ privacyUrl: "https://shop.com/privacy" }).privacyUrl, "https://shop.com/privacy");

// The style string only ever carries sanitized values.
assert.ok(toStyle(s).includes("--notify-me-trigger-bg: #abcdef;"));
assert.ok(!toStyle(s).includes("url("));

console.log("widget.test: ok");
