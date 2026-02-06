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
          title="Save (Ctrl/Cmd+S)"
        >
          Save (Ctrl/Cmd+S)
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onDownload}
          title="Download JSON (no shortcut)"
        >
          Download JSON
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onUndo}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
        >
          Redo
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onZoomOut}
          title="Zoom out (-)"
        >
          -
        </button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onZoomIn}
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onResetZoom}
          title="Reset zoom (0)"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
