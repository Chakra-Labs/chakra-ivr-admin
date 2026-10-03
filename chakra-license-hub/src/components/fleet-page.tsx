"use client";

// GPU Fleet tab: what the speech fleet needs (from active licences), what it has,
// and the controls to add, redeploy, drain and remove GPU nodes. Everything goes
// through /api/fleet/*, which forwards to the fleet controller server-side.
import { useEffect, useRef, useState } from "react";

import { fleetApi, useFleet } from "./fleet-context";
import { Check, Copy, RefreshCw, X, Zap } from "./icons";
import { Badge, Button, Card, Empty, ErrorBanner, StatusPill, cx, inputClass } from "./ui";
import { num } from "@/lib/format";
import type { FleetNode } from "@/lib/types";

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

const STATE_TONE: Record<string, "good" | "warning" | "info" | "critical" | "neutral"> = {
  active: "good",
  deploying: "warning",
  pending: "warning",
  draining: "info",
  failed: "critical",
};

export default function FleetPage() {
  const { nodes, capacity, assessments, loaded, error: fleetError, refresh } = useFleet();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [sshKey, setSshKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ host: "", role: "tts" as "stt" | "tts", name: "" });
  // Optional: the private key a VM was created with, when it is not the Chakra
  // fleet key. Sent once to the controller, which installs the fleet key with
  // it and forgets it. Cleared from the page straight after.
  const [otherKey, setOtherKey] = useState({ open: false, pem: "", passphrase: "" });
  const [rekey, setRekey] = useState<{ node: FleetNode; pem: string; passphrase: string; rebuilt: boolean } | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fleetApi<UsageRow[]>("usage?days=30").then(setUsage).catch(() => {});
    fleetApi<{ public_key: string }>("ssh-public-key").then((r) => setSshKey(r.public_key)).catch(() => {});
  }, []);

  // Follow a running deployment's log.
  useEffect(() => {
    if (!deployment || deployment.status !== "running") return;
    const t = setInterval(async () => {
      try {
        const d = await fleetApi<Deployment>(`deployments/${deployment.id}`);
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
      setDeployment(await fleetApi<Deployment>(`deployments/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const latestDeployment = async (nodeId: number) => {
    try {
      const list = await fleetApi<{ id: number }[]>(`deployments?node_id=${nodeId}&limit=1`);
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
      const r = await fleetApi<{ node: FleetNode; deployment_id: number | null }>("nodes", {
        method: "POST",
        body: JSON.stringify({
          host: form.host.trim(),
          role: form.role,
          name: form.name.trim() || null,
          deploy: true,
          ...(otherKey.open && otherKey.pem.trim()
            ? { ssh_private_key: otherKey.pem, ssh_key_passphrase: otherKey.passphrase || null }
            : {}),
        }),
      });
      setForm({ host: "", role: form.role, name: "" });
      setOtherKey({ open: false, pem: "", passphrase: "" });
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
      const r = await fleetApi<{ deployment_id?: number }>(`nodes/${node.id}/${action}`, { method: "POST", body: "{}" });
      await refresh();
      if (r.deployment_id) await openDeployment(r.deployment_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const redeployWithKey = async () => {
    if (!rekey) return;
    const { node, pem, passphrase, rebuilt } = rekey;
    setBusy(node.id);
    try {
      const r = await fleetApi<{ deployment_id?: number }>(`nodes/${node.id}/deploy`, {
        method: "POST",
        body: JSON.stringify({
          reset_host_key: rebuilt,
          ...(pem.trim() ? { ssh_private_key: pem, ssh_key_passphrase: passphrase || null } : {}),
        }),
      });
      setRekey(null);
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
      const r = await fleetApi<{ deployment_id?: number }>(`nodes/${node.id}?teardown=${node.managed}`, { method: "DELETE" });
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
    <div className="space-y-5">
      <ErrorBanner message={error || (fleetError ? `Fleet controller: ${fleetError}` : "")} onClose={error ? () => setError("") : undefined} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(["stt", "tts"] as const).map((role) => (
          <Card key={role} title={`${role.toUpperCase()} GPUs`}>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-semibold text-ink leading-none">{capacity?.active[role] ?? "–"}</span>
              <span className="text-ink-3 text-[13px]">/ {capacity?.required[role] ?? "–"} needed</span>
            </div>
            <div className="text-[12px] mt-2">
              {capacity && capacity.missing[role] > 0 ? (
                <span className="text-warning">
                  {capacity.missing[role]} more to buy
                  {capacity.deploying[role] > 0 && ` (${capacity.deploying[role]} deploying)`}
                </span>
              ) : (
                <span className="text-good">{capacity ? "Enough" : ""}</span>
              )}
            </div>
          </Card>
        ))}
        <Card title="Lines sold">
          <div className="text-[28px] font-semibold text-ink leading-none">{capacity?.total_lines ?? "–"}</div>
          <div className="text-[12px] text-ink-3 mt-2">{capacity?.active_licenses ?? 0} active licences</div>
        </Card>
        <Card title="Lines the fleet carries">
          <div className={cx("text-[28px] font-semibold leading-none", capacity && capacity.lines_supported < capacity.total_lines ? "text-warning" : "text-ink")}>
            {capacity?.lines_supported ?? "–"}
          </div>
          <div className="text-[12px] text-ink-3 mt-2">1 STT ≈ 14 lines · 1 TTS ≈ 7 lines</div>
        </Card>
      </div>
      {capacity && capacity.unknown_packages.length > 0 && (
        <div className="text-[12px] text-warning">Licences on unknown packages (counted as 14 lines): {capacity.unknown_packages.join(", ")}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Card className="xl:col-span-5" title="Add a GPU">
          <ol className="text-[12px] text-ink-2 space-y-1 list-decimal list-inside mb-4">
            <li>In Hyperstack, create an RTX A4000 VM with the Chakra fleet SSH key below (used by default). Made it with another key? Tick the box below.</li>
            <li>Open inbound TCP 443 in its firewall.</li>
            <li>Enter its IP and role here. Deploying takes about 15–25 minutes.</li>
          </ol>
          <div className="grid grid-cols-3 gap-2">
            <input
              className={cx(inputClass, "col-span-2 font-mono")}
              placeholder="Public IP, e.g. 149.36.1.105"
              aria-label="Public IP"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
            <select className={inputClass} aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "stt" | "tts" })}>
              <option value="tts">TTS</option>
              <option value="stt">STT</option>
            </select>
            <input
              className={cx(inputClass, "col-span-3")}
              placeholder="Name (optional), e.g. tts-oslo-3"
              aria-label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="mt-3 rounded-xl border border-line bg-panel-2">
            <label className="flex items-start gap-2.5 p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent)]"
                checked={otherKey.open}
                onChange={(e) => setOtherKey({ ...otherKey, open: e.target.checked })}
              />
              <span>
                <span className="block text-[13px] text-ink">The VM was created with a different SSH key</span>
                <span className="block text-[11px] text-ink-3">
                  Default: the Chakra fleet key below. Tick this only if the VM was made with another key pair.
                </span>
              </span>
            </label>
            {otherKey.open && (
              <div className="px-3 pb-3 space-y-2">
                <textarea
                  className={cx(inputClass, "h-28 py-2 font-mono text-[11px] resize-y")}
                  placeholder="Paste the private key (-----BEGIN OPENSSH PRIVATE KEY----- …)"
                  aria-label="Private key the VM was created with"
                  value={otherKey.pem}
                  onChange={(e) => setOtherKey({ ...otherKey, pem: e.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                />
                <input
                  type="password"
                  className={inputClass}
                  placeholder="Key passphrase (only if it has one)"
                  aria-label="Key passphrase"
                  autoComplete="off"
                  value={otherKey.passphrase}
                  onChange={(e) => setOtherKey({ ...otherKey, passphrase: e.target.value })}
                />
                <p className="text-[11px] text-ink-3">
                  Used once to add the Chakra fleet key to the VM, then forgotten. It is never saved. After that the fleet key is used for this GPU.
                </p>
              </div>
            )}
          </div>
          <Button variant="primary" className="w-full h-10 mt-3" onClick={addNode} disabled={busy === "add"}>
            {busy === "add" ? "Starting…" : <><Zap size={15} /> Add and deploy</>}
          </Button>
          <div className="mt-4">
            <div className="text-[12px] text-ink-2 mb-1.5">Chakra fleet SSH public key</div>
            <div className="relative">
              <div className="w-full px-3 py-2.5 pr-10 bg-canvas border border-line rounded-xl text-ink-3 text-[11px] font-mono break-all">{sshKey || "unavailable"}</div>
              {sshKey && (
                <button onClick={copyKey} title="Copy" aria-label="Copy SSH key" className="absolute right-2 top-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink-2">
                  {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-7" title="GPU servers" action={<Button size="sm" onClick={() => refresh()}><RefreshCw size={12} /> Refresh</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-3 border-b border-line">
                  <th className="py-2 pr-3 font-medium">GPU</th>
                  <th className="py-2 pr-3 font-medium">State</th>
                  <th className="py-2 pr-3 font-medium">Health</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loaded && (
                  <tr><td colSpan={4}><Empty>Loading…</Empty></td></tr>
                )}
                {loaded && nodes.length === 0 && (
                  <tr><td colSpan={4}><Empty>No GPU nodes yet.</Empty></td></tr>
                )}
                {nodes.map((n) => {
                  const a = assessments.get(n.id);
                  return (
                    <tr key={n.id} className="border-b border-line last:border-0 align-top">
                      <td className="py-3 pr-3">
                        <div className="text-ink font-medium flex items-center gap-2">
                          {n.name}
                          <span className="text-[10px] font-mono text-ink-3">{n.role.toUpperCase()}</span>
                          {!n.managed && <span className="text-[10px] text-ink-3">registered</span>}
                        </div>
                        <div className="text-[11px] text-ink-3 font-mono mt-0.5">{n.host}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={STATE_TONE[n.state] ?? "neutral"}>{n.state}</Badge>
                        {n.last_error && <div className="text-[11px] text-critical/90 mt-1 max-w-[220px]">{n.last_error}</div>}
                      </td>
                      <td className="py-3 pr-3 text-[12px]">
                        {a && a.status !== "unknown" && a.status !== "pending" ? (
                          <div className="space-y-1">
                            <StatusPill status={a.status} />
                            {n.health?.ok && (
                              <div className="text-ink-3">
                                queue {n.health.queue_depth ?? 0}
                                {n.health.avg_gpu_ms != null && ` · ${Math.round(n.health.avg_gpu_ms)} ms GPU`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-3">–</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {n.managed && (
                            <>
                              <Button size="sm" disabled={busy === n.id} onClick={() => nodeAction(n, "preflight")}>Check</Button>
                              <Button size="sm" disabled={busy === n.id} onClick={() => nodeAction(n, "deploy")}>Redeploy</Button>
                              <Button size="sm" onClick={() => latestDeployment(n.id)}>Log</Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy === n.id}
                                onClick={() => setRekey({ node: n, pem: "", passphrase: "", rebuilt: false })}
                                title="Redeploy using another SSH key, e.g. after the VM was rebuilt with a different key"
                              >
                                Use another key
                              </Button>
                            </>
                          )}
                          {n.state === "active" && <Button size="sm" disabled={busy === n.id} onClick={() => nodeAction(n, "drain")}>Drain</Button>}
                          {n.state === "draining" && <Button size="sm" disabled={busy === n.id} onClick={() => nodeAction(n, "activate")}>Activate</Button>}
                          <Button size="sm" variant="danger" disabled={busy === n.id} onClick={() => removeNode(n)}>
                            {confirmRemove === n.id ? "Click to confirm" : "Remove"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {rekey && (
        <Card
          title={`Redeploy ${rekey.node.name} with another SSH key`}
          subtitle="For a VM created or rebuilt with a key other than the Chakra fleet key."
          className="border-accent/30"
          action={<button onClick={() => setRekey(null)} className="text-ink-3 hover:text-ink" aria-label="Cancel"><X size={16} /></button>}
        >
          <div className="space-y-2">
            <textarea
              className={cx(inputClass, "h-28 py-2 font-mono text-[11px] resize-y")}
              placeholder="Private key the VM accepts (leave empty to use the fleet key)"
              aria-label="Private key"
              value={rekey.pem}
              onChange={(e) => setRekey({ ...rekey, pem: e.target.value })}
              spellCheck={false}
              autoComplete="off"
            />
            <input
              type="password"
              className={inputClass}
              placeholder="Key passphrase (only if it has one)"
              aria-label="Key passphrase"
              autoComplete="off"
              value={rekey.passphrase}
              onChange={(e) => setRekey({ ...rekey, passphrase: e.target.value })}
            />
            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={rekey.rebuilt} onChange={(e) => setRekey({ ...rekey, rebuilt: e.target.checked })} />
              The VM was rebuilt (forget its old SSH host key)
            </label>
            <p className="text-[11px] text-ink-3">The key is used once to add the Chakra fleet key, then forgotten. It is never saved.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setRekey(null)}>Cancel</Button>
              <Button variant="primary" disabled={busy === rekey.node.id} onClick={redeployWithKey}>Redeploy</Button>
            </div>
          </div>
        </Card>
      )}

      {deployment && (
        <Card
          title={
            <span>
              {deployment.action} · deployment #{deployment.id}
              <span className={cx("ml-2 text-[12px]", deployment.status === "succeeded" ? "text-good" : deployment.status === "failed" ? "text-critical" : "text-warning")}>
                {deployment.status}
              </span>
            </span>
          }
          action={<button onClick={() => setDeployment(null)} className="text-ink-3 hover:text-ink" aria-label="Close log"><X size={16} /></button>}
        >
          {deployment.steps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {deployment.steps.map((s, i) => (
                <Badge key={i}>{s}</Badge>
              ))}
            </div>
          )}
          <pre ref={logRef} className="max-h-72 overflow-auto custom-scrollbar bg-canvas border border-line rounded-xl p-4 text-[11px] leading-relaxed text-ink-2 font-mono whitespace-pre-wrap">
            {deployment.log || "Starting…"}
          </pre>
        </Card>
      )}

      <Card title="Speech usage, last 30 days" subtitle="Per company, as metered by the gateway">
        {usage.length === 0 ? (
          <Empty>No speech usage recorded yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-ink-3 border-b border-line">
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Package</th>
                  <th className="py-2 pr-3 font-medium text-right">STT min</th>
                  <th className="py-2 pr-3 font-medium text-right">TTS min</th>
                  <th className="py-2 font-medium text-right">Requests</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {usage.map((u) => (
                  <tr key={u.license_id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-ink">{u.company_name ?? `licence #${u.license_id}`}</td>
                    <td className="py-2.5 pr-3 text-ink-2">{u.package_name ?? "–"}</td>
                    <td className="py-2.5 pr-3 text-right">{u.stt_minutes}</td>
                    <td className="py-2.5 pr-3 text-right">{u.tts_minutes}</td>
                    <td className="py-2.5 text-right text-ink-2">{num(u.stt_requests + u.tts_requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

