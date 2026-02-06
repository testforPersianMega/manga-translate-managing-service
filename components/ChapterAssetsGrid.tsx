"use client";

import { useMemo, useState } from "react";

type ChapterAsset = {
  id: string;
  pageIndex: number;
  fileName: string;
  pageJson: { id: string } | null;
};

type ChapterAssetsGridProps = {
  assets: ChapterAsset[];
  canUpdate: boolean;
  canDelete: boolean;
  deleteAsset: (formData: FormData) => Promise<void>;
  deleteAssets: (formData: FormData) => Promise<void>;
  deleteJson: (formData: FormData) => Promise<void>;
  replaceImage: (formData: FormData) => Promise<void>;
  replaceJson: (formData: FormData) => Promise<void>;
  reorderPage: (formData: FormData) => Promise<void>;
};

export function ChapterAssetsGrid({
  assets,
  canUpdate,
  canDelete,
  deleteAsset,
  deleteAssets,
  deleteJson,
  replaceImage,
  replaceJson,
  reorderPage,
}: ChapterAssetsGridProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;
  const hasSelection = selectedCount > 0;

  const allSelected = useMemo(() => {
    if (assets.length === 0) return false;
    return assets.every((asset) => selected.has(asset.id));
  }, [assets, selected]);

  const toggleSelection = (assetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelected(new Set(assets.map((asset) => asset.id)));
  };

  const handleDeselectAll = () => {
    setSelected(new Set());
  };

  return (
    <div className="mt-4 space-y-3">
      {canDelete && assets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={allSelected}
            className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-60"
          >
            انتخاب همه
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={!hasSelection}
            className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-60"
          >
            لغو انتخاب
          </button>
          <span>تعداد انتخاب شده: {selectedCount}</span>
          <form action={deleteAssets} className="flex items-center gap-2">
            {[...selected].map((assetId) => (
              <input key={assetId} type="hidden" name="assetIds" value={assetId} />
            ))}
            <button
              disabled={!hasSelection}
              className="rounded-md border border-red-300 px-3 py-1 text-red-600 disabled:opacity-60"
            >
              حذف انتخابی
            </button>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => {
          const isChecked = selected.has(asset.id);
          return (
            <div key={asset.id} className="rounded-lg border border-gray-200 p-3">
              {canDelete && (
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelection(asset.id)}
                  />
                  انتخاب
                </label>
              )}
              <img
                src={`/api/assets/image/${asset.id}`}
                alt={asset.fileName}
                className="mt-2 h-48 w-full rounded-md object-cover"
              />
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                <p>صفحه: {asset.pageIndex}</p>
                <p>فایل: {asset.fileName}</p>
                <p>JSON: {asset.pageJson ? "دارد" : "ندارد"}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canUpdate && (
                  <form action={reorderPage}>
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                      بالا
                    </button>
                  </form>
                )}
                {canUpdate && (
                  <form action={reorderPage}>
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                      پایین
                    </button>
                  </form>
                )}
                {canDelete && (
                  <form action={deleteAsset}>
                    <input type="hidden" name="assetId" value={asset.id} />
                    <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600">
                      حذف تصویر
                    </button>
                  </form>
                )}
              </div>

              {canUpdate && (
                <form action={replaceImage} className="mt-3 space-y-2">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input name="image" type="file" accept="image/*" />
                  <button className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
                    جایگزینی تصویر
                  </button>
                </form>
              )}

              <div className="mt-3 space-y-2">
                {asset.pageJson && (
                  <a
                    href={`/api/assets/json/${asset.pageJson.id}`}
                    className="text-xs text-blue-600"
                  >
                    دانلود JSON
                  </a>
                )}
                {canUpdate && (
                  <form action={replaceJson} className="space-y-2">
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input name="json" type="file" accept="application/json" />
                    <button className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
                      {asset.pageJson ? "جایگزینی JSON" : "آپلود JSON"}
                    </button>
                  </form>
                )}
                {asset.pageJson && canDelete && (
                  <form action={deleteJson}>
                    <input type="hidden" name="jsonId" value={asset.pageJson.id} />
                    <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600">
                      حذف JSON
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
