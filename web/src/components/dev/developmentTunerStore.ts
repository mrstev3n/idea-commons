"use client";

import { useSyncExternalStore } from "react";

export type DevelopmentTunerId = "home-hero";

let activeTuner: DevelopmentTunerId | null = null;
const listeners = new Set<() => void>();

export function setActiveDevelopmentTuner(
  tuner: DevelopmentTunerId | null,
) {
  if (activeTuner === tuner) return;
  activeTuner = tuner;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return activeTuner;
}

function getServerSnapshot() {
  return null;
}

export function useActiveDevelopmentTuner() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
