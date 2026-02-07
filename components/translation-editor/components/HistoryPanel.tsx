import type { HistoryEntry } from "../types";
import styles from "../translation-editor.module.css";

type HistoryPanelProps = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onApplyHistory: (entry: HistoryEntry, stackType: "undo" | "redo", index: number) => void;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatMeta = (entry: HistoryEntry) => {
  if (!entry.meta) return null;
  const parts: string[] = [];
  const editorName = entry.meta.editor?.name || entry.meta.editor?.email;
  if (editorName) {
    parts.push(`By ${editorName}`);
  }
  if (entry.meta.bubbleId !== undefined) {
    parts.push(`Bubble ${entry.meta.bubbleId}`);
  }
  if (entry.meta.field) {
    parts.push(entry.meta.field.replace(/_/g, " "));
  }
  if (entry.meta.note) {
    parts.push(entry.meta.note);
  }
  if (entry.meta.from !== undefined || entry.meta.to !== undefined) {
    parts.push(`${String(entry.meta.from ?? "")} → ${String(entry.meta.to ?? "")}`.trim());
  }
  return parts.filter(Boolean).join(" • ");
};

const renderEntries = (
  entries: HistoryEntry[],
  stackType: "undo" | "redo",
  onApplyHistory: HistoryPanelProps["onApplyHistory"],
) => {
  if (!entries.length) {
    return <li className={styles.historyEmpty}>No entries</li>;
  }
  const displayEntries = [...entries].reverse();
  return displayEntries.map((entry, displayIndex) => {
    const originalIndex = entries.length - 1 - displayIndex;
    const meta = formatMeta(entry);
    return (
      <li key={`${stackType}-${entry.label}-${entry.timestamp}-${displayIndex}`}>
        <button
          type="button"
          className={styles.historyItemButton}
          onClick={() => onApplyHistory(entry, stackType, originalIndex)}
        >
          <div className={styles.historyTitle}>{entry.label}</div>
          {meta && <div className={styles.historyMeta}>{meta}</div>}
          <div className={styles.historyMeta}>{formatTime(entry.timestamp)}</div>
        </button>
      </li>
    );
  });
};

export function HistoryPanel({
  undoStack,
  redoStack,
  onUndo,
  onRedo,
  onClear,
  onApplyHistory,
}: HistoryPanelProps) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>History</h3>
      <div className={styles.historyActions}>
        <button type="button" className={styles.secondaryButton} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onRedo}>
          Redo
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onClear}>
          Clear History
        </button>
      </div>
      <div className={styles.historySummary}>
        {undoStack.length} undo • {redoStack.length} redo
      </div>
      <div className={styles.historyList}>
        <h4 className={styles.historyHeading}>Undo</h4>
        <ul>{renderEntries(undoStack, "undo", onApplyHistory)}</ul>
      </div>
      <div className={styles.historyList}>
        <h4 className={styles.historyHeading}>Redo</h4>
        <ul>{renderEntries(redoStack, "redo", onApplyHistory)}</ul>
      </div>
    </div>
  );
}
