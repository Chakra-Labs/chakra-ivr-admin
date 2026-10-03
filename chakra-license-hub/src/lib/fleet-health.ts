// When is a GPU "down" or "at peak"? One place, so the header bell, the
// dashboard and the GPU tab always agree. Tune the thresholds here.
import { LINES_PER_GPU } from "./packages";
import type { Capacity, FleetNode, NodeSummary } from "./types";

export const PEAK = {
  /** Most requests in flight at once (last 5 min) vs the lines one GPU carries. */
  loadRatio: 0.8,
  /** Requests waiting behind the one being processed, right now. */
  queue: 3,
  /** Slowest 5% of requests (last 5 min), as callers feel it. */
  p95Ms: { stt: 1500, tts: 4000 },
  /** Share of failed requests in the last 5 min (only with enough traffic). */
  errorRate: 0.05,
  minRequests: 5,
  vram: 0.92,
  cpu: 0.9,
  ram: 0.9,
};

export type NodeStatus = "healthy" | "down" | "peak" | "draining" | "pending" | "failed" | "unknown";

export interface Assessment {
  status: NodeStatus;
  level: "down" | "peak" | null;
  reasons: string[];
  /** Peak in-flight (5 min) / lines one GPU carries. */
  load: number | null;
}

export function assess(node: FleetNode, summary: NodeSummary | undefined, capacity?: Capacity | null): Assessment {
  if (node.state === "pending" || node.state === "deploying") return { status: "pending", level: null, reasons: [], load: null };
  if (node.state === "failed") {
    return { status: "failed", level: "down", reasons: [node.last_error || "Last deployment failed"], load: null };
  }
  const h = node.health;
  if (h == null) return { status: "unknown", level: null, reasons: [], load: null };
  if (!h.ok) {
    return {
      status: "down",
      level: "down",
      reasons: [h.error ? shortError(h.error) : h.status === "loading" ? "Models still loading" : "Not responding to health checks"],
      load: null,
    };
  }
  const lines = capacity?.node_capacity?.[node.role] ?? LINES_PER_GPU[node.role];
  const load = summary?.peak_inflight_5m != null ? summary.peak_inflight_5m / lines : null;
  if (node.state === "draining") return { status: "draining", level: null, reasons: [], load };

  const reasons: string[] = [];
  if (load != null && load >= PEAK.loadRatio) reasons.push(`Load ${Math.round(load * 100)}% (${summary!.peak_inflight_5m} at once, carries ~${lines})`);
  if ((h.queue_depth ?? 0) >= PEAK.queue) reasons.push(`${h.queue_depth} requests waiting`);
  const p95 = summary?.p95_ms_5m;
  if (p95 != null && p95 > PEAK.p95Ms[node.role]) reasons.push(`Slow: p95 ${(p95 / 1000).toFixed(1)} s`);
  const reqs = summary?.requests_5m ?? 0;
  const errs = summary?.errors_5m ?? 0;
  if (reqs >= PEAK.minRequests && errs / reqs >= PEAK.errorRate) reasons.push(`${Math.round((errs / reqs) * 100)}% of requests failing`);
  if (h.vram_mb != null && h.vram_total_mb && h.vram_mb / h.vram_total_mb >= PEAK.vram) reasons.push(`GPU memory ${Math.round((h.vram_mb / h.vram_total_mb) * 100)}%`);
  if (h.host?.cpu_pct != null && h.host.cpu_pct / 100 >= PEAK.cpu) reasons.push(`CPU ${Math.round(h.host.cpu_pct)}%`);
  if (h.host?.ram_used_mb != null && h.host.ram_total_mb && h.host.ram_used_mb / h.host.ram_total_mb >= PEAK.ram) {
    reasons.push(`RAM ${Math.round((h.host.ram_used_mb / h.host.ram_total_mb) * 100)}%`);
  }
  return reasons.length ? { status: "peak", level: "peak", reasons, load } : { status: "healthy", level: null, reasons: [], load };
}

function shortError(e: string): string {
  if (/ConnectError|Connection refused|connect/i.test(e)) return "Cannot connect (server off or unreachable)";
  if (/Timeout/i.test(e)) return "Health check timed out";
  if (/SSL|certificate/i.test(e)) return "TLS certificate problem";
  return e.length > 90 ? `${e.slice(0, 90)}…` : e;
}

// Hourly price per GPU type (Hyperstack, Oct 2026). Unknown GPUs use the A4000 price.
export const GPU_HOURLY_USD: { match: RegExp; price: number; label: string }[] = [
  { match: /A6000/i, price: 0.5, label: "RTX A6000" },
  { match: /A4000/i, price: 0.15, label: "RTX A4000" },
];
export const DEFAULT_GPU_HOURLY_USD = 0.15;

export function gpuPrice(gpuName?: string | null): { price: number; label: string; known: boolean } {
  const hit = GPU_HOURLY_USD.find((g) => gpuName && g.match.test(gpuName));
  return hit ? { price: hit.price, label: hit.label, known: true } : { price: DEFAULT_GPU_HOURLY_USD, label: gpuName || "Unknown GPU", known: false };
}
