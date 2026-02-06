export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BubbleItem = {
  id: string;
  index: number;
  text: string;
  translation: string;
  box: Box | null;
  raw: Record<string, unknown>;
  arrayPath: Array<string | number> | null;
};

export type PageAsset = {
  pageIndex: number;
  assetId: string;
  imageUrl: string;
  jsonUrl: string | null;
};

export type PageState = {
  json: Record<string, unknown> | null;
  items: BubbleItem[];
  arrayPath: Array<string | number> | null;
  imageSize: { width: number; height: number } | null;
};
