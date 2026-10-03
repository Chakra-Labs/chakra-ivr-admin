"use client";

// GPU performance: one card per GPU (health, running since, live traffic,
// latency, memory/CPU/RAM, uptime) plus 1 h – 7 d charts and the downtime log.
// Live numbers come from the controller's health probe; history from the
// gateway's per-minute metrics (fleet_node_metrics).
import { useEffect, useMemo, useState } from "react";

import { ColumnChart, LineChart, StatusStrip } from "./charts";
import { fleetApi, useFleet } from "./fleet-context";
import { useHub } from "./hub-context";
import { Activity, AlertOctagon, AlertTriangle, Clock, Cpu, RefreshCw, Server } from "./icons";
import { Badge, Button, Card, Empty, ErrorBanner, Meter, MiniStat, Segmented, Stat, StatusPill, cx } from "./ui";
import { PEAK } from "@/lib/fleet-health";
import { dateTime, duration, mb, ms, num, pct, timeOnly } from "@/lib/format";
import { LINES_PER_GPU } from "@/lib/packages";
import type { FleetMetrics, FleetNode, MetricPoint, NodeSummary } from "@/lib/types";

type Range = 1 | 6 | 24 | 168;

export default function GpuPage() {
  const fleet = useFleet();
  const { now } = useHub();
  const [range, setRange] = useState<Range>(24);
  const [own, setOwn] = useState<FleetMetrics | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // 24 h comes with the shared fleet data; other ranges are fetched here.
  useEffect(() => {
    if (range === 24) return;
    let live = true;
    const load = () => fleetApi<FleetMetrics>(`metrics?hours=${range}`).then((m) => live && setOwn(m)).catch(() => {});
    const first = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [range]);

  const metrics = range === 24 ? fleet.metrics : own?.hours === range ? own : null;
  const summaries = fleet.metrics?.summary ?? {};
  const nodes = fleet.nodes;
  const current = nodes.find((n) => n.id === selected) ?? nodes[0];

  const totalRpm = Object.values(summaries).reduce((a, s) => a + (s.requests_5m ?? 0), 0) / 5;
  const latency = (role: "stt" | "tts") => {
    const ss = nodes.filter((n) => n.role === role).map((n) => summaries[String(n.id)]).filter(Boolean) as NodeSummary[];
    const reqs = ss.reduce((a, s) => a + (s.requests_5m ?? 0), 0);
    const avg = reqs ? ss.reduce((a, s) => a + (s.avg_ms_5m ?? 0) * (s.requests_5m ?? 0), 0) / reqs : null;
    const p95 = ss.reduce<number | null>((a, s) => (s.p95_ms_5m == null ? a : Math.max(a ?? 0, s.p95_ms_5m)), null);
    return { avg, p95 };
  };
  const stt = latency("stt");
  const tts = latency("tts");
  const healthy = nodes.filter((n) => ["healthy", "peak"].includes(fleet.assessments.get(n.id)?.status ?? "")).length;
  const down = fleet.alerts.filter((a) => a.assessment.level === "down").length;

  return (
    <div className="space-y-5">
      <ErrorBanner message={fleet.error ? `Fleet controller: ${fleet.error}` : ""} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label="GPUs healthy"
          value={fleet.loaded ? `${healthy} / ${nodes.length}` : "–"}
          sub={down ? `${down} down` : "All responding"}
          icon={<Server size={16} />}
          tone={down ? "critical" : undefined}
        />
        <Stat label="Requests per minute" value={num(totalRpm, totalRpm < 10 ? 1 : 0)} sub="Average over the last 5 minutes" icon={<Activity size={16} />} />
        <Stat label="STT response time" value={ms(stt.avg)} sub={`slowest 5%: ${ms(stt.p95)} · last 5 min`} icon={<Clock size={16} />} />
        <Stat label="TTS response time" value={ms(tts.avg)} sub={`slowest 5%: ${ms(tts.p95)} · last 5 min`} icon={<Clock size={16} />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-ink-3">
          Live values refresh every 30 s{fleet.updatedAt ? ` · last check ${timeOnly(new Date(fleet.updatedAt).toISOString())}` : ""}
        </div>
        <Button size="sm" onClick={() => fleet.refresh()}>
          <RefreshCw size={13} /> Refresh now
        </Button>
      </div>

      {!fleet.loaded ? (
        <Empty>Checking the GPUs…</Empty>
      ) : nodes.length === 0 ? (
        <Empty>No GPUs in the fleet yet. Add one in GPU fleet.</Empty>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          {nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              summary={summaries[String(n.id)]}
              series={fleet.metrics?.series[String(n.id)] ?? []}
              bucketMinutes={fleet.metrics?.bucket_minutes ?? 5}
              checkedAt={fleet.updatedAt}
              now={now}
              selected={current?.id === n.id}
              onSelect={() => setSelected(n.id)}
            />
          ))}
        </div>
      )}

      {current && (
        <Card
          title={`History · ${current.name}`}
          subtitle="Pick a GPU above to switch. Times are Sri Lanka time."
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
          {metrics ? <NodeHistory node={current} metrics={metrics} now={now} /> : <Empty>Loading history…</Empty>}
        </Card>
      )}

      <Card title="Downtime log" subtitle="Minutes when every health check failed, last 7 days">
        <DowntimeTable metrics={fleet.metrics} nodes={nodes} />
      </Card>
    </div>
  );
}

function NodeCard({
  node,
  summary,
  series,
  bucketMinutes,
  checkedAt,
  now,
  selected,
  onSelect,
}: {
  node: FleetNode;
  summary?: NodeSummary;
  series: MetricPoint[];
  bucketMinutes: number;
  checkedAt: number | null;
  now: number;
  selected: boolean;
  onSelect: () => void;
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
        isDown ? "border-critical/50 bg-critical/[0.04]" : a?.level === "peak" ? "border-warning/40" : selected ? "border-line-strong" : "border-line",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-ink">{node.name}</h3>
            <Badge tone={node.role === "stt" ? "info" : "serious"}>{node.role.toUpperCase()}</Badge>
            <StatusPill status={a?.status ?? "unknown"} />
            {node.state === "draining" && a?.status !== "draining" && <Badge tone="info">Draining</Badge>}
          </div>
          <div className="text-[12px] text-ink-3 font-mono mt-1">
            {node.host}
            {h?.gpu ? ` · ${h.gpu.replace("NVIDIA ", "")}` : ""}
          </div>
        </div>
        <Button size="sm" variant={selected ? "secondary" : "ghost"} onClick={onSelect}>
          {selected ? "Showing history" : "Show history"}
        </Button>
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
      {h?.ok && !h.host && <p className="text-[11px] text-ink-3 -mt-2">CPU and RAM appear once this GPU runs the updated speech image.</p>}

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

function DowntimeTable({ metrics, nodes }: { metrics: FleetMetrics | null; nodes: FleetNode[] }) {
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
          {metrics.downtime.map((d) => (
            <tr key={`${d.node_id}-${d.started_at}`} className={cx("border-b border-line last:border-0", d.ongoing && "bg-critical/[0.06]")}>
              <td className="py-2.5 pr-3 text-ink">{names.get(d.node_id) ?? `node #${d.node_id}`}</td>
              <td className="py-2.5 pr-3 text-ink-2">{dateTime(d.started_at)}</td>
              <td className="py-2.5 pr-3">{d.ongoing ? <Badge tone="critical"><AlertOctagon size={11} /> Still down</Badge> : <span className="text-ink-2">{dateTime(d.ended_at)}</span>}</td>
              <td className="py-2.5 text-right text-ink">{duration(d.minutes * 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
