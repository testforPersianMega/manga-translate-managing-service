import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChapterAsset, PageJson, PageState } from "../types";
import {
  applyRedo,
  applyUndo,
  clearHistory,
  cloneJson,
  createHistoryState,
  pushHistory,
} from "./useHistory";
import { getOrderedBubbleIndices } from "../utils";

const clampIndex = (index: number, length: number) => {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(index, length - 1));
};

export const useEditorState = (chapterId: string) => {
  const [pages, setPages] = useState<PageState[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentPage = pages[currentPageIndex] ?? null;

  const loadAssets = useCallback(async () => {
    try {
      setErrorMessage(null);
      const response = await fetch(`/api/chapters/${chapterId}/assets`);
      if (!response.ok) {
        setErrorMessage("Failed to load chapter assets.");
        return;
      }
      const data = (await response.json()) as ChapterAsset[];
      const nextPages = data.map((asset) => ({
        asset,
        json: null,
        isJsonLoading: Boolean(asset.jsonUrl),
        selectedBubbleIndex: -1,
        history: createHistoryState(),
      }));
      setPages(nextPages);
      setCurrentPageIndex(0);
    } catch {
      setErrorMessage("Failed to load chapter assets.");
    }
  }, [chapterId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    const page = pages[currentPageIndex];
    if (!page || page.json || !page.asset.jsonUrl || !page.isJsonLoading) return;
    let active = true;
    const loadJson = async () => {
      try {
        const response = await fetch(page.asset.jsonUrl ?? "");
        if (!response.ok) {
          if (!active) return;
          setPages((prev) =>
            prev.map((item, index) =>
              index === currentPageIndex
                ? { ...item, json: null, isJsonLoading: false }
                : item,
            ),
          );
          return;
        }
        const jsonData = (await response.json()) as PageJson;
        if (!active) return;
        setPages((prev) =>
          prev.map((item, index) =>
            index === currentPageIndex
              ? {
                  ...item,
                  json: jsonData,
                  isJsonLoading: false,
                  selectedBubbleIndex: clampIndex(
                    item.selectedBubbleIndex,
                    jsonData.items?.length ?? 0,
                  ),
                }
              : item,
          ),
        );
      } catch {
        if (!active) return;
        setPages((prev) =>
          prev.map((item, index) =>
            index === currentPageIndex
              ? { ...item, json: null, isJsonLoading: false }
              : item,
          ),
        );
      }
    };
    void loadJson();
    return () => {
      active = false;
    };
  }, [currentPageIndex, pages]);

  const selectPage = useCallback((index: number) => {
    setCurrentPageIndex((prev) => {
      if (index < 0 || index >= pages.length) return prev;
      return index;
    });
  }, [pages.length]);

  const setSelectedBubbleIndex = useCallback((index: number) => {
    setPages((prev) =>
      prev.map((page, pageIndex) => {
        if (pageIndex !== currentPageIndex) return page;
        if (!page.json) return page;
        return {
          ...page,
          selectedBubbleIndex: clampIndex(index, page.json.items.length),
        };
      }),
    );
  }, [currentPageIndex]);

  const updateCurrentJson = useCallback(
    (updater: (json: PageJson) => PageJson, label?: string) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page?.json) return prev;
        const before = cloneJson(page.json);
        const updated = updater(cloneJson(page.json));
        const history = label ? pushHistory(page.history, before, label) : page.history;
        const nextSelected = clampIndex(
          page.selectedBubbleIndex,
          updated.items?.length ?? 0,
        );
        next[currentPageIndex] = {
          ...page,
          json: updated,
          history,
          selectedBubbleIndex: nextSelected,
        };
        return next;
      });
    },
    [currentPageIndex],
  );

  const updateCurrentAsset = useCallback(
    (updater: (asset: ChapterAsset) => ChapterAsset) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page) return prev;
        next[currentPageIndex] = { ...page, asset: updater(page.asset) };
        return next;
      });
    },
    [currentPageIndex],
  );

  const pushHistorySnapshot = useCallback(
    (snapshot: PageJson, label: string) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page?.json) return prev;
        next[currentPageIndex] = {
          ...page,
          history: pushHistory(page.history, snapshot, label),
        };
        return next;
      });
    },
    [currentPageIndex],
  );

  const undo = useCallback(() => {
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page?.json) return prev;
      const { nextState, snapshot } = applyUndo(page.history, page.json);
      if (!snapshot) return prev;
      next[currentPageIndex] = {
        ...page,
        json: snapshot,
        history: nextState,
        selectedBubbleIndex: clampIndex(
          page.selectedBubbleIndex,
          snapshot.items?.length ?? 0,
        ),
      };
      return next;
    });
  }, [currentPageIndex]);

  const redo = useCallback(() => {
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page?.json) return prev;
      const { nextState, snapshot } = applyRedo(page.history, page.json);
      if (!snapshot) return prev;
      next[currentPageIndex] = {
        ...page,
        json: snapshot,
        history: nextState,
        selectedBubbleIndex: clampIndex(
          page.selectedBubbleIndex,
          snapshot.items?.length ?? 0,
        ),
      };
      return next;
    });
  }, [currentPageIndex]);

  const clearHistoryState = useCallback(() => {
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPageIndex];
      if (!page) return prev;
      next[currentPageIndex] = {
        ...page,
        history: clearHistory(),
      };
      return next;
    });
  }, [currentPageIndex]);

  const orderedBubbleIndices = useMemo(() => {
    if (!currentPage?.json?.items?.length) return [];
    return getOrderedBubbleIndices(currentPage.json);
  }, [currentPage?.json]);

  const selectNextBubble = useCallback(() => {
    if (!currentPage?.json?.items?.length) return;
    const ordered = getOrderedBubbleIndices(currentPage.json);
    if (!ordered.length) return;
    const currentPosition = ordered.indexOf(currentPage.selectedBubbleIndex);
    const nextPosition = currentPosition === -1 ? 0 : currentPosition + 1;
    const nextIndex = ordered[nextPosition >= ordered.length ? 0 : nextPosition];
    if (nextIndex !== undefined) {
      setSelectedBubbleIndex(nextIndex);
    }
  }, [currentPage, setSelectedBubbleIndex]);

  const selectPrevBubble = useCallback(() => {
    if (!currentPage?.json?.items?.length) return;
    const ordered = getOrderedBubbleIndices(currentPage.json);
    if (!ordered.length) return;
    const currentPosition = ordered.indexOf(currentPage.selectedBubbleIndex);
    const prevPosition =
      currentPosition === -1 ? ordered.length - 1 : currentPosition - 1;
    const prevIndex = ordered[prevPosition < 0 ? ordered.length - 1 : prevPosition];
    if (prevIndex !== undefined) {
      setSelectedBubbleIndex(prevIndex);
    }
  }, [currentPage, setSelectedBubbleIndex]);

  const bubbleCount = currentPage?.json?.items?.length ?? 0;

  return {
    pages,
    currentPageIndex,
    currentPage,
    statusMessage,
    errorMessage,
    bubbleCount,
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
    loadAssets,
    setStatusMessage,
  };
};
