// Hand-drawn charts for the Waitlist page. Polaris web components have no
// charts, and these three are small enough not to justify a chart library.
import { useEffect, useRef, useState } from "react";

export type Day = { date: string; signups: number; sent: number };

// Validated for the white admin card (dataviz palette, slots 1-2).
const SERIES = [
  { key: "signups", label: "Signups", color: "#2a78d6" },
  { key: "sent", label: "Emails sent", color: "#eb6834" },
] as const;

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// Smallest 1/2/5 step that fits the max in four ticks, so the axis reads 0, 2, 4...
function niceStep(max: number) {
  for (let p = 1; ; p *= 10) {
    for (const m of [1, 2, 5]) if (m * p * 4 >= max) return m * p;
  }
}

/** Daily signups and emails sent, with a crosshair that snaps to the nearest day. */
export function TrendChart({ days }: { days: Day[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(1, ...days.flatMap((d) => [d.signups, d.sent]));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const last = days.length - 1;
  const x = (i: number) => PAD.left + (last ? (i / last) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const clamp = (i: number) => Math.min(last, Math.max(0, i));

  const pointAt = (clientX: number) => {
    const left = ref.current!.getBoundingClientRect().left;
    setActive(clamp(Math.round(((clientX - left - PAD.left) / plotW) * last)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const move = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[e.key];
    if (move === undefined) return;
    e.preventDefault();
    setActive((i) => clamp((i ?? last) + move));
  };

  const day = active === null ? null : days[active];
  const tipX = active === null ? 0 : x(active);

  return (
    <div className="wl-chart">
      <div className="wl-legend-row">
        {SERIES.map((s) => (
          <span key={s.key} className="wl-key">
            <span className="wl-line-key" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div ref={ref} className="wl-plot" style={{ height: HEIGHT }}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Daily signups and emails sent. Use the arrow keys to read each day."
          tabIndex={0}
          onPointerMove={(e) => pointAt(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "#c3c2b7" : "#e1e0d9"}
              />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="wl-tick">
                {t.toLocaleString()}
              </text>
            </g>
          ))}
          {[...new Set([0, Math.floor(last / 2), last])].map((i, n, all) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={all.length === 1 ? "middle" : (["start", "middle", "end"] as const)[n]}
              className="wl-tick"
            >
              {dayLabel(days[i].date)}
            </text>
          ))}

          {active !== null && (
            <line x1={tipX} x2={tipX} y1={PAD.top} y2={PAD.top + plotH} stroke="#c3c2b7" />
          )}
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={days.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[s.key])}`).join("")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {day &&
            SERIES.map((s) => (
              <circle
                key={s.key}
                cx={tipX}
                cy={y(day[s.key])}
                r={4}
                fill={s.color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
        </svg>

        {day && (
          <div
            className="wl-tooltip"
            style={{
              left: tipX,
              transform: tipX > width / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <div className="wl-tooltip-date">{dayLabel(day.date)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="wl-tooltip-row">
                <span className="wl-line-key" style={{ background: s.color }} />
                <strong>{day[s.key].toLocaleString()}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="wl-details">
        <summary>View as table</summary>
        <table className="wl-table">
          <thead>
            <tr>
              <th>Day</th>
              {SERIES.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{dayLabel(d.date)}</td>
                <td>{d.signups.toLocaleString()}</td>
                <td>{d.sent.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export type Slice = { key: string; label: string; value: number; color: string };

/** Share of every signup by status: one stacked bar, with the list as its legend. */
export function StatusBreakdown({ slices }: { slices: Slice[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "0%");
  const dim = (key: string) => (hover && hover !== key ? 0.3 : 1);

  return (
    <div className="wl-status">
      <div className="wl-stack" aria-hidden="true">
        {slices
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              style={{ flexGrow: s.value, background: s.color, opacity: dim(s.key) }}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
      </div>
      <ul className="wl-status-list">
        {slices.map((s) => (
          <li
            key={s.key}
            style={{ opacity: dim(s.key) }}
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="wl-swatch" style={{ background: s.color }} />
            <span className="wl-status-label">{s.label}</span>
            <strong>{s.value.toLocaleString()}</strong>
            <span className="wl-pct">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Bar = { id: string; label: string; detail: string; value: number };

/** Variants ranked by shoppers waiting; the value sits at each bar's tip. */
export function RankedBars({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ol className="wl-bars">
      {bars.map((b) => (
        <li key={b.id}>
          <div className="wl-bar-label">
            <strong>{b.label}</strong>
            {b.detail && <span> · {b.detail}</span>}
          </div>
          <div className="wl-bar-row">
            <div className="wl-bar" style={{ width: `calc((100% - 3em) * ${b.value / max})` }} />
            <span className="wl-bar-value">{b.value.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Light only: the Shopify admin renders apps on a light surface.
export const CHART_CSS = `
  .wl-stat-value { font-size: 28px; font-weight: 600; line-height: 1.2; color: #0b0b0b; }
  .wl-chart { display: grid; gap: 8px; }
  .wl-legend-row { display: flex; gap: 16px; font-size: 12px; color: #52514e; }
  .wl-key { display: inline-flex; align-items: center; gap: 6px; }
  .wl-line-key { display: inline-block; width: 12px; height: 2px; border-radius: 1px; }
  .wl-plot { position: relative; }
  .wl-plot svg { display: block; overflow: visible; cursor: crosshair; }
  .wl-plot svg:focus-visible { outline: 2px solid #2a78d6; outline-offset: 4px; border-radius: 4px; }
  .wl-tick { font-size: 11px; fill: #898781; font-variant-numeric: tabular-nums; }
  .wl-tooltip { position: absolute; top: 8px; pointer-events: none; min-width: 132px; padding: 8px 10px; border-radius: 8px; background: #fff; box-shadow: 0 4px 16px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(0 0 0 / 0.06); font-size: 12px; color: #52514e; }
  .wl-tooltip-date { margin-bottom: 4px; }
  .wl-tooltip-row { display: flex; align-items: center; gap: 6px; }
  .wl-tooltip-row strong { color: #0b0b0b; font-size: 13px; }
  .wl-details summary { cursor: pointer; font-size: 12px; color: #52514e; }
  .wl-table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 12px; }
  .wl-table th, .wl-table td { padding: 4px 8px; text-align: right; border-bottom: 1px solid #e1e0d9; font-variant-numeric: tabular-nums; }
  .wl-table th:first-child, .wl-table td:first-child { text-align: left; }
  .wl-status { display: grid; gap: 12px; }
  .wl-stack { display: flex; gap: 2px; height: 12px; border-radius: 4px; overflow: hidden; background: #f1f1f1; }
  .wl-stack > div { transition: opacity 0.15s; }
  .wl-status-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .wl-status-list li { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; transition: opacity 0.15s; }
  .wl-swatch { width: 10px; height: 10px; flex: none; border-radius: 3px; }
  .wl-status-label { flex: 1; color: #52514e; }
  .wl-pct { width: 3.5em; text-align: right; color: #898781; font-variant-numeric: tabular-nums; }
  .wl-bars { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
  .wl-bar-label { overflow: hidden; margin-bottom: 4px; font-size: 13px; white-space: nowrap; text-overflow: ellipsis; }
  .wl-bar-label span { color: #52514e; }
  .wl-bar-row { display: flex; align-items: center; gap: 8px; }
  .wl-bar { min-width: 4px; height: 10px; border-radius: 0 4px 4px 0; background: #2a78d6; }
  .wl-bar-value { font-size: 13px; font-weight: 600; color: #0b0b0b; }
`;
