"use client";

// GPU Fleet tab: what the speech fleet needs (from active licences), what it has,
// and the controls to add, redeploy, drain and remove GPU nodes. Everything goes
// through /api/fleet/*, which forwards to the fleet controller server-side.
import { useCallback, useEffect, useRef, useState } from "react";

import { Check, Copy, Plus, Zap } from "./icons";

type Health = { ok: boolean; queue_depth?: number; avg_gpu_ms?: number; vram_mb?: number; error?: string } | null;

type FleetNode = {
  id: number;
  name: string;
  role: "stt" | "tts";
  host: string;
  managed: boolean;
  state: string;
  image: string | null;
  last_error: string | null;
  updated_at: string;
  health?: Health;
};

type Capacity = {
  active_licenses: number;
  total_lines: number;
  required: { stt: number; tts: number };
  active: { stt: number; tts: number };
  deploying: { stt: number; tts: number };
  missing: { stt: number; tts: number };
  lines_supported: number;
  unknown_packages: string[];
};

type Deployment = {
  id: number;
  node_id: number;
  action: string;
  status: "running" | "succeeded" | "failed";
  log: string;
  steps: string[];
  started_at: string;
  finished_at: string | null;
};

type UsageRow = {
  license_id: number;
  company_name: string | null;
  package_name: string | null;
  stt_requests: number;
  stt_minutes: string;
  tts_requests: number;
  tts_minutes: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/fleet/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const card = "bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl";
const input =
  "px-4 py-2.5 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-zinc-200 placeholder-zinc-600 text-[13px]";
const smallBtn =
  "px-2.5 py-1 rounded-lg text-[11px] font-medium border border-white/10 text-zinc-300 hover:bg-white/5 disabled:opacity-40 transition-colors";

const STATE_STYLE: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  deploying: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  pending: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  draining: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  failed: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function FleetPage() {
  const [nodes, setNodes] = useState<FleetNode[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [sshKey, setSshKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ host: "", role: "tts" as "stt" | "tts", name: "" });
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [n, c] = await Promise.all([
        api<FleetNode[]>("nodes?health=true"),
        api<Capacity>("capacity"),
      ]);
      setNodes(n);
      setCapacity(c);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 10_000);
    api<UsageRow[]>("usage?days=30").then(setUsage).catch(() => {});
    api<{ public_key: string }>("ssh-public-key").then((r) => setSshKey(r.public_key)).catch(() => {});
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  // Follow a running deployment's log.
  useEffect(() => {
    if (!deployment || deployment.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const d = await api<Deployment>(`deployments/${deployment.id}`);
        setDeployment(d);
        if (d.status !== "running") refresh();
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [deployment, refresh]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [deployment?.log]);

  const openDeployment = async (id: number) => {
    try {
      setDeployment(await api<Deployment>(`deployments/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const latestDeployment = async (nodeId: number) => {
    try {
      const list = await api<{ id: number }[]>(`deployments?node_id=${nodeId}&limit=1`);
      if (list[0]) await openDeployment(list[0].id);
      else setError("No deployments for this node yet.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addNode = async () => {
    if (!form.host.trim()) {
      setError("Enter the GPU's public IP address.");
      return;
    }
    setBusy("add");
    try {
      const r = await api<{ node: FleetNode; deployment_id: number | null }>("nodes", {
        method: "POST",
        body: JSON.stringify({ host: form.host.trim(), role: form.role, name: form.name.trim() || null, deploy: true }),
      });
      setForm({ host: "", role: form.role, name: "" });
      await refresh();
      if (r.deployment_id) await openDeployment(r.deployment_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const nodeAction = async (node: FleetNode, action: "preflight" | "deploy" | "drain" | "activate") => {
    setBusy(node.id);
    try {
      const r = await api<{ deployment_id?: number }>(`nodes/${node.id}/${action}`, { method: "POST", body: "{}" });
      await refresh();
      if (r.deployment_id) await openDeployment(r.deployment_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeNode = async (node: FleetNode) => {
    if (confirmRemove !== node.id) {
      setConfirmRemove(node.id);
      setTimeout(() => setConfirmRemove((c) => (c === node.id ? null : c)), 4000);
      return;
    }
    setConfirmRemove(null);
    setBusy(node.id);
    try {
      const r = await api<{ deployment_id?: number }>(`nodes/${node.id}?teardown=${node.managed}`, { method: "DELETE" });
      await refresh();
      if (r.deployment_id) await openDeployment(r.deployment_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(sshKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-5 mt-2">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] flex justify-between gap-4">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-300 hover:text-white">
            <Plus className="rotate-45" size={14} />
          </button>
        </div>
      )}

      {/* Capacity */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {(["stt", "tts"] as const).map((role) => (
          <div key={role} className={card}>
            <div className="text-[13px] font-medium text-zinc-400 mb-3">{role.toUpperCase()} GPUs</div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-bold text-zinc-100 leading-none">{capacity?.active[role] ?? "–"}</span>
              <span className="text-zinc-500 text-[14px]">/ {capacity?.required[role] ?? "–"} needed</span>
            </div>
            <div className="text-[12px] mt-2">
              {capacity && capacity.missing[role] > 0 ? (
                <span className="text-amber-300">
                  {capacity.missing[role]} more to buy
                  {capacity.deploying[role] > 0 && ` (${capacity.deploying[role]} deploying)`}
                </span>
              ) : (
                <span className="text-emerald-400">{capacity ? "enough" : ""}</span>
              )}
            </div>
          </div>
        ))}
        <div className={card}>
          <div className="text-[13px] font-medium text-zinc-400 mb-3">Lines sold</div>
          <div className="text-[32px] font-bold text-zinc-100 leading-none">{capacity?.total_lines ?? "–"}</div>
          <div className="text-[12px] text-zinc-500 mt-2">{capacity?.active_licenses ?? 0} active licences</div>
        </div>
        <div className={card}>
          <div className="text-[13px] font-medium text-zinc-400 mb-3">Lines the fleet carries</div>
          <div
            className={`text-[32px] font-bold leading-none ${
              capacity && capacity.lines_supported < capacity.total_lines ? "text-amber-300" : "text-zinc-100"
            }`}
          >
            {capacity?.lines_supported ?? "–"}
          </div>
          <div className="text-[12px] text-zinc-500 mt-2">1 STT ≈ 14 lines · 1 TTS ≈ 7 lines</div>
        </div>
      </div>
      {capacity && capacity.unknown_packages.length > 0 && (
        <div className="text-[12px] text-amber-300/90">
          Licences on unknown packages (counted as 14 lines): {capacity.unknown_packages.join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Add node */}
        <div className={`${card} xl:col-span-5 space-y-4`}>
          <h3 className="font-semibold text-[15px] text-zinc-200">Add a GPU</h3>
          <ol className="text-[12px] text-zinc-500 space-y-1 list-decimal list-inside">
            <li>In Hyperstack, create an RTX A4000 VM with the Chakra fleet SSH key below.</li>
            <li>Open inbound TCP 443 in its firewall.</li>
            <li>Enter its IP and role here. Deploying takes about 15–25 minutes.</li>
          </ol>
          <div className="grid grid-cols-3 gap-3">
            <input
              className={`${input} col-span-2 font-mono`}
              placeholder="Public IP, e.g. 149.36.1.105"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
            <select
              className={input}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "stt" | "tts" })}
            >
              <option value="tts">TTS</option>
              <option value="stt">STT</option>
            </select>
            <input
              className={`${input} col-span-3`}
              placeholder="Name (optional), e.g. tts-oslo-3"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <button
            onClick={addNode}
            disabled={busy === "add"}
            className="w-full py-3 bg-[#00ebfb] hover:bg-[#00ebfb]/90 disabled:opacity-50 text-black rounded-xl font-bold text-[14px] flex items-center justify-center gap-2"
          >
            {busy === "add" ? "Starting…" : <><Zap size={16} /> Add and deploy</>}
          </button>
          <div>
            <div className="text-[12px] font-medium text-zinc-400 mb-1.5">Chakra fleet SSH public key</div>
            <div className="relative group">
              <div className="w-full px-3 py-2.5 pr-10 bg-[#121116] border border-white/5 rounded-xl text-zinc-400 text-[11px] font-mono break-all">
                {sshKey || "unavailable"}
              </div>
              {sshKey && (
                <button onClick={copyKey} title="Copy" className="absolute right-2 top-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Nodes */}
        <div className={`${card} xl:col-span-7`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[15px] text-zinc-200">Nodes</h3>
            <button onClick={refresh} className={smallBtn}>Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                  <th className="py-2 pr-3 font-medium">Node</th>
                  <th className="py-2 pr-3 font-medium">State</th>
                  <th className="py-2 pr-3 font-medium">Health</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="py-6 text-center text-zinc-500">Loading…</td></tr>
                )}
                {!loading && nodes.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-zinc-500">No GPU nodes yet.</td></tr>
                )}
                {nodes.map((n) => (
                  <tr key={n.id} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-3">
                      <div className="text-zinc-200 font-medium flex items-center gap-2">
                        {n.name}
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-zinc-400 font-mono">
                          {n.role.toUpperCase()}
                        </span>
                        {!n.managed && <span className="text-[10px] text-zinc-500">registered</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{n.host}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] border ${STATE_STYLE[n.state] ?? "text-zinc-400 border-white/10"}`}>
                        {n.state}
                      </span>
                      {n.last_error && <div className="text-[11px] text-red-400/80 mt-1 max-w-[220px]">{n.last_error}</div>}
                    </td>
                    <td className="py-3 pr-3 text-[12px]">
                      {n.health == null ? (
                        <span className="text-zinc-600">–</span>
                      ) : n.health.ok ? (
                        <span className="text-emerald-400">
                          ok · queue {n.health.queue_depth ?? 0}
                          {n.health.avg_gpu_ms != null && ` · ${Math.round(n.health.avg_gpu_ms)} ms`}
                        </span>
                      ) : (
                        <span className="text-red-400" title={n.health.error}>down</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {n.managed && (
                          <>
                            <button className={smallBtn} disabled={busy === n.id} onClick={() => nodeAction(n, "preflight")}>Check</button>
                            <button className={smallBtn} disabled={busy === n.id} onClick={() => nodeAction(n, "deploy")}>Redeploy</button>
                            <button className={smallBtn} onClick={() => latestDeployment(n.id)}>Log</button>
                          </>
                        )}
                        {n.state === "active" && (
                          <button className={smallBtn} disabled={busy === n.id} onClick={() => nodeAction(n, "drain")}>Drain</button>
                        )}
                        {n.state === "draining" && (
                          <button className={smallBtn} disabled={busy === n.id} onClick={() => nodeAction(n, "activate")}>Activate</button>
                        )}
                        <button
                          className={`${smallBtn} ${confirmRemove === n.id ? "text-red-300 border-red-500/40 bg-red-500/10" : "text-red-400"}`}
                          disabled={busy === n.id}
                          onClick={() => removeNode(n)}
                        >
                          {confirmRemove === n.id ? "Click to confirm" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Deployment log */}
      {deployment && (
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-zinc-200">
              {deployment.action} · deployment #{deployment.id}{" "}
              <span
                className={`ml-2 text-[12px] ${
                  deployment.status === "succeeded" ? "text-emerald-400" : deployment.status === "failed" ? "text-red-400" : "text-amber-300"
                }`}
              >
                {deployment.status}
              </span>
            </h3>
            <button onClick={() => setDeployment(null)} className="text-zinc-500 hover:text-white">
              <Plus className="rotate-45" size={16} />
            </button>
          </div>
          {deployment.steps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {deployment.steps.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md text-[11px] bg-white/5 border border-white/10 text-zinc-300">
                  {s}
                </span>
              ))}
            </div>
          )}
          <pre ref={logRef} className="max-h-72 overflow-auto bg-black/40 border border-white/5 rounded-xl p-4 text-[11px] leading-relaxed text-zinc-400 font-mono whitespace-pre-wrap">
            {deployment.log || "Starting…"}
          </pre>
        </div>
      )}

      {/* Usage */}
      <div className={card}>
        <h3 className="font-semibold text-[15px] text-zinc-200 mb-4">Speech usage, last 30 days</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Package</th>
                <th className="py-2 pr-3 font-medium text-right">STT min</th>
                <th className="py-2 pr-3 font-medium text-right">TTS min</th>
                <th className="py-2 font-medium text-right">Requests</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No speech usage recorded yet.</td></tr>
              )}
              {usage.map((u) => (
                <tr key={u.license_id} className="border-b border-white/5">
                  <td className="py-2.5 pr-3 text-zinc-200">{u.company_name ?? `licence #${u.license_id}`}</td>
                  <td className="py-2.5 pr-3 text-zinc-400">{u.package_name ?? "–"}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{u.stt_minutes}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{u.tts_minutes}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-zinc-400">
                    {(u.stt_requests + u.tts_requests).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
