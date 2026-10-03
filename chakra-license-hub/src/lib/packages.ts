// Subscription packages. Names and line counts must match
// chakra-gpu-fleet/fleet/packages.yaml: the fleet sizes its GPUs from each
// licence's package (1 STT GPU per 14 lines, 1 TTS GPU per 7 lines).
//
// `maxMinutes` is the package's monthly speech-minute allowance; usage resets
// on the 1st of each month (Sri Lanka time).

export interface Package {
  id: string;
  name: string;
  maxMinutes: number;
  lines: number;
}

export const DEFAULT_PACKAGES: Package[] = [
  { id: "1", name: "Essential", maxMinutes: 15000, lines: 14 },
  { id: "2", name: "Standard", maxMinutes: 25000, lines: 21 },
  { id: "3", name: "Business", maxMinutes: 40000, lines: 28 },
  { id: "4", name: "Business Plus", maxMinutes: 75000, lines: 42 },
  { id: "5", name: "Enterprise", maxMinutes: 100000, lines: 56 },
  { id: "6", name: "Enterprise Plus", maxMinutes: 200000, lines: 98 },
  { id: "7", name: "National", maxMinutes: 500000, lines: 217 },
  { id: "8", name: "National Plus", maxMinutes: 1000000, lines: 392 },
];

// Names the panel used before it adopted the price sheet (same as packages.yaml).
const ALIASES: Record<string, string> = {
  starter: "Essential",
  growth: "Standard",
  scale: "Business Plus",
  "enterprise - md": "Enterprise",
  "enterprise - lg": "Enterprise Plus",
};

// What one GPU carries, from the 28 Sep 2026 two-A4000 benchmark.
export const LINES_PER_GPU = { stt: 14, tts: 7 } as const;
// In-flight requests the gateway allows per line (INFLIGHT_PER_LINE).
export const INFLIGHT_PER_LINE = 2;
export const DEFAULT_LINES = 14;

export function findPackage(packages: Package[], name?: string | null): Package | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  const target = (ALIASES[wanted] ?? wanted).toLowerCase();
  return packages.find((p) => p.name.toLowerCase() === target);
}

export function packageQuota(packages: Package[], name?: string | null): number {
  return findPackage(packages, name)?.maxMinutes ?? 15000;
}

export function packageLines(packages: Package[], name?: string | null): number {
  return findPackage(packages, name)?.lines ?? DEFAULT_LINES;
}

export function gpusFor(lines: number) {
  return {
    stt: lines ? Math.ceil(lines / LINES_PER_GPU.stt) : 0,
    tts: lines ? Math.ceil(lines / LINES_PER_GPU.tts) : 0,
  };
}
