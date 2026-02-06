import type { BubbleBBox, PageJson } from "./types";

const RIGHT_PRIORITY_WEIGHT = 1.1;

const getRightTopPriorityScore = (entry: { yMin: number; xCenter: number }) =>
  entry.yMin - entry.xCenter * RIGHT_PRIORITY_WEIGHT;

export const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getItemBbox = (item: { bbox_bubble?: BubbleBBox; bbox_text?: BubbleBBox }) =>
  item.bbox_bubble ?? item.bbox_text ?? null;

export const getBboxEdges = (bbox: BubbleBBox | null) => {
  if (!bbox) return null;
  const xMin = Number(bbox.xMin ?? bbox.x_min);
  const xMax = Number(bbox.xMax ?? bbox.x_max);
  const yMin = Number(bbox.yMin ?? bbox.y_min);
  const yMax = Number(bbox.yMax ?? bbox.y_max);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return null;
  return { xMin, xMax, yMin, yMax };
};

export const getRowBasedBubbleIndices = (jsonData: PageJson) => {
  const entries = jsonData.items.map((item, index) => {
    const edges = getBboxEdges(getItemBbox(item));
    if (!edges) {
      return {
        index,
        bbox: null,
        xMin: Number.POSITIVE_INFINITY,
        xMax: Number.POSITIVE_INFINITY,
        yMin: Number.POSITIVE_INFINITY,
        yMax: Number.POSITIVE_INFINITY,
        xCenter: Number.POSITIVE_INFINITY,
        yCenter: Number.POSITIVE_INFINITY,
        width: 0,
        height: 0,
      };
    }
    const width = Math.max(0, edges.xMax - edges.xMin);
    const height = Math.max(0, edges.yMax - edges.yMin);
    return {
      index,
      bbox: edges,
      xMin: edges.xMin,
      xMax: edges.xMax,
      yMin: edges.yMin,
      yMax: edges.yMax,
      xCenter: edges.xMin + width / 2,
      yCenter: edges.yMin + height / 2,
      width,
      height,
    };
  });
  const withBbox = entries.filter((entry) => entry.bbox);
  const withoutBbox = entries.filter((entry) => !entry.bbox);
  if (!withBbox.length) {
    return entries.map((entry) => entry.index);
  }
  const anchor = withBbox.reduce<typeof withBbox[number] | null>((best, entry) => {
    if (!best) return entry;
    const entryPriority = getRightTopPriorityScore(entry);
    const bestPriority = getRightTopPriorityScore(best);
    if (entryPriority !== bestPriority) {
      return entryPriority < bestPriority ? entry : best;
    }
    return entry.index < best.index ? entry : best;
  }, null);
  const anchorCenter = anchor?.yCenter ?? Number.POSITIVE_INFINITY;
  const ordered = withBbox
    .slice()
    .sort((a, b) => {
      const distanceA = Math.abs(a.yCenter - anchorCenter);
      const distanceB = Math.abs(b.yCenter - anchorCenter);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      const priorityA = getRightTopPriorityScore(a);
      const priorityB = getRightTopPriorityScore(b);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.index);
  return ordered.concat(withoutBbox.map((entry) => entry.index));
};

const fillMissingBubbleOrders = (jsonData: PageJson) => {
  if (!jsonData?.items?.length) return;
  const usedOrders = new Set(
    jsonData.items
      .map((item) => Number(item.order))
      .filter((value) => Number.isFinite(value)),
  );
  let nextOrder = 1;
  const rowOrder = getRowBasedBubbleIndices(jsonData);
  rowOrder.forEach((index) => {
    const item = jsonData.items[index];
    if (Number.isFinite(Number(item.order))) return;
    while (usedOrders.has(nextOrder)) {
      nextOrder += 1;
    }
    item.order = nextOrder;
    usedOrders.add(nextOrder);
  });
};

const normalizeBubbleOrders = (jsonData: PageJson) => {
  if (!jsonData?.items?.length) return;
  fillMissingBubbleOrders(jsonData);
  const rowOrder = getRowBasedBubbleIndices(jsonData);
  const rowRank = new Map(rowOrder.map((index, position) => [index, position]));
  const entries = jsonData.items.map((item, index) => ({
    index,
    order: Number(item.order),
  }));
  entries.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return (rowRank.get(a.index) ?? a.index) - (rowRank.get(b.index) ?? b.index);
  });
  entries.forEach((entry, position) => {
    jsonData.items[entry.index].order = position + 1;
  });
};

export const ensureBubbleOrders = (jsonData: PageJson) => {
  if (!jsonData?.items?.length) return;
  const hasMissing = jsonData.items.some(
    (item) => !Number.isFinite(Number(item.order)),
  );
  if (hasMissing) {
    normalizeBubbleOrders(jsonData);
  }
};

export const getOrderedBubbleIndices = (jsonData: PageJson) => {
  const entries = jsonData.items.map((item, index) => ({
    index,
    order: Number(item.order),
  }));
  entries.sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.index - b.index;
  });
  return entries.map((entry) => entry.index);
};

const getBubbleXCenter = (item: { bbox_bubble?: BubbleBBox; bbox_text?: BubbleBBox }) => {
  const edges = getBboxEdges(getItemBbox(item));
  if (!edges) return Number.POSITIVE_INFINITY;
  return edges.xMin + (edges.xMax - edges.xMin) / 2;
};

const areBboxesOverlapping = (bboxA: BubbleBBox | null, bboxB: BubbleBBox | null) => {
  const edgesA = getBboxEdges(bboxA);
  const edgesB = getBboxEdges(bboxB);
  if (!edgesA || !edgesB) return false;
  const xOverlap = Math.min(edgesA.xMax, edgesB.xMax) - Math.max(edgesA.xMin, edgesB.xMin);
  const yOverlap = Math.min(edgesA.yMax, edgesB.yMax) - Math.max(edgesA.yMin, edgesB.yMin);
  return xOverlap > 0 && yOverlap > 0;
};

const getOverlappingBubbleIndices = (jsonData: PageJson, currentIndex: number) => {
  if (!jsonData?.items?.length || currentIndex < 0) return [];
  const currentItem = jsonData.items[currentIndex];
  const currentBbox = getItemBbox(currentItem);
  if (!currentBbox) return [];
  const currentXCenter = getBubbleXCenter(currentItem);
  return jsonData.items
    .map((item, index) => {
      if (index === currentIndex) return null;
      const bbox = getItemBbox(item);
      if (!areBboxesOverlapping(currentBbox, bbox)) return null;
      return {
        index,
        distance: Math.abs(getBubbleXCenter(item) - currentXCenter),
      };
    })
    .filter((entry): entry is { index: number; distance: number } => Boolean(entry))
    .sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.index);
};

const getOverlapPriorityBubbleIndices = (
  jsonData: PageJson,
  currentIndex: number,
  direction: "forward" | "backward" = "forward",
) => {
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  if (!orderedIndices.length || currentIndex < 0) {
    return orderedIndices;
  }
  const currentPosition = orderedIndices.indexOf(currentIndex);
  if (currentPosition === -1) return orderedIndices;
  const overlappingIndices = getOverlappingBubbleIndices(jsonData, currentIndex);
  if (!overlappingIndices.length) {
    return orderedIndices;
  }
  const positionMap = new Map(orderedIndices.map((index, position) => [index, position]));
  const orderedOverlaps = overlappingIndices
    .slice()
    .sort((a, b) => (positionMap.get(a) ?? 0) - (positionMap.get(b) ?? 0));
  const directionalOverlaps =
    direction === "backward"
      ? orderedOverlaps.filter((index) => (positionMap.get(index) ?? -1) < currentPosition)
      : orderedOverlaps.filter((index) => (positionMap.get(index) ?? -1) > currentPosition);
  if (!directionalOverlaps.length) {
    return orderedIndices;
  }
  const overlapSet = new Set(directionalOverlaps);
  const beforeCurrent = orderedIndices
    .slice(0, currentPosition)
    .filter((index) => !overlapSet.has(index));
  const afterCurrent = orderedIndices
    .slice(currentPosition + 1)
    .filter((index) => !overlapSet.has(index));
  return direction === "backward"
    ? [...beforeCurrent, ...directionalOverlaps, currentIndex, ...afterCurrent]
    : [...beforeCurrent, currentIndex, ...directionalOverlaps, ...afterCurrent];
};

const updateOrdersFromIndices = (jsonData: PageJson, orderedIndices: number[]) => {
  orderedIndices.forEach((index, position) => {
    jsonData.items[index].order = position + 1;
  });
};

export const reorderBubbleToPosition = (
  jsonData: PageJson,
  fromIndex: number,
  targetPosition: number,
) => {
  if (!jsonData?.items?.length) return;
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  const currentPosition = orderedIndices.indexOf(fromIndex);
  if (currentPosition === -1) return;
  const clampedPosition = clampValue(targetPosition, 0, orderedIndices.length - 1);
  if (currentPosition === clampedPosition) return;
  orderedIndices.splice(currentPosition, 1);
  orderedIndices.splice(clampedPosition, 0, fromIndex);
  updateOrdersFromIndices(jsonData, orderedIndices);
};

const applyOverlapOrderingIfNeeded = (
  jsonData: PageJson,
  currentIndex: number,
  direction: "forward" | "backward" = "forward",
) => {
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  if (!orderedIndices.length) {
    return orderedIndices;
  }
  const targetIndex = currentIndex < 0 ? orderedIndices[0] : currentIndex;
  const prioritized = getOverlapPriorityBubbleIndices(jsonData, targetIndex, direction);
  if (prioritized.length === orderedIndices.length) {
    const changed = prioritized.some(
      (index, position) => orderedIndices[position] !== index,
    );
    if (changed) {
      updateOrdersFromIndices(jsonData, prioritized);
    }
  }
  return prioritized;
};

export const applyInitialOverlapOrdering = (jsonData: PageJson) => {
  if (!jsonData?.items?.length) return;
  jsonData.items.forEach((_, index) => {
    applyOverlapOrderingIfNeeded(jsonData, index, "forward");
  });
};

export const autoOrderBubbles = (jsonData: PageJson) => {
  if (!jsonData?.items?.length) return;
  const orderedIndices = getRowBasedBubbleIndices(jsonData);
  updateOrdersFromIndices(jsonData, orderedIndices);
  applyInitialOverlapOrdering(jsonData);
};

export const formatBubbleLabel = (order: number, id: number | string, text: string) => {
  const trimmed = text.trim();
  const preview = trimmed ? ` : ${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}` : "";
  return `#${order} | ${id}${preview}`;
};
