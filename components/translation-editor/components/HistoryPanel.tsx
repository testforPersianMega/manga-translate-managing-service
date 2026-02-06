import type { HistoryEntry } from "../types";
import styles from "../translation-editor.module.css";

type HistoryPanelProps = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const renderEntries = (entries: HistoryEntry[], label: string) => {
  if (!entries.length) {
    return <li className={styles.historyEmpty}>No entries</li>;
  }
  return entries.map((entry, index) => (
    <li key={`${label}-${index}`} className={styles.historyItem}>
      <div className={styles.historyTitle}>{entry.label}</div>
      <div className={styles.historyMeta}>{formatTime(entry.timestamp)}</div>
    </li>
  ));
};

export function HistoryPanel({ undoStack, redoStack, onUndo, onRedo, onClear }: HistoryPanelProps) {
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
        <ul>{renderEntries([...undoStack].reverse(), "undo")}</ul>
      </div>
      <div className={styles.historyList}>
        <h4 className={styles.historyHeading}>Redo</h4>
        <ul>{renderEntries([...redoStack].reverse(), "redo")}</ul>
      </div>
    </div>
  );
}
