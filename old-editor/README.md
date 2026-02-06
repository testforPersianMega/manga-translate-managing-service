# Manga Translate Helper

This is a single-page helper for reviewing manga bubble detection JSON alongside uploaded images. It lets you browse pages, inspect bubble details, and export updated translations.

## Features

- Upload multiple images and JSON files to align pages by filename.
- Navigate bubbles using the list or keyboard.
- Zoom and pan the preview to inspect text regions, including mouse-wheel zooming.
- Undo and redo bubble edits, reorders, and region adjustments with a visible history list.
- Export the current or all JSON files after edits.

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Save current JSON | `Ctrl/Cmd + S` |
| Undo change | `Ctrl/Cmd + Z` |
| Redo change | `Ctrl/Cmd + Shift + Z` or `Ctrl + Y` |
| Next bubble | `Arrow Right` |
| Previous bubble | `Arrow Left` |
| Zoom in | `+` or `=` |
| Zoom out | `-` |
| Reset zoom/position | `0` |
| Zoom with mouse | Scroll wheel while hovering the image |
| Pan image left | `Shift + Arrow Left` |
| Pan image right | `Shift + Arrow Right` |
| Pan image up | `Shift + Arrow Up` |
| Pan image down | `Shift + Arrow Down` |

Bubble navigation follows the bubble bounding boxes (`bbox_bubble` or `bbox_text`) from left to right.

Shortcut keys are based on the physical keyboard layout (the same keys work on Persian
keyboard layouts).

## History

Use the History section on the right to review recent edits. The Undo and Redo buttons
in that panel work the same as the toolbar buttons and keyboard shortcuts, so you can
step through changes directly from the list.

## Usage

1. Open `index.html` in your browser.
2. Upload images and JSON files with matching base names.
3. Select bubbles to edit translations and download updated JSON.

## Project Structure

```
.
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── index.html
└── README.md
```

### File Guide

- `index.html`: The main page structure and UI markup for the app.
- `css/styles.css`: All visual styling for the layout, toolbar, panels, and overlays.
- `js/app.js`: The full application logic (state, rendering, interactions, and history).
- `README.md`: Project overview, usage, and file documentation.
