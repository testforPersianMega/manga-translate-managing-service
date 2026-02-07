import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PageJson } from "../types";
import { clampValue, getBboxEdges, getItemBbox } from "../utils";
import styles from "../translation-editor.module.css";

const MIN_BBOX_SIZE = 12;

type ImageOverlayProps = {
  imageUrl: string | null;
  json: PageJson | null;
  selectedIndex: number;
  pan: { x: number; y: number };
  canPan: boolean;
  canEdit: boolean;
  drawMode: boolean;
  zoom: number;
  transformStyle: { transform: string };
  toolbar?: ReactNode;
  onSelect: (index: number) => void;
  onWheelZoom: (deltaY: number, cursorX: number, cursorY: number) => void;
  onPanTo: (x: number, y: number) => void;
  onAddBubble: (bbox: { xMin: number; xMax: number; yMin: number; yMax: number }) => void;
  onUpdateBubble: (
    index: number,
    bbox: { xMin: number; xMax: number; yMin: number; yMax: number },
  ) => void;
  onCommitResize: (snapshot: PageJson) => void;
  onDrawModeChange: (drawMode: boolean) => void;
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
  canEdit,
  drawMode,
  zoom,
  transformStyle,
  toolbar,
  onSelect,
  onWheelZoom,
  onPanTo,
  onAddBubble,
  onUpdateBubble,
  onCommitResize,
  onDrawModeChange,
  onStageMetricsChange,
  onMetricsChange,
}: ImageOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);
  const panRaf = useRef<number | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drawStartDisplay = useRef<{ x: number; y: number } | null>(null);
  const resizeState = useRef<{
    index: number;
    handle: string;
    startEdges: { xMin: number; xMax: number; yMin: number; yMax: number };
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  const resizeSnapshot = useRef<PageJson | null>(null);
  const [drawRect, setDrawRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const handlePointerDownCapture = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-image-toolbar]")) return;
    if (target.closest("[data-overlay='true']")) return;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    if (target.isContentEditable) return;
    event.preventDefault();
  };
  const handleSelectStart = useCallback((event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-image-toolbar]")) return;
    if (target.closest("[data-overlay='true']")) return;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    if (target.isContentEditable) return;
    event.preventDefault();
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handleWheel = (event: WheelEvent) => {
      if (!wrapperRef.current) return;
      if (event.target instanceof Element && event.target.closest(".image-toolbar")) {
        return;
      }
      if (!imageRef.current?.src) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = wrapperRef.current.getBoundingClientRect();
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      onWheelZoom(event.deltaY, cursorX, cursorY);
    };
    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    wrapper.addEventListener("selectstart", handleSelectStart);
    return () => {
      wrapper.removeEventListener("wheel", handleWheel);
      wrapper.removeEventListener("selectstart", handleSelectStart);
    };
  }, [handleSelectStart, onWheelZoom]);

  useEffect(() => {
    let active = true;
    if (!imageUrl) {
      setDisplayImageUrl(null);
      setIsImageLoading(false);
      setDisplaySize({ width: 0, height: 0 });
      return undefined;
    }
    setIsImageLoading(true);
    setDisplayImageUrl(null);
    setDisplaySize({ width: 0, height: 0 });
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      if (!active) return;
      setDisplayImageUrl(imageUrl);
      setIsImageLoading(false);
    };
    image.onerror = () => {
      if (!active) return;
      setDisplayImageUrl(null);
      setIsImageLoading(false);
    };
    return () => {
      active = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (drawMode) return;
    drawStart.current = null;
    drawStartDisplay.current = null;
    setDrawRect(null);
  }, [drawMode]);

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
  }, [displayImageUrl, onStageMetricsChange]);

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

  const getDisplayPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (!imageRef.current) return null;
      const rect = imageRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = (event.clientX - rect.left) / zoom;
      const y = (event.clientY - rect.top) / zoom;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: clampValue(x, 0, displaySize.width),
        y: clampValue(y, 0, displaySize.height),
      };
    },
    [displaySize.height, displaySize.width, zoom],
  );

  const getImagePoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (!imageSize || !displaySize.width || !displaySize.height) return null;
      const point = getDisplayPoint(event);
      if (!point) return null;
      const widthScale = displaySize.width / imageSize.width;
      const heightScale = displaySize.height / imageSize.height;
      return {
        x: point.x / widthScale,
        y: point.y / heightScale,
      };
    },
    [displaySize.height, displaySize.width, getDisplayPoint, imageSize],
  );

  const normalizeBounds = useCallback(
    (xMin: number, xMax: number, yMin: number, yMax: number) => {
      if (!imageSize) return null;
      const minX = 0;
      const minY = 0;
      const maxX = imageSize.width;
      const maxY = imageSize.height;
      let nextXMin = clampValue(Math.min(xMin, xMax), minX, maxX);
      let nextXMax = clampValue(Math.max(xMin, xMax), minX, maxX);
      let nextYMin = clampValue(Math.min(yMin, yMax), minY, maxY);
      let nextYMax = clampValue(Math.max(yMin, yMax), minY, maxY);
      if (nextXMax - nextXMin < MIN_BBOX_SIZE) {
        const adjust = MIN_BBOX_SIZE - (nextXMax - nextXMin);
        nextXMin = clampValue(nextXMin - adjust / 2, minX, maxX);
        nextXMax = clampValue(nextXMin + MIN_BBOX_SIZE, minX, maxX);
      }
      if (nextYMax - nextYMin < MIN_BBOX_SIZE) {
        const adjust = MIN_BBOX_SIZE - (nextYMax - nextYMin);
        nextYMin = clampValue(nextYMin - adjust / 2, minY, maxY);
        nextYMax = clampValue(nextYMin + MIN_BBOX_SIZE, minY, maxY);
      }
      return { xMin: nextXMin, xMax: nextXMax, yMin: nextYMin, yMax: nextYMax };
    },
    [imageSize],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0) return;
    if (target.dataset.overlay === "true") return;
    if (drawMode && canEdit) {
      const point = getImagePoint(event);
      if (!point || !json) return;
      event.preventDefault();
      drawStart.current = point;
      const displayPoint = getDisplayPoint(event);
      if (displayPoint) {
        drawStartDisplay.current = displayPoint;
        setDrawRect({ left: displayPoint.x, top: displayPoint.y, width: 0, height: 0 });
      }
      activePointerId.current = event.pointerId;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      return;
    }
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
    if (drawStart.current && drawMode && canEdit) {
      const displayPoint = getDisplayPoint(event);
      if (!displayPoint) return;
      const startDisplay = drawStartDisplay.current;
      if (!startDisplay) return;
      const left = Math.min(startDisplay.x, displayPoint.x);
      const top = Math.min(startDisplay.y, displayPoint.y);
      const width = Math.abs(displayPoint.x - startDisplay.x);
      const height = Math.abs(displayPoint.y - startDisplay.y);
      setDrawRect({ left, top, width, height });
      return;
    }
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

  const finalizeDraw = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (!drawStart.current || !drawMode || !canEdit) return;
      if (!json || !imageSize) {
        drawStart.current = null;
        drawStartDisplay.current = null;
        setDrawRect(null);
        return;
      }
      const endPoint = getImagePoint(event);
      if (!endPoint) return;
      const normalized = normalizeBounds(
        drawStart.current.x,
        endPoint.x,
        drawStart.current.y,
        endPoint.y,
      );
      drawStart.current = null;
      drawStartDisplay.current = null;
      setDrawRect(null);
      if (!normalized) return;
      onAddBubble(normalized);
      onDrawModeChange(false);
    },
    [canEdit, drawMode, getImagePoint, imageSize, json, normalizeBounds, onAddBubble, onDrawModeChange],
  );

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawStart.current && drawMode && canEdit) {
      if (activePointerId.current !== null) {
        try {
          (event.currentTarget as HTMLElement).releasePointerCapture(activePointerId.current);
        } catch {
          // Ignore release errors.
        }
        activePointerId.current = null;
      }
      finalizeDraw(event);
      return;
    }
    stopDragging(event, "stop-pointer-up");
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (event.buttons) return;
    stopDragging(event, "stop-pointer-leave");
  };

  useEffect(() => {
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (drawStart.current && drawMode && canEdit) {
        finalizeDraw(event);
        return;
      }
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
  }, [canEdit, drawMode, finalizeDraw, isDragging]);

  const startResize = (
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
    handle: string,
  ) => {
    if (!canEdit || !json) return;
    const item = json.items[index];
    const edges = getBboxEdges(getItemBbox(item));
    if (!edges) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSnapshot.current = json ? JSON.parse(JSON.stringify(json)) : null;
    resizeState.current = {
      index,
      handle,
      startEdges: edges,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
    setIsResizing(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeState.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!imageSize || !displaySize.width || !displaySize.height) return;
      const widthScale = displaySize.width / imageSize.width;
      const heightScale = displaySize.height / imageSize.height;
      const deltaX = (event.clientX - current.startX) / (widthScale * zoom);
      const deltaY = (event.clientY - current.startY) / (heightScale * zoom);
      let { xMin, xMax, yMin, yMax } = current.startEdges;
      switch (current.handle) {
        case "nw":
          xMin += deltaX;
          yMin += deltaY;
          break;
        case "ne":
          xMax += deltaX;
          yMin += deltaY;
          break;
        case "sw":
          xMin += deltaX;
          yMax += deltaY;
          break;
        case "se":
          xMax += deltaX;
          yMax += deltaY;
          break;
        case "n":
          yMin += deltaY;
          break;
        case "s":
          yMax += deltaY;
          break;
        case "w":
          xMin += deltaX;
          break;
        case "e":
          xMax += deltaX;
          break;
        default:
          break;
      }
      const normalized = normalizeBounds(xMin, xMax, yMin, yMax);
      if (!normalized) return;
      onUpdateBubble(current.index, normalized);
    };
    const handlePointerUp = (event: PointerEvent) => {
      const current = resizeState.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setIsResizing(false);
      resizeState.current = null;
      if (resizeSnapshot.current) {
        onCommitResize(resizeSnapshot.current);
      }
      resizeSnapshot.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [
    displaySize.height,
    displaySize.width,
    imageSize,
    isResizing,
    normalizeBounds,
    onCommitResize,
    onUpdateBubble,
    zoom,
  ]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.imageWrapper} ${canPan ? styles.imageWrapperGrabbable : ""} ${
        isDragging ? styles.imageWrapperGrabbing : ""
      } ${drawMode ? styles.imageWrapperDrawing : ""}`}
      onPointerDownCapture={handlePointerDownCapture}
      draggable={false}
    >
      {toolbar && (
        <div className={styles.imageToolbar} data-image-toolbar>
          {toolbar}
        </div>
      )}
      <div
        className={`${styles.imageTransform} ${isDragging ? styles.imageTransformDragging : ""}`}
        style={transformStyle}
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={(event) => stopDragging(event, "stop-pointer-cancel")}
        onLostPointerCapture={(event) => stopDragging(event, "stop-lost-pointer-capture")}
      >
        {displayImageUrl ? (
          <img
            ref={imageRef}
            src={displayImageUrl}
            alt="Chapter page"
            className={styles.image}
            draggable={false}
          />
        ) : isImageLoading ? (
          <div className={styles.imagePlaceholder}>
            Loading new page image...
          </div>
        ) : (
          <div className={styles.imagePlaceholder}>Select a page to preview.</div>
        )}
        {displayImageUrl && (
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
                  onClick={() =>
                    onSelect(overlay.index === selectedIndex ? -1 : overlay.index)
                  }
                >
                  {overlay.index === selectedIndex && canEdit && (
                    <>
                      {["nw", "n", "ne", "w", "e", "sw", "s", "se"].map((handle) => (
                        <div
                          key={handle}
                          className={styles.overlayHandle}
                          data-corner={handle}
                          onPointerDown={(event) => startResize(event, overlay.index, handle)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
            {drawRect && (
              <div
                className={`${styles.overlay} ${styles.overlayDrawing}`}
                style={{
                  left: drawRect.left,
                  top: drawRect.top,
                  width: drawRect.width,
                  height: drawRect.height,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
