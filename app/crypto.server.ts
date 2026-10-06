import crypto from "node:crypto";
import db from "./db.server";

// Shopper emails are encrypted at rest (AES-256-GCM), as Shopify's protected
// customer data rules require. Lookups go through emailHash, a keyed HMAC, so
// the plain address never has to be stored. Losing DATA_ENCRYPTION_KEY makes
// every stored email unreadable: keep a copy outside the server.
const PREFIX = "v1:";

function key() {
  const raw = Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? "", "base64");
  if (raw.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64");
  return raw;
}

export function emailHash(email: string) {
  // A separate key for hashing, derived so there's still only one secret to keep.
  const hashKey = crypto.createHmac("sha256", key()).update("email-hash").digest();
  return crypto.createHmac("sha256", hashKey).update(email.toLowerCase()).digest("hex");
}

export function encryptEmail(email: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decryptEmail(stored: string) {
  // Rows written before encryption hold the plain address until the backfill reaches them.
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** The two columns a subscription stores for an address. */
export const sealEmail = (email: string) => ({
  email: encryptEmail(email),
  emailHash: emailHash(email),
});

/** Encrypt rows saved before encryption existed. Safe to run repeatedly. */
export async function backfillEmails() {
  const rows = await db.restockSubscription.findMany({
    where: { emailHash: null },
    select: { id: true, email: true },
  });
  for (const row of rows) {
    try {
      await db.restockSubscription.update({ where: { id: row.id }, data: sealEmail(row.email) });
    } catch (e) {
      // P2002: the same shopper signed up again after deploy, so an encrypted row
      // already exists for this variant. That newer row wins.
      if ((e as { code?: string }).code !== "P2002") throw e;
      await db.restockSubscription.delete({ where: { id: row.id } });
    }
  }
  return rows.length;
}
