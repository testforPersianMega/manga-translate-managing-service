import type { ChapterAsset } from "../types";
import styles from "../translation-editor.module.css";

type PageSwitcherProps = {
  pages: ChapterAsset[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function PageSwitcher({
  pages,
  currentIndex,
  onSelect,
  onPrev,
  onNext,
}: PageSwitcherProps) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Pages</h3>
      <div className={styles.pageControls}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onPrev}
          disabled={currentIndex <= 0}
          title="Previous page (PageUp)"
          aria-label="Previous page (PageUp)"
        >
          Previous
        </button>
        <span className={styles.pageStatus}>
          {pages.length ? `${currentIndex + 1} / ${pages.length}` : "0 / 0"}
        </span>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onNext}
          disabled={currentIndex >= pages.length - 1}
          title="Next page (PageDown)"
          aria-label="Next page (PageDown)"
        >
          Next
        </button>
      </div>
      <ul className={styles.pageList}>
        {pages.map((page, index) => (
          <li key={page.assetId}>
            <button
              type="button"
              className={
                index === currentIndex
                  ? `${styles.pageButton} ${styles.pageButtonActive}`
                  : styles.pageButton
              }
              onClick={() => onSelect(index)}
            >
              <span>Page {page.pageIndex}</span>
              {page.isTranslated && (
                <span className={styles.pageStatusIcon} title="Translation done">
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
