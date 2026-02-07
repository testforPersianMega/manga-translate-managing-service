"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./translation-editor.module.css";
import { useEditorState } from "./hooks/useEditorState";
import { useShortcuts } from "./hooks/useShortcuts";
import { useZoomPan } from "./hooks/useZoomPan";
import { BubbleDetails } from "./components/BubbleDetails";
import { BubbleList } from "./components/BubbleList";
import { HistoryPanel } from "./components/HistoryPanel";
import { ImageOverlay } from "./components/ImageOverlay";
import { PageSwitcher } from "./components/PageSwitcher";
import { Toolbar } from "./components/Toolbar";
import {
  autoOrderBubbles,
  clampValue,
  getBboxEdges,
  getItemBbox,
  getOrderedBubbleIndices,
  reorderBubbleToPosition,
} from "./utils";
import type { PageJson } from "./types";

const DEFAULT_MARGIN = 80;

export type TranslationEditorProps = {
  chapterId: string;
  canEdit: boolean;
};

export function TranslationEditor({ chapterId, canEdit }: TranslationEditorProps) {
  const {
    pages,
    currentPageIndex,
    currentPage,
    errorMessage,
    statusMessage,
    orderedBubbleIndices,
    selectPage,
    setSelectedBubbleIndex,
    updateCurrentJson,
    pushHistorySnapshot,
    undo,
    redo,
    clearHistoryState,
    applyHistoryEntry,
    updatePageState,
    selectNextBubble,
    selectPrevBubble,
    setStatusMessage,
  } = useEditorState(chapterId);

  const {
    zoom,
    pan,
    canPan,
    transform,
    zoomIn,
    zoomOut,
    reset,
    panBy,
    panTo,
    wheelZoom,
    panStep,
    setStageMetrics,
  } = useZoomPan();

  const [autoPanEnabled, setAutoPanEnabled] = useState(true);
  const [bubbleMargin, setBubbleMargin] = useState(DEFAULT_MARGIN);
  const [manualOrderNotice, setManualOrderNotice] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [metrics, setMetrics] = useState({
    displayWidth: 0,
    displayHeight: 0,
    imageWidth: 0,
    imageHeight: 0,
    wrapperWidth: 0,
    wrapperHeight: 0,
  });
  const panRef = useRef(pan);

  const items = currentPage?.json?.items ?? [];
  const selectedIndex = currentPage?.selectedBubbleIndex ?? -1;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  useEffect(() => {
    setManualOrderNotice(false);
  }, [currentPageIndex]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const ensureBubbleInView = useCallback(() => {
    if (!autoPanEnabled || !currentPage?.json || selectedIndex < 0) return;
    const item = currentPage.json.items[selectedIndex];
    const edges = getBboxEdges(getItemBbox(item));
    if (
      !edges ||
      !metrics.displayWidth ||
      !metrics.displayHeight ||
      !metrics.wrapperWidth ||
      !metrics.wrapperHeight
    ) {
      return;
    }
    const widthScale = metrics.displayWidth / (metrics.imageWidth || metrics.displayWidth);
    const heightScale = metrics.displayHeight / (metrics.imageHeight || metrics.displayHeight);
    const xMin = edges.xMin * widthScale;
    const xMax = edges.xMax * widthScale;
    const yMin = edges.yMin * heightScale;
    const yMax = edges.yMax * heightScale;

    const stageCenterX = metrics.displayWidth / 2;
    const stageCenterY = metrics.displayHeight / 2;
    const currentPan = panRef.current;
    const leftEdge = (xMin - stageCenterX) * zoom + currentPan.x;
    const rightEdge = (xMax - stageCenterX) * zoom + currentPan.x;
    const topEdge = (yMin - stageCenterY) * zoom + currentPan.y;
    const bottomEdge = (yMax - stageCenterY) * zoom + currentPan.y;

    const margin = bubbleMargin;
    const leftBound = -metrics.wrapperWidth / 2 + margin;
    const rightBound = metrics.wrapperWidth / 2 - margin;
    const topBound = -metrics.wrapperHeight / 2 + margin;
    const bottomBound = metrics.wrapperHeight / 2 - margin;

    const bubbleWidth = (xMax - xMin) * zoom;
    const bubbleHeight = (yMax - yMin) * zoom;
    const bubbleCenterX = (xMin + xMax) / 2;
    const bubbleCenterY = (yMin + yMax) / 2;

    let nextPanX = currentPan.x;
    let nextPanY = currentPan.y;

    if (bubbleWidth + margin * 2 > metrics.wrapperWidth) {
      nextPanX = -((bubbleCenterX - stageCenterX) * zoom);
    } else if (leftEdge < leftBound) {
      nextPanX += leftBound - leftEdge;
    } else if (rightEdge > rightBound) {
      nextPanX += rightBound - rightEdge;
    }

    if (bubbleHeight + margin * 2 > metrics.wrapperHeight) {
      nextPanY = -((bubbleCenterY - stageCenterY) * zoom);
    } else if (topEdge < topBound) {
      nextPanY += topBound - topEdge;
    } else if (bottomEdge > bottomBound) {
      nextPanY += bottomBound - bottomEdge;
    }

    panTo(nextPanX, nextPanY);
  }, [
    autoPanEnabled,
    bubbleMargin,
    currentPage?.json,
    metrics.displayHeight,
    metrics.displayWidth,
    metrics.imageHeight,
    metrics.imageWidth,
    metrics.wrapperHeight,
    metrics.wrapperWidth,
    panTo,
    selectedIndex,
    zoom,
  ]);

  useEffect(() => {
    ensureBubbleInView();
  }, [ensureBubbleInView]);

  const savePageJson = useCallback(
    async (
      pageIndex: number,
      options?: { silent?: boolean; statusPrefix?: string },
    ) => {
      const page = pages[pageIndex];
      if (!page?.json || !page.asset) return { ok: false };
      if (!canEdit) return { ok: false };
      const dirtyRevision = page.dirtyRevision;
      const pageLabel = `Page ${page.asset.pageIndex}`;
      if (!options?.silent) {
        setStatusMessage(`${options?.statusPrefix ?? "Saving"} ${pageLabel}...`);
      }
      updatePageState(pageIndex, (prev) => ({ ...prev, isSaving: true }));
      try {
        const response = await fetch(
          `/api/chapters/${chapterId}/assets/${page.asset.assetId}/json`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: page.json }),
          },
        );
        if (!response.ok) {
          if (!options?.silent) {
            setStatusMessage(`Failed to save ${pageLabel}.`);
          }
          updatePageState(pageIndex, (prev) => ({ ...prev, isSaving: false }));
          return { ok: false };
        }
        const data = (await response.json()) as { jsonUrl?: string };
        const jsonUrl = data.jsonUrl ?? null;
        updatePageState(pageIndex, (prev) => ({
          ...prev,
          asset: { ...prev.asset, jsonUrl },
          isSaving: false,
          isDirty: prev.dirtyRevision === dirtyRevision ? false : prev.isDirty,
        }));
        if (!options?.silent) {
          setStatusMessage(`${pageLabel} saved.`);
        }
        return { ok: true, pageLabel };
      } catch {
        if (!options?.silent) {
          setStatusMessage(`Failed to save ${pageLabel}.`);
        }
        updatePageState(pageIndex, (prev) => ({ ...prev, isSaving: false }));
        return { ok: false };
      }
    },
    [canEdit, chapterId, pages, setStatusMessage, updatePageState],
  );

  const onSave = useCallback(async () => {
    if (!currentPage) return;
    await savePageJson(currentPageIndex);
  }, [currentPage, currentPageIndex, savePageJson]);

  const onDownload = useCallback(() => {
    if (!currentPage?.json) return;
    const fileName = currentPage.asset.fileName
      ? currentPage.asset.fileName.replace(/\.[^/.]+$/, ".json")
      : `chapter-${chapterId}-page-${currentPage.asset.pageIndex}.json`;
    const blob = new Blob([JSON.stringify(currentPage.json, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [chapterId, currentPage]);

  const onSaveAll = useCallback(async () => {
    if (!canEdit) return;
    const targets = pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.json);
    if (!targets.length) {
      setStatusMessage("No pages available to save.");
      return;
    }
    setStatusMessage("Saving all pages...");
    const saved: string[] = [];
    for (const target of targets) {
      const result = await savePageJson(target.index, { silent: true });
      if (result.ok && result.pageLabel) {
        saved.push(result.pageLabel);
      }
    }
    if (saved.length) {
      setStatusMessage(`Saved: ${saved.join(", ")}.`);
    } else {
      setStatusMessage("No pages were saved.");
    }
  }, [canEdit, pages, savePageJson, setStatusMessage]);

  const onMarkTranslated = useCallback(async () => {
    const page = pages[currentPageIndex];
    if (!page?.json) return;
    const saveResult = await savePageJson(currentPageIndex, { silent: true });
    if (!saveResult.ok) {
      setStatusMessage("Failed to save before marking translation done.");
      return;
    }
    try {
      const response = await fetch(
        `/api/chapters/${chapterId}/assets/${page.asset.assetId}/translation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isTranslated: true }),
        },
      );
      if (!response.ok) {
        setStatusMessage("Failed to mark translation as done.");
        return;
      }
      updatePageState(currentPageIndex, (prev) => ({
        ...prev,
        asset: { ...prev.asset, isTranslated: true },
      }));
      setStatusMessage(`${saveResult.pageLabel ?? "Page"} saved and marked done.`);
      selectPage(Math.min(pages.length - 1, currentPageIndex + 1));
    } catch {
      setStatusMessage("Failed to mark translation as done.");
    }
  }, [
    chapterId,
    currentPageIndex,
    pages,
    savePageJson,
    selectPage,
    setStatusMessage,
    updatePageState,
  ]);

  const handleTextChange = useCallback(
    (value: string) => {
      updateCurrentJson((json) => {
        if (selectedIndex < 0) return json;
        json.items[selectedIndex] = { ...json.items[selectedIndex], text: value };
        return json;
      });
    },
    [selectedIndex, updateCurrentJson],
  );

  useEffect(() => {
    if (!canEdit) return undefined;
    const interval = window.setInterval(() => {
      const page = pages[currentPageIndex];
      if (!page?.json || !page.isDirty || page.isSaving) return;
      void savePageJson(currentPageIndex, { silent: true }).then((result) => {
        if (result.ok && result.pageLabel) {
          setStatusMessage(`Auto-saved ${result.pageLabel}.`);
        }
      });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [canEdit, currentPageIndex, pages, savePageJson, setStatusMessage]);

  const handleTextCommit = useCallback(
    (snapshot: PageJson) => {
      if (selectedIndex < 0) return;
      const beforeText = snapshot.items?.[selectedIndex]?.text ?? "";
      const afterText = currentPage?.json?.items?.[selectedIndex]?.text ?? "";
      pushHistorySnapshot(snapshot, "text edit", {
        action: "text_edit",
        bubbleId: snapshot.items?.[selectedIndex]?.id,
        field: "text",
        from: beforeText,
        to: afterText,
      });
    },
    [currentPage?.json, pushHistorySnapshot, selectedIndex],
  );

  const handleOrderChange = useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || !currentPage?.json) return;
      updateCurrentJson((json) => {
        const ordered = getOrderedBubbleIndices(json);
        const currentPosition = ordered.indexOf(selectedIndex);
        if (currentPosition === -1) return json;
        const clampedOrder = clampValue(value, 1, ordered.length);
        reorderBubbleToPosition(json, selectedIndex, clampedOrder - 1);
        return json;
      }, "manual order change", {
        action: "order_change",
        bubbleId: currentPage.json.items?.[selectedIndex]?.id,
        field: "order",
        from: currentPage.json.items?.[selectedIndex]?.order ?? null,
        to: value,
      });
      setManualOrderNotice(true);
    },
    [currentPage?.json, selectedIndex, updateCurrentJson],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      updateCurrentJson((json) => {
        if (selectedIndex < 0) return json;
        json.items[selectedIndex] = { ...json.items[selectedIndex], bubble_type: value };
        return json;
      }, "bubble type change", {
        action: "type_change",
        bubbleId: currentPage?.json?.items?.[selectedIndex]?.id,
        field: "bubble_type",
        from: currentPage?.json?.items?.[selectedIndex]?.bubble_type ?? null,
        to: value,
      });
    },
    [currentPage?.json, selectedIndex, updateCurrentJson],
  );

  const handleAutoOrder = useCallback(() => {
    updateCurrentJson((json) => {
      autoOrderBubbles(json);
      return json;
    }, "auto order", { action: "auto_order" });
    setManualOrderNotice(false);
  }, [updateCurrentJson]);

  const handleReorder = useCallback(
    (fromIndex: number, targetIndex: number) => {
      updateCurrentJson((json) => {
        const ordered = getOrderedBubbleIndices(json);
        const targetPosition = ordered.indexOf(targetIndex);
        if (targetPosition === -1 || fromIndex === targetIndex) return json;
        reorderBubbleToPosition(json, fromIndex, targetPosition);
        return json;
      }, "drag reorder", {
        action: "drag_reorder",
        bubbleId: currentPage?.json?.items?.[fromIndex]?.id,
        from: fromIndex,
        to: targetIndex,
      });
      setManualOrderNotice(true);
    },
    [currentPage?.json, updateCurrentJson],
  );

  const handleAddBubble = useCallback(
    (bbox: { xMin: number; xMax: number; yMin: number; yMax: number }) => {
      if (!currentPage?.json) return;
      let nextId: number | string | undefined;
      updateCurrentJson((json) => {
        const orders = json.items
          .map((item) => Number(item.order))
          .filter((value) => Number.isFinite(value));
        const nextOrder = orders.length ? Math.max(...orders) + 1 : json.items.length + 1;
        const lastId = json.items.at(-1)?.id;
        const lastNumber =
          typeof lastId === "number" ? lastId : Number.parseInt(String(lastId ?? ""), 10);
        nextId = Number.isFinite(lastNumber) ? lastNumber + 1 : json.items.length + 1;
        json.items.push({
          id: nextId,
          order: nextOrder,
          text_original: "",
          text: "",
          bubble_type: "Standard",
          bbox_bubble: {
            x_min: bbox.xMin,
            y_min: bbox.yMin,
            x_max: bbox.xMax,
            y_max: bbox.yMax,
            xMin: bbox.xMin,
            yMin: bbox.yMin,
            xMax: bbox.xMax,
            yMax: bbox.yMax,
          },
        });
        return json;
      }, "add bubble", {
        action: "add_bubble",
        bubbleId: nextId,
      });
      setSelectedBubbleIndex(currentPage.json.items.length);
      setDrawMode(false);
    },
    [currentPage?.json, setDrawMode, setSelectedBubbleIndex, updateCurrentJson],
  );

  const handleRemoveBubble = useCallback(() => {
    if (!currentPage?.json || selectedIndex < 0) return;
    const bubbleId = currentPage.json.items[selectedIndex]?.id;
    updateCurrentJson((json) => {
      json.items.splice(selectedIndex, 1);
      return json;
    }, "remove bubble", { action: "remove_bubble", bubbleId });
  }, [currentPage?.json, selectedIndex, updateCurrentJson]);

  const handleToggleDrawMode = useCallback(() => {
    setDrawMode((prev) => !prev);
  }, []);

  const handleToggleDrawShortcut = useCallback(() => {
    if (!canEdit) return;
    setDrawMode((prev) => !prev);
  }, [canEdit]);

  const handleRemoveBubbleShortcut = useCallback(() => {
    if (!canEdit) return;
    handleRemoveBubble();
  }, [canEdit, handleRemoveBubble]);

  const handleUpdateBubbleBbox = useCallback(
    (index: number, bbox: { xMin: number; xMax: number; yMin: number; yMax: number }) => {
      updateCurrentJson((json) => {
        if (!json.items[index]) return json;
        const nextBBox = {
          x_min: bbox.xMin,
          y_min: bbox.yMin,
          x_max: bbox.xMax,
          y_max: bbox.yMax,
          xMin: bbox.xMin,
          yMin: bbox.yMin,
          xMax: bbox.xMax,
          yMax: bbox.yMax,
        };
        if (json.items[index].bbox_bubble) {
          json.items[index] = { ...json.items[index], bbox_bubble: nextBBox };
        } else if (json.items[index].bbox_text) {
          json.items[index] = { ...json.items[index], bbox_text: nextBBox };
        } else {
          json.items[index] = { ...json.items[index], bbox_bubble: nextBBox };
        }
        return json;
      });
    },
    [updateCurrentJson],
  );

  const handleCommitResize = useCallback(
    (snapshot: PageJson, index: number) => {
      const beforeItem = snapshot.items?.[index];
      const afterItem = currentPage?.json?.items?.[index];
      const getSizeLabel = (item: typeof beforeItem) => {
        const bbox = item?.bbox_bubble ?? item?.bbox_text;
        if (!bbox) return null;
        const xMin = bbox.x_min ?? bbox.xMin ?? 0;
        const yMin = bbox.y_min ?? bbox.yMin ?? 0;
        const xMax = bbox.x_max ?? bbox.xMax ?? 0;
        const yMax = bbox.y_max ?? bbox.yMax ?? 0;
        const width = Math.max(0, Math.round(xMax - xMin));
        const height = Math.max(0, Math.round(yMax - yMin));
        return `${width}x${height}`;
      };
      pushHistorySnapshot(snapshot, "resize bubble", {
        action: "resize_bubble",
        bubbleId: beforeItem?.id,
        field: "bbox",
        from: getSizeLabel(beforeItem),
        to: getSizeLabel(afterItem),
      });
    },
    [currentPage?.json, pushHistorySnapshot],
  );

  const hasJson = Boolean(currentPage?.json);
  const canSave = hasJson && canEdit;
  const canSaveAll = canEdit && pages.some((page) => page.json && page.isDirty);
  const canMarkTranslated = canSave && !currentPage?.isSaving;

  const assets = useMemo(() => pages.map((page) => page.asset), [pages]);
  const handlePrevPage = useCallback(() => {
    selectPage(Math.max(0, currentPageIndex - 1));
  }, [currentPageIndex, selectPage]);

  const handleNextPage = useCallback(() => {
    selectPage(Math.min(pages.length - 1, currentPageIndex + 1));
  }, [currentPageIndex, pages.length, selectPage]);

  useShortcuts({
    onSave,
    onUndo: undo,
    onRedo: redo,
    onToggleDrawMode: handleToggleDrawShortcut,
    onRemoveBubble: handleRemoveBubbleShortcut,
    onNextBubble: selectNextBubble,
    onPrevBubble: selectPrevBubble,
    onNextPage: handleNextPage,
    onPrevPage: handlePrevPage,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: reset,
    onPan: panBy,
    panStep,
  });

  return (
    <div className={styles.editorRoot}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Translation Editor</h2>
          <p className={styles.subtitle}>This editor always stays English + LTR.</p>
        </div>
        {!canEdit && <span className={styles.readonlyBadge}>Read-only</span>}
      </div>
      {errorMessage && <div className={styles.errorBanner}>{errorMessage}</div>}
      {statusMessage && <div className={styles.statusBanner}>{statusMessage}</div>}
      <div className={styles.contentGrid}>
        <div className={styles.column}>
          <PageSwitcher
            pages={assets}
            currentIndex={currentPageIndex}
            onSelect={selectPage}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        </div>
        <div className={styles.previewColumn}>
          <ImageOverlay
            imageUrl={currentPage?.asset.imageUrl ?? null}
            json={currentPage?.json ?? null}
            selectedIndex={selectedIndex}
            pan={pan}
            canPan={canPan}
            canEdit={canEdit}
            drawMode={drawMode}
            zoom={zoom}
            transformStyle={transform}
            onSelect={setSelectedBubbleIndex}
            onWheelZoom={wheelZoom}
            onPanTo={panTo}
            onAddBubble={handleAddBubble}
            onCommitResize={handleCommitResize}
            onUpdateBubble={handleUpdateBubbleBbox}
            onDrawModeChange={setDrawMode}
            onStageMetricsChange={setStageMetrics}
            onMetricsChange={setMetrics}
            toolbar={
              <Toolbar
                canEdit={canEdit}
                canSave={canSave}
                canRemove={selectedIndex >= 0}
                drawMode={drawMode}
                zoom={zoom}
                canSaveAll={canSaveAll}
                canMarkTranslated={canMarkTranslated}
                isTranslated={Boolean(currentPage?.asset.isTranslated)}
                onSave={onSave}
                onSaveAll={onSaveAll}
                onMarkTranslated={onMarkTranslated}
                onDownload={onDownload}
                onUndo={undo}
                onRedo={redo}
                onToggleDrawMode={handleToggleDrawMode}
                onRemoveBubble={handleRemoveBubble}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onResetZoom={reset}
              />
            }
          />
        </div>
        <div className={styles.column}>
          <BubbleList
            items={items}
            orderedIndices={orderedBubbleIndices}
            selectedIndex={selectedIndex}
            onSelect={setSelectedBubbleIndex}
            onReorder={handleReorder}
            readOnly={!canEdit}
          />
          <BubbleDetails
            item={selectedItem}
            json={currentPage?.json ?? null}
            readOnly={!canEdit}
            onUpdateText={handleTextChange}
            onCommitText={handleTextCommit}
            onUpdateOrder={handleOrderChange}
            onUpdateType={handleTypeChange}
            onAutoOrder={handleAutoOrder}
            manualOrderNotice={manualOrderNotice}
          />
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Settings</h3>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={autoPanEnabled}
                onChange={(event) => setAutoPanEnabled(event.target.checked)}
              />
              Auto-pan bubble into view on arrow navigation
            </label>
            <label className={styles.formLabel}>Bubble view margin (px)</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={300}
              step={5}
              value={bubbleMargin}
              onChange={(event) => setBubbleMargin(Number(event.target.value) || 0)}
            />
          </div>
          <HistoryPanel
            undoStack={currentPage?.history.undoStack ?? []}
            redoStack={currentPage?.history.redoStack ?? []}
            onUndo={undo}
            onRedo={redo}
            onClear={clearHistoryState}
            onApplyHistory={applyHistoryEntry}
          />
        </div>
      </div>
    </div>
  );
}
