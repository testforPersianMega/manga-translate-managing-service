import type { BubbleBBox, PageJson } from "./types";

const normalizeBbox = (bbox: BubbleBBox | null) => {
  if (!bbox) return null;
  const xMin = Number(bbox.x_min ?? bbox.xMin);
  const xMax = Number(bbox.x_max ?? bbox.xMax);
  const yMin = Number(bbox.y_min ?? bbox.yMin);
  const yMax = Number(bbox.y_max ?? bbox.yMax);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return null;
  return {
    x_min: xMin,
    x_max: xMax,
    y_min: yMin,
    y_max: yMax,
  };
};

export const getItemBbox = (item: { bbox_bubble?: BubbleBBox; bbox_text?: BubbleBBox }) =>
  normalizeBbox(item.bbox_bubble ?? item.bbox_text ?? null);

const getBubbleCenter = (bbox: { x_min: number; x_max: number; y_min: number; y_max: number }) => {
  return {
    x: bbox.x_min + (bbox.x_max - bbox.x_min) / 2,
    y: bbox.y_min + (bbox.y_max - bbox.y_min) / 2,
  };
};

export const getOrderedBubbleIndices = (
  jsonData: PageJson,
  options?: { ignoreExplicitOrder?: boolean },
) => {
  const items = jsonData.items ?? [];
  if (!items.length) return [];
  const hasExplicitOrder = items.every((item) => Number.isFinite(Number(item.order)));
  if (hasExplicitOrder && !options?.ignoreExplicitOrder) {
    return items
      .map((item, index) => ({
        index,
        order: Number(item.order),
      }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.index);
  }

  const entries = items.map((item, index) => {
    const bbox = getItemBbox(item);
    if (!bbox) {
      return { index, bbox: null, center: null };
    }
    return { index, bbox, center: getBubbleCenter(bbox) };
  });

  const withBbox = entries.filter((entry) => entry.bbox && entry.center);
  const withoutBbox = entries.filter((entry) => !entry.bbox || !entry.center);

  withBbox.sort((a, b) => {
    if (!a.center || !b.center) return 0;
    const yDiff = a.center.y - b.center.y;
    if (Math.abs(yDiff) < 24) {
      return a.center.x - b.center.x;
    }
    return yDiff;
  });

  return [...withBbox.map((entry) => entry.index), ...withoutBbox.map((entry) => entry.index)];
};

export const formatBubbleLabel = (order: number, id: number | string, text: string) => {
  const trimmed = text.trim();
  const preview = trimmed ? ` : ${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}` : "";
  return `#${order} | ${id}${preview}`;
};
