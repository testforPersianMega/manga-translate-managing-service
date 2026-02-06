import { useState } from "react";
import type { BubbleItem } from "../types";
import { formatBubbleLabel } from "../utils";
import styles from "../translation-editor.module.css";

type BubbleListProps = {
  items: BubbleItem[];
  orderedIndices: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, targetIndex: number) => void;
  readOnly: boolean;
};

export function BubbleList({
  items,
  orderedIndices,
  selectedIndex,
  onSelect,
  onReorder,
  readOnly,
}: BubbleListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
            <li
              key={`${index}-${order}`}
              className={`${styles.bubbleListItem} ${
                dragOverIndex === index ? styles.bubbleListItemDragOver : ""
              } ${draggingIndex === index ? styles.bubbleListItemDragging : ""}`}
              onDragOver={(event) => {
                if (readOnly) return;
                event.preventDefault();
                setDragOverIndex(index);
                event.dataTransfer.dropEffect = "move";
              }}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(event) => {
                if (readOnly) return;
                event.preventDefault();
                setDragOverIndex(null);
                const data = event.dataTransfer.getData("text/plain");
                const fromIndex = Number.parseInt(data, 10);
                if (!Number.isFinite(fromIndex)) return;
                onReorder(fromIndex, index);
              }}
            >
              <div
                className={styles.bubbleDragHandle}
                title="Drag to reorder"
                draggable={!readOnly}
                onDragStart={(event) => {
                  if (readOnly) return;
                  setDraggingIndex(index);
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDraggingIndex(null)}
              >
                ⋮⋮
              </div>
              <button
                type="button"
                className={
                  index === selectedIndex
                    ? `${styles.bubbleButton} ${styles.bubbleButtonActive}`
                    : styles.bubbleButton
                }
                onClick={() => onSelect(index === selectedIndex ? -1 : index)}
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
