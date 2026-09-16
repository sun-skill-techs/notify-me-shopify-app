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
// in sync and reopen the form so the shopper can sign up for the new variant.
document.addEventListener("change", (event) => {
  if (!event.target.name || event.target.name !== "id") return;
  const root = document.querySelector("[data-notify-me]");
  if (!root) return;
  root.dataset.variantId = event.target.value;
  delete root.dataset.state;
  const message = root.querySelector("[data-notify-me-message]");
  if (message) {
    message.dataset.tone = "";
    message.textContent = "";
  }
});
