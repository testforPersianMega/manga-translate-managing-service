import styles from "../translation-editor.module.css";

type ToolbarProps = {
  canEdit: boolean;
  canSave: boolean;
  zoom: number;
  onSave: () => void;
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

export function Toolbar({
  canEdit,
  canSave,
  zoom,
  onSave,
  onDownload,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onSave}
          disabled={!canEdit || !canSave}
        >
          Save (Ctrl/Cmd+S)
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onDownload}>
          Download JSON
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button type="button" className={styles.secondaryButton} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onRedo}>
          Redo
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button type="button" className={styles.secondaryButton} onClick={onZoomOut}>
          -
        </button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button type="button" className={styles.secondaryButton} onClick={onZoomIn}>
          +
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onResetZoom}>
          Reset
        </button>
      </div>
    </div>
  );
}
