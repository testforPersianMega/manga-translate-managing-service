import { useCallback, useEffect, useMemo, useState } from "react";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const PAN_STEP = 80;
const PAN_MARGIN = 120;

export const useZoomPan = () => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [metrics, setMetrics] = useState({
    wrapperWidth: 0,
    wrapperHeight: 0,
    imageWidth: 0,
    imageHeight: 0,
  });

  const clampZoom = useCallback((value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }, []);

  const getMaxPanX = useCallback(
    (nextZoom: number) => {
      if (!metrics.wrapperWidth || !metrics.imageWidth) return 0;
      const scaledWidth = metrics.imageWidth * nextZoom;
      return Math.max(0, (scaledWidth - metrics.wrapperWidth) / 2);
    },
    [metrics.imageWidth, metrics.wrapperWidth],
  );

  const getMaxPanY = useCallback(
    (nextZoom: number) => {
      if (!metrics.wrapperHeight || !metrics.imageHeight) return 0;
      const scaledHeight = metrics.imageHeight * nextZoom;
      return Math.max(0, (scaledHeight - metrics.wrapperHeight) / 2);
    },
    [metrics.imageHeight, metrics.wrapperHeight],
  );

  const getPanLimits = useCallback(
    (nextZoom: number) => {
      const limitX = getMaxPanX(nextZoom) + Math.max(PAN_MARGIN, metrics.wrapperWidth / 2);
      const limitY = getMaxPanY(nextZoom) + Math.max(PAN_MARGIN, metrics.wrapperHeight / 2);
      return { limitX, limitY };
    },
    [getMaxPanX, getMaxPanY, metrics.wrapperHeight, metrics.wrapperWidth],
  );

  const clampPan = useCallback((value: number, limit: number) => {
    return Math.min(limit, Math.max(-limit, value));
  }, []);

  const applyPan = useCallback(
    (nextX: number, nextY: number, nextZoom = zoom) => {
      const { limitX, limitY } = getPanLimits(nextZoom);
      const canPan = limitX > 0.5 || limitY > 0.5;
      if (!canPan) {
        setPan({ x: 0, y: 0 });
        return;
      }
      setPan({ x: clampPan(nextX, limitX), y: clampPan(nextY, limitY) });
    },
    [clampPan, getPanLimits, zoom],
  );

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const clamped = clampZoom(nextZoom);
      setZoom(clamped);
      applyPan(pan.x, pan.y, clamped);
    },
    [applyPan, clampZoom, pan.x, pan.y],
  );

  const zoomIn = useCallback(() => {
    applyZoom(zoom + ZOOM_STEP);
  }, [applyZoom, zoom]);

  const zoomOut = useCallback(() => {
    applyZoom(zoom - ZOOM_STEP);
  }, [applyZoom, zoom]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const { limitX, limitY } = getPanLimits(zoom);
    if (limitX <= 0.5 && limitY <= 0.5) return;
    applyPan(pan.x + dx, pan.y + dy, zoom);
  }, [applyPan, getPanLimits, pan.x, pan.y, zoom]);

  const panTo = useCallback((x: number, y: number) => {
    applyPan(x, y, zoom);
  }, [applyPan, zoom]);

  const wheelZoom = useCallback(
    (deltaY: number, cursorX: number, cursorY: number) => {
      if (deltaY === 0) return;
      const direction = Math.sign(deltaY);
      if (!direction) return;
      const nextZoom = direction > 0 ? zoom - ZOOM_STEP : zoom + ZOOM_STEP;
      const nextLevel = clampZoom(nextZoom);
      if (Math.abs(nextLevel - zoom) < 0.0001) return;
      const zoomRatio = nextLevel / zoom;
      const nextX = pan.x + (1 - zoomRatio) * (cursorX - pan.x);
      const nextY = pan.y + (1 - zoomRatio) * (cursorY - pan.y);
      setZoom(nextLevel);
      applyPan(nextX, nextY, nextLevel);
    },
    [applyPan, clampZoom, pan.x, pan.y, zoom],
  );

  const panStep = PAN_STEP;

  const transform = useMemo(
    () => ({ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }),
    [pan.x, pan.y, zoom],
  );

  const canPan = useMemo(() => {
    const { limitX, limitY } = getPanLimits(zoom);
    return limitX > 0.5 || limitY > 0.5;
  }, [getPanLimits, zoom]);

  useEffect(() => {
    applyPan(pan.x, pan.y, zoom);
  }, [applyPan, pan.x, pan.y, zoom, metrics]);

  return {
    zoom,
    pan,
    canPan,
    setStageMetrics: setMetrics,
    transform,
    zoomIn,
    zoomOut,
    reset,
    panBy,
    panTo,
    wheelZoom,
    panStep,
  };
};
