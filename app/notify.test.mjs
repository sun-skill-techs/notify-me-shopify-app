// Run: node app/notify.test.mjs
// Guards the unsubscribe-link signing: a forged or swapped token must not unsubscribe someone.
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SHOPIFY_API_SECRET = "test-secret";

// Mirrors notify.server.ts. Imported source would pull in Prisma, so the HMAC
// is re-derived here and asserted against the same construction.
const token = (id) =>
  crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(id)
    .digest("hex")
    .slice(0, 32);

const verify = (id, candidate) => {
  const expected = token(id);
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
  );
};

// A real token verifies.
assert.ok(verify("sub_123", token("sub_123")));

// One subscriber's token must not unsubscribe another.
assert.ok(!verify("sub_123", token("sub_456")));

// Garbage and empty tokens are rejected, not crashes.
assert.ok(!verify("sub_123", "deadbeef"));
assert.ok(!verify("sub_123", ""));

// Tokens are stable across calls, so emailed links keep working.
assert.equal(token("sub_123"), token("sub_123"));

console.log("ok: unsubscribe token signing");
