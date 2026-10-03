"use client";

// Data every page shares: licences, packages, the current route, toasts and
// the "new key" dialog. Lives in the shell (app/page.tsx).
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { Package } from "@/lib/packages";
import type { Analytics, Client } from "@/lib/types";

export type Route =
  | { page: "dashboard" }
  | { page: "companies" }
  | { page: "company"; id: number }
  | { page: "new" }
  | { page: "packages" }
  | { page: "gpus" }
  | { page: "fleet" };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const company = /^company\/(\d+)$/.exec(h);
  if (company) return { page: "company", id: Number(company[1]) };
  if (["companies", "new", "packages", "gpus", "fleet"].includes(h)) return { page: h } as Route;
  return { page: "dashboard" };
}

export function routeHash(r: Route): string {
  return r.page === "company" ? `#company/${r.id}` : `#${r.page}`;
}

export interface Hub {
  clients: Client[];
  clientsLoaded: boolean;
  setClients: Dispatch<SetStateAction<Client[]>>;
  reloadClients: () => Promise<void>;
  packages: Package[];
  setPackages: Dispatch<SetStateAction<Package[]>>;
  navigate: (r: Route) => void;
  toast: (message: string, tone?: "error" | "success") => void;
  /** Ask, rotate, and show the new key once. Resolves true when rotated. */
  rotateKey: (client: Client) => Promise<boolean>;
  /** Wall clock, refreshed every minute (for "5 min ago" labels). */
  now: number;
}

export const HubContext = createContext<Hub | null>(null);

export function useHub(): Hub {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error("useHub must be used inside the hub shell");
  return ctx;
}

/** The session expired: the shell listens for this and goes to /login. */
export function signedOut() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("chakra:signed-out"));
}

export async function licenseApi<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/licenses", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) signedOut();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Speech analytics for every licence, or one (`license`). */
export function useAnalytics(days: number, license?: number) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (license != null) q.set("license", String(license));
      const res = await fetch(`/api/analytics?${q}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, license]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  return { data, error, loading, reload: load };
}
