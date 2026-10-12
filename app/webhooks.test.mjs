// Run: npx vite-node app/webhooks.test.mjs
// Uninstall and redact webhooks for a shop whose offline token has expired. The
// app is already uninstalled, so Shopify rejects any token refresh: these
// handlers must still answer 200 and clean up, or Shopify retries them to death.
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_APP_URL = "https://app.example.com";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const shop = "gone.myshopify.com";
let sessions;
const deleted = [];
globalThis.prismaGlobal = {
  session: {
    count: async () => sessions.length,
    findUnique: async ({ where }) => sessions.find((s) => s.id === where.id) ?? null,
    deleteMany: async ({ where }) => {
      sessions = sessions.filter((s) => s.shop !== where.shop);
    },
  },
  restockSubscription: { deleteMany: async ({ where }) => deleted.push(["sub", where]) },
  shopSettings: { deleteMany: async ({ where }) => deleted.push(["settings", where]) },
};
// The token refresh an uninstalled shop gets.
globalThis.fetch = async () =>
  new Response(JSON.stringify({ error: "invalid_grant" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });

const webhook = (topic, body, secret = "test-secret") => {
  const raw = JSON.stringify(body);
  return new Request(`https://app.example.com/webhooks/${topic}`, {
    method: "POST",
    body: raw,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-Hmac-Sha256": crypto.createHmac("sha256", secret).update(raw).digest("base64"),
      "X-Shopify-Webhook-Id": "wh_1",
      "X-Shopify-API-Version": "2026-07",
    },
  });
};
const run = (action, request) =>
  action({ request }).catch((thrown) => {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  });

const { action: uninstalled } = await import("./routes/webhooks.app.uninstalled.tsx");
const { action: shopRedact } = await import("./routes/webhooks.shop.redact.tsx");
const { action: customersRedact } = await import("./routes/webhooks.customers.redact.tsx");

sessions = [
  {
    id: `offline_${shop}`,
    shop,
    state: "",
    isOnline: false,
    scope: "read_products",
    expires: new Date(Date.now() - 60_000),
    accessToken: "shpat_expired",
    refreshToken: "shprt_1",
    refreshTokenExpires: new Date(Date.now() + 86_400_000),
  },
];

assert.equal((await run(uninstalled, webhook("app/uninstalled", { id: 1 }))).status, 200);
assert.equal(sessions.length, 0, "uninstall drops the shop's sessions");

assert.equal((await run(shopRedact, webhook("shop/redact", { shop_domain: shop }))).status, 200);
assert.deepEqual(deleted, [["sub", { shop }], ["settings", { shop }]]);

const custBody = { customer: { email: "a@x.co" } };
assert.equal((await run(customersRedact, webhook("customers/redact", custBody))).status, 200);

// A forged signature is still refused, and touches nothing.
sessions = [{ id: "s", shop }];
assert.equal((await run(uninstalled, webhook("app/uninstalled", { id: 1 }, "wrong"))).status, 401);
assert.equal(sessions.length, 1);

console.log("webhooks.test: ok");
