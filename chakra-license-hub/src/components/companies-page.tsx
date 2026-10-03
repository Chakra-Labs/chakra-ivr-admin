"use client";

import { useState } from "react";

import { useHub } from "./hub-context";
import { Building, ChevronRight, Key, Plus, RefreshCw, Search } from "./icons";
import { Badge, Button, Empty, Meter, Segmented, Skeleton, inputClass } from "./ui";
import { ago, compact, dateOnly, minutes, pct } from "@/lib/format";
import { packageQuota } from "@/lib/packages";

export default function CompaniesPage() {
  const { clients, clientsLoaded, packages, navigate, rotateKey, now } = useHub();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [rotating, setRotating] = useState<number | null>(null);

  const shown = clients.filter(
    (c) =>
      (status === "all" || (status === "active" ? c.is_active : !c.is_active)) &&
      (!query.trim() || c.company_name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a company"
              aria-label="Find a company"
              className={`${inputClass} pl-9 w-64`}
            />
          </div>
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: `All ${clients.length}` },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
        </div>
        <Button variant="primary" onClick={() => navigate({ page: "new" })}>
          <Plus size={15} /> New licence
        </Button>
      </div>

      {!clientsLoaded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[210px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty>{clients.length ? "No company matches." : "No companies yet. Create a licence to add one."}</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {shown.map((c) => {
            const quota = packageQuota(packages, c.package_name);
            return (
              <article
                key={c.id}
                className="group bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4 hover:border-line-strong transition-colors cursor-pointer"
                onClick={() => navigate({ page: "company", id: c.id })}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-panel-3 border border-line flex items-center justify-center shrink-0 text-ink-2">
                    <Building size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-ink truncate group-hover:text-accent transition-colors">{c.company_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge tone="accent">{c.package_name || "Essential"}</Badge>
                      <Badge tone={c.is_active ? "good" : "critical"}>{c.is_active ? "Active" : "Suspended"}</Badge>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-ink-3 mt-1 group-hover:text-ink transition-colors" />
                </div>

                <div className="rounded-xl bg-panel-2 border border-line p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] text-ink-3 inline-flex items-center gap-1.5">
                      <Key size={12} /> Licence key
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={rotating === c.id}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setRotating(c.id);
                        await rotateKey(c);
                        setRotating(null);
                      }}
                      title="Keys are stored hashed and shown only once. Rotate to issue a new one."
                    >
                      <RefreshCw size={12} /> {rotating === c.id ? "Rotating…" : "Rotate"}
                    </Button>
                  </div>
                  <div className="font-mono text-[12px] text-ink-2 truncate">{c.token_prefix ?? "chk_live_"}••••••••••••</div>
                </div>

                <Meter
                  value={c.month_minutes}
                  max={quota}
                  label="This month"
                  detail={`${minutes(c.month_minutes)} / ${compact(quota)} min · ${pct(c.month_minutes / quota)}`}
                />

                <div className="flex items-center justify-between text-[11px] text-ink-3 pt-1 border-t border-line">
                  <span className="pt-3">Last activity {ago(c.last_activity, now)}</span>
                  <span className="pt-3">Since {dateOnly(c.created_at)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
