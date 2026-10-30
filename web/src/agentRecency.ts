import { useSyncExternalStore } from "react";
import { roamgateLocalStorage, subscribeLocalStorage } from "./browserStorage";
import type { Pane } from "./types";

/** When this browser last opened each agent pane, for the "Recently opened" sort. */
export const AGENT_RECENCY_STORAGE_KEY = "agentRecency.v1";

const MAX_AGENT_RECENCY_ENTRIES = 200;
const MAX_KEY_LENGTH = 1024;

export type AgentRecency = ReadonlyMap<string, number>;

/** Keyed by terminal too, so a reused pane id never inherits an old agent's slot. */
export function agentRecencyKey(
  connectionId: string,
  pane: Pick<Pane, "pane_id" | "terminal_id">,
): string {
  return JSON.stringify([connectionId, pane.pane_id, pane.terminal_id]);
}

export function parseAgentRecency(raw: string | null): Map<string, number> {
  const recency = new Map<string, number>();
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return recency;
    }
    for (const [key, openedAt] of Object.entries(value)) {
      if (
        key.length > MAX_KEY_LENGTH ||
        typeof openedAt !== "number" ||
        !Number.isFinite(openedAt) ||
        openedAt <= 0
      ) {
        continue;
      }
      recency.set(key, openedAt);
    }
  } catch {
    // Missing or invalid history starts empty.
  }
  return recency;
}

export function recordAgentOpened(
  recency: AgentRecency,
  key: string,
  openedAt: number,
): Map<string, number> {
  const next = new Map(recency);
  next.set(key, openedAt);
  return new Map(
    [...next]
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_AGENT_RECENCY_ENTRIES),
  );
}

let cachedRaw: string | null | undefined;
let cachedRecency: AgentRecency = new Map();

function readAgentRecency(): AgentRecency {
  const raw = roamgateLocalStorage.getItem(AGENT_RECENCY_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecency = parseAgentRecency(raw);
  }
  return cachedRecency;
}

const listeners = new Set<() => void>();

function subscribeAgentRecency(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribeStorage = subscribeLocalStorage((key) => {
    if (key === null || key === AGENT_RECENCY_STORAGE_KEY) listener();
  });
  return () => {
    listeners.delete(listener);
    unsubscribeStorage();
  };
}

export function markAgentOpened(
  connectionId: string,
  pane: Pick<Pane, "pane_id" | "terminal_id">,
  openedAt = Date.now(),
): void {
  const next = recordAgentOpened(
    readAgentRecency(),
    agentRecencyKey(connectionId, pane),
    openedAt,
  );
  try {
    roamgateLocalStorage.setItem(
      AGENT_RECENCY_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(next)),
    );
  } catch {
    // Full or blocked storage keeps the previous order; opening still works.
    return;
  }
  for (const listener of listeners) listener();
}

export function useAgentRecency(): AgentRecency {
  return useSyncExternalStore(
    subscribeAgentRecency,
    readAgentRecency,
    readAgentRecency,
  );
}
