"use client";

// Small SVG charts with no chart library. Conventions (kept on purpose):
// one y-axis per chart; thin marks (bars <= 24px, 2px lines); bars rounded at
// the data end only, square at the baseline; a 2px gap between stacked parts;
// hairline solid gridlines; a legend whenever there are two or more series;
// hover tooltips (crosshair on lines, per-column on bars); and a data table
// under every chart so no value depends on hovering.
import React, { useEffect, useRef, useState } from "react";

import { cx } from "./ui";

export type Series = { key: string; label: string; color: string; values: (number | null)[] };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function niceMax(v: number, ticks = 4): number {
  if (!(v > 0)) return ticks;
  const raw = v / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const s = raw / mag;
  const nice = s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10;
  return nice * mag * ticks;
}

const axisFmt = (v: number) =>
  v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : `${+v.toFixed(v < 10 ? 1 : 0)}`;

export function Legend({ series, shape = "rect" }: { series: Pick<Series, "key" | "label" | "color">[]; shape?: "rect" | "line" }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          {shape === "rect" ? (
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
          ) : (
            <span className="w-3.5 h-[2px] rounded" style={{ background: s.color }} />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { label: string; color: string; value: string }[] }) {
  const w = 168;
  const left = Math.max(0, Math.min(width - w, x - w / 2));
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 rounded-lg border border-line-strong bg-panel-3/95 backdrop-blur px-3 py-2 shadow-xl"
      style={{ left, width: w }}
    >
      <div className="text-[11px] text-ink-3 mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="w-2.5 h-[2px] rounded" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-semibold text-ink tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ labels, series, format }: { labels: string[]; series: Series[]; format: (v: number) => string }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer select-none text-[11px] text-ink-3 hover:text-ink-2 w-fit">Show as table</summary>
      <div className="mt-2 max-h-56 overflow-auto custom-scrollbar rounded-lg border border-line">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-panel-2">
            <tr className="text-left text-ink-3">
              <th className="px-3 py-1.5 font-medium">Period</th>
              {series.map((s) => (
                <th key={s.key} className="px-3 py-1.5 font-medium text-right">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {labels.map((l, i) => (
              <tr key={l + i} className="border-t border-line">
                <td className="px-3 py-1.5 text-ink-2">{l}</td>
                {series.map((s) => (
                  <td key={s.key} className="px-3 py-1.5 text-right text-ink">{s.values[i] == null ? "–" : format(s.values[i] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Stacked columns over a category axis (days). */
export function ColumnChart({
  labels,
  tooltipLabels,
  series,
  height = 220,
  format = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }),
  unit = "",
  table = true,
}: {
  labels: string[];
  tooltipLabels?: string[];
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  unit?: string;
  table?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const padL = 40;
  const padB = 22;
  const padT = 8;
  const plotW = Math.max(0, width - padL - 4);
  const plotH = height - padB - padT;
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))));
  const allZero = totals.every((t) => t === 0);

  return (
    <div className="min-w-0">
      <div className="mb-3"><Legend series={series} /></div>
      <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(" and ")} by period`}>
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <g key={p}>
                <line x1={padL} x2={width - 4} y1={y(max * p)} y2={y(max * p)} stroke={p === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
                <text x={padL - 8} y={y(max * p) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)" className="tabular">
                  {axisFmt(max * p)}
                </text>
              </g>
            ))}
            {labels.map((l, i) => {
              const cxp = padL + band * i + band / 2;
              let acc = 0;
              const parts = series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const isTop = series.slice(si + 1).every((t) => (t.values[i] ?? 0) === 0);
                // 2px surface gap between stacked parts.
                const h = Math.max(0, y0 - y1 - (si > 0 && v > 0 ? 2 : 0));
                if (v <= 0 || h <= 0) return null;
                return isTop ? (
                  <path key={s.key} d={topRoundedRect(cxp - barW / 2, y1, barW, h, 4)} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.55} />
                ) : (
                  <rect key={s.key} x={cxp - barW / 2} y={y1} width={barW} height={h} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.55} />
                );
              });
              return (
                <g key={l + i}>
                  {parts}
                  {i % tickEvery === 0 && (
                    <text x={cxp} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{l}</text>
                  )}
                  <rect
                    x={padL + band * i}
                    y={padT}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={-1}
                  />
                </g>
              );
            })}
            {allZero && (
              <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={12} fill="var(--ink-3)">No usage in this period</text>
            )}
          </svg>
        )}
        {hover != null && width > 0 && (
          <Tooltip
            x={padL + band * hover + band / 2}
            width={width}
            title={(tooltipLabels ?? labels)[hover]}
            rows={[
              ...series.map((s) => ({ label: s.label, color: s.color, value: `${format(s.values[hover] ?? 0)}${unit}` })),
              ...(series.length > 1 ? [{ label: "Total", color: "transparent", value: `${format(totals[hover])}${unit}` }] : []),
            ]}
          />
        )}
      </div>
      {table && <DataTable labels={tooltipLabels ?? labels} series={series} format={format} />}
    </div>
  );
}

/** Lines over time with a crosshair. `null` values leave a gap. */
export function LineChart({
  labels,
  tooltipLabels,
  series,
  height = 200,
  format = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }),
  yMax,
  table = true,
  empty = "No data yet",
}: {
  labels: string[];
  tooltipLabels?: string[];
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  yMax?: number;
  table?: boolean;
  empty?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = yMax ?? niceMax(Math.max(0, ...all));
  const padL = 44;
  const padB = 22;
  const padT = 8;
  const plotW = Math.max(0, width - padL - 8);
  const plotH = height - padB - padT;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => padT + plotH - (Math.min(v, max) / max) * plotH;
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))));

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (n < 1) return;
    const i = Math.round(((px - padL) / Math.max(1, plotW)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="min-w-0">
      <div className="mb-3"><Legend series={series} shape="line" /></div>
      <div ref={ref} className="relative w-full" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(", ")} over time`}>
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <g key={p}>
                <line x1={padL} x2={width - 8} y1={y(max * p)} y2={y(max * p)} stroke={p === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
                <text x={padL - 8} y={y(max * p) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)" className="tabular">
                  {format(max * p)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % tickEvery === 0 ? (
                <text key={l + i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">{l}</text>
              ) : null,
            )}
            {series.map((s) => (
              <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hover != null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--ink-3)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[hover] != null ? (
                    <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
                  ) : null,
                )}
              </>
            )}
            {all.length === 0 && (
              <text x={padL + plotW / 2} y={padT + plotH / 2} textAnchor="middle" fontSize={12} fill="var(--ink-3)">{empty}</text>
            )}
          </svg>
        )}
        {hover != null && width > 0 && all.length > 0 && (
          <Tooltip
            x={x(hover)}
            width={width}
            title={(tooltipLabels ?? labels)[hover]}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[hover] == null ? "–" : format(s.values[hover] as number) }))}
          />
        )}
      </div>
      {table && <DataTable labels={tooltipLabels ?? labels} series={series} format={format} />}
    </div>
  );
}

/** Ranked horizontal bars (top companies). */
export function BarList({
  items,
  format,
  empty = "Nothing yet",
}: {
  items: { key: string | number; label: string; value: number; sub?: string; onClick?: () => void }[];
  format: (v: number) => string;
  empty?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length || max === 0) return <div className="py-8 text-center text-[13px] text-ink-3">{empty}</div>;
  return (
    <ol className="space-y-3">
      {items.map((it, rank) => (
        <li key={it.key}>
          <button onClick={it.onClick} disabled={!it.onClick} className="w-full text-left group disabled:cursor-default">
            <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1.5">
              <span className="truncate text-ink group-hover:text-accent transition-colors">
                <span className="text-ink-3 tabular mr-2">{rank + 1}</span>
                {it.label}
                {it.sub && <span className="text-ink-3 ml-2 text-[11px]">{it.sub}</span>}
              </span>
              <span className="text-ink-2 tabular shrink-0">{format(it.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: "var(--series-1)" }} />
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

// Sequential blue ramp (one hue, dark → light on the dark surface).
const RAMP = ["#1a2433", "#104281", "#184f95", "#1c5cab", "#2a78d6", "#3987e5", "#6da7ec", "#9ec5f4"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Day-of-week × hour-of-day grid. */
export function Heatmap({
  cells,
  metric = "minutes",
  format,
}: {
  cells: { dow: number; hour: number; minutes: number; requests: number }[];
  metric?: "minutes" | "requests";
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(0, ...cells.map((c) => c[metric]));
  const color = (v: number) => (v <= 0 || max <= 0 ? "rgba(255,255,255,0.03)" : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor((v / max) * (RAMP.length - 1)))]);
  const hovered = hover ? grid.get(`${hover.dow}-${hover.hour}`) : null;
  const totalsByHour = Array.from({ length: 24 }, (_, h) => cells.filter((c) => c.hour === h).reduce((a, c) => a + c[metric], 0));
  const peakHour = max > 0 ? totalsByHour.indexOf(Math.max(...totalsByHour)) : -1;

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[380px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: "30px repeat(24, minmax(0, 1fr))" }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[9px] text-ink-3 text-center tabular">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>
            ))}
            {DAYS.map((d, di) => (
              <React.Fragment key={d}>
                <div className="text-[10px] text-ink-3 flex items-center">{d}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const c = grid.get(`${di + 1}-${h}`);
                  const v = c ? c[metric] : 0;
                  return (
                    <div
                      key={h}
                      onMouseEnter={() => setHover({ dow: di + 1, hour: h })}
                      onMouseLeave={() => setHover(null)}
                      className={cx("aspect-square rounded-[3px] transition-transform", hover?.dow === di + 1 && hover.hour === h && "ring-1 ring-ink scale-110")}
                      style={{ background: color(v) }}
                      aria-label={`${d} ${h}:00 — ${format(v)}`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-[12px]">
        <span className="text-ink-2 min-h-[18px]">
          {hover
            ? `${DAYS[hover.dow - 1]} ${String(hover.hour).padStart(2, "0")}:00–${String((hover.hour + 1) % 24).padStart(2, "0")}:00 · ${format(hovered ? hovered[metric] : 0)}`
            : peakHour >= 0
              ? `Busiest hour: ${String(peakHour).padStart(2, "0")}:00–${String((peakHour + 1) % 24).padStart(2, "0")}:00 (Sri Lanka time)`
              : "No traffic in the last 30 days"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-ink-3">
          Less
          {RAMP.slice(1).map((c) => (
            <span key={c} className="w-3 h-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/** One tick per time bucket: green healthy, red down, amber partly down, grey no data. */
export function StatusStrip({ points, labels }: { points: (number | null)[]; labels: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex gap-px sm:gap-[2px] h-6 items-stretch min-w-0" onMouseLeave={() => setHover(null)}>
        {points.map((r, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            className="flex-1 rounded-[1px] sm:rounded-[2px] min-w-0"
            style={{
              background: r == null ? "rgba(255,255,255,0.06)" : r >= 0.999 ? "var(--good)" : r <= 0.001 ? "var(--critical)" : "var(--warning)",
              opacity: hover == null || hover === i ? 1 : 0.6,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-ink-3 min-h-[16px]">
        {hover != null
          ? `${labels[hover]} · ${points[hover] == null ? "no data" : points[hover]! >= 0.999 ? "healthy" : points[hover]! <= 0.001 ? "down" : `up ${Math.round(points[hover]! * 100)}% of checks`}`
          : "Hover a bar for the time"}
      </div>
    </div>
  );
}
