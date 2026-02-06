import { useCallback, useMemo, useState } from "react";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const PAN_STEP = 80;

export const useZoomPan = () => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const clampZoom = useCallback((value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((value) => clampZoom(value + ZOOM_STEP));
  }, [clampZoom]);

  const zoomOut = useCallback(() => {
    setZoom((value) => clampZoom(value - ZOOM_STEP));
  }, [clampZoom]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setZoomValue = useCallback(
    (value: number) => setZoom(clampZoom(value)),
    [clampZoom],
  );

  const panBy = useCallback((dx: number, dy: number) => {
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const panTo = useCallback((x: number, y: number) => {
    setPan({ x, y });
  }, []);

  const wheelZoom = useCallback(
    (deltaY: number) => {
      if (deltaY === 0) return;
      const direction = deltaY > 0 ? -1 : 1;
      setZoom((value) => clampZoom(value + direction * ZOOM_STEP));
    },
    [clampZoom],
  );

  const panStep = PAN_STEP;

  const transform = useMemo(
    () => ({ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }),
    [pan.x, pan.y, zoom],
  );

  return {
    zoom,
    pan,
    transform,
    zoomIn,
    zoomOut,
    reset,
    setZoomValue,
    panBy,
    panTo,
    wheelZoom,
    panStep,
  };
};
