"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getItemBbox, getOrderedBubbleIndices } from "./utils";
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

  const { zoom, transform, zoomIn, zoomOut, reset, panBy, panTo, wheelZoom, panStep } =
    useZoomPan();

  const [autoPanEnabled, setAutoPanEnabled] = useState(true);
  const [bubbleMargin, setBubbleMargin] = useState(DEFAULT_MARGIN);
  const [manualOrderNotice, setManualOrderNotice] = useState(false);
  const [metrics, setMetrics] = useState({
    displayWidth: 0,
    displayHeight: 0,
    imageWidth: 0,
    imageHeight: 0,
  });

  const items = currentPage?.json?.items ?? [];
  const selectedIndex = currentPage?.selectedBubbleIndex ?? -1;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  useEffect(() => {
    if (currentPage?.json?.items?.length && currentPage.selectedBubbleIndex < 0) {
      setSelectedBubbleIndex(0);
    }
  }, [currentPage?.json?.items?.length, currentPage?.selectedBubbleIndex, setSelectedBubbleIndex]);

  useEffect(() => {
    setManualOrderNotice(false);
  }, [currentPageIndex]);

  const ensureBubbleInView = useCallback(() => {
    if (!autoPanEnabled || !currentPage?.json || selectedIndex < 0) return;
    const item = currentPage.json.items[selectedIndex];
    const bbox = getItemBbox(item);
    if (!bbox || !metrics.displayWidth || !metrics.displayHeight) return;
    const widthScale = metrics.displayWidth / (metrics.imageWidth || metrics.displayWidth);
    const heightScale = metrics.displayHeight / (metrics.imageHeight || metrics.displayHeight);
    const centerX = (bbox.x_min + bbox.x_max) / 2 * widthScale;
    const centerY = (bbox.y_min + bbox.y_max) / 2 * heightScale;
    const targetX = metrics.displayWidth / 2 - centerX * zoom;
    const targetY = metrics.displayHeight / 2 - centerY * zoom;
    const marginX = Math.sign(targetX) * bubbleMargin;
    const marginY = Math.sign(targetY) * bubbleMargin;
    panTo(targetX + marginX, targetY + marginY);
  }, [
    autoPanEnabled,
    bubbleMargin,
    currentPage?.json,
    metrics.displayHeight,
    metrics.displayWidth,
    metrics.imageHeight,
    metrics.imageWidth,
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
      if (data.jsonUrl) {
        updateCurrentAsset((asset) => ({ ...asset, jsonUrl: data.jsonUrl }));
      }
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
        const nextPosition = Math.max(0, Math.min(value - 1, ordered.length - 1));
        if (currentPosition === -1) return json;
        ordered.splice(currentPosition, 1);
        ordered.splice(nextPosition, 0, selectedIndex);
        ordered.forEach((index, position) => {
          json.items[index] = { ...json.items[index], order: position + 1 };
        });
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
      const ordered = getOrderedBubbleIndices(json, { ignoreExplicitOrder: true });
      ordered.forEach((index, position) => {
        json.items[index] = { ...json.items[index], order: position + 1 };
      });
      return json;
    }, "auto order");
    setManualOrderNotice(false);
  }, [updateCurrentJson]);

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
            transformStyle={transform}
            onSelect={setSelectedBubbleIndex}
            onWheelZoom={wheelZoom}
            onPanBy={panBy}
            onMetricsChange={setMetrics}
          />
        </div>
        <div className={styles.column}>
          <BubbleList
            items={items}
            orderedIndices={orderedBubbleIndices}
            selectedIndex={selectedIndex}
            onSelect={setSelectedBubbleIndex}
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
