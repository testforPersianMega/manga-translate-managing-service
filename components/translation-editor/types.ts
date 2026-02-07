export type ChapterAsset = {
  pageIndex: number;
  assetId: string;
  imageUrl: string;
  jsonUrl: string | null;
  fileName?: string;
  isTranslated?: boolean;
};

export type BubbleBBox = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  xMin?: number;
  yMin?: number;
  xMax?: number;
  yMax?: number;
};

export type BubbleItem = {
  id?: number | string;
  order?: number;
  text?: string;
  text_original?: string;
  bubble_type?: string;
  bbox_bubble?: BubbleBBox;
  bbox_text?: BubbleBBox;
  [key: string]: unknown;
};

export type PageJson = {
  image_size?: { width: number; height: number };
  items: BubbleItem[];
  [key: string]: unknown;
};

export type HistoryEntry = {
  id?: string;
  snapshot: PageJson;
  label: string;
  timestamp: number;
  meta?: HistoryMeta;
};

export type HistoryMeta = {
  action?: string;
  bubbleId?: number | string;
  field?: string;
  from?: unknown;
  to?: unknown;
  note?: string;
};

export type HistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
};

export type PageState = {
  asset: ChapterAsset;
  json: PageJson | null;
  isJsonLoading: boolean;
  isDirty: boolean;
  isSaving: boolean;
  hasHistoryLoaded?: boolean;
  selectedBubbleIndex: number;
  history: HistoryState;
  manualOrderChanged?: boolean;
  overlapOrdered?: boolean;
};
