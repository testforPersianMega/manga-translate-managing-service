"use client";

import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useEditorState } from "./useEditorState";
import { useShortcuts } from "./useShortcuts";
import { useZoomPan } from "./useZoomPan";

const EMPTY_METADATA_LABEL = "No editable metadata";

type TranslationEditorProps = {
  chapterId: string;
  canEdit: boolean;
};

export default function TranslationEditor({ chapterId, canEdit }: TranslationEditorProps) {
  const {
    pages,
    currentPage,
    currentPageIndex,
    setCurrentPageIndex,
    currentState,
    selectedItem,
    selectedItemId,
    setSelectedItemId,
    updateTranslation,
    updateMetadataField,
    handleUndo,
    handleRedo,
    canUndoCurrent,
    canRedoCurrent,
    isSaving,
    saveCurrent,
    downloadCurrent,
    itemsWithMetadata,
    loading,
    error,
    lastSavedAt,
    setImageSize,
  } = useEditorState(chapterId, canEdit);
  const { scale, offset, zoomIn, zoomOut, reset, panBy } = useZoomPan();
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const items = currentState.items;
  const selectedIndex = items.findIndex((item) => item.id === selectedItemId);
  const selectedMetadataEntries =
    itemsWithMetadata.find((item) => item.id === selectedItemId)?.metadataEntries ?? [];

  const canGoPrevPage = currentPageIndex > 0;
  const canGoNextPage = currentPageIndex < pages.length - 1;

  const nextItem = () => {
    if (!items.length) return;
    const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
    setSelectedItemId(items[nextIndex].id);
  };

  const prevItem = () => {
    if (!items.length) return;
    const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
    setSelectedItemId(items[prevIndex].id);
  };

  const shortcutActions = useMemo(
    () => ({
      onSave: saveCurrent,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onNextItem: nextItem,
      onPrevItem: prevItem,
      onZoomIn: zoomIn,
      onZoomOut: zoomOut,
      onResetZoom: reset,
      onPan: panBy,
    }),
    [handleRedo, handleUndo, nextItem, panBy, prevItem, reset, saveCurrent, zoomIn, zoomOut],
  );

  useShortcuts(shortcutActions, Boolean(currentPage));

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragging || !dragStart.current) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    dragStart.current = { x: event.clientX, y: event.clientY };
    panBy(dx, dy);
  };

  const onMouseUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const overlayStyle = useMemo(() => {
    return {
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      transformOrigin: "top left",
    } as const;
  }, [offset.x, offset.y, scale]);

  return (
    <div className="space-y-4" style={{ direction: "ltr" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={() => setCurrentPageIndex((index) => Math.max(0, index - 1))}
            disabled={!canGoPrevPage}
          >
            Previous Page
          </button>
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={() => setCurrentPageIndex((index) => Math.min(pages.length - 1, index + 1))}
            disabled={!canGoNextPage}
          >
            Next Page
          </button>
          <span className="text-sm text-gray-500">
            Page {currentPage ? currentPage.pageIndex : "-"} / {pages.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={handleUndo}
            disabled={!canUndoCurrent}
          >
            Undo
          </button>
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            onClick={handleRedo}
            disabled={!canRedoCurrent}
          >
            Redo
          </button>
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm"
            onClick={zoomOut}
          >
            -
          </button>
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm"
            onClick={zoomIn}
          >
            +
          </button>
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm"
            onClick={reset}
          >
            Reset
          </button>
          <span className="text-sm text-gray-500">Zoom {Math.round(scale * 100)}%</span>
          {canEdit && (
            <button
              className="rounded-md bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
              onClick={saveCurrent}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          )}
          <button
            className="rounded-md border border-gray-300 px-3 py-1 text-sm"
            onClick={downloadCurrent}
          >
            Download JSON
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">{error}</div>}
      {lastSavedAt && (
        <div className="text-xs text-gray-500">Last saved at {lastSavedAt}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="rounded-lg border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold">Pages</h3>
          {loading && <p className="mt-2 text-sm text-gray-500">Loading pages...</p>}
          {!loading && pages.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">No pages available.</p>
          )}
          <ul className="mt-3 space-y-2">
            {pages.map((page, index) => (
              <li key={page.assetId}>
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    index === currentPageIndex
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setCurrentPageIndex(index)}
                >
                  <div className="flex items-center justify-between">
                    <span>Page {page.pageIndex}</span>
                    <span className="text-xs text-gray-400">
                      {page.jsonUrl ? "JSON" : "No JSON"}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Canvas</h3>
            <span className="text-xs text-gray-500">Drag to pan · Shift + arrows</span>
          </div>
          <div
            className="relative mt-3 h-[70vh] overflow-hidden rounded-md border border-gray-100 bg-gray-50"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {currentPage ? (
              <div className="absolute left-0 top-0" style={overlayStyle}>
                <div className="relative">
                  <img
                    src={currentPage.imageUrl}
                    alt={`Page ${currentPage.pageIndex}`}
                    className="max-w-none select-none"
                    onLoad={(event) => {
                      const target = event.currentTarget;
                      setImageSize(currentPage.assetId, {
                        width: target.naturalWidth,
                        height: target.naturalHeight,
                      });
                    }}
                  />
                  <div
                    className="absolute left-0 top-0"
                    style={{
                      width: currentState.imageSize?.width ?? "auto",
                      height: currentState.imageSize?.height ?? "auto",
                    }}
                  >
                    {items.map((item) => {
                      if (!item.box) return null;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className={`absolute border-2 transition ${
                            item.id === selectedItemId
                              ? "border-blue-500 bg-blue-200/20"
                              : "border-emerald-400 bg-emerald-200/10"
                          }`}
                          style={{
                            left: item.box.x,
                            top: item.box.y,
                            width: item.box.width,
                            height: item.box.height,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Select a page to begin.
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-3">
          <h3 className="text-sm font-semibold">Bubbles</h3>
          {items.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">No bubbles detected.</p>
          )}
          <ul className="mt-3 max-h-[30vh] space-y-2 overflow-auto pr-2">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    item.id === selectedItemId
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className="text-xs text-gray-400">Bubble #{index + 1}</div>
                  <div className="line-clamp-2 font-medium">
                    {item.text || item.translation || "(empty)"}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t pt-4">
            <h4 className="text-sm font-semibold">Details</h4>
            {!selectedItem && (
              <p className="mt-2 text-sm text-gray-500">Select a bubble to edit.</p>
            )}
            {selectedItem && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs uppercase text-gray-400">Original Text</label>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
                    {selectedItem.text || "(none)"}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">Translation</label>
                  <textarea
                    className="mt-1 min-h-[96px] w-full rounded-md border border-gray-300 p-2 text-sm"
                    value={selectedItem.translation}
                    disabled={!canEdit}
                    onChange={(event) => updateTranslation(selectedItem, event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400">Metadata</label>
                  {selectedItem.raw && Object.keys(selectedItem.raw).length > 0 &&
                  selectedMetadataEntries.length ? (
                    <div className="mt-2 space-y-2">
                      {selectedMetadataEntries.map(([key, value]) => {
                          const stringValue =
                            typeof value === "string" ? value : JSON.stringify(value);
                          const isEditable =
                            typeof value === "string" ||
                            typeof value === "number" ||
                            typeof value === "boolean";
                          return (
                            <div key={key}>
                              <label className="text-xs text-gray-500">{key}</label>
                              {isEditable ? (
                                <input
                                  className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                                  value={String(value)}
                                  disabled={!canEdit}
                                  onChange={(event) => {
                                    const nextValue =
                                      typeof value === "number"
                                        ? Number(event.target.value)
                                        : typeof value === "boolean"
                                          ? event.target.value === "true"
                                          : event.target.value;
                                    updateMetadataField(selectedItem, key, nextValue);
                                  }}
                                />
                              ) : (
                                <textarea
                                  className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 p-2 text-xs"
                                  rows={2}
                                  readOnly
                                  value={stringValue}
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">{EMPTY_METADATA_LABEL}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
