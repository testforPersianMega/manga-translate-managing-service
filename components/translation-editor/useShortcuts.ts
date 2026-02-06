import { useEffect } from "react";

type ShortcutActions = {
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNextItem: () => void;
  onPrevItem: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onPan: (dx: number, dy: number) => void;
};

const PAN_STEP = 30;

export function useShortcuts(actions: ShortcutActions, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const isMeta = event.metaKey || event.ctrlKey;

      if (isMeta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        actions.onSave();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          actions.onRedo();
        } else {
          actions.onUndo();
        }
        return;
      }

      if (isMeta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        actions.onRedo();
        return;
      }

      if (!isTypingTarget && !event.shiftKey) {
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          event.preventDefault();
          actions.onNextItem();
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          event.preventDefault();
          actions.onPrevItem();
          return;
        }
      }

      if (event.shiftKey) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          actions.onPan(0, -PAN_STEP);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          actions.onPan(0, PAN_STEP);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          actions.onPan(-PAN_STEP, 0);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          actions.onPan(PAN_STEP, 0);
          return;
        }
      }

      if (!isTypingTarget) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          actions.onZoomIn();
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          actions.onZoomOut();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          actions.onResetZoom();
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions, enabled]);
}
