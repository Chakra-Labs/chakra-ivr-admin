// Number and date formatting shared by every page. Dates show in Sri Lanka time.

const TZ = "Asia/Colombo";

export function compact(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(digits).replace(/\.0+$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(digits).replace(/\.0+$/, "")}K`;
  return Math.round(n).toLocaleString("en-US");
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function minutes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n < 10 ? n.toFixed(1) : compact(n);
}

export function pct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return "–";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function ms(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

export function money(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function mb(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`;
}

/** "3d 4h", "2h 15m", "45s" */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** "5 min ago", "3 h ago", "2 days ago" relative to `now` (ms). */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** "12 Sep" from YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

export function signedPct(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "–";
  const v = Math.round(ratio * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}
