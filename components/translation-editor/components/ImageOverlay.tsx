import { useEffect, useMemo, useRef, useState } from "react";
import type { PageJson } from "../types";
import { getBboxEdges, getItemBbox } from "../utils";
import styles from "../translation-editor.module.css";

type ImageOverlayProps = {
  imageUrl: string | null;
  json: PageJson | null;
  selectedIndex: number;
  pan: { x: number; y: number };
  canPan: boolean;
  transformStyle: { transform: string };
  onSelect: (index: number) => void;
  onWheelZoom: (deltaY: number, cursorX: number, cursorY: number) => void;
  onPanTo: (x: number, y: number) => void;
  onStageMetricsChange?: (metrics: {
    wrapperWidth: number;
    wrapperHeight: number;
    imageWidth: number;
    imageHeight: number;
  }) => void;
  onMetricsChange?: (metrics: {
    displayWidth: number;
    displayHeight: number;
    imageWidth: number;
    imageHeight: number;
    wrapperWidth: number;
    wrapperHeight: number;
  }) => void;
};

export function ImageOverlay({
  imageUrl,
  json,
  selectedIndex,
  pan,
  canPan,
  transformStyle,
  onSelect,
  onWheelZoom,
  onPanTo,
  onStageMetricsChange,
  onMetricsChange,
}: ImageOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);
  const panRaf = useRef<number | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDownCapture = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-overlay='true']")) return;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    if (target.isContentEditable) return;
    event.preventDefault();
  };

  useEffect(() => {
    if (!imageRef.current) return;
    const updateSize = () => {
      if (!imageRef.current) return;
      setDisplaySize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
      if (wrapperRef.current) {
        onStageMetricsChange?.({
          wrapperWidth: wrapperRef.current.clientWidth,
          wrapperHeight: wrapperRef.current.clientHeight,
          imageWidth: imageRef.current.clientWidth,
          imageHeight: imageRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(imageRef.current);
    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [imageUrl, onStageMetricsChange]);

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
    const wrapperWidth = wrapperRef.current?.clientWidth ?? displaySize.width;
    const wrapperHeight = wrapperRef.current?.clientHeight ?? displaySize.height;
    onMetricsChange?.({
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      wrapperWidth,
      wrapperHeight,
    });
  }, [displaySize.height, displaySize.width, imageSize, onMetricsChange]);

  const overlayItems = useMemo(() => {
    if (!json || !imageSize || !displaySize.width || !displaySize.height) return [];
    const widthScale = displaySize.width / imageSize.width;
    const heightScale = displaySize.height / imageSize.height;
    return json.items.map((item, index) => {
      const edges = getBboxEdges(getItemBbox(item));
      if (!edges) return null;
      const left = edges.xMin * widthScale;
      const top = edges.yMin * heightScale;
      const width = (edges.xMax - edges.xMin) * widthScale;
      const height = (edges.yMax - edges.yMin) * heightScale;
      return { index, left, top, width, height };
    });
  }, [json, imageSize, displaySize.width, displaySize.height]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0) return;
    if (target.dataset.overlay === "true") return;
    if (!canPan) return;
    setIsDragging(true);
    activePointerId.current = event.pointerId;
    dragStart.current = { x: event.clientX, y: event.clientY };
    panStart.current = { x: pan.x, y: pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const schedulePanUpdate = (nextX: number, nextY: number) => {
    pendingPan.current = { x: nextX, y: nextY };
    if (panRaf.current !== null) return;
    panRaf.current = window.requestAnimationFrame(() => {
      if (!pendingPan.current) return;
      onPanTo(pendingPan.current.x, pendingPan.current.y);
      pendingPan.current = null;
      panRaf.current = null;
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (!event.buttons) {
      stopDragging(event, "stop-no-buttons");
      return;
    }
    const deltaX = event.clientX - dragStart.current.x;
    const deltaY = event.clientY - dragStart.current.y;
    schedulePanUpdate(panStart.current.x + deltaX, panStart.current.y + deltaY);
  };

  const finalizePan = (event?: PointerEvent | React.PointerEvent<HTMLDivElement>) => {
    if (pendingPan.current) {
      onPanTo(pendingPan.current.x, pendingPan.current.y);
      return;
    }
    if (!event || typeof event.clientX !== "number") return;
    const deltaX = event.clientX - dragStart.current.x;
    const deltaY = event.clientY - dragStart.current.y;
    onPanTo(panStart.current.x + deltaX, panStart.current.y + deltaY);
  };

  const stopDragging = (
    event?: PointerEvent | React.PointerEvent<HTMLDivElement>,
    reason?: string,
  ) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (panRaf.current !== null) {
      cancelAnimationFrame(panRaf.current);
      panRaf.current = null;
    }
    finalizePan(event);
    pendingPan.current = null;
    if (activePointerId.current !== null && wrapperRef.current) {
      try {
        wrapperRef.current.releasePointerCapture(activePointerId.current);
      } catch (error) {
        // Ignore release errors (e.g. capture already released).
      }
    }
    activePointerId.current = null;
    if (reason) {
      void reason;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    stopDragging(event, "stop-pointer-up");
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (event.buttons) return;
    stopDragging(event, "stop-pointer-leave");
  };

  useEffect(() => {
    const handleWindowPointerUp = (event: PointerEvent) => {
      stopDragging(event, "stop-window-pointer-up");
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      stopDragging(event, "stop-window-pointer-cancel");
    };
    const handleWindowBlur = () => {
      stopDragging(undefined, "stop-blur");
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isDragging]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.imageWrapper} ${canPan ? styles.imageWrapperGrabbable : ""} ${
        isDragging ? styles.imageWrapperGrabbing : ""
      }`}
      onWheel={(event) => {
        if (!wrapperRef.current) return;
        event.preventDefault();
        const rect = wrapperRef.current.getBoundingClientRect();
        const cursorX = event.clientX - rect.left - rect.width / 2;
        const cursorY = event.clientY - rect.top - rect.height / 2;
        onWheelZoom(event.deltaY, cursorX, cursorY);
      }}
      onPointerDownCapture={handlePointerDownCapture}
      draggable={false}
    >
      <div
        className={styles.imageTransform}
        style={transformStyle}
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={(event) => stopDragging(event, "stop-pointer-cancel")}
        onLostPointerCapture={(event) => stopDragging(event, "stop-lost-pointer-capture")}
      >
        {imageUrl ? (
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Chapter page"
            className={styles.image}
            draggable={false}
          />
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
