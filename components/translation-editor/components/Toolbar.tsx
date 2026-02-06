import styles from "../translation-editor.module.css";

type ToolbarProps = {
  canEdit: boolean;
  canSave: boolean;
  canRemove: boolean;
  drawMode: boolean;
  zoom: number;
  onSave: () => void;
  onDownload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleDrawMode: () => void;
  onRemoveBubble: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

export function Toolbar({
  canEdit,
  canSave,
  canRemove,
  drawMode,
  zoom,
  onSave,
  onDownload,
  onUndo,
  onRedo,
  onToggleDrawMode,
  onRemoveBubble,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ToolbarProps) {
  return (
    <div className={`${styles.toolbar} image-toolbar`}>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.iconButton}`}
          onClick={onSave}
          disabled={!canEdit || !canSave}
          title="Save (Ctrl/Cmd+S)"
          aria-label="Save (Ctrl/Cmd+S)"
        >
          <span aria-hidden="true">💾</span>
        </button>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onDownload}
          title="Download JSON (no shortcut)"
          aria-label="Download JSON (no shortcut)"
        >
          <span aria-hidden="true">⬇️</span>
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onUndo}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo (Ctrl/Cmd+Z)"
        >
          <span aria-hidden="true">↶</span>
        </button>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
          aria-label="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
        >
          <span aria-hidden="true">↷</span>
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton} ${
            drawMode ? styles.secondaryButtonActive : ""
          }`}
          onClick={onToggleDrawMode}
          disabled={!canEdit}
          title="Draw a new bubble"
          aria-label="Draw a new bubble"
        >
          <span aria-hidden="true">✚</span>
        </button>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onRemoveBubble}
          disabled={!canEdit || !canRemove}
          title="Remove selected bubble"
          aria-label="Remove selected bubble"
        >
          <span aria-hidden="true">🗑️</span>
        </button>
      </div>
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onZoomOut}
          title="Zoom out (-)"
          aria-label="Zoom out (-)"
        >
          <span aria-hidden="true">−</span>
        </button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onZoomIn}
          title="Zoom in (+)"
          aria-label="Zoom in (+)"
        >
          <span aria-hidden="true">＋</span>
        </button>
        <button
          type="button"
          className={`${styles.secondaryButton} ${styles.iconButton}`}
          onClick={onResetZoom}
          title="Reset zoom (0)"
          aria-label="Reset zoom (0)"
        >
          <span aria-hidden="true">⟲</span>
        </button>
      </div>
    </div>
  );
}
