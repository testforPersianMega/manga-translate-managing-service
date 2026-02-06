import type { BubbleItem } from "../types";
import { formatBubbleLabel } from "../utils";
import styles from "../translation-editor.module.css";

type BubbleListProps = {
  items: BubbleItem[];
  orderedIndices: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function BubbleList({ items, orderedIndices, selectedIndex, onSelect }: BubbleListProps) {
  if (!items.length) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Bubbles</h3>
        <p className={styles.emptyText}>No bubbles loaded.</p>
      </div>
    );
  }

  const list = orderedIndices.length ? orderedIndices : items.map((_, index) => index);

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Bubbles</h3>
      <ul className={styles.bubbleList}>
        {list.map((index) => {
          const item = items[index];
          const order = Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1;
          const id = item.id ?? index + 1;
          return (
            <li key={`${index}-${order}`}>
              <button
                type="button"
                className={
                  index === selectedIndex
                    ? `${styles.bubbleButton} ${styles.bubbleButtonActive}`
                    : styles.bubbleButton
                }
                onClick={() => onSelect(index)}
              >
                {formatBubbleLabel(order, id, String(item.text ?? ""))}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
