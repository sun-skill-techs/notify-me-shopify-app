// Run: npx vite-node app/notify.test.mjs
// Exercises the real notify.server.ts with Prisma and the Resend API faked:
// token signing, the From header, reply-to, stale-claim recovery, CSV escaping,
// the retention purge, email encryption, the customer sync, plan limits and
// features, re-notify, and the click-tracking redirect.
import assert from "node:assert/strict";

process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.RESEND_API_KEY = "re_test";
process.env.RESEND_FROM = "alerts@example.com";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
// The CSV route pulls in shopify.server, which won't load without these.
process.env.SHOPIFY_APP_URL = "https://app.example.com";
process.env.SHOPIFY_API_KEY = "test-key";

// db.server reuses global.prismaGlobal outside production, so this fake stands in for Prisma.
let rows = [];
let settings = null;
const matches = (row, where) =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return v.some((w) => matches(row, w));
    if (v && typeof v === "object" && "lt" in v) return row[k] != null && row[k] < v.lt;
    return v === null ? row[k] == null : row[k] === v;
  });
globalThis.prismaGlobal = {
  session: { count: async () => 0 }, // shopify.server's session storage probes it at load
  // One shop's settings; null means none saved (a Free store).
  shopSettings: {
    findUnique: async () => settings,
    updateMany: async ({ where, data }) => {
      if (!settings || settings.usageMonth !== where.usageMonth) return { count: 0 };
      settings.usageCount += data.usageCount.increment;
      return { count: 1 };
    },
    upsert: async ({ create, update }) => (settings = settings ? Object.assign(settings, update) : { ...create }),
  },
  dataAccessLog: { deleteMany: async () => ({ count: 0 }) },
  restockSubscription: {
    findMany: async ({ where }) => rows.filter((r) => matches(r, where)),
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      // Mirrors the unique index on (shop, variantId, emailHash).
      if (data.emailHash && rows.some((r) => r !== row && r.shop === row.shop && r.variantId === row.variantId && r.emailHash === data.emailHash)) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      return Object.assign(row, data);
    },
    delete: async ({ where }) => {
      rows = rows.filter((r) => r.id !== where.id);
    },
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

const { unsubscribeToken, verifyUnsubscribeToken, fromHeader, notifyVariant, syncCustomer, buyableVariant, renderEmail } = await import(
  "./notify.server.ts"
);
const { EMAIL_TEXT, sanitizeEmailText } = await import("./email-text.ts");
const { cell } = await import("./routes/app.waitlist.export.tsx");
const { purgeOldRecords } = await import("./retention.server.ts");
const { encryptEmail, decryptEmail, emailHash, sealEmail, backfillEmails } = await import(
  "./crypto.server.ts"
);

// Emails are stored encrypted: each write differs, reads round-trip, tampering fails,
// and the lookup hash ignores case. Rows from before encryption still read.
const sealed = encryptEmail("shopper@x.co");
assert.ok(sealed.startsWith("v1:") && !sealed.includes("shopper"));
assert.notEqual(encryptEmail("shopper@x.co"), sealed);
assert.equal(decryptEmail(sealed), "shopper@x.co");
assert.throws(() => decryptEmail(sealed.slice(0, -4) + "AAAA"));
assert.equal(emailHash("Shopper@X.co"), emailHash("shopper@x.co"));
assert.notEqual(emailHash("a@x.co"), emailHash("b@x.co"));
assert.equal(decryptEmail("legacy@x.co"), "legacy@x.co");

// Backfill encrypts old rows; an old row duplicated by a newer encrypted signup goes.
rows = [
  { id: "old-1", shop: "s", variantId: "1", email: "keep@x.co", emailHash: null },
  { id: "old-2", shop: "s", variantId: "1", email: "dup@x.co", emailHash: null },
  { id: "new-2", shop: "s", variantId: "1", ...sealEmail("dup@x.co") },
];
assert.equal(await backfillEmails(), 2);
assert.deepEqual(rows.map((r) => r.id), ["old-1", "new-2"]);
assert.equal(decryptEmail(rows[0].email), "keep@x.co");
assert.equal(rows[0].emailHash, emailHash("keep@x.co"));

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
  { id: "a", shop: "s.myshopify.com", variantId: "1", ...sealEmail("a@x.co"), status: "PENDING" },
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
assert.deepEqual(result, { sent: 2, failed: 0, held: 0 });
assert.deepEqual(sent.map((e) => e.to[0]).sort(), ["a@x.co", "b@x.co"]);
assert.equal(rows.find((r) => r.id === "c").status, "SENDING");

// No sender name saved: From uses the store name, and replies go to the store.
assert.equal(sent[0].from, '"Linen & Co" <alerts@example.com>');
assert.equal(sent[0].reply_to, "hello@linen.co");
assert.equal(sent[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

// Email text: blanks and junk fall back to English; unknown keys are dropped.
assert.deepEqual(sanitizeEmailText(null), EMAIL_TEXT);
const es = sanitizeEmailText({ heading: "  ¡{{product}} ya está disponible!  ", button: "", evil: "x", body: 5 });
assert.equal(es.heading, "¡{{product}} ya está disponible!");
assert.equal(es.button, EMAIL_TEXT.button);
assert.equal(es.body, EMAIL_TEXT.body);
assert.ok(!("evil" in es));

// The default email is unchanged; custom text is used and escaped, product included.
const base = { productTitle: "Tee <b>", variantTitle: "", productUrl: "https://s.co/p", imageUrl: null, storeName: "S", unsubscribeUrl: "https://s.co/u" };
assert.ok(renderEmail(base).includes("Tee &lt;b&gt; is back in stock"));
const html = renderEmail({ ...base, text: { ...EMAIL_TEXT, heading: "¡{{product}} volvió! <script>", button: "Comprar", unsubscribe: "Darse de baja" } });
assert.ok(html.includes("¡Tee &lt;b&gt; volvió! &lt;script&gt;"));
assert.ok(html.includes(">Comprar</a>") && html.includes(">Darse de baja</a>"));
assert.ok(!html.includes("Shop now") && !html.includes("<script>"));

// A store's saved text reaches the real send.
settings = { emailSubject: "{{product}} está de vuelta", fromName: "", emailText: { button: "Comprar ahora" } };
sent.length = 0;
rows = [{ id: "es", shop: "s.myshopify.com", variantId: "2", ...sealEmail("es@x.co"), status: "PENDING" }];
await notifyVariant({ shop: "s.myshopify.com", variantId: "2", productTitle: "Camisa", variantTitle: "", productUrl: "https://s.co/p", imageUrl: null, shopName: "S", shopContactEmail: null });
assert.equal(sent[0].subject, "Camisa está de vuelta");
assert.ok(sent[0].html.includes(">Comprar ahora</a>"));
settings = null;

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

// Customer sync: a new email is created with the tag and no marketing consent;
// a known one only gets the tag added, so its existing tags survive.
const fakeAdmin = (existingId) => {
  const calls = [];
  return {
    calls,
    graphql: async (query, { variables }) => {
      calls.push({ op: query.match(/(query|mutation) (\w+)/)[2], variables });
      const data = query.includes("customerByIdentifier")
        ? { customerByIdentifier: existingId ? { id: existingId } : null }
        : { tagsAdd: { userErrors: [] }, customerCreate: { userErrors: [] } };
      return Response.json({ data });
    },
  };
};
const fresh = fakeAdmin(null);
await syncCustomer(fresh, "new@x.co");
assert.deepEqual(fresh.calls[1], {
  op: "backSoonCustomerCreate",
  variables: { input: { email: "new@x.co", tags: ["backsoon-waitlist"] } },
});
const known = fakeAdmin("gid://shopify/Customer/1");
await syncCustomer(known, "old@x.co");
assert.deepEqual(known.calls[1], {
  op: "backSoonTag",
  variables: { id: "gid://shopify/Customer/1", tags: ["backsoon-waitlist"] },
});
await assert.rejects(
  syncCustomer(
    { graphql: async () => Response.json({ data: { customerByIdentifier: null, customerCreate: { userErrors: [{ message: "Email has already been taken" }] } } }) },
    "race@x.co",
  ),
  /already been taken/,
);

// Product link: falls back to the handle on a password-protected store; drafts are skipped.
const variantAdmin = (product) => ({
  graphql: async () => Response.json({ data: {
    shop: { name: "S", contactEmail: null, primaryDomain: { url: "https://s.com" } },
    productVariant: { title: "Red", availableForSale: true, product: { title: "P", handle: "p", featuredMedia: null, ...product } },
  } }),
});
const gid = "gid://shopify/ProductVariant/9";
assert.equal((await buyableVariant(variantAdmin({ status: "ACTIVE", onlineStoreUrl: null }), gid)).productUrl, "https://s.com/products/p?variant=9");
assert.equal((await buyableVariant(variantAdmin({ status: "ACTIVE", onlineStoreUrl: "https://s.com/x" }), gid)).productUrl, "https://s.com/x?variant=9");
assert.equal(await buyableVariant(variantAdmin({ status: "DRAFT", onlineStoreUrl: null }), gid), null);

// --- Plans ---
const { planFromNames, effectivePlan } = await import("./plans.server.ts");
const { loader: clickLoader } = await import("./routes/c.$id.tsx");
const { trackedUrl } = await import("./notify.server.ts");
assert.equal(planFromNames([]), "free");
assert.equal(planFromNames(["Starter"]), "starter");
assert.equal(planFromNames(["Growth"]), "growth");
assert.equal(planFromNames(["Pro"]), "pro");
assert.equal(planFromNames(["product"]), "free");
assert.equal(effectivePlan(null), "free");
assert.equal(effectivePlan({ plan: "free", grandfathered: true }), "starter");
assert.equal(effectivePlan({ plan: "growth", grandfathered: true }), "growth");
assert.equal(effectivePlan({ plan: "bogus", grandfathered: false }), "free");

const month = new Date().toISOString().slice(0, 7);
const restock = () =>
  notifyVariant({
    shop: "s.myshopify.com",
    variantId: "1",
    productTitle: "Linen shirt",
    variantTitle: "",
    productUrl: "https://s.example/products/linen?variant=1",
    imageUrl: null,
    shopName: "Linen & Co",
    shopContactEmail: null,
  });
const freshSettings = (extra) => ({
  shop: "s.myshopify.com",
  plan: "free",
  grandfathered: false,
  planCheckedAt: new Date(),
  usageMonth: month,
  usageCount: 0,
  emailSubject: "Custom {{product}}",
  fromName: "Custom Sender",
  renotify: false,
  emailButtonColor: "#ff0000",
  emailLogoUrl: "",
  ...extra,
});

// A failed plan check (no session, Shopify down) keeps the cached plan, never downgrades.
const { refreshPlan } = await import("./plans.server.ts");
settings = freshSettings({ plan: "growth", planCheckedAt: null });
const checked = await refreshPlan("s.myshopify.com", { maxAgeMs: 0 });
assert.equal(checked.refreshed, false);
assert.equal(checked.settings.plan, "growth");

// Free: one email left this month, so the second shopper waits; own subject, default sender, design and branding.
settings = freshSettings({ usageCount: 49 });
rows = [
  { id: "f1", shop: "s.myshopify.com", variantId: "1", ...sealEmail("f1@x.co"), status: "PENDING" },
  { id: "f2", shop: "s.myshopify.com", variantId: "1", ...sealEmail("f2@x.co"), status: "PENDING" },
];
sent.length = 0;
assert.deepEqual(await restock(), { sent: 1, failed: 0, held: 1 });
assert.equal(settings.usageCount, 50);
assert.deepEqual(rows.map((r) => r.status).sort(), ["PENDING", "SENT"]);
assert.equal(sent[0].subject, "Custom Linen shirt");
assert.equal(sent[0].from, '"Linen & Co" <alerts@example.com>');
assert.doesNotMatch(sent[0].html, /#ff0000/);
assert.match(sent[0].html, /Sent with <a href="https:\/\/backsoon/);
assert.match(sent[0].html, /Linen shirt is back in stock/);
// The Shop now link goes through the click tracker.
const sentId = rows.find((r) => r.status === "SENT").id;
assert.ok(sent[0].html.includes(trackedUrl(sentId, "https://s.example/products/linen?variant=1").replace(/&/g, "&amp;")));

// Last month's count doesn't carry over.
settings = freshSettings({ usageMonth: "2000-01", usageCount: 50 });
rows = [{ id: "m1", shop: "s.myshopify.com", variantId: "1", ...sealEmail("m1@x.co"), status: "PENDING" }];
assert.deepEqual(await restock(), { sent: 1, failed: 0, held: 0 });
assert.equal(settings.usageMonth, month);
assert.equal(settings.usageCount, 1);

// Starter: custom sender, no branding, default design.
settings = freshSettings({ plan: "starter" });
rows = [{ id: "b1", shop: "s.myshopify.com", variantId: "1", ...sealEmail("b1@x.co"), status: "PENDING" }];
sent.length = 0;
await restock();
assert.equal(sent[0].subject, "Custom Linen shirt");
assert.equal(sent[0].from, '"Custom Sender" <alerts@example.com>');
assert.doesNotMatch(sent[0].html, /Sent with/);
assert.doesNotMatch(sent[0].html, /#ff0000/);

// Growth + re-notify: emailed shoppers hear again, but not twice in a day; design applies.
settings = freshSettings({ plan: "growth", renotify: true });
rows = [
  { id: "g1", shop: "s.myshopify.com", variantId: "1", ...sealEmail("g1@x.co"), status: "SENT", sentAt: ago(3) },
  { id: "g2", shop: "s.myshopify.com", variantId: "1", ...sealEmail("g2@x.co"), status: "SENT", sentAt: new Date() },
  { id: "g3", shop: "s.myshopify.com", variantId: "1", ...sealEmail("g3@x.co"), status: "UNSUBSCRIBED" },
];
sent.length = 0;
assert.deepEqual(await restock(), { sent: 1, failed: 0, held: 0 });
assert.equal(sent[0].to[0], "g1@x.co");
assert.match(sent[0].html, /#ff0000/);
// The one-email footer note would be wrong here, so it's left out.
assert.doesNotMatch(sent[0].html, /only get this one email/);
// Re-notify off: SENT rows are left alone.
settings = freshSettings({ plan: "growth" });
rows[0].sentAt = ago(3);
assert.deepEqual(await restock(), { sent: 0, failed: 0, held: 0 });

// Click tracker: a signed link records the click and redirects; a tampered one 404s.
rows = [{ id: "k1", clickedAt: null }];
const click = (url) => clickLoader({ params: { id: "k1" }, request: new Request(url) });
const link = trackedUrl("k1", "https://s.example/p?variant=1");
const ok = await click(link);
assert.equal(ok.status, 302);
assert.equal(ok.headers.get("location"), "https://s.example/p?variant=1");
assert.ok(rows[0].clickedAt instanceof Date);
const forged = link.replace(encodeURIComponent("https://s.example"), encodeURIComponent("https://evil.example"));
assert.equal((await click(forged)).status, 404);

console.log("ok: notify.server, CSV export, retention, encryption, customer sync, product links, plans and click tracking");
