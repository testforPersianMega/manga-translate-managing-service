import { useRef } from "react";

type HistoryEntry = {
  past: Record<string, unknown>[];
  future: Record<string, unknown>[];
};

function getOrCreateEntry(map: Map<string, HistoryEntry>, key: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const entry = { past: [], future: [] } satisfies HistoryEntry;
  map.set(key, entry);
  return entry;
}

export function useHistory() {
  const historyRef = useRef(new Map<string, HistoryEntry>());

  function pushState(key: string, state: Record<string, unknown>) {
    const entry = getOrCreateEntry(historyRef.current, key);
    entry.past.push(structuredClone(state));
    entry.future = [];
  }

  function undo(key: string, current: Record<string, unknown>) {
    const entry = historyRef.current.get(key);
    if (!entry || entry.past.length === 0) return null;
    const previous = entry.past.pop();
    if (previous) {
      entry.future.push(structuredClone(current));
      return structuredClone(previous);
    }
    return null;
  }

  function redo(key: string, current: Record<string, unknown>) {
    const entry = historyRef.current.get(key);
    if (!entry || entry.future.length === 0) return null;
    const next = entry.future.pop();
    if (next) {
      entry.past.push(structuredClone(current));
      return structuredClone(next);
    }
    return null;
  }

  function canUndo(key: string) {
    const entry = historyRef.current.get(key);
    return Boolean(entry?.past.length);
  }

  function canRedo(key: string) {
    const entry = historyRef.current.get(key);
    return Boolean(entry?.future.length);
  }

  function reset(key: string) {
    historyRef.current.delete(key);
  }

  return { pushState, undo, redo, canUndo, canRedo, reset };
}
