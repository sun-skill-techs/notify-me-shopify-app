import db from "./db.server";
import type { Day } from "./waitlist-charts";

const DAY_MS = 86_400_000;

// "2026-09-23" minus n calendar days, without timezone drift.
const shiftDate = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);

/** Daily signups and sends for the last `days` days in the shop's timezone,
 * plus the previous period's totals for comparison. */
export async function activity(shop: string, timezone: string, days: number) {
  const dateOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format;
  const today = dateOf(new Date());
  const first = shiftDate(today, days - 1);
  const prevFirst = shiftDate(today, 2 * days - 1);

  // ponytail: buckets rows in JS; move to a date_trunc GROUP BY if a shop's
  // waitlist grows past tens of thousands of rows per period.
  const since = new Date(Date.now() - (2 * days + 1) * DAY_MS);
  const rows = await db.restockSubscription.findMany({
    where: { shop, OR: [{ createdAt: { gte: since } }, { sentAt: { gte: since } }] },
    select: { createdAt: true, sentAt: true },
  });

  const series = new Map<string, Day>();
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, i);
    series.set(date, { date, signups: 0, sent: 0 });
  }
  const previous = { signups: 0, sent: 0 };
  const count = (at: Date | null, key: "signups" | "sent") => {
    if (!at) return;
    const date = dateOf(at);
    const day = series.get(date);
    if (day) day[key]++;
    else if (date >= prevFirst && date < first) previous[key]++;
  };
  for (const row of rows) {
    count(row.createdAt, "signups");
    count(row.sentAt, "sent");
  }

  const daily = [...series.values()];
  const current = {
    signups: daily.reduce((n, d) => n + d.signups, 0),
    sent: daily.reduce((n, d) => n + d.sent, 0),
  };
  return { daily, current, previous };
}
