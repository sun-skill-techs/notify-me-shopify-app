// Several blocks can share a page (quick view, featured product), so every
// handler resolves its own root instead of assuming one.
const roots = () => document.querySelectorAll("[data-notify-me]");

// Remember which variants this browser already joined so a returning shopper
// sees "You're on the list" instead of a form they already filled in.
const STORAGE_KEY = "notify-me:joined";
const joined = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const remember = (variantId) => {
  try {
    const set = joined();
    set.add(String(variantId));
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].slice(-50)));
  } catch {
    // Private mode or blocked storage: the success state still shows this visit.
  }
};

const showJoined = (root) => {
  const trigger = root.querySelector("[data-notify-me-trigger]");
  const form = root.querySelector("[data-notify-me-form]");
  trigger.textContent = root.dataset.successText || "You're on the list";
  trigger.disabled = true;
  trigger.hidden = false;
  form.hidden = true;
};

const setMessage = (form, tone, text) => {
  const message = form.querySelector("[data-notify-me-message]");
  if (!message) return;
  message.dataset.tone = tone;
  message.textContent = text;
};

// The form starts collapsed behind a compact trigger so the sold-out state
// doesn't claim the email field's height until the shopper asks for it.
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-notify-me-trigger]");
  if (!trigger) return;
  const root = trigger.closest("[data-notify-me]");
  const form = root.querySelector("[data-notify-me-form]");
  trigger.hidden = true;
  form.hidden = false;
  form.querySelector("input[name=email]").focus();
});

// Posts the waitlist signup through the app proxy so the request is signed by Shopify.
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-notify-me-form]");
  if (!form) return;
  event.preventDefault();

  const root = form.closest("[data-notify-me]");
  const button = form.querySelector("[data-notify-me-button]");
  const input = form.querySelector("input[name=email]");
  const email = input.value.trim();
  const errorText = root.dataset.errorText || "Something went wrong. Try again.";

  // Checked here as well as server-side so the shopper gets an instant answer.
  if (!input.checkValidity() || !email) {
    input.setAttribute("aria-invalid", "true");
    setMessage(form, "error", root.dataset.invalidText || "Enter a valid email address.");
    input.focus();
    return;
  }

  input.removeAttribute("aria-invalid");
  button.disabled = true;
  button.dataset.loading = "";
  setMessage(form, "", "");

  try {
    const body = new FormData(form);
    body.set("email", email);
    body.set("variantId", root.dataset.variantId);
    body.set("productId", root.dataset.productId);

    const response = await fetch(`${root.dataset.proxy}/subscribe`, {
      method: "POST",
      body,
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      form.reset();
      remember(root.dataset.variantId);
      showJoined(root);
    } else {
      setMessage(form, "error", data.error || errorText);
    }
  } catch (error) {
    setMessage(form, "error", errorText);
  } finally {
    button.disabled = false;
    delete button.dataset.loading;
  }
});

// Clear the error state as soon as the shopper starts correcting the address.
document.addEventListener("input", (event) => {
  const input = event.target.closest("[data-notify-me] input[name=email]");
  if (!input || !input.hasAttribute("aria-invalid")) return;
  input.removeAttribute("aria-invalid");
  setMessage(input.closest("[data-notify-me-form]"), "", "");
});

// Themes re-render the product form on variant change; keep the stored variant
// in sync, show the form only while the chosen variant is sold out, and reopen
// it so the shopper can sign up for the new variant.
const soldOutVariants = (root) =>
  new Set(
    (root.dataset.variantAvailability || "")
      .split(",")
      .filter((pair) => pair.endsWith(":0"))
      .map((pair) => pair.split(":")[0]),
  );

const syncVariant = (root, variantId) => {
  if (!variantId) return;
  root.dataset.variantId = variantId;
  root.hidden = !soldOutVariants(root).has(String(variantId));

  if (joined().has(String(variantId))) {
    showJoined(root);
    return;
  }

  const trigger = root.querySelector("[data-notify-me-trigger]");
  const form = root.querySelector("[data-notify-me-form]");
  trigger.textContent = trigger.dataset.defaultText;
  trigger.disabled = false;
  trigger.hidden = false;
  form.hidden = true;
  setMessage(form, "", "");
};

const urlVariant = () => new URLSearchParams(location.search).get("variant");

// Some themes swap variants via the URL (?variant=) without firing a change
// event on a named "id" input, so mirror the URL on load and on history moves.
// Liquid's own `hidden` can also be stale if the variant was pre-selected
// client-side before this script ran, so re-sync against the root's own
// data-variant-id (set correctly by the server) as a fallback.
const syncFromUrl = () => {
  for (const root of roots()) {
    syncVariant(root, urlVariant() || root.dataset.variantId);
  }
};

// Which variant did a change on input[name=id] actually select?
//   - A trusted (user) event on a real <select name="id"> is authoritative.
//   - Dawn and most modern themes update the URL first, then dispatch a
//     synthetic change on the hidden id input, so the URL is the safest source.
//   - Some pickers dispatch a synthetic change while hydrating on load carrying
//     their first option rather than the selected variant. Those arrive within
//     the first second or so, before any shopper could have clicked. Ignore them.
// ponytail: the settle window is a heuristic. Replace with the theme's own
// variant event (e.g. variant:change) if a client theme needs it.
const SETTLE_MS = 1500;
const resolveVariant = (event) => {
  if (event.isTrusted) return event.target.value;
  return urlVariant() || (performance.now() > SETTLE_MS ? event.target.value : null);
};

document.addEventListener("change", (event) => {
  if (!event.target.name || event.target.name !== "id") return;
  const variantId = resolveVariant(event);
  if (!variantId) return;
  // Prefer the block in the same section as the picker; fall back to all of them.
  const section = event.target.closest(".shopify-section");
  const targets = section?.querySelectorAll("[data-notify-me]");
  for (const root of targets?.length ? targets : roots()) syncVariant(root, variantId);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncFromUrl);
} else {
  syncFromUrl();
}
window.addEventListener("popstate", syncFromUrl);
