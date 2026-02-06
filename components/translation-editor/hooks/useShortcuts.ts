import { useEffect } from "react";

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

type ShortcutHandlers = {
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNextBubble: () => void;
  onPrevBubble: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onPan: (dx: number, dy: number) => void;
  panStep: number;
};

export const useShortcuts = ({
  onSave,
  onUndo,
  onRedo,
  onNextBubble,
  onPrevBubble,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onPan,
  panStep,
}: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            onRedo();
          } else {
            onUndo();
          }
          return;
        }
        if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          onRedo();
          return;
        }
      }

      if (!event.ctrlKey && !event.metaKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          onZoomIn();
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          onZoomOut();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          onResetZoom();
          return;
        }
        if (event.shiftKey && event.key === "ArrowLeft") {
          event.preventDefault();
          onPan(-panStep, 0);
          return;
        }
        if (event.shiftKey && event.key === "ArrowRight") {
          event.preventDefault();
          onPan(panStep, 0);
          return;
        }
        if (event.shiftKey && event.key === "ArrowUp") {
          event.preventDefault();
          onPan(0, -panStep);
          return;
        }
        if (event.shiftKey && event.key === "ArrowDown") {
          event.preventDefault();
          onPan(0, panStep);
          return;
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevBubble();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNextBubble();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onSave,
    onUndo,
    onRedo,
    onNextBubble,
    onPrevBubble,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onPan,
    panStep,
  ]);
};
