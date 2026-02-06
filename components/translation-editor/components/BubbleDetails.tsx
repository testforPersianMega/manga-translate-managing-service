import { useEffect, useRef, useState } from "react";
import type { BubbleItem, PageJson } from "../types";
import styles from "../translation-editor.module.css";

const bubbleTypeOptions = [
  "Standard",
  "Thought",
  "Shouting",
  "Whisper/Soft",
  "Narration",
  "Distorted/Custom",
  "SFX",
];

type BubbleDetailsProps = {
  item: BubbleItem | null;
  json: PageJson | null;
  readOnly: boolean;
  onUpdateText: (value: string) => void;
  onCommitText: (snapshot: PageJson) => void;
  onUpdateOrder: (value: number) => void;
  onUpdateType: (value: string) => void;
  onAutoOrder: () => void;
  manualOrderNotice: boolean;
};

export function BubbleDetails({
  item,
  json,
  readOnly,
  onUpdateText,
  onCommitText,
  onUpdateOrder,
  onUpdateType,
  onAutoOrder,
  manualOrderNotice,
}: BubbleDetailsProps) {
  const [textValue, setTextValue] = useState("");
  const snapshotRef = useRef<PageJson | null>(null);

  useEffect(() => {
    setTextValue(item?.text ?? "");
  }, [item?.text, item?.id]);

  if (!item) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Bubble Details</h3>
        <p className={styles.emptyText}>Select a bubble to edit its details.</p>
      </div>
    );
  }

  const orderValue = Number.isFinite(Number(item.order)) ? Number(item.order) : "";

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Bubble Details</h3>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Bubble ID</label>
        <input className={styles.input} value={item.id ?? ""} readOnly />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Order</label>
        <input
          className={styles.input}
          type="number"
          min={1}
          value={orderValue}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (Number.isFinite(nextValue) && nextValue > 0) {
              onUpdateOrder(nextValue);
            }
          }}
          disabled={readOnly}
        />
      </div>
      <div className={styles.formField}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onAutoOrder}
          disabled={readOnly || !json}
        >
          Auto Order Bubbles
        </button>
        {manualOrderNotice && (
          <p className={styles.noticeText}>Order was changed manually. Use auto order to reset.</p>
        )}
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Original Text</label>
        <textarea
          className={styles.textarea}
          value={item.text_original ?? ""}
          readOnly
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Translated Text</label>
        <textarea
          className={`${styles.textarea} ${styles.translatedTextarea}`}
          value={textValue}
          onFocus={() => {
            snapshotRef.current = json ? JSON.parse(JSON.stringify(json)) : null;
          }}
          onChange={(event) => {
            setTextValue(event.target.value);
            onUpdateText(event.target.value);
          }}
          onBlur={() => {
            if (snapshotRef.current) {
              onCommitText(snapshotRef.current);
            }
            snapshotRef.current = null;
          }}
          disabled={readOnly}
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Bubble Type</label>
        <select
          className={styles.input}
          value={item.bubble_type ?? "Standard"}
          onChange={(event) => onUpdateType(event.target.value)}
          disabled={readOnly}
        >
          {bubbleTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
