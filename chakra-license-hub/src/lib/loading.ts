// Counts requests the admin is waiting for, so the header can show a loading
// bar. Background refreshes (polling) pass `quiet` and don't count: a bar that
// flashes every 30 s would teach people to ignore it.
import { useSyncExternalStore } from "react";

let pending = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function track<T>(work: Promise<T>, quiet = false): Promise<T> {
  if (quiet) return work;
  pending++;
  emit();
  return work.finally(() => {
    pending--;
    emit();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLoading(): boolean {
  return useSyncExternalStore(subscribe, () => pending > 0, () => false);
}
