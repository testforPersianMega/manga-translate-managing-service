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
    updateCurrentAsset,
    pushHistorySnapshot,
    undo,
    redo,
    clearHistoryState,
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

  const onSave = useCallback(async () => {
    if (!currentPage?.json || !currentPage.asset) return;
    if (!canEdit) return;
    setStatusMessage("Saving JSON...");
    try {
      const response = await fetch(
        `/api/chapters/${chapterId}/assets/${currentPage.asset.assetId}/json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: currentPage.json }),
        },
      );
      if (!response.ok) {
        setStatusMessage("Failed to save JSON.");
        return;
      }
      const data = (await response.json()) as { jsonUrl?: string };
      const jsonUrl = data.jsonUrl ?? null;
      updateCurrentAsset((asset) => ({ ...asset, jsonUrl }));
      setStatusMessage("JSON saved successfully.");
    } catch {
      setStatusMessage("Failed to save JSON.");
    }
  }, [canEdit, chapterId, currentPage, setStatusMessage]);

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

  const handleTextCommit = useCallback(
    (snapshot: PageJson) => {
      pushHistorySnapshot(snapshot, "text edit");
    },
    [pushHistorySnapshot],
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
      }, "manual order change");
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
      }, "bubble type change");
    },
    [selectedIndex, updateCurrentJson],
  );

  const handleAutoOrder = useCallback(() => {
    updateCurrentJson((json) => {
      autoOrderBubbles(json);
      return json;
    }, "auto order");
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
      }, "drag reorder");
      setManualOrderNotice(true);
    },
    [updateCurrentJson],
  );

  const hasJson = Boolean(currentPage?.json);
  const canSave = hasJson && canEdit;

  useShortcuts({
    onSave,
    onUndo: undo,
    onRedo: redo,
    onNextBubble: selectNextBubble,
    onPrevBubble: selectPrevBubble,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: reset,
    onPan: panBy,
    panStep,
  });

  const assets = useMemo(() => pages.map((page) => page.asset), [pages]);
  const handlePrevPage = useCallback(() => {
    selectPage(Math.max(0, currentPageIndex - 1));
  }, [currentPageIndex, selectPage]);

  const handleNextPage = useCallback(() => {
    selectPage(Math.min(pages.length - 1, currentPageIndex + 1));
  }, [currentPageIndex, pages.length, selectPage]);

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
          <Toolbar
            canEdit={canEdit}
            canSave={canSave}
            zoom={zoom}
            onSave={onSave}
            onDownload={onDownload}
            onUndo={undo}
            onRedo={redo}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={reset}
          />
          <ImageOverlay
            imageUrl={currentPage?.asset.imageUrl ?? null}
            json={currentPage?.json ?? null}
            selectedIndex={selectedIndex}
            pan={pan}
            canPan={canPan}
            transformStyle={transform}
            onSelect={setSelectedBubbleIndex}
            onWheelZoom={wheelZoom}
            onPanTo={panTo}
            onStageMetricsChange={setStageMetrics}
            onMetricsChange={setMetrics}
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
          />
        </div>
      </div>
    </div>
  );
}
