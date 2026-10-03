"use client";

// GPU performance, built to stay readable with dozens of GPUs: an overview,
// filters (search, role, status, sort), one compact tile (or table row) per
// GPU, worst first, and a side panel with the full detail and history for the
// GPU you click (#gpus/<id>, so the header bell can open one directly).
// Live numbers come from the controller's health probe; history from the
// gateway's per-minute metrics (fleet_node_metrics).
import { useEffect, useMemo, useState } from "react";

import { ColumnChart, LineChart, StatusStrip } from "./charts";
import { fleetApi, useFleet } from "./fleet-context";
import { useHub } from "./hub-context";
import { Activity, AlertOctagon, AlertTriangle, ChevronRight, Clock, Cpu, RefreshCw, Search, Server } from "./icons";
import { Badge, Button, Card, Drawer, Empty, ErrorBanner, Meter, MiniStat, Segmented, Skeleton, Spinner, Stat, StatusPill, cx, inputClass } from "./ui";
import { PEAK, type Assessment, type NodeStatus } from "@/lib/fleet-health";
import { useLoading } from "@/lib/loading";
import { dateTime, duration, mb, ms, num, pct, timeOnly } from "@/lib/format";
import { LINES_PER_GPU } from "@/lib/packages";
import type { FleetMetrics, FleetNode, MetricPoint, NodeSummary } from "@/lib/types";

type Range = 1 | 6 | 24 | 168;
type View = "tiles" | "table";
type StatusFilter = "all" | "down" | "peak" | "healthy" | "other";
type SortKey = "status" | "load" | "latency" | "name";

// Worst first: what needs a look sits at the top.
const ORDER: Record<NodeStatus, number> = { down: 0, failed: 0, peak: 1, unknown: 2, pending: 3, draining: 4, healthy: 5 };
const VIEW_KEY = "chakra.gpus.view";

function bucket(status: NodeStatus): Exclude<StatusFilter, "all"> {
  if (status === "down" || status === "failed") return "down";
  if (status === "peak") return "peak";
  if (status === "healthy") return "healthy";
  return "other";
}

const ratio = (v?: number | null, max?: number | null) => (v != null && max ? v / max : null);

export default function GpuPage({ node: openId }: { node?: number }) {
  const fleet = useFleet();
  const { now, navigate } = useHub();
  const busy = useLoading();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "stt" | "tts">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("status");
  const [view, setView] = useState<View>("tiles");

  // The tiles/table choice is remembered in this browser only.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(VIEW_KEY) === "table") setView("table");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const summaries = fleet.metrics?.summary ?? {};
  const nodes = fleet.nodes;
  const statusOf = (n: FleetNode): NodeStatus => fleet.assessments.get(n.id)?.status ?? "unknown";

  const counts = { all: nodes.length, down: 0, peak: 0, healthy: 0, other: 0 };
  for (const n of nodes) counts[bucket(statusOf(n))]++;

  const q = query.trim().toLowerCase();
  const shown = nodes
    .filter((n) => role === "all" || n.role === role)
    .filter((n) => status === "all" || bucket(statusOf(n)) === status)
    .filter((n) => !q || n.name.toLowerCase().includes(q) || n.host.includes(q))
    .sort((a, b) => {
      const sa = summaries[String(a.id)];
      const sb = summaries[String(b.id)];
      if (sort === "load") return (fleet.assessments.get(b.id)?.load ?? -1) - (fleet.assessments.get(a.id)?.load ?? -1);
      if (sort === "latency") return (sb?.p95_ms_5m ?? -1) - (sa?.p95_ms_5m ?? -1);
      if (sort === "name") return a.name.localeCompare(b.name);
      return ORDER[statusOf(a)] - ORDER[statusOf(b)] || a.name.localeCompare(b.name);
    });

  const totalRpm = Object.values(summaries).reduce((a, s) => a + (s.requests_5m ?? 0), 0) / 5;
  const latency = (r: "stt" | "tts") => {
    const ss = nodes.filter((n) => n.role === r).map((n) => summaries[String(n.id)]).filter(Boolean) as NodeSummary[];
    const reqs = ss.reduce((a, s) => a + (s.requests_5m ?? 0), 0);
    const avg = reqs ? ss.reduce((a, s) => a + (s.avg_ms_5m ?? 0) * (s.requests_5m ?? 0), 0) / reqs : null;
    const p95 = ss.reduce<number | null>((a, s) => (s.p95_ms_5m == null ? a : Math.max(a ?? 0, s.p95_ms_5m)), null);
    return { avg, p95 };
  };
  const stt = latency("stt");
  const tts = latency("tts");

  // The open GPU, and its neighbours in the current list for prev/next.
  const open = openId != null ? nodes.find((n) => n.id === openId) : undefined;
  const list = shown.some((n) => n.id === openId) ? shown : nodes;
  const at = list.findIndex((n) => n.id === openId);
  const prev = at > 0 ? list[at - 1] : undefined;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : undefined;
  const openGpu = (id: number) => navigate({ page: "gpus", node: id });

  return (
    <div className="space-y-5">
      <ErrorBanner message={fleet.error ? `Fleet controller: ${fleet.error}` : ""} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label="GPUs healthy"
          loading={!fleet.loaded}
          value={`${counts.healthy + counts.peak} / ${nodes.length}`}
          sub={counts.down ? `${counts.down} down` : "All responding"}
          icon={<Server size={16} />}
          tone={counts.down ? "critical" : undefined}
        />
        <Stat label="Requests per minute" loading={!fleet.metrics && !fleet.loaded} value={num(totalRpm, totalRpm < 10 ? 1 : 0)} sub="Whole fleet, last 5 minutes" icon={<Activity size={16} />} />
        <Stat label="STT response time" loading={!fleet.metrics && !fleet.loaded} value={ms(stt.avg)} sub={`slowest 5%: ${ms(stt.p95)} · last 5 min`} icon={<Clock size={16} />} />
        <Stat label="TTS response time" loading={!fleet.metrics && !fleet.loaded} value={ms(tts.avg)} sub={`slowest 5%: ${ms(tts.p95)} · last 5 min`} icon={<Clock size={16} />} />
      </div>

      {/* Filters: one row above the list they scope. Status chips double as counts. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a GPU (name or IP)" aria-label="Find a GPU" className={cx(inputClass, "pl-9 w-56")} />
        </div>
        <Segmented label="Role" value={role} onChange={setRole} options={[{ value: "all", label: "All" }, { value: "stt", label: "STT" }, { value: "tts", label: "TTS" }]} />
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Status">
          {(
            [
              ["all", "All", "neutral"],
              ["down", "Down", "critical"],
              ["peak", "At peak", "warning"],
              ["healthy", "Healthy", "good"],
              ["other", "Draining / other", "info"],
            ] as const
          ).map(([key, label, tone]) => (
            <button
              key={key}
              role="radio"
              aria-checked={status === key}
              onClick={() => setStatus(key)}
              className={cx(
                "h-8 px-2.5 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors",
                status === key ? "bg-panel-3 border-line-strong text-ink" : "border-line text-ink-2 hover:text-ink hover:border-line-strong",
              )}
            >
              {key !== "all" && <Dot tone={tone} pulse={key === "down" && counts.down > 0} />}
              {label}
              <span className={cx("tabular text-[11px]", key === "down" && counts.down ? "text-critical font-semibold" : "text-ink-3")}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort GPUs" className={cx(inputClass, "w-auto h-8 text-[12px]")}>
            <option value="status">Sort: needs attention</option>
            <option value="load">Sort: busiest</option>
            <option value="latency">Sort: slowest</option>
            <option value="name">Sort: name</option>
          </select>
          <Segmented
            label="View"
            value={view}
            onChange={changeView}
            options={[
              { value: "tiles", label: "Tiles" },
              { value: "table", label: "Table" },
            ]}
          />
          <Button size="sm" onClick={() => fleet.refresh()} title="Live values also refresh every 30 s">
            {busy ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
          </Button>
        </div>
      </div>

      {!fleet.loaded ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[196px] rounded-2xl" />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <Empty>No GPUs in the fleet yet. Add one in GPU fleet.</Empty>
      ) : shown.length === 0 ? (
        <Empty>No GPU matches these filters.</Empty>
      ) : view === "tiles" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {shown.map((n, i) => (
            <GpuTile key={n.id} node={n} a={fleet.assessments.get(n.id)} s={summaries[String(n.id)]} index={i} onOpen={() => openGpu(n.id)} />
          ))}
        </div>
      ) : (
        <GpuTable nodes={shown} summaries={summaries} onOpen={openGpu} />
      )}
      <div className="text-[11px] text-ink-3">
        Showing {shown.length} of {nodes.length} GPUs · live values refresh every 30 s
        {fleet.updatedAt ? ` · last check ${timeOnly(new Date(fleet.updatedAt).toISOString())}` : ""}
      </div>

      <Card title="Downtime log" subtitle="Minutes when every health check failed, last 7 days">
        <DowntimeTable metrics={fleet.metrics} nodes={nodes} onOpen={openGpu} />
      </Card>

      {open && (
        // Not keyed by GPU: Prev/Next swap the content without replaying the slide-in.
        <GpuDrawer
          node={open}
          summary={summaries[String(open.id)]}
          metrics24={fleet.metrics}
          checkedAt={fleet.updatedAt}
          now={now}
          position={at >= 0 ? `${at + 1} of ${list.length}` : undefined}
          onPrev={prev ? () => openGpu(prev.id) : undefined}
          onNext={next ? () => openGpu(next.id) : undefined}
          onClose={() => navigate({ page: "gpus" })}
        />
      )}
    </div>
  );
}

function Dot({ tone, pulse = false }: { tone: "critical" | "warning" | "good" | "info" | "neutral"; pulse?: boolean }) {
  const bg = { critical: "bg-critical", warning: "bg-warning", good: "bg-good", info: "bg-series-1", neutral: "bg-ink-3" }[tone];
  return <span aria-hidden="true" className={cx("w-2 h-2 rounded-full shrink-0", bg, pulse && "pulse-critical")} />;
}

const STATUS_TONE: Record<NodeStatus, "critical" | "warning" | "good" | "info" | "neutral"> = {
  down: "critical",
  failed: "critical",
  peak: "warning",
  healthy: "good",
  draining: "info",
  pending: "warning",
  unknown: "neutral",
};

function MiniBar({ label, value }: { label: string; value: number | null }) {
  const v = value == null ? null : Math.max(0, Math.min(1, value));
  const color = v == null ? "transparent" : v >= 0.9 ? "var(--critical)" : v >= 0.75 ? "var(--warning)" : "var(--accent)";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-8 text-ink-3">{label}</span>
      <span className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(v ?? 0) * 100}%`, background: color }} />
      </span>
      <span className="w-8 text-right text-ink-2 tabular">{v == null ? "–" : `${Math.round(v * 100)}%`}</span>
    </div>
  );
}

function GpuTile({ node, a, s, index, onOpen }: { node: FleetNode; a?: Assessment; s?: NodeSummary; index: number; onOpen: () => void }) {
  const h = node.health;
  const st = a?.status ?? "unknown";
  const down = a?.level === "down";
  const rpm = s?.requests_5m != null ? s.requests_5m / 5 : null;
  return (
    <button
      onClick={onOpen}
      // Tiles rise in one after another (capped so 50 GPUs don't take long).
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
      className={cx(
        "rise-in text-left bg-panel border rounded-2xl p-4 min-w-0 transition-[border-color,transform,background-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent",
        down ? "border-critical/50 bg-critical/[0.05] hover:border-critical" : a?.level === "peak" ? "border-warning/40 hover:border-warning/70" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <Dot tone={STATUS_TONE[st]} pulse={down} />
          <span className="text-[14px] font-semibold text-ink truncate">{node.name}</span>
        </span>
        <span className={cx("text-[10px] font-mono font-semibold", node.role === "stt" ? "text-series-1" : "text-serious")}>{node.role.toUpperCase()}</span>
      </div>
      <div className="text-[12px] text-ink-3 font-mono truncate mt-1">
        {node.host}
        {h?.gpu ? ` · ${h.gpu.replace("NVIDIA ", "").replace("RTX ", "")}` : ""}
      </div>
      <div className={cx("text-[12px] mt-2 h-4 truncate", down ? "text-critical" : a?.level === "peak" ? "text-warning" : "text-ink-3")}>
        {a?.reasons[0] ?? (st === "draining" ? "Draining · takes no calls" : st === "pending" ? "Deploying…" : st === "healthy" ? "Healthy" : "No data yet")}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <TileFigure label="Load" value={a?.load != null ? pct(a.load) : "–"} warn={(a?.load ?? 0) >= PEAK.loadRatio} />
        <TileFigure label="p95" value={ms(s?.p95_ms_5m)} warn={s?.p95_ms_5m != null && s.p95_ms_5m > PEAK.p95Ms[node.role]} />
        <TileFigure label="req/min" value={rpm == null ? "–" : num(rpm, rpm < 10 ? 1 : 0)} />
      </div>
      <div className="mt-4 space-y-1.5">
        <MiniBar label="GPU" value={ratio(h?.vram_mb, h?.vram_total_mb)} />
        <MiniBar label="CPU" value={h?.host?.cpu_pct != null ? h.host.cpu_pct / 100 : null} />
        <MiniBar label="RAM" value={ratio(h?.host?.ram_used_mb, h?.host?.ram_total_mb)} />
      </div>
    </button>
  );
}

function TileFigure({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={cx("text-[16px] font-semibold tabular truncate", warn ? "text-warning" : "text-ink")}>{value}</div>
    </div>
  );
}

function GpuTable({ nodes, summaries, onOpen }: { nodes: FleetNode[]; summaries: Record<string, NodeSummary>; onOpen: (id: number) => void }) {
  const { assessments } = useFleet();
  return (
    <div className="bg-panel border border-line rounded-2xl overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-[12px] min-w-[960px]">
          <thead className="bg-panel-2 text-ink-3 text-left">
            <tr>
              {["GPU", "Status", "Load", "req/min", "Avg · 5 min", "p95 · 5 min", "GPU mem", "CPU", "RAM", "Up 24 h", "Running"].map((h, i) => (
                <th key={h} className={cx("px-3 py-2.5 font-medium whitespace-nowrap", i > 1 && "text-right")}>{h}</th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="tabular">
            {nodes.map((n) => {
              const a = assessments.get(n.id);
              const s = summaries[String(n.id)];
              const h = n.health;
              const rpm = s?.requests_5m != null ? s.requests_5m / 5 : null;
              const cell = (v: number | null, warnAt = 0.75, critAt = 0.9) => (
                <span className={cx(v == null ? "text-ink-3" : v >= critAt ? "text-critical" : v >= warnAt ? "text-warning" : "text-ink")}>{v == null ? "–" : pct(v)}</span>
              );
              return (
                <tr
                  key={n.id}
                  tabIndex={0}
                  onClick={() => onOpen(n.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(n.id)}
                  className={cx(
                    "border-t border-line cursor-pointer hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    a?.level === "down" && "bg-critical/[0.06]",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Dot tone={STATUS_TONE[a?.status ?? "unknown"]} pulse={a?.level === "down"} />
                      <span className="text-ink font-medium">{n.name}</span>
                      <span className={cx("text-[10px] font-mono", n.role === "stt" ? "text-series-1" : "text-serious")}>{n.role.toUpperCase()}</span>
                    </div>
                    <div className="text-[11px] text-ink-3 font-mono pl-4">{n.host}</div>
                  </td>
                  <td className="px-3 py-2.5"><StatusPill status={a?.status ?? "unknown"} /></td>
                  <td className="px-3 py-2.5 text-right">{cell(a?.load ?? null, 0.6, PEAK.loadRatio)}</td>
                  <td className="px-3 py-2.5 text-right text-ink">{rpm == null ? "–" : num(rpm, rpm < 10 ? 1 : 0)}</td>
                  <td className="px-3 py-2.5 text-right text-ink">{ms(s?.avg_ms_5m)}</td>
                  <td className={cx("px-3 py-2.5 text-right", s?.p95_ms_5m != null && s.p95_ms_5m > PEAK.p95Ms[n.role] ? "text-warning" : "text-ink")}>{ms(s?.p95_ms_5m)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(ratio(h?.vram_mb, h?.vram_total_mb), 0.85, PEAK.vram)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(h?.host?.cpu_pct != null ? h.host.cpu_pct / 100 : null)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(ratio(h?.host?.ram_used_mb, h?.host?.ram_total_mb), 0.8, PEAK.ram)}</td>
                  <td className="px-3 py-2.5 text-right text-ink">{pct(s?.uptime_24h, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{h?.uptime_s != null ? duration(h.uptime_s) : "–"}</td>
                  <td className="pr-3 text-ink-3"><ChevronRight size={14} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GpuDrawer({
  node,
  summary,
  metrics24,
  checkedAt,
  now,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  node: FleetNode;
  summary?: NodeSummary;
  metrics24: FleetMetrics | null;
  checkedAt: number | null;
  now: number;
  position?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState<Range>(24);
  const [own, setOwn] = useState<FleetMetrics | null>(null);

  // 24 h comes with the shared fleet data; other ranges are fetched for the panel.
  useEffect(() => {
    if (range === 24) return;
    let live = true;
    const load = (quiet: boolean) =>
      fleetApi<FleetMetrics>(`metrics?hours=${range}`, undefined, quiet).then((m) => live && setOwn(m)).catch(() => {});
    const first = setTimeout(() => load(false), 0);
    const t = setInterval(() => load(true), 60_000);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [range]);
  const metrics = range === 24 ? metrics24 : own?.hours === range ? own : null;

  // ← / → step through GPUs while the panel is open.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [onPrev, onNext]);

  return (
    <Drawer
      title={
        <span className="flex items-center gap-2">
          {node.name}
          <span className={cx("text-[11px] font-mono", node.role === "stt" ? "text-series-1" : "text-serious")}>{node.role.toUpperCase()}</span>
        </span>
      }
      subtitle={position ? `${position} · use ← → to move between GPUs` : undefined}
      onClose={onClose}
      actions={
        <>
          <Button size="sm" variant="ghost" disabled={!onPrev} onClick={onPrev} aria-label="Previous GPU">
            <ChevronRight size={14} className="rotate-180" /> Prev
          </Button>
          <Button size="sm" variant="ghost" disabled={!onNext} onClick={onNext} aria-label="Next GPU">
            Next <ChevronRight size={14} />
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <NodeCard node={node} summary={summary} series={metrics24?.series[String(node.id)] ?? []} bucketMinutes={metrics24?.bucket_minutes ?? 5} checkedAt={checkedAt} now={now} />
        <Card
          title="History"
          subtitle="Times are Sri Lanka time"
          action={
            <Segmented
              label="History range"
              value={range}
              onChange={setRange}
              options={[
                { value: 1, label: "1 h" },
                { value: 6, label: "6 h" },
                { value: 24, label: "24 h" },
                { value: 168, label: "7 d" },
              ]}
            />
          }
        >
          {metrics ? <NodeHistory node={node} metrics={metrics} now={now} /> : <Skeleton className="h-[440px]" />}
        </Card>
      </div>
    </Drawer>
  );
}

function NodeCard({
  node,
  summary,
  series,
  bucketMinutes,
  checkedAt,
  now,
}: {
  node: FleetNode;
  summary?: NodeSummary;
  series: MetricPoint[];
  bucketMinutes: number;
  checkedAt: number | null;
  now: number;
}) {
  const { assessments } = useFleet();
  const a = assessments.get(node.id);
  const h = node.health;
  const lines = LINES_PER_GPU[node.role];
  const startedAt = h?.uptime_s != null && checkedAt ? new Date(checkedAt - h.uptime_s * 1000).toISOString() : null;
  const rpm = summary?.requests_5m != null ? summary.requests_5m / 5 : null;

  // Last 24 h as status ticks (1 per bucket).
  const strip = useMemo(() => {
    const byT = new Map(series.map((p) => [new Date(p.t).getTime(), p]));
    const step = bucketMinutes * 60_000;
    const origin = Date.UTC(2000, 0, 1);
    const end = origin + Math.floor((now - origin) / step) * step;
    const count = Math.min(96, Math.round((24 * 60) / bucketMinutes));
    const pts: (number | null)[] = [];
    const labels: string[] = [];
    // Group buckets so the strip has at most 96 ticks.
    const group = Math.max(1, Math.round((24 * 60) / bucketMinutes / count));
    for (let i = count - 1; i >= 0; i--) {
      let checks = 0;
      let ok = 0;
      for (let g = 0; g < group; g++) {
        const p = byT.get(end - (i * group + g) * step);
        if (p) {
          checks += p.checks;
          ok += p.ok_checks;
        }
      }
      pts.push(checks ? ok / checks : null);
      labels.push(dateTime(new Date(end - i * group * step).toISOString()));
    }
    return { pts, labels };
  }, [series, bucketMinutes, now]);

  const isDown = a?.level === "down";
  return (
    <article
      className={cx(
        "bg-panel border rounded-2xl p-5 space-y-4 transition-colors min-w-0",
        isDown ? "border-critical/50 bg-critical/[0.04]" : a?.level === "peak" ? "border-warning/40" : "border-line",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={a?.status ?? "unknown"} />
            {node.state === "draining" && a?.status !== "draining" && <Badge tone="info">Draining</Badge>}
          </div>
          <div className="text-[12px] text-ink-3 font-mono mt-1">
            {node.host}
            {h?.gpu ? ` · ${h.gpu.replace("NVIDIA ", "")}` : ""}
          </div>
        </div>
      </header>

      {a && a.reasons.length > 0 && (
        <div className={cx("rounded-xl p-3 text-[12px] flex gap-2", isDown ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning")}>
          {isDown ? <AlertOctagon size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
          <span>{a.reasons.join(" · ")}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Running since" value={startedAt ? duration(h!.uptime_s) : isDown ? "Down" : "–"} />
        <MiniStat label="Requests / min" value={rpm == null ? "–" : num(rpm, rpm < 10 ? 1 : 0)} />
        <MiniStat
          label={`At once (of ~${lines})`}
          value={summary?.peak_inflight_5m != null ? `${summary.peak_inflight_5m} · ${pct(a?.load ?? 0)}` : "–"}
          tone={(a?.load ?? 0) >= PEAK.loadRatio ? "warning" : undefined}
        />
        <MiniStat label="Waiting now" value={h?.queue_depth ?? "–"} tone={(h?.queue_depth ?? 0) >= PEAK.queue ? "warning" : undefined} />
      </div>
      {startedAt && <div className="text-[11px] text-ink-3 -mt-2">Started {dateTime(startedAt)} · last checked {checkedAt ? timeOnly(new Date(checkedAt).toISOString()) : "–"}</div>}

      <div>
        <div className="text-[12px] text-ink-2 mb-2">Response time (as callers feel it)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Average · 5 min" value={ms(summary?.avg_ms_5m)} />
          <MiniStat
            label="Slowest 5% · 5 min"
            value={ms(summary?.p95_ms_5m)}
            tone={summary?.p95_ms_5m != null && summary.p95_ms_5m > PEAK.p95Ms[node.role] ? "warning" : undefined}
          />
          <MiniStat label="Average · 1 h" value={ms(summary?.avg_ms_1h)} />
          <MiniStat label="Slowest 5% · 1 h" value={ms(summary?.p95_ms_1h)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Meter
          value={h?.vram_mb}
          max={h?.vram_total_mb}
          warnAt={0.85}
          critAt={PEAK.vram}
          label={<span className="inline-flex items-center gap-1.5"><Cpu size={12} /> GPU memory</span>}
          detail={h?.vram_mb != null && h.vram_total_mb ? `${mb(h.vram_mb)} / ${mb(h.vram_total_mb)}` : "–"}
        />
        <Meter
          value={h?.host?.cpu_pct ?? null}
          max={100}
          warnAt={0.75}
          critAt={PEAK.cpu}
          label="CPU"
          detail={h?.host?.cpu_pct != null ? `${Math.round(h.host.cpu_pct)}%${h.host.cpu_count ? ` of ${h.host.cpu_count} cores` : ""}` : "–"}
        />
        <Meter
          value={h?.host?.ram_used_mb ?? null}
          max={h?.host?.ram_total_mb ?? null}
          warnAt={0.8}
          critAt={PEAK.ram}
          label="RAM"
          detail={h?.host?.ram_used_mb != null ? `${mb(h.host.ram_used_mb)} / ${mb(h.host.ram_total_mb)}` : "–"}
        />
      </div>
      {h?.ok && !h.host && (
        <p className="text-[11px] text-ink-3 -mt-2">
          {node.managed
            ? "CPU and RAM appear after this GPU is redeployed in GPU fleet (that adds the stats helper)."
            : "CPU and RAM need the fleet's stats helper; this GPU was set up by hand, so install it once."}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
        <Info label="Model" value={h?.model?.split("/").pop()} />
        <Info label={node.role === "stt" ? "Engine" : "Voice"} value={node.role === "stt" ? (h?.ok ? (h.backend ?? "transformers") : undefined) : h?.voice} />
        <Info label="Served since start" value={h?.stats?.submitted != null ? `${num(h.stats.submitted)} (${num(h.stats.errors ?? 0)} errors)` : undefined} />
        <Info label="GPU time / batch" value={h?.stats?.avg_gpu_ms != null ? `${ms(h.stats.avg_gpu_ms)} · ×${h.stats.avg_batch_size ?? 1}` : undefined} />
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[12px] mb-2">
          <span className="text-ink-2">Health, last 24 h</span>
          <span className="text-ink-3 tabular">
            uptime 24 h <span className="text-ink">{pct(summary?.uptime_24h, 1)}</span> · 7 d <span className="text-ink">{pct(summary?.uptime_7d, 1)}</span>
          </span>
        </div>
        <StatusStrip points={strip.pts} labels={strip.labels} />
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="text-ink truncate" title={value ?? undefined}>{value || "–"}</div>
    </div>
  );
}

function NodeHistory({ node, metrics, now }: { node: FleetNode; metrics: FleetMetrics; now: number }) {
  const step = metrics.bucket_minutes * 60_000;
  const origin = Date.UTC(2000, 0, 1);
  const end = origin + Math.floor((now - origin) / step) * step;
  const count = Math.round((metrics.hours * 60) / metrics.bucket_minutes);
  const times = Array.from({ length: count }, (_, i) => end - (count - 1 - i) * step);
  const byT = new Map((metrics.series[String(node.id)] ?? []).map((p) => [new Date(p.t).getTime(), p]));
  const pts = times.map((t) => byT.get(t) ?? null);
  const short = (t: number) =>
    metrics.hours > 24 ? dateTime(new Date(t).toISOString()).replace(/,.*$/, "") : timeOnly(new Date(t).toISOString());
  const labels = times.map(short);
  const full = times.map((t) => dateTime(new Date(t).toISOString()));
  const vramTotal = node.health?.vram_total_mb ?? null;
  const ramTotal = node.health?.host?.ram_total_mb ?? null;
  const per = metrics.bucket_minutes === 1 ? "per minute" : `per ${metrics.bucket_minutes} min`;
  const hasData = pts.some(Boolean);

  if (!hasData) return <Empty>No history for this GPU in this range yet. The gateway records a sample every minute.</Empty>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <div className="text-[13px] text-ink mb-1">Response time</div>
        <div className="text-[11px] text-ink-3 mb-3">Average and slowest 5% of requests</div>
        <LineChart
          labels={labels}
          tooltipLabels={full}
          series={[
            { key: "avg", label: "Average", color: "var(--series-1)", values: pts.map((p) => p?.avg_ms ?? null) },
            { key: "p95", label: "Slowest 5%", color: "var(--series-2)", values: pts.map((p) => p?.p95_ms ?? null) },
          ]}
          format={(v) => ms(v)}
        />
      </div>
      <div>
        <div className="text-[13px] text-ink mb-1">Traffic</div>
        <div className="text-[11px] text-ink-3 mb-3">Requests {per}</div>
        <ColumnChart
          labels={labels}
          tooltipLabels={full}
          series={[{ key: "req", label: "Requests", color: "var(--series-1)", values: pts.map((p) => p?.requests ?? 0) }]}
          format={(v) => num(v)}
          height={200}
        />
      </div>
      <div>
        <div className="text-[13px] text-ink mb-1">Load</div>
        <div className="text-[11px] text-ink-3 mb-3">Most requests at once, and the most waiting in the queue (carries ~{LINES_PER_GPU[node.role]})</div>
        <LineChart
          labels={labels}
          tooltipLabels={full}
          series={[
            { key: "inflight", label: "At once", color: "var(--series-1)", values: pts.map((p) => (p ? p.peak_inflight : null)) },
            { key: "queue", label: "Waiting", color: "var(--series-2)", values: pts.map((p) => (p ? p.max_queue : null)) },
          ]}
          format={(v) => num(v, v < 10 && v % 1 ? 1 : 0)}
        />
      </div>
      <div>
        <div className="text-[13px] text-ink mb-1">Resources</div>
        <div className="text-[11px] text-ink-3 mb-3">GPU memory, CPU and RAM, % of the total</div>
        <LineChart
          labels={labels}
          tooltipLabels={full}
          yMax={100}
          series={[
            { key: "vram", label: "GPU memory", color: "var(--series-1)", values: pts.map((p) => (p?.vram_used_mb != null && vramTotal ? (p.vram_used_mb / vramTotal) * 100 : null)) },
            { key: "cpu", label: "CPU", color: "var(--series-2)", values: pts.map((p) => p?.cpu_pct ?? null) },
            { key: "ram", label: "RAM", color: "var(--series-3)", values: pts.map((p) => (p?.ram_used_mb != null && ramTotal ? (p.ram_used_mb / ramTotal) * 100 : null)) },
          ]}
          format={(v) => `${Math.round(v)}%`}
        />
      </div>
    </div>
  );
}

function DowntimeTable({ metrics, nodes, onOpen }: { metrics: FleetMetrics | null; nodes: FleetNode[]; onOpen: (id: number) => void }) {
  const [all, setAll] = useState(false);
  if (!metrics) return <Empty>No history yet.</Empty>;
  const names = new Map([...metrics.nodes, ...nodes].map((n) => [n.id, n.name]));
  if (metrics.downtime.length === 0) return <Empty>No downtime in the last 7 days.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-ink-3 border-b border-line">
            <th className="py-2 pr-3 font-medium">GPU</th>
            <th className="py-2 pr-3 font-medium">Went down</th>
            <th className="py-2 pr-3 font-medium">Came back</th>
            <th className="py-2 font-medium text-right">For</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {(all ? metrics.downtime : metrics.downtime.slice(0, 8)).map((d) => (
            <tr key={`${d.node_id}-${d.started_at}`} className={cx("border-b border-line last:border-0", d.ongoing && "bg-critical/[0.06]")}>
              <td className="py-2.5 pr-3">
                {nodes.some((n) => n.id === d.node_id) ? (
                  <button onClick={() => onOpen(d.node_id)} className="text-ink hover:text-accent transition-colors">{names.get(d.node_id)}</button>
                ) : (
                  <span className="text-ink-2">{names.get(d.node_id) ?? `node #${d.node_id}`} (removed)</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-ink-2">{dateTime(d.started_at)}</td>
              <td className="py-2.5 pr-3">{d.ongoing ? <Badge tone="critical"><AlertOctagon size={11} /> Still down</Badge> : <span className="text-ink-2">{dateTime(d.ended_at)}</span>}</td>
              <td className="py-2.5 text-right text-ink">{duration(d.minutes * 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {metrics.downtime.length > 8 && (
        <div className="pt-3">
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${metrics.downtime.length}`}
          </Button>
        </div>
      )}
    </div>
  );
}
