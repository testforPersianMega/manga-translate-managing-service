import { useCallback, useEffect, useMemo, useState } from "react";
import type { BubbleItem, PageAsset, PageState } from "./types";
import { extractBubbleItems, getMetadataEntries, updateItemField } from "./utils";
import { useHistory } from "./useHistory";

const EMPTY_STATE: PageState = {
  json: null,
  items: [],
  arrayPath: null,
  imageSize: null,
};

export function useEditorState(chapterId: string, canEdit: boolean) {
  const [pages, setPages] = useState<PageAsset[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageStates, setPageStates] = useState<Record<string, PageState>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const { pushState, undo, redo, canUndo, canRedo, reset } = useHistory();

  const currentPage = pages[currentPageIndex] ?? null;
  const currentState = currentPage ? pageStates[currentPage.assetId] ?? EMPTY_STATE : EMPTY_STATE;

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return currentState.items.find((item) => item.id === selectedItemId) ?? null;
  }, [currentState.items, selectedItemId]);

  const itemsWithMetadata = useMemo(() => {
    return currentState.items.map((item) => ({
      ...item,
      metadataEntries: getMetadataEntries(item.raw),
    }));
  }, [currentState.items]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/chapters/${chapterId}/assets`);
        if (!response.ok) {
          throw new Error("Failed to load chapter assets.");
        }
        const data = (await response.json()) as PageAsset[];
        if (!active) return;
        setPages(data);
        setCurrentPageIndex(0);
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [chapterId]);

  const hydratePage = useCallback(async (page: PageAsset) => {
    try {
      if (!page.jsonUrl) {
        setPageStates((prev) => ({
          ...prev,
          [page.assetId]: {
            ...EMPTY_STATE,
            json: { bubbles: [] },
          },
        }));
        return;
      }
      const response = await fetch(page.jsonUrl);
      if (!response.ok) {
        throw new Error("Failed to load JSON data.");
      }
      const json = (await response.json()) as Record<string, unknown>;
      const { items, arrayPath } = extractBubbleItems(json);
      setPageStates((prev) => ({
        ...prev,
        [page.assetId]: {
          ...prev[page.assetId],
          json,
          items,
          arrayPath,
          imageSize: prev[page.assetId]?.imageSize ?? null,
        },
      }));
      reset(page.assetId);
      setSelectedItemId(items[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [reset]);

  useEffect(() => {
    if (!currentPage) return;
    if (pageStates[currentPage.assetId]) return;
    hydratePage(currentPage);
  }, [currentPage, hydratePage, pageStates]);

  useEffect(() => {
    if (!currentPage) return;
    const items = pageStates[currentPage.assetId]?.items ?? [];
    setSelectedItemId(items[0]?.id ?? null);
  }, [currentPage?.assetId, pageStates]);

  const updatePageState = useCallback(
    (assetId: string, nextJson: Record<string, unknown>) => {
      const { items, arrayPath } = extractBubbleItems(nextJson, pageStates[assetId]?.arrayPath);
      setPageStates((prev) => ({
        ...prev,
        [assetId]: {
          ...prev[assetId],
          json: nextJson,
          items,
          arrayPath,
        },
      }));
    },
    [pageStates],
  );

  const updateTranslation = useCallback(
    (item: BubbleItem, translation: string) => {
      if (!currentPage || !currentState.json || !currentState.arrayPath) return;
      if (!canEdit) return;
      pushState(currentPage.assetId, currentState.json);
      const updated = structuredClone(currentState.json);
      updateItemField(updated, currentState.arrayPath, item.index, "translation", translation);
      updatePageState(currentPage.assetId, updated);
    },
    [canEdit, currentPage, currentState.arrayPath, currentState.json, pushState, updatePageState],
  );

  const updateMetadataField = useCallback(
    (item: BubbleItem, key: string, value: unknown) => {
      if (!currentPage || !currentState.json || !currentState.arrayPath) return;
      if (!canEdit) return;
      pushState(currentPage.assetId, currentState.json);
      const updated = structuredClone(currentState.json);
      updateItemField(updated, currentState.arrayPath, item.index, key, value);
      updatePageState(currentPage.assetId, updated);
    },
    [canEdit, currentPage, currentState.arrayPath, currentState.json, pushState, updatePageState],
  );

  const handleUndo = useCallback(() => {
    if (!currentPage || !currentState.json) return;
    const previous = undo(currentPage.assetId, currentState.json);
    if (previous) {
      updatePageState(currentPage.assetId, previous);
    }
  }, [currentPage, currentState.json, undo, updatePageState]);

  const handleRedo = useCallback(() => {
    if (!currentPage || !currentState.json) return;
    const next = redo(currentPage.assetId, currentState.json);
    if (next) {
      updatePageState(currentPage.assetId, next);
    }
  }, [currentPage, currentState.json, redo, updatePageState]);

  const saveCurrent = useCallback(async () => {
    if (!currentPage || !currentState.json) return;
    if (!canEdit) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/chapters/${chapterId}/assets/${currentPage.assetId}/json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: currentState.json }),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to save JSON.");
      }
      setLastSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, chapterId, currentPage, currentState.json]);

  const downloadCurrent = useCallback(() => {
    if (!currentPage || !currentState.json) return;
    const blob = new Blob([JSON.stringify(currentState.json, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `page-${currentPage.pageIndex}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentPage, currentState.json]);

  const setImageSize = useCallback((assetId: string, size: { width: number; height: number }) => {
    setPageStates((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        imageSize: size,
      },
    }));
  }, []);

  const canUndoCurrent = currentPage ? canUndo(currentPage.assetId) : false;
  const canRedoCurrent = currentPage ? canRedo(currentPage.assetId) : false;

  return {
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
  };
}
