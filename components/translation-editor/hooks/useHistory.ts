import type { HistoryEntry, HistoryState, PageJson } from "../types";

export const createHistoryState = (): HistoryState => ({
  undoStack: [],
  redoStack: [],
});

export const cloneJson = (data: PageJson): PageJson =>
  JSON.parse(JSON.stringify(data)) as PageJson;

const formatLabel = (label: string) =>
  label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const pushHistory = (state: HistoryState, snapshot: PageJson, label: string) => {
  const entry: HistoryEntry = {
    snapshot: cloneJson(snapshot),
    label: formatLabel(label || "Edit"),
    timestamp: Date.now(),
  };
  return {
    undoStack: [...state.undoStack, entry],
    redoStack: [],
  };
};

export const applyUndo = (
  state: HistoryState,
  currentSnapshot: PageJson,
): { nextState: HistoryState; snapshot: PageJson | null } => {
  if (!state.undoStack.length) {
    return { nextState: state, snapshot: null };
  }
  const nextUndo = [...state.undoStack];
  const entry = nextUndo.pop();
  if (!entry) return { nextState: state, snapshot: null };
  const redoEntry: HistoryEntry = {
    snapshot: cloneJson(currentSnapshot),
    label: entry.label,
    timestamp: entry.timestamp,
  };
  return {
    nextState: {
      undoStack: nextUndo,
      redoStack: [...state.redoStack, redoEntry],
    },
    snapshot: entry.snapshot,
  };
};

export const applyRedo = (
  state: HistoryState,
  currentSnapshot: PageJson,
): { nextState: HistoryState; snapshot: PageJson | null } => {
  if (!state.redoStack.length) {
    return { nextState: state, snapshot: null };
  }
  const nextRedo = [...state.redoStack];
  const entry = nextRedo.pop();
  if (!entry) return { nextState: state, snapshot: null };
  const undoEntry: HistoryEntry = {
    snapshot: cloneJson(currentSnapshot),
    label: entry.label,
    timestamp: entry.timestamp,
  };
  return {
    nextState: {
      undoStack: [...state.undoStack, undoEntry],
      redoStack: nextRedo,
    },
    snapshot: entry.snapshot,
  };
};

export const clearHistory = () => createHistoryState();
