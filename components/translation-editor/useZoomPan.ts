import { useCallback, useState } from "react";

type Offset = { x: number; y: number };

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const STEP = 0.1;

export function useZoomPan() {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_SCALE, Number((prev + STEP).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_SCALE, Number((prev - STEP).toFixed(2))));
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  return {
    scale,
    offset,
    zoomIn,
    zoomOut,
    reset,
    panBy,
    setScale,
    setOffset,
  };
}
