import db from "./db.server";

// Finished records are deleted this long after their last activity. Waiting
// requests stay until the item is back or the shopper unsubscribes.
// The privacy policy (routes/privacy.tsx) states this; keep them in step.
export const RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeOldRecords(now = Date.now()) {
  const cutoff = new Date(now - RETENTION_DAYS * DAY_MS);
  const { count } = await db.restockSubscription.deleteMany({
    where: {
      OR: [
        { status: "SENT", sentAt: { lt: cutoff } },
        { status: "UNSUBSCRIBED", unsubscribedAt: { lt: cutoff } },
        // claimedAt is the last send attempt; rows from before it existed fall back to signup.
        { status: "FAILED", claimedAt: { lt: cutoff } },
        { status: "FAILED", claimedAt: null, createdAt: { lt: cutoff } },
      ],
    },
  });
  return count;
}

// ponytail: in-process daily timer, one per server instance. Extra instances
// just repeat an idempotent delete; move to a Railway cron if restarts get so
// frequent that a day never passes.
if (process.env.NODE_ENV === "production") {
  const run = () =>
    purgeOldRecords()
      .then((n) => n && console.log(`notify-me: retention deleted ${n} record(s)`))
      .catch((e) => console.error("notify-me: retention failed", e));
  run();
  setInterval(run, DAY_MS).unref();
}
