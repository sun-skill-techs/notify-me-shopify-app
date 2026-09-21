// Run: node app/variant-toggle.test.mjs
// Guards the block's show/hide rule: the form must appear for a sold-out variant
// and stay hidden for one in stock, on a product where only some variants sold out.
import assert from "node:assert/strict";

// Mirrors soldOutVariants/syncVariant in extensions/notify-me/assets/notify-me.js.
// The real functions touch the DOM, so the rule is re-derived here.
const soldOutVariants = (attr) =>
  new Set(
    (attr || "")
      .split(",")
      .filter((pair) => pair.endsWith(":0"))
      .map((pair) => pair.split(":")[0]),
  );

const isHidden = (attr, variantId) =>
  !soldOutVariants(attr).has(String(variantId));

// Nurse Diamond: variant 1 in stock, the rest sold out.
const diamond = "50686319198454:1,50686319231222:0,50686319263990:0";

// In-stock variant selected: form hidden.
assert.equal(isHidden(diamond, "50686319198454"), true);

// Sold-out variant selected: form shown.
assert.equal(isHidden(diamond, "50686319231222"), false);

// The id arrives as a number from some themes; comparison must still hold.
assert.equal(isHidden(diamond, 50686319231222), false);

// A variant not in the list (theme quirk) must not show a form we can't honor.
assert.equal(isHidden(diamond, "99999999"), true);

// Every variant sold out: form shows for each.
assert.equal(isHidden("1:0,2:0", "2"), false);

// Missing attribute must not throw, and must not show the form.
assert.equal(isHidden(undefined, "1"), true);

console.log("variant toggle: all assertions passed");

// Mirrors resolveVariant in notify-me.js: which variant a change on
// input[name=id] really selected. Dawn dispatches synthetic changes, so a
// trusted-only rule (the old behaviour) silently broke variant switching there.
const SETTLE_MS = 1500;
const resolveVariant = (event, { url, now }) => {
  if (event.isTrusted) return event.target.value;
  return url || (now > SETTLE_MS ? event.target.value : null);
};

// Real user change on a <select name="id">: use its value.
assert.equal(resolveVariant({ isTrusted: true, target: { value: "2" } }, { url: null, now: 100 }), "2");

// Dawn: URL updated first, then synthetic change. URL wins, and it works on load.
assert.equal(resolveVariant({ isTrusted: false, target: { value: "1" } }, { url: "2", now: 100 }), "2");

// Hydration flash: synthetic change, no URL, right after load. Ignored.
assert.equal(resolveVariant({ isTrusted: false, target: { value: "1" } }, { url: null, now: 100 }), null);

// Synthetic change from a real click later on, theme that doesn't touch the URL. Applied.
assert.equal(resolveVariant({ isTrusted: false, target: { value: "3" } }, { url: null, now: 5000 }), "3");

console.log("variant resolver: all assertions passed");
