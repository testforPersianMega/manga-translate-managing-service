import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChapterAsset, HistoryEntry, HistoryMeta, PageJson, PageState } from "../types";
import {
  applyRedo,
  applyUndo,
  clearHistory,
  cloneJson,
  createHistoryState,
  pushHistory,
} from "./useHistory";
import {
  applyInitialOverlapOrdering,
  ensureBubbleOrders,
  getOrderedBubbleIndices,
} from "../utils";

const clampIndex = (index: number, length: number) => {
  if (length <= 0) return -1;
  if (index < 0) return -1;
  return Math.max(0, Math.min(index, length - 1));
};

export const useEditorState = (chapterId: string) => {
  const [pages, setPages] = useState<PageState[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const historyQueueRef = useRef<
    { assetId: string; entry: HistoryEntry }[]
  >([]);
  const historyFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchInFlight = useRef<Set<string>>(new Set());
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

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
        isDirty: false,
        dirtyRevision: 0,
        isSaving: false,
        hasHistoryLoaded: false,
        selectedBubbleIndex: -1,
        history: createHistoryState(),
        manualOrderChanged: false,
        overlapOrdered: false,
      }));
      setPages(nextPages);
      setCurrentPageIndex(0);
    } catch {
      setErrorMessage("Failed to load chapter assets.");
    }
  }, [chapterId]);

  const withCacheBust = useCallback((url: string) => {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const hydratePageJson = useCallback(
    (pageIndex: number, jsonData: PageJson) => {
      ensureBubbleOrders(jsonData);
      applyInitialOverlapOrdering(jsonData);
      setPages((prev) =>
        prev.map((item, index) => {
          if (index !== pageIndex) return item;
          if (item.isDirty) {
            return { ...item, isJsonLoading: false };
          }
          const ordered = jsonData.items?.length ? getOrderedBubbleIndices(jsonData) : [];
          const nextSelected =
            item.selectedBubbleIndex < 0
              ? (ordered[0] ?? -1)
              : clampIndex(item.selectedBubbleIndex, jsonData.items?.length ?? 0);
          return {
            ...item,
            json: jsonData,
            isJsonLoading: false,
            selectedBubbleIndex: nextSelected,
            overlapOrdered: true,
          };
        }),
      );
    },
    [],
  );

  const flushHistoryQueue = useCallback(async () => {
    const queued = historyQueueRef.current.splice(0, historyQueueRef.current.length);
    if (!queued.length) return;
    const grouped = queued.reduce<Record<string, HistoryEntry[]>>((acc, item) => {
      acc[item.assetId] = acc[item.assetId] ?? [];
      acc[item.assetId].push(item.entry);
      return acc;
    }, {});
    await Promise.all(
      Object.entries(grouped).map(([assetId, entries]) =>
        fetch(`/api/chapters/${chapterId}/assets/${assetId}/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        }).catch(() => null),
      ),
    );
  }, [chapterId]);

  const queueHistoryEntry = useCallback(
    (assetId: string, entry: HistoryEntry) => {
      historyQueueRef.current.push({ assetId, entry });
      if (historyFlushTimer.current) {
        clearTimeout(historyFlushTimer.current);
      }
      historyFlushTimer.current = setTimeout(() => {
        historyFlushTimer.current = null;
        void flushHistoryQueue();
      }, 1200);
    },
    [flushHistoryQueue],
  );

  useEffect(() => {
    const page = pages[currentPageIndex];
    if (!page || page.json || !page.asset.jsonUrl || !page.isJsonLoading) return;
    let active = true;
    const loadJson = async () => {
      try {
        const response = await fetch(withCacheBust(page.asset.jsonUrl), {
          cache: "no-store",
        });
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
        hydratePageJson(currentPageIndex, jsonData);
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
  }, [currentPageIndex, hydratePageJson, pages, withCacheBust]);

  useEffect(() => {
    pages.forEach((page, index) => {
      if (!page.asset.jsonUrl || page.json) return;
      if (prefetchInFlight.current.has(page.asset.assetId)) return;
      prefetchInFlight.current.add(page.asset.assetId);
      fetch(withCacheBust(page.asset.jsonUrl), { cache: "no-store" })
        .then((response) => {
          if (!response.ok) return null;
          return response.json() as Promise<PageJson>;
        })
        .then((jsonData) => {
          if (!jsonData) return;
          hydratePageJson(index, jsonData);
        })
        .finally(() => {
          prefetchInFlight.current.delete(page.asset.assetId);
        });
    });
  }, [hydratePageJson, pages, withCacheBust]);

  useEffect(() => {
    pages.forEach((page) => {
      if (imageCache.current.has(page.asset.imageUrl)) return;
      const image = new Image();
      image.src = page.asset.imageUrl;
      imageCache.current.set(page.asset.imageUrl, image);
    });
  }, [pages]);

  useEffect(() => {
    const page = pages[currentPageIndex];
    if (!page?.json || page.hasHistoryLoaded) return;
    let active = true;
    const loadHistory = async () => {
      try {
        const response = await fetch(
          `/api/chapters/${chapterId}/assets/${page.asset.assetId}/history`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as HistoryEntry[];
        if (!active) return;
        setPages((prev) =>
          prev.map((item, index) =>
            index === currentPageIndex
              ? {
                  ...item,
                  history: { undoStack: data, redoStack: [] },
                  hasHistoryLoaded: true,
                }
              : item,
          ),
        );
      } catch {
        if (!active) return;
        setPages((prev) =>
          prev.map((item, index) =>
            index === currentPageIndex
              ? { ...item, hasHistoryLoaded: true }
              : item,
          ),
        );
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, [chapterId, currentPageIndex, pages]);

  const selectPage = useCallback(
    (index: number) => {
      setPages((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        return prev.map((page, pageIndex) => {
          if (pageIndex !== index) return page;
          if (!page.json?.items?.length) {
            return { ...page, selectedBubbleIndex: -1 };
          }
          const ordered = getOrderedBubbleIndices(page.json);
          return { ...page, selectedBubbleIndex: ordered[0] ?? -1 };
        });
      });
      setCurrentPageIndex((prev) => {
        if (index < 0 || index >= pages.length) return prev;
        return index;
      });
    },
    [pages.length],
  );

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
    (updater: (json: PageJson) => PageJson, label?: string, meta?: HistoryMeta) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page?.json) return prev;
        const before = cloneJson(page.json);
        const updated = updater(cloneJson(page.json));
        const history = label
          ? pushHistory(page.history, before, label, meta)
          : page.history;
        const entry = label ? history.undoStack.at(-1) : null;
        if (entry) {
          queueHistoryEntry(page.asset.assetId, entry);
        }
        const nextSelected = clampIndex(
          page.selectedBubbleIndex,
          updated.items?.length ?? 0,
        );
        next[currentPageIndex] = {
          ...page,
          json: updated,
          history,
          isDirty: true,
          dirtyRevision: page.dirtyRevision + 1,
          selectedBubbleIndex: nextSelected,
        };
        return next;
      });
    },
    [currentPageIndex, queueHistoryEntry],
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
    (snapshot: PageJson, label: string, meta?: HistoryMeta) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page?.json) return prev;
        const history = pushHistory(page.history, snapshot, label, meta);
        const entry = history.undoStack.at(-1);
        if (entry) {
          queueHistoryEntry(page.asset.assetId, entry);
        }
        next[currentPageIndex] = {
          ...page,
          history,
          isDirty: true,
          dirtyRevision: page.dirtyRevision + 1,
        };
        return next;
      });
    },
    [currentPageIndex, queueHistoryEntry],
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
        isDirty: true,
        dirtyRevision: page.dirtyRevision + 1,
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
        isDirty: true,
        dirtyRevision: page.dirtyRevision + 1,
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

  const applyHistoryEntry = useCallback(
    (entry: HistoryEntry, stackType: "undo" | "redo", index: number) => {
      setPages((prev) => {
        const next = [...prev];
        const page = next[currentPageIndex];
        if (!page?.json) return prev;
        const currentHistory = page.history;
        let nextUndo = currentHistory.undoStack;
        if (stackType === "undo") {
          nextUndo = currentHistory.undoStack.slice(0, index);
        } else {
          nextUndo = [
            ...currentHistory.undoStack,
            ...currentHistory.redoStack.slice(0, index),
          ];
        }
        next[currentPageIndex] = {
          ...page,
          json: cloneJson(entry.snapshot),
          history: {
            undoStack: nextUndo,
            redoStack: [],
          },
          isDirty: true,
          dirtyRevision: page.dirtyRevision + 1,
          selectedBubbleIndex: clampIndex(
            page.selectedBubbleIndex,
            entry.snapshot.items?.length ?? 0,
          ),
        };
        return next;
      });
    },
    [currentPageIndex],
  );

  const updatePageState = useCallback(
    (index: number, updater: (page: PageState) => PageState) => {
      setPages((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        return prev.map((page, pageIndex) =>
          pageIndex === index ? updater(page) : page,
        );
      });
    },
    [],
  );

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
    applyHistoryEntry,
    updatePageState,
    selectNextBubble,
    selectPrevBubble,
    loadAssets,
    setStatusMessage,
  };
};
