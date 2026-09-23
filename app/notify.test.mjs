// Run: npx vite-node app/notify.test.mjs
// Exercises the real notify.server.ts with Prisma and the Resend API faked:
// token signing, the From header, reply-to, stale-claim recovery, CSV escaping,
// and the retention purge.
import assert from "node:assert/strict";

process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.RESEND_API_KEY = "re_test";
process.env.RESEND_FROM = "alerts@example.com";
// The CSV route pulls in shopify.server, which won't load without these.
process.env.SHOPIFY_APP_URL = "https://app.example.com";
process.env.SHOPIFY_API_KEY = "test-key";

// db.server reuses global.prismaGlobal outside production, so this fake stands in for Prisma.
let rows = [];
const matches = (row, where) =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((w) => matches(row, w));
    if (v && typeof v === "object" && "lt" in v) return row[k] != null && row[k] < v.lt;
    return v === null ? row[k] == null : row[k] === v;
  });
globalThis.prismaGlobal = {
  session: { count: async () => 0 }, // shopify.server's session storage probes it at load
  shopSettings: { findUnique: async () => null },
  restockSubscription: {
    findMany: async ({ where }) => rows.filter((r) => matches(r, where)),
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
    deleteMany: async ({ where }) => {
      const before = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { count: before - rows.length };
    },
  },
};

// Resend calls fetch; capture each email instead of sending it.
const sent = [];
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: "email_1" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const { unsubscribeToken, verifyUnsubscribeToken, fromHeader, notifyVariant } = await import(
  "./notify.server.ts"
);
const { cell } = await import("./routes/app.waitlist.export.tsx");
const { purgeOldRecords } = await import("./retention.server.ts");

// Unsubscribe tokens verify only for their own row.
assert.ok(verifyUnsubscribeToken("sub_123", unsubscribeToken("sub_123")));
assert.ok(!verifyUnsubscribeToken("sub_123", unsubscribeToken("sub_456")));
assert.ok(!verifyUnsubscribeToken("sub_123", "deadbeef"));
assert.ok(!verifyUnsubscribeToken("sub_123", ""));

// Display names are quoted, and can't break out of the quotes or the header.
assert.equal(fromHeader("Smith, Jones & Co", "a@x.co"), '"Smith, Jones & Co" <a@x.co>');
assert.equal(fromHeader('Evil" <b@y.co>\r\nBcc: c', "a@x.co"), '"Evil b@y.coBcc: c" <a@x.co>');
assert.equal(fromHeader("", "a@x.co"), "a@x.co");

// A row stuck in SENDING by a dead process is retried; a fresh claim is left alone.
const old = new Date(Date.now() - 60 * 60 * 1000);
rows = [
  { id: "a", shop: "s.myshopify.com", variantId: "1", email: "a@x.co", status: "PENDING" },
  { id: "b", shop: "s.myshopify.com", variantId: "1", email: "b@x.co", status: "SENDING", claimedAt: old },
  { id: "c", shop: "s.myshopify.com", variantId: "1", email: "c@x.co", status: "SENDING", claimedAt: new Date() },
];
const result = await notifyVariant({
  shop: "s.myshopify.com",
  variantId: "1",
  productTitle: "Linen shirt",
  variantTitle: "M",
  productUrl: "https://s.example/products/linen?variant=1",
  imageUrl: null,
  shopName: "Linen & Co",
  shopContactEmail: "hello@linen.co",
});
assert.deepEqual(result, { sent: 2, failed: 0 });
assert.deepEqual(sent.map((e) => e.to[0]).sort(), ["a@x.co", "b@x.co"]);
assert.equal(rows.find((r) => r.id === "c").status, "SENDING");

// No sender name saved: From uses the store name, and replies go to the store.
assert.equal(sent[0].from, '"Linen & Co" <alerts@example.com>');
assert.equal(sent[0].reply_to, "hello@linen.co");
assert.equal(sent[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

// CSV cells that a spreadsheet would run as formulas are neutralised.
assert.equal(cell('=HYPERLINK("//evil.co")@x.co'), `"'=HYPERLINK(""//evil.co"")@x.co"`);
assert.equal(cell("+1@x.co"), "'+1@x.co");
assert.equal(cell("@x.co"), "'@x.co");
assert.equal(cell("plain@x.co"), "plain@x.co");

// Retention: finished rows go 180 days after their last activity; waiting rows stay.
const day = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(Date.now() - d * day);
rows = [
  { id: "sent-old", status: "SENT", sentAt: ago(200) },
  { id: "sent-new", status: "SENT", sentAt: ago(10) },
  { id: "unsub-old", status: "UNSUBSCRIBED", unsubscribedAt: ago(200) },
  { id: "failed-old", status: "FAILED", claimedAt: ago(200), createdAt: ago(300) },
  { id: "failed-recent-try", status: "FAILED", claimedAt: ago(5), createdAt: ago(300) },
  { id: "failed-legacy", status: "FAILED", claimedAt: null, createdAt: ago(300) },
  { id: "pending-old", status: "PENDING", createdAt: ago(400) },
];
assert.equal(await purgeOldRecords(), 4);
assert.deepEqual(rows.map((r) => r.id), ["sent-new", "failed-recent-try", "pending-old"]);

console.log("ok: notify.server, CSV export and retention");
