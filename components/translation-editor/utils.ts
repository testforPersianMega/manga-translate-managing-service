import type { Box, BubbleItem } from "./types";

type ArrayPath = Array<string | number>;

type CandidateArray = {
  path: ArrayPath;
  items: Record<string, unknown>[];
  score: number;
};

const DIRECT_ARRAY_KEYS = [
  "bubbles",
  "texts",
  "items",
  "regions",
  "text_regions",
  "textRegions",
  "annotations",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBox(value: unknown): Box | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((item) => typeof item === "number")) {
      const [x1, y1, x2, y2] = value as number[];
      const width = Math.max(0, x2 - x1);
      const height = Math.max(0, y2 - y1);
      return { x: x1, y: y1, width, height };
    }
    if (
      value.length >= 4 &&
      value.every((item) => Array.isArray(item) || typeof item === "object")
    ) {
      const points = value
        .map((item) => {
          if (Array.isArray(item)) {
            const [x, y] = item as number[];
            return { x: Number(x), y: Number(y) };
          }
          if (isRecord(item) && typeof item.x === "number" && typeof item.y === "number") {
            return { x: Number(item.x), y: Number(item.y) };
          }
          return null;
        })
        .filter((item): item is { x: number; y: number } => Boolean(item));
      if (!points.length) return null;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
  }
  if (isRecord(value)) {
    const x = Number(value.x ?? value.left ?? value.minX ?? value.x1);
    const y = Number(value.y ?? value.top ?? value.minY ?? value.y1);
    const width = Number(value.width ?? value.w ?? value.maxX ?? value.x2) - x;
    const height = Number(value.height ?? value.h ?? value.maxY ?? value.y2) - y;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width)) {
      return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
    }
  }
  return null;
}

function getBox(item: Record<string, unknown>): Box | null {
  return (
    normalizeBox(item.bbox) ||
    normalizeBox(item.bounding_box) ||
    normalizeBox(item.boundingBox) ||
    normalizeBox(item.box) ||
    normalizeBox(item.rect)
  );
}

function candidateScore(items: Record<string, unknown>[]) {
  let score = 0;
  for (const item of items) {
    if (getBox(item)) score += 1;
  }
  return score;
}

function findCandidateArrays(value: unknown, path: ArrayPath = []): CandidateArray[] {
  const candidates: CandidateArray[] = [];
  if (Array.isArray(value)) {
    const items = value.filter((item) => isRecord(item)) as Record<string, unknown>[];
    if (items.length) {
      candidates.push({ path, items, score: candidateScore(items) });
    }
    value.forEach((entry, index) => {
      candidates.push(...findCandidateArrays(entry, [...path, index]));
    });
    return candidates;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      candidates.push(...findCandidateArrays(entry, [...path, key]));
    });
  }
  return candidates;
}

function getArrayAtPath(value: unknown, path: ArrayPath): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (!acc) return undefined;
    if (typeof key === "number" && Array.isArray(acc)) return acc[key];
    if (typeof key === "string" && isRecord(acc)) return acc[key];
    return undefined;
  }, value);
}

function resolveItemText(item: Record<string, unknown>) {
  const text =
    (typeof item.text === "string" && item.text) ||
    (typeof item.source === "string" && item.source) ||
    (typeof item.original === "string" && item.original) ||
    "";
  const translation =
    (typeof item.translation === "string" && item.translation) ||
    (typeof item.translated === "string" && item.translated) ||
    "";
  return { text, translation };
}

export function extractBubbleItems(
  json: Record<string, unknown>,
  existingArrayPath: ArrayPath | null = null,
): { items: BubbleItem[]; arrayPath: ArrayPath | null } {
  let arrayPath = existingArrayPath;
  let items: Record<string, unknown>[] = [];

  if (arrayPath) {
    const resolved = getArrayAtPath(json, arrayPath);
    if (Array.isArray(resolved)) {
      items = resolved.filter((item) => isRecord(item)) as Record<string, unknown>[];
    }
  }

  if (!items.length) {
    for (const key of DIRECT_ARRAY_KEYS) {
      const entry = json[key];
      if (Array.isArray(entry)) {
        items = entry.filter((item) => isRecord(item)) as Record<string, unknown>[];
        if (items.length) {
          arrayPath = [key];
          break;
        }
      }
    }
  }

  if (!items.length) {
    const candidates = findCandidateArrays(json).filter((candidate) => candidate.score > 0);
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best) {
      items = best.items;
      arrayPath = best.path;
    }
  }

  const bubbleItems = items.map((item, index) => {
    const { text, translation } = resolveItemText(item);
    return {
      id: `${arrayPath?.join(".") ?? "items"}-${index}`,
      index,
      text,
      translation,
      box: getBox(item),
      raw: item,
      arrayPath,
    } satisfies BubbleItem;
  });

  return { items: bubbleItems, arrayPath };
}

export function updateItemField(
  json: Record<string, unknown>,
  arrayPath: ArrayPath,
  itemIndex: number,
  key: string,
  value: unknown,
) {
  const resolved = getArrayAtPath(json, arrayPath);
  if (!Array.isArray(resolved)) return;
  const item = resolved[itemIndex];
  if (!isRecord(item)) return;
  item[key] = value as never;
}

export function getArrayAt(json: Record<string, unknown>, arrayPath: ArrayPath | null) {
  if (!arrayPath) return null;
  const resolved = getArrayAtPath(json, arrayPath);
  if (!Array.isArray(resolved)) return null;
  return resolved;
}

export function getMetadataEntries(item: Record<string, unknown>) {
  const ignored = new Set([
    "text",
    "translation",
    "translated",
    "source",
    "original",
    "bbox",
    "bounding_box",
    "boundingBox",
    "box",
    "rect",
  ]);
  return Object.entries(item).filter(([key]) => !ignored.has(key));
}
