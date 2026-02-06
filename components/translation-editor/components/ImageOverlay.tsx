import { useEffect, useMemo, useRef, useState } from "react";
import type { PageJson } from "../types";
import { getItemBbox } from "../utils";
import styles from "../translation-editor.module.css";

type ImageOverlayProps = {
  imageUrl: string | null;
  json: PageJson | null;
  selectedIndex: number;
  transformStyle: { transform: string };
  onSelect: (index: number) => void;
  onWheelZoom: (deltaY: number) => void;
  onPanBy: (dx: number, dy: number) => void;
  onMetricsChange?: (metrics: {
    displayWidth: number;
    displayHeight: number;
    imageWidth: number;
    imageHeight: number;
  }) => void;
};

export function ImageOverlay({
  imageUrl,
  json,
  selectedIndex,
  transformStyle,
  onSelect,
  onWheelZoom,
  onPanBy,
  onMetricsChange,
}: ImageOverlayProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!imageRef.current) return;
    const updateSize = () => {
      if (!imageRef.current) return;
      setDisplaySize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(imageRef.current);
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [imageUrl]);

  const imageSize = useMemo(() => {
    if (json?.image_size?.width && json.image_size?.height) {
      return json.image_size;
    }
    if (imageRef.current?.naturalWidth && imageRef.current?.naturalHeight) {
      return { width: imageRef.current.naturalWidth, height: imageRef.current.naturalHeight };
    }
    return null;
  }, [json, displaySize.width, displaySize.height]);

  useEffect(() => {
    if (!imageSize || !displaySize.width || !displaySize.height) return;
    onMetricsChange?.({
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
    });
  }, [displaySize.height, displaySize.width, imageSize, onMetricsChange]);

  const overlayItems = useMemo(() => {
    if (!json || !imageSize || !displaySize.width || !displaySize.height) return [];
    const widthScale = displaySize.width / imageSize.width;
    const heightScale = displaySize.height / imageSize.height;
    return json.items.map((item, index) => {
      const bbox = getItemBbox(item);
      if (!bbox) return null;
      const left = bbox.x_min * widthScale;
      const top = bbox.y_min * heightScale;
      const width = (bbox.x_max - bbox.x_min) * widthScale;
      const height = (bbox.y_max - bbox.y_min) * heightScale;
      return { index, left, top, width, height };
    });
  }, [json, imageSize, displaySize.width, displaySize.height]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.overlay === "true") return;
    if (event.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    dragStart.current = { x: event.clientX, y: event.clientY };
    onPanBy(dx, dy);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={styles.imageStage}
      onWheel={(event) => {
        event.preventDefault();
        onWheelZoom(event.deltaY);
      }}
    >
      <div
        className={styles.imageTransform}
        style={transformStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {imageUrl ? (
          <img ref={imageRef} src={imageUrl} alt="Chapter page" className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder}>Select a page to preview.</div>
        )}
        <div className={styles.overlayLayer}>
          {overlayItems.map((overlay, idx) => {
            if (!overlay) return null;
            return (
              <div
                key={`${overlay.index}-${idx}`}
                data-overlay="true"
                className={
                  overlay.index === selectedIndex
                    ? `${styles.overlay} ${styles.overlayActive}`
                    : styles.overlay
                }
                style={{
                  left: overlay.left,
                  top: overlay.top,
                  width: overlay.width,
                  height: overlay.height,
                }}
                onClick={() => onSelect(overlay.index)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
