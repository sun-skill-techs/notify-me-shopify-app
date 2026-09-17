// Posts the waitlist signup through the app proxy so the request is signed by Shopify.
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-notify-me-form]");
  if (!form) return;
  event.preventDefault();

  const root = form.closest("[data-notify-me]");
  const message = form.querySelector("[data-notify-me-message]");
  const button = form.querySelector("[data-notify-me-button]");
  const input = form.querySelector("input[name=email]");
  const email = input.value.trim();

  const show = (tone, text) => {
    message.dataset.tone = tone;
    message.textContent = text;
  };

  // Checked here as well as server-side so the shopper gets an instant answer.
  if (!input.checkValidity() || !email) {
    input.setAttribute("aria-invalid", "true");
    show("error", "Enter a valid email address.");
    input.focus();
    return;
  }

  input.removeAttribute("aria-invalid");
  button.disabled = true;
  button.dataset.loading = "";
  show("", "");

  try {
    const body = new FormData();
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
      root.dataset.state = "done";
      show("success", "You're on the list. We'll email you when it's back.");
    } else {
      show("error", data.error || "Something went wrong. Try again.");
    }
  } catch (error) {
    show("error", "Something went wrong. Try again.");
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
  const message = input
    .closest("[data-notify-me-form]")
    .querySelector("[data-notify-me-message]");
  message.dataset.tone = "";
  message.textContent = "";
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
  delete root.dataset.state;
  const message = root.querySelector("[data-notify-me-message]");
  if (message) {
    message.dataset.tone = "";
    message.textContent = "";
  }
};

// Some themes swap variants via the URL (?variant=) without firing a change
// event on a named "id" input, so mirror the URL on load and on history moves.
// Liquid's own `hidden` can also be stale if the variant was pre-selected
// client-side before this script ran, so re-sync against the root's own
// data-variant-id (set correctly by the server) as a fallback.
const syncFromUrl = () => {
  const root = document.querySelector("[data-notify-me]");
  if (!root) return;
  const variantId =
    new URLSearchParams(location.search).get("variant") ||
    root.dataset.variantId;
  if (variantId) syncVariant(root, variantId);
};

// Some themes dispatch a synthetic "change" on the variant input while their
// picker hydrates on load, broadcasting whatever the picker's default/first
// option is rather than the actually pre-selected variant. That's not a real
// shopper action (isTrusted is false for script-dispatched events), and
// acting on it is what flashes the widget open and immediately hides it
// again on page load. Only genuine, user-triggered changes should resync.
document.addEventListener("change", (event) => {
  if (!event.target.name || event.target.name !== "id") return;
  if (!event.isTrusted) return;
  const root = document.querySelector("[data-notify-me]");
  if (!root) return;
  syncVariant(root, event.target.value);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncFromUrl);
} else {
  syncFromUrl();
}
window.addEventListener("popstate", syncFromUrl);
