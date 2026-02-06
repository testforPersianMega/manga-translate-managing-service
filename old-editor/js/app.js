const imageInput = document.getElementById("imageInput");
const jsonInput = document.getElementById("jsonInput");
const downloadBtn = document.getElementById("downloadBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const statusText = document.getElementById("statusText");
const errorText = document.getElementById("errorText");
const mainImage = document.getElementById("mainImage");
const imageWrapper = document.getElementById("imageWrapper");
const imagePlaceholder = document.getElementById("imagePlaceholder");
const imageStage = document.getElementById("imageStage");
const overlayLayer = document.getElementById("overlayLayer");
const pageList = document.getElementById("pageList");
const bubbleList = document.getElementById("bubbleList");
const detailPlaceholder = document.getElementById("detailPlaceholder");
const detailForm = document.getElementById("detailForm");
const bubbleId = document.getElementById("bubbleId");
const bubbleOrder = document.getElementById("bubbleOrder");
const bubbleOriginal = document.getElementById("bubbleOriginal");
const bubbleText = document.getElementById("bubbleText");
const bubbleType = document.getElementById("bubbleType");
const autoOrderBtn = document.getElementById("autoOrderBtn");
const manualOrderNotice = document.getElementById("manualOrderNotice");
const autoPanToggle = document.getElementById("autoPanToggle");
const bubbleMarginInput = document.getElementById("bubbleMarginInput");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomLabel = document.getElementById("zoomLabel");
const zoomRange = document.getElementById("zoomRange");
const addBubbleBtn = document.getElementById("addBubbleBtn");
const removeBubbleBtn = document.getElementById("removeBubbleBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const historyUndoBtn = document.getElementById("historyUndoBtn");
const historyRedoBtn = document.getElementById("historyRedoBtn");
const historyClearBtn = document.getElementById("historyClearBtn");
const historySummary = document.getElementById("historySummary");
const undoHistoryList = document.getElementById("undoHistoryList");
const redoHistoryList = document.getElementById("redoHistoryList");

const bubbleTypeOptions = Array.from(bubbleType.options).map(
  (option) => option.value,
);

const pages = [];
let currentPageIndex = -1;
let selectedIndex = -1;
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;
let activePointerId = null;
let panRaf = 0;
let pendingPan = null;
let isResizing = false;
let resizeCorner = null;
let resizeStart = null;
let resizePointerId = null;
let resizeTarget = null;
let isDrawingBubble = false;
let drawStart = null;
let drawOverlay = null;
let drawPointerId = null;
let isHistoryApplying = false;
let textEditSnapshot = null;
let textEditDirty = false;
const logDragEvent = (message, event, details = {}) => {
  console.info(`[drag] ${message}`, {
    pointerId: event?.pointerId ?? null,
    buttons: event?.buttons ?? null,
    clientX: event?.clientX ?? null,
    clientY: event?.clientY ?? null,
    panX,
    panY,
    zoomLevel,
    ...details,
  });
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const PAN_STEP = 80;
const PAN_MARGIN = 120;
const MIN_BBOX_SIZE = 12;
const DEFAULT_BUBBLE_VIEW_MARGIN = 80;

let autoPanEnabled = true;
let bubbleViewMargin = DEFAULT_BUBBLE_VIEW_MARGIN;

const getBaseName = (filename) => filename.replace(/\.[^/.]+$/, "");

const getCurrentPage = () => pages[currentPageIndex] ?? null;
const cloneJsonData = (data) =>
  data ? JSON.parse(JSON.stringify(data)) : null;

const ensureHistoryState = (page) => {
  if (!page) return;
  page.undoStack = page.undoStack ?? [];
  page.redoStack = page.redoStack ?? [];
};

const formatHistoryLabel = (source) => {
  const normalized = (source || "edit").replace(/_/g, "-");
  const labels = {
    "add-bubble": "Add bubble",
    "remove-bubble": "Remove bubble",
    "resize-bubble": "Resize bubble",
    "drag-reorder": "Reorder bubble",
    "manual-order-change": "Edit order",
    "bubble-type-change": "Change bubble type",
    "auto-order": "Auto order bubbles",
    "text-edit": "Edit translation",
    "text-original-edit": "Edit original text",
  };
  return labels[normalized] || normalized.replace(/-/g, " ");
};

const formatHistoryTime = (timestamp) => {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const truncateHistoryText = (value, maxLength = 36) => {
  if (!value) return "";
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
};

const getHistoryBubbleDetails = (page, source) => {
  if (!page?.jsonData?.items?.length) return {};
  const items = page.jsonData.items;
  if (source === "add-bubble") {
    return {
      id: getNextBubbleId(items),
    };
  }
  const item = items[selectedIndex] ?? null;
  if (!item) return {};
  return {
    id: item.id ?? selectedIndex + 1,
    order: Number.isFinite(Number(item.order)) ? item.order : undefined,
    type: item.bubble_type,
    text: truncateHistoryText(item.text || item.text_original || ""),
  };
};

const formatHistoryDetail = (details) => {
  if (!details) return "";
  const parts = [];
  if (details.id !== undefined) {
    parts.push(`Bubble #${details.id}`);
  }
  if (details.order !== undefined) {
    parts.push(`Order ${details.order}`);
  }
  if (details.type) {
    parts.push(`Type: ${details.type}`);
  }
  if (details.text) {
    parts.push(`Text: “${details.text}”`);
  }
  return parts.join(" • ");
};

const createHistoryEntry = (page, source) => {
  const detail = formatHistoryDetail(
    getHistoryBubbleDetails(page, source),
  );
  return {
    label: formatHistoryLabel(source),
    detail,
    timestamp: Date.now(),
  };
};

const jumpToHistory = (stackType, displayIndex) => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  ensureHistoryState(page);
  const targetStack =
    stackType === "redo" ? page.redoStack : page.undoStack;
  if (!targetStack.length) return;
  const steps = Math.max(
    1,
    Math.min(displayIndex + 1, targetStack.length),
  );
  for (let i = 0; i < steps; i += 1) {
    if (stackType === "redo") {
      redoChange();
    } else {
      undoChange();
    }
  }
};

const renderHistoryList = (listElement, items, stackType) => {
  listElement.innerHTML = "";
  if (!items.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty";
    emptyItem.textContent = "No entries";
    listElement.appendChild(emptyItem);
    return;
  }
  items.forEach((entry, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.index = String(index);
    button.dataset.stack = stackType;
    const title = document.createElement("span");
    title.className = "history-item-title";
    title.textContent = entry.label || "Edit";
    button.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "history-item-meta";
    meta.textContent = entry.detail || "No details";
    button.appendChild(meta);
    const time = document.createElement("span");
    time.className = "history-item-time";
    time.textContent = formatHistoryTime(entry.timestamp);
    button.appendChild(time);
    button.addEventListener("click", () => {
      jumpToHistory(stackType, index);
    });
    item.appendChild(button);
    listElement.appendChild(item);
  });
};

const updateHistoryPanel = () => {
  const page = getCurrentPage();
  const undoStack = page?.undoStack ?? [];
  const redoStack = page?.redoStack ?? [];
  historySummary.textContent = page?.jsonData
    ? `${undoStack.length} undo • ${redoStack.length} redo`
    : "No changes yet.";
  renderHistoryList(undoHistoryList, [...undoStack].reverse(), "undo");
  renderHistoryList(redoHistoryList, [...redoStack].reverse(), "redo");
  historyUndoBtn.disabled = undoStack.length === 0;
  historyRedoBtn.disabled = redoStack.length === 0;
  historyClearBtn.disabled =
    undoStack.length === 0 && redoStack.length === 0;
};

const updateUndoRedoState = () => {
  const page = getCurrentPage();
  const canUndo =
    Boolean(page?.jsonData) && (page?.undoStack?.length ?? 0) > 0;
  const canRedo =
    Boolean(page?.jsonData) && (page?.redoStack?.length ?? 0) > 0;
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  updateHistoryPanel();
};

const pushHistorySnapshot = (page, snapshot, source) => {
  if (!page?.jsonData || !snapshot || isHistoryApplying) return;
  ensureHistoryState(page);
  const entry = createHistoryEntry(page, source);
  page.undoStack.push({
    jsonData: snapshot,
    manualOrderChanged: page.manualOrderChanged ?? false,
    label: entry.label,
    detail: entry.detail,
    timestamp: entry.timestamp,
  });
  page.redoStack = [];
  updateUndoRedoState();
};

const recordHistory = (page, source) => {
  if (!page?.jsonData || isHistoryApplying) return;
  pushHistorySnapshot(page, cloneJsonData(page.jsonData), source);
};

const refreshAfterHistoryChange = () => {
  const page = getCurrentPage();
  if (!page?.jsonData) {
    resetSelection();
    renderBubbleList();
    renderOverlays();
    updateStatus();
    updateBubbleToolState();
    updateUndoRedoState();
    return;
  }
  ensureBubbleOrders(page.jsonData);
  setManualOrderNotice(Boolean(page.manualOrderChanged));
  if (selectedIndex >= page.jsonData.items.length) {
    selectedIndex = page.jsonData.items.length - 1;
  }
  if (selectedIndex >= 0) {
    selectBubble(selectedIndex);
  } else {
    resetSelection();
    renderBubbleList();
    renderOverlays();
  }
  updateStatus();
  updateBubbleToolState();
  updateUndoRedoState();
};

const undoChange = () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  ensureHistoryState(page);
  if (!page.undoStack.length) return;
  const snapshot = page.undoStack.pop();
  page.redoStack.push({
    jsonData: cloneJsonData(page.jsonData),
    manualOrderChanged: page.manualOrderChanged ?? false,
    label: snapshot?.label ?? "Edit",
    detail: snapshot?.detail ?? "No details",
    timestamp: snapshot?.timestamp ?? Date.now(),
  });
  const nextSnapshot =
    snapshot && snapshot.jsonData ? snapshot.jsonData : snapshot;
  isHistoryApplying = true;
  page.jsonData = nextSnapshot;
  if (snapshot && typeof snapshot.manualOrderChanged === "boolean") {
    page.manualOrderChanged = snapshot.manualOrderChanged;
  }
  isHistoryApplying = false;
  refreshAfterHistoryChange();
};

const redoChange = () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  ensureHistoryState(page);
  if (!page.redoStack.length) return;
  const snapshot = page.redoStack.pop();
  page.undoStack.push({
    jsonData: cloneJsonData(page.jsonData),
    manualOrderChanged: page.manualOrderChanged ?? false,
    label: snapshot?.label ?? "Edit",
    detail: snapshot?.detail ?? "No details",
    timestamp: snapshot?.timestamp ?? Date.now(),
  });
  const nextSnapshot =
    snapshot && snapshot.jsonData ? snapshot.jsonData : snapshot;
  isHistoryApplying = true;
  page.jsonData = nextSnapshot;
  if (snapshot && typeof snapshot.manualOrderChanged === "boolean") {
    page.manualOrderChanged = snapshot.manualOrderChanged;
  }
  isHistoryApplying = false;
  refreshAfterHistoryChange();
};

const clearHistory = () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  ensureHistoryState(page);
  page.undoStack = [];
  page.redoStack = [];
  updateUndoRedoState();
};

const logOrderEvent = (message, details = {}) => {
  console.info(`[order] ${message}`, {
    currentPageIndex,
    currentIndex: selectedIndex,
    pageName: getCurrentPage()?.jsonName ?? getCurrentPage()?.imageName,
    ...details,
  });
};

const logOverlapEvent = (message, details = {}) => {
  console.info(`[overlap] ${message}`, {
    currentPageIndex,
    currentIndex: selectedIndex,
    pageName: getCurrentPage()?.jsonName ?? getCurrentPage()?.imageName,
    ...details,
  });
};

const getCurrentJson = () => getCurrentPage()?.jsonData ?? null;

const getPageStatusTags = (page) => {
  const tags = [];
  if (page.imageName) tags.push("Image");
  if (page.jsonData) tags.push("JSON");
  return tags.length ? tags : ["Empty"];
};

const updateStatus = () => {
  const bubbleCount = getCurrentJson()?.items?.length ?? 0;
  const parts = [];
  if (pages.length) {
    parts.push(`Pages: ${pages.length}`);
  }
  if (currentPageIndex >= 0) {
    const page = getCurrentPage();
    parts.push(`Page ${currentPageIndex + 1}`);
    if (page?.imageName) {
      parts.push(`Image: ${page.imageName}`);
    }
    if (page?.jsonName) {
      parts.push(`JSON: ${page.jsonName}`);
    }
  }
  if (bubbleCount) {
    parts.push(`Bubbles: ${bubbleCount}`);
  }
  statusText.textContent = parts.length
    ? parts.join(" | ")
    : "No image or JSON loaded.";
  downloadBtn.disabled = !getCurrentJson();
  downloadAllBtn.disabled = !pages.some((page) => page.jsonData);
};

const updateBubbleToolState = () => {
  const hasJson = Boolean(getCurrentJson());
  addBubbleBtn.disabled = !hasJson;
  removeBubbleBtn.disabled = !hasJson || selectedIndex < 0;
  autoOrderBtn.disabled = !hasJson;
  updateUndoRedoState();
  if (!hasJson) {
    manualOrderNotice.hidden = true;
  }
  if (!hasJson && isDrawingBubble) {
    setDrawingMode(false);
  }
};

const setError = (message) => {
  errorText.textContent = message || "";
};

const getMaxPanX = () => {
  const wrapperWidth = imageWrapper.clientWidth;
  const imageWidth = mainImage.clientWidth;
  if (!wrapperWidth || !imageWidth) return 0;
  const scaledWidth = imageWidth * zoomLevel;
  return Math.max(0, (scaledWidth - wrapperWidth) / 2);
};

const getMaxPanY = () => {
  const wrapperHeight = imageWrapper.clientHeight;
  const imageHeight = mainImage.clientHeight;
  if (!wrapperHeight || !imageHeight) return 0;
  const scaledHeight = imageHeight * zoomLevel;
  return Math.max(0, (scaledHeight - wrapperHeight) / 2);
};

const getPanLimitX = () =>
  getMaxPanX() + Math.max(PAN_MARGIN, imageWrapper.clientWidth / 2);

const getPanLimitY = () =>
  getMaxPanY() + Math.max(PAN_MARGIN, imageWrapper.clientHeight / 2);

const clampPanX = (value) => {
  const limit = getPanLimitX();
  return Math.min(limit, Math.max(-limit, value));
};

const clampPanY = (value) => {
  const limit = getPanLimitY();
  return Math.min(limit, Math.max(-limit, value));
};

const updateZoomResetState = () => {
  const isDefaultZoom = Math.abs(zoomLevel - 1) < 0.001;
  const isCentered = Math.abs(panX) < 0.5 && Math.abs(panY) < 0.5;
  zoomResetBtn.disabled = isDefaultZoom && isCentered;
};

const updateTransform = () => {
  imageStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  updateZoomResetState();
};

const updateGrabState = () => {
  const canPan = getPanLimitX() > 0.5 || getPanLimitY() > 0.5;
  imageWrapper.classList.toggle("grabbable", canPan);
  if (!canPan) {
    panX = 0;
    panY = 0;
    updateTransform();
  } else {
    panX = clampPanX(panX);
    panY = clampPanY(panY);
    updateTransform();
  }
};

const applyZoom = (level) => {
  zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
  panX = clampPanX(panX);
  panY = clampPanY(panY);
  updateTransform();
  zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
  zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM + 0.001;
  zoomInBtn.disabled = zoomLevel >= MAX_ZOOM - 0.001;
  zoomRange.value = Math.round(zoomLevel * 100);
  updateGrabState();
};

const resetZoom = () => {
  panX = 0;
  panY = 0;
  applyZoom(1);
};

const resetSelection = () => {
  selectedIndex = -1;
  detailForm.hidden = true;
  detailPlaceholder.hidden = false;
  bubbleId.value = "";
  bubbleOrder.value = "";
  bubbleOriginal.value = "";
  bubbleText.value = "";
  bubbleType.value = "Standard";
  textEditSnapshot = null;
  textEditDirty = false;
  updateBubbleToolState();
  setDrawingMode(false);
};

const clearOverlays = () => {
  overlayLayer.innerHTML = "";
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getItemBbox = (item) => item.bbox_bubble ?? item.bbox_text ?? null;

const RIGHT_PRIORITY_WEIGHT = 1.1;

const getRightTopPriorityScore = (entry) =>
  entry.yMin - entry.xCenter * RIGHT_PRIORITY_WEIGHT;

const getBboxEdges = (bbox) => {
  if (!bbox) return null;
  const xMin = Number(bbox.xMin ?? bbox.x_min);
  const xMax = Number(bbox.xMax ?? bbox.x_max);
  const yMin = Number(bbox.yMin ?? bbox.y_min);
  const yMax = Number(bbox.yMax ?? bbox.y_max);
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return null;
  }
  return { xMin, xMax, yMin, yMax };
};

const getRowBasedBubbleIndices = (jsonData) => {
  logOrderEvent("row-order-start", { itemCount: jsonData.items.length });
  const entries = jsonData.items.map((item, index) => {
    const bbox = getItemBbox(item);
    if (!bbox) {
      return {
        index,
        bbox: null,
        xMin: Number.POSITIVE_INFINITY,
        xMax: Number.POSITIVE_INFINITY,
        yMin: Number.POSITIVE_INFINITY,
        yMax: Number.POSITIVE_INFINITY,
        xCenter: Number.POSITIVE_INFINITY,
        yCenter: Number.POSITIVE_INFINITY,
        width: 0,
        height: 0,
      };
    }
    const width = Math.max(0, bbox.x_max - bbox.x_min);
    const height = Math.max(0, bbox.y_max - bbox.y_min);
    return {
      index,
      bbox,
      xMin: bbox.x_min,
      xMax: bbox.x_max,
      yMin: bbox.y_min,
      yMax: bbox.y_max,
      xCenter: bbox.x_min + width / 2,
      yCenter: bbox.y_min + height / 2,
      width,
      height,
    };
  });
  const withBbox = entries.filter((entry) => entry.bbox);
  const withoutBbox = entries.filter((entry) => !entry.bbox);
  if (!withBbox.length) {
    logOrderEvent("row-order-no-bbox", {
      orderedIndices: entries.map((entry) => entry.index),
    });
    return entries.map((entry) => entry.index);
  }
  const anchor = withBbox.reduce((best, entry) => {
    if (!best) return entry;
    const entryPriority = getRightTopPriorityScore(entry);
    const bestPriority = getRightTopPriorityScore(best);
    if (entryPriority !== bestPriority) {
      return entryPriority < bestPriority ? entry : best;
    }
    return entry.index < best.index ? entry : best;
  }, null);
  const anchorCenter = anchor?.yCenter ?? Number.POSITIVE_INFINITY;
  const ordered = withBbox
    .slice()
    .sort((a, b) => {
      const distanceA = Math.abs(a.yCenter - anchorCenter);
      const distanceB = Math.abs(b.yCenter - anchorCenter);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      const priorityA = getRightTopPriorityScore(a);
      const priorityB = getRightTopPriorityScore(b);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.index);
  const result = ordered.concat(withoutBbox.map((entry) => entry.index));
  logOrderEvent("row-order-complete", {
    anchorIndex: anchor?.index ?? null,
    orderedIndices: result,
  });
  return result;
};

const fillMissingBubbleOrders = (jsonData) => {
  if (!jsonData?.items?.length) return;
  const usedOrders = new Set(
    jsonData.items
      .map((item) => Number(item.order))
      .filter((value) => Number.isFinite(value)),
  );
  let nextOrder = 1;
  const rowOrder = getRowBasedBubbleIndices(jsonData);
  rowOrder.forEach((index) => {
    const item = jsonData.items[index];
    if (Number.isFinite(Number(item.order))) return;
    while (usedOrders.has(nextOrder)) {
      nextOrder += 1;
    }
    item.order = nextOrder;
    usedOrders.add(nextOrder);
    logOrderEvent("filled-missing-order", {
      index,
      assignedOrder: nextOrder,
    });
  });
  logOrderEvent("fill-missing-complete", {
    usedOrders: Array.from(usedOrders).sort((a, b) => a - b),
    rowOrder,
  });
};

const normalizeBubbleOrders = (jsonData) => {
  if (!jsonData?.items?.length) return;
  logOrderEvent("normalize-start", {
    orders: jsonData.items.map((item) => item.order ?? null),
  });
  fillMissingBubbleOrders(jsonData);
  const rowOrder = getRowBasedBubbleIndices(jsonData);
  const rowRank = new Map(
    rowOrder.map((index, position) => [index, position]),
  );
  const entries = jsonData.items.map((item, index) => ({
    index,
    order: Number(item.order),
  }));
  entries.sort((a, b) => {
    const orderA = Number.isFinite(a.order)
      ? a.order
      : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.order)
      ? b.order
      : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return (
      (rowRank.get(a.index) ?? a.index) -
      (rowRank.get(b.index) ?? b.index)
    );
  });
  entries.forEach((entry, position) => {
    jsonData.items[entry.index].order = position + 1;
  });
  logOrderEvent("normalize-complete", {
    orderedEntries: entries,
    finalOrders: jsonData.items.map((item) => item.order),
  });
};

const ensureBubbleOrders = (jsonData) => {
  if (!jsonData?.items?.length) return;
  const hasMissing = jsonData.items.some(
    (item) => !Number.isFinite(Number(item.order)),
  );
  if (hasMissing) {
    logOrderEvent("ensure-missing-orders", { hasMissing });
    normalizeBubbleOrders(jsonData);
    return;
  }
  logOrderEvent("ensure-orders-present", { hasMissing });
};

const setManualOrderNotice = (isManual) => {
  manualOrderNotice.hidden = !isManual;
  const page = getCurrentPage();
  if (page) {
    page.manualOrderChanged = isManual;
  }
};

const getOrderedBubbleIndices = (jsonData) => {
  const entries = jsonData.items.map((item, index) => ({
    index,
    order: Number(item.order),
  }));
  entries.sort((a, b) => {
    const orderA = Number.isFinite(a.order)
      ? a.order
      : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.order)
      ? b.order
      : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.index - b.index;
  });
  const orderedIndices = entries.map((entry) => entry.index);
  logOrderEvent("ordered-indices", { orderedIndices, entries });
  return orderedIndices;
};

const getBubbleXCenter = (item) => {
  const edges = getBboxEdges(getItemBbox(item));
  if (!edges) return Number.POSITIVE_INFINITY;
  return edges.xMin + (edges.xMax - edges.xMin) / 2;
};

const areBboxesOverlapping = (bboxA, bboxB) => {
  const edgesA = getBboxEdges(bboxA);
  const edgesB = getBboxEdges(bboxB);
  if (!edgesA || !edgesB) return false;
  const xOverlap =
    Math.min(edgesA.xMax, edgesB.xMax) -
    Math.max(edgesA.xMin, edgesB.xMin);
  const yOverlap =
    Math.min(edgesA.yMax, edgesB.yMax) -
    Math.max(edgesA.yMin, edgesB.yMin);
  return xOverlap > 0 && yOverlap > 0;
};

const getOverlappingBubbleIndices = (jsonData, currentIndex) => {
  if (!jsonData?.items?.length || currentIndex < 0) return [];
  const currentItem = jsonData.items[currentIndex];
  const currentBbox = getItemBbox(currentItem);
  if (!currentBbox) return [];
  const currentXCenter = getBubbleXCenter(currentItem);
  const overlapping = jsonData.items
    .map((item, index) => {
      if (index === currentIndex) return null;
      const bbox = getItemBbox(item);
      if (!areBboxesOverlapping(currentBbox, bbox)) return null;
      return {
        index,
        distance: Math.abs(getBubbleXCenter(item) - currentXCenter),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.index);
  logOverlapEvent("overlap-detected", {
    currentIndex,
    overlappingIndices: overlapping,
  });
  return overlapping;
};

const getOverlapPriorityBubbleIndices = (
  jsonData,
  currentIndex,
  direction = "forward",
) => {
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  if (!orderedIndices.length || currentIndex < 0) {
    logOrderEvent("auto-priority-no-current", { orderedIndices });
    return orderedIndices;
  }
  const currentPosition = orderedIndices.indexOf(currentIndex);
  if (currentPosition === -1) return orderedIndices;
  const overlappingIndices = getOverlappingBubbleIndices(
    jsonData,
    currentIndex,
  );
  if (!overlappingIndices.length) {
    logOverlapEvent("auto-priority-no-overlap", {
      currentIndex,
      orderedIndices,
    });
    return orderedIndices;
  }
  const positionMap = new Map(
    orderedIndices.map((index, position) => [index, position]),
  );
  const orderedOverlaps = overlappingIndices
    .slice()
    .sort(
      (a, b) => (positionMap.get(a) ?? 0) - (positionMap.get(b) ?? 0),
    );
  const directionalOverlaps =
    direction === "backward"
      ? orderedOverlaps.filter(
          (index) => (positionMap.get(index) ?? -1) < currentPosition,
        )
      : orderedOverlaps.filter(
          (index) => (positionMap.get(index) ?? -1) > currentPosition,
        );
  if (!directionalOverlaps.length) {
    logOverlapEvent("auto-priority-no-directional-overlap", {
      currentIndex,
      orderedIndices,
      overlappingIndices,
      direction,
    });
    return orderedIndices;
  }
  const overlapSet = new Set(directionalOverlaps);
  const beforeCurrent = orderedIndices
    .slice(0, currentPosition)
    .filter((index) => !overlapSet.has(index));
  const afterCurrent = orderedIndices
    .slice(currentPosition + 1)
    .filter((index) => !overlapSet.has(index));
  const prioritized =
    direction === "backward"
      ? [
          ...beforeCurrent,
          ...directionalOverlaps,
          currentIndex,
          ...afterCurrent,
        ]
      : [
          ...beforeCurrent,
          currentIndex,
          ...directionalOverlaps,
          ...afterCurrent,
        ];
  logOverlapEvent("auto-priority-overlap", {
    currentIndex,
    orderedIndices,
    overlappingIndices,
    directionalOverlaps,
    direction,
    prioritized,
  });
  return prioritized;
};

const updateOrdersFromIndices = (jsonData, orderedIndices, source) => {
  orderedIndices.forEach((index, position) => {
    jsonData.items[index].order = position + 1;
  });
  logOrderEvent("order-update", {
    source,
    orderedIndices,
    finalOrders: jsonData.items.map((item) => item.order),
  });
};

const reorderBubbleToPosition = (
  jsonData,
  fromIndex,
  targetPosition,
  source,
) => {
  if (!jsonData?.items?.length) return;
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  const currentPosition = orderedIndices.indexOf(fromIndex);
  if (currentPosition === -1) return;
  const clampedPosition = clamp(
    targetPosition,
    0,
    orderedIndices.length - 1,
  );
  if (currentPosition === clampedPosition) return;
  orderedIndices.splice(currentPosition, 1);
  orderedIndices.splice(clampedPosition, 0, fromIndex);
  updateOrdersFromIndices(jsonData, orderedIndices, source);
};

const applyOverlapOrderingIfNeeded = (
  jsonData,
  currentIndex,
  direction = "forward",
) => {
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  if (!orderedIndices.length) {
    return orderedIndices;
  }
  const targetIndex = currentIndex < 0 ? orderedIndices[0] : currentIndex;
  const prioritized = getOverlapPriorityBubbleIndices(
    jsonData,
    targetIndex,
    direction,
  );
  if (prioritized.length === orderedIndices.length) {
    const changed = prioritized.some(
      (index, position) => orderedIndices[position] !== index,
    );
    if (changed) {
      updateOrdersFromIndices(jsonData, prioritized, "overlap-priority");
    }
  }
  return prioritized;
};

const applyInitialOverlapOrdering = (jsonData) => {
  if (!jsonData?.items?.length) return;
  jsonData.items.forEach((_, index) => {
    applyOverlapOrderingIfNeeded(jsonData, index, "forward");
  });
};

const autoOrderBubbles = (jsonData) => {
  if (!jsonData?.items?.length) return;
  const orderedIndices = getRowBasedBubbleIndices(jsonData);
  updateOrdersFromIndices(jsonData, orderedIndices, "row-auto-order");
  applyInitialOverlapOrdering(jsonData);
};

const getNextBubbleIndexByCenter = (jsonData, currentIndex) => {
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  if (!orderedIndices.length) return -1;
  if (currentIndex < 0) return orderedIndices[0];
  const currentPosition = orderedIndices.indexOf(currentIndex);
  const startPosition = currentPosition === -1 ? 0 : currentPosition + 1;
  if (startPosition >= orderedIndices.length) {
    return orderedIndices[orderedIndices.length - 1];
  }
  const currentItem = jsonData.items[currentIndex];
  const currentCenter = getBubbleXCenter(currentItem);
  if (!Number.isFinite(currentCenter)) {
    return orderedIndices[startPosition];
  }
  let bestIndex = orderedIndices[startPosition];
  let bestDistance = Number.POSITIVE_INFINITY;
  orderedIndices.slice(startPosition).forEach((index) => {
    const candidate = jsonData.items[index];
    const candidateCenter = getBubbleXCenter(candidate);
    const distance = Math.abs(candidateCenter - currentCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
};

const normalizeItem = (item) => {
  if (!item) return;
  if (typeof item.text !== "string") {
    item.text = "";
  }
  if (!bubbleTypeOptions.includes(item.bubble_type)) {
    item.bubble_type = "Standard";
  }
};

const validateJsonStructure = (data) => {
  if (!data || typeof data !== "object") {
    return "JSON is not an object.";
  }
  if (
    !data.image_size ||
    typeof data.image_size.width !== "number" ||
    typeof data.image_size.height !== "number"
  ) {
    return "JSON image_size is missing width/height numbers.";
  }
  if (!Array.isArray(data.items)) {
    return "JSON items must be an array.";
  }
  return "";
};

const renderPageList = () => {
  pageList.innerHTML = "";
  if (!pages.length) {
    pageList.innerHTML =
      '<div class="placeholder" style="padding: 12px;">No pages loaded.</div>';
    return;
  }
  pages.forEach((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const name = page.imageName || page.jsonName || `Page ${index + 1}`;
    const tags = getPageStatusTags(page)
      .map((tag) => `<span>${tag}</span>`)
      .join("");
    button.innerHTML = `<div>${name}</div><div class="page-meta">${tags}</div>`;
    button.addEventListener("click", () => setCurrentPage(index));
    if (index === currentPageIndex) {
      button.classList.add("active");
    }
    pageList.appendChild(button);
  });
};

const renderBubbleList = () => {
  bubbleList.innerHTML = "";
  const jsonData = getCurrentJson();
  if (!jsonData?.items?.length) {
    bubbleList.innerHTML =
      '<div class="placeholder" style="padding: 12px;">No bubbles loaded.</div>';
    return;
  }
  const orderedIndices = getOrderedBubbleIndices(jsonData);
  orderedIndices.forEach((index) => {
    const item = jsonData.items[index];
    const row = document.createElement("div");
    row.className = "bubble-list-item";
    row.dataset.index = String(index);
    const handle = document.createElement("div");
    handle.className = "bubble-drag-handle";
    handle.textContent = "⋮⋮";
    handle.title = "Drag to reorder";
    handle.draggable = true;
    const button = document.createElement("button");
    button.type = "button";
    const orderLabel = Number.isFinite(Number(item.order))
      ? item.order
      : index + 1;
    const bubbleIdLabel = item.id ?? index + 1;
    const translatedText = (item.text ?? "").trim();
    const translatedPreview = translatedText
      ? ` : ${
          translatedText.length > 40
            ? `${translatedText.slice(0, 40)}…`
            : translatedText
        }`
      : "";
    button.textContent = `#${orderLabel} | ${bubbleIdLabel}${translatedPreview}`;
    button.addEventListener("click", () => selectBubble(index));
    if (index === selectedIndex) {
      button.classList.add("active");
    }
    handle.addEventListener("dragstart", (event) => {
      row.classList.add("dragging");
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      const data = event.dataTransfer.getData("text/plain");
      const fromIndex = Number.parseInt(data, 10);
      if (!Number.isFinite(fromIndex)) return;
      const jsonData = getCurrentJson();
      if (!jsonData) return;
      const orderedIndices = getOrderedBubbleIndices(jsonData);
      const targetPosition = orderedIndices.indexOf(index);
      if (targetPosition === -1 || fromIndex === index) return;
      recordHistory(getCurrentPage(), "drag-reorder");
      reorderBubbleToPosition(
        jsonData,
        fromIndex,
        targetPosition,
        "drag-reorder",
      );
      setManualOrderNotice(true);
      renderBubbleList();
      if (selectedIndex >= 0) {
        bubbleOrder.value = jsonData.items[selectedIndex].order ?? "";
      }
    });
    row.appendChild(handle);
    row.appendChild(button);
    bubbleList.appendChild(row);
  });
};

const renderOverlays = () => {
  clearOverlays();
  const jsonData = getCurrentJson();
  if (!jsonData || !mainImage.src) return;

  const displayedWidth = mainImage.clientWidth;
  const displayedHeight = mainImage.clientHeight;
  overlayLayer.style.width = `${displayedWidth}px`;
  overlayLayer.style.height = `${displayedHeight}px`;

  const widthScale = displayedWidth / jsonData.image_size.width;
  const heightScale = displayedHeight / jsonData.image_size.height;

  jsonData.items.forEach((item, index) => {
    const bbox = getItemBbox(item);
    if (!bbox) return;
    const left = bbox.x_min * widthScale;
    const top = bbox.y_min * heightScale;
    const width = (bbox.x_max - bbox.x_min) * widthScale;
    const height = (bbox.y_max - bbox.y_min) * heightScale;
    const overlay = document.createElement("div");
    overlay.className = "bubble-overlay";
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.dataset.index = String(index);
    overlay.addEventListener("click", () => selectBubble(index));
    if (index === selectedIndex) {
      overlay.classList.add("active");
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((corner) => {
        const handle = document.createElement("div");
        handle.className = "bubble-handle";
        handle.dataset.corner = corner;
        handle.addEventListener("pointerdown", (event) =>
          startResize(event, index, corner),
        );
        overlay.appendChild(handle);
      });
    }
    overlayLayer.appendChild(overlay);
  });
};

const selectBubble = (index) => {
  const jsonData = getCurrentJson();
  if (!jsonData?.items?.length) return;
  const clamped = Math.max(0, Math.min(index, jsonData.items.length - 1));
  selectedIndex = clamped;
  const item = jsonData.items[clamped];
  normalizeItem(item);
  bubbleId.value = item.id ?? clamped + 1;
  bubbleOrder.value = Number.isFinite(Number(item.order))
    ? item.order
    : "";
  bubbleOriginal.value = item.text_original ?? "";
  bubbleText.value = item.text ?? "";
  bubbleType.value = item.bubble_type;
  detailPlaceholder.hidden = true;
  detailForm.hidden = false;
  renderBubbleList();
  renderOverlays();
  updateBubbleToolState();
};

bubbleText.addEventListener("input", (event) => {
  const jsonData = getCurrentJson();
  if (selectedIndex < 0 || !jsonData) return;
  textEditDirty = true;
  jsonData.items[selectedIndex].text = event.target.value;
});

bubbleText.addEventListener("focus", () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  textEditSnapshot = cloneJsonData(page.jsonData);
  textEditDirty = false;
});

bubbleText.addEventListener("blur", () => {
  const page = getCurrentPage();
  if (!page?.jsonData || !textEditSnapshot) return;
  if (textEditDirty) {
    pushHistorySnapshot(page, textEditSnapshot, "text-edit");
  }
  textEditSnapshot = null;
  textEditDirty = false;
});

bubbleOrder.addEventListener("change", (event) => {
  const jsonData = getCurrentJson();
  if (selectedIndex < 0 || !jsonData) return;
  const nextOrder = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(nextOrder)) return;
  const clampedOrder = clamp(nextOrder, 1, jsonData.items.length);
  recordHistory(getCurrentPage(), "manual-order-change");
  logOrderEvent("manual-order-change", {
    index: selectedIndex,
    previousOrder: jsonData.items[selectedIndex].order,
    nextOrder: clampedOrder,
  });
  reorderBubbleToPosition(
    jsonData,
    selectedIndex,
    clampedOrder - 1,
    "manual-input",
  );
  setManualOrderNotice(true);
  bubbleOrder.value = jsonData.items[selectedIndex].order;
  renderBubbleList();
  logOrderEvent("manual-order-change-complete", {
    index: selectedIndex,
    updatedOrder: jsonData.items[selectedIndex].order,
  });
});

bubbleType.addEventListener("change", (event) => {
  const jsonData = getCurrentJson();
  if (selectedIndex < 0 || !jsonData) return;
  recordHistory(getCurrentPage(), "bubble-type-change");
  jsonData.items[selectedIndex].bubble_type = event.target.value;
});

autoOrderBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  recordHistory(page, "auto-order");
  autoOrderBubbles(page.jsonData);
  setManualOrderNotice(false);
  page.overlapOrdered = true;
  renderBubbleList();
  if (selectedIndex >= 0) {
    bubbleOrder.value = page.jsonData.items[selectedIndex].order ?? "";
  }
});

const updateBubbleMarginValue = (value) => {
  const nextValue = Number.parseInt(value, 10);
  if (!Number.isFinite(nextValue)) return;
  bubbleViewMargin = clamp(nextValue, 0, 300);
  bubbleMarginInput.value = bubbleViewMargin;
};

autoPanToggle.addEventListener("change", (event) => {
  autoPanEnabled = event.target.checked;
});

bubbleMarginInput.addEventListener("input", (event) => {
  updateBubbleMarginValue(event.target.value);
});

autoPanEnabled = autoPanToggle.checked;
updateBubbleMarginValue(bubbleMarginInput.value);

const setCurrentPage = (index) => {
  if (index < 0 || index >= pages.length) return;
  currentPageIndex = index;
  setDrawingMode(false);
  const page = getCurrentPage();
  ensureHistoryState(page);
  if (page?.jsonData) {
    ensureBubbleOrders(page.jsonData);
    if (!page.overlapOrdered) {
      applyInitialOverlapOrdering(page.jsonData);
      page.overlapOrdered = true;
    }
  }
  setManualOrderNotice(Boolean(page?.manualOrderChanged));
  if (page?.imageUrl) {
    mainImage.src = page.imageUrl;
    imagePlaceholder.style.display = "none";
    imageStage.style.display = "inline-flex";
    mainImage.style.display = "block";
  } else {
    mainImage.removeAttribute("src");
    imagePlaceholder.style.display = "block";
    imageStage.style.display = "none";
    mainImage.style.display = "none";
  }
  mainImage.onload = () => {
    renderOverlays();
    updateGrabState();
  };
  panX = 0;
  panY = 0;
  applyZoom(1);
  resetSelection();
  renderPageList();
  renderBubbleList();
  renderOverlays();
  updateStatus();
  updateBubbleToolState();
  updateUndoRedoState();
};

const findPageByBaseName = (baseName) =>
  pages.find((page) => page.baseName === baseName);

imageInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  files.forEach((file, index) => {
    const baseName = getBaseName(file.name);
    const existing = findPageByBaseName(baseName);
    const imageUrl = URL.createObjectURL(file);
    if (existing) {
      existing.imageFile = file;
      existing.imageUrl = imageUrl;
      existing.imageName = file.name;
    } else {
      pages.push({
        id: crypto.randomUUID(),
        baseName,
        imageFile: file,
        imageUrl,
        imageName: file.name,
        jsonData: null,
        jsonName: "",
        overlapOrdered: false,
        manualOrderChanged: false,
        undoStack: [],
        redoStack: [],
      });
    }
    if (currentPageIndex === -1 && index === 0) {
      currentPageIndex = 0;
    }
  });
  setError("");
  renderPageList();
  if (currentPageIndex === -1 && pages.length) {
    setCurrentPage(0);
  } else if (currentPageIndex >= 0) {
    setCurrentPage(currentPageIndex);
  }
  updateStatus();
});

jsonInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  let errorMessage = "";
  const readers = files.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ file, content: reader.result });
        reader.readAsText(file);
      }),
  );
  Promise.all(readers).then((results) => {
    results.forEach(({ file, content }) => {
      try {
        const data = JSON.parse(content);
        const error = validateJsonStructure(data);
        if (error) {
          errorMessage = errorMessage
            ? `${errorMessage} ${file.name}: ${error}`
            : `${file.name}: ${error}`;
          return;
        }
        data.items.forEach((item) => normalizeItem(item));
        ensureBubbleOrders(data);
        const baseName = getBaseName(file.name);
        const existing = findPageByBaseName(baseName);
        if (existing) {
          existing.jsonData = data;
          existing.jsonName = file.name;
          existing.overlapOrdered = false;
          existing.manualOrderChanged = false;
          existing.undoStack = [];
          existing.redoStack = [];
        } else {
          pages.push({
            id: crypto.randomUUID(),
            baseName,
            imageFile: null,
            imageUrl: "",
            imageName: "",
            jsonData: data,
            jsonName: file.name,
            overlapOrdered: false,
            manualOrderChanged: false,
            undoStack: [],
            redoStack: [],
          });
        }
      } catch (err) {
        errorMessage = errorMessage
          ? `${errorMessage} ${file.name}: Invalid JSON file.`
          : `${file.name}: Invalid JSON file.`;
      }
    });
    setError(errorMessage);
    renderPageList();
    if (currentPageIndex === -1 && pages.length) {
      setCurrentPage(0);
    } else if (currentPageIndex >= 0) {
      setCurrentPage(currentPageIndex);
    }
    updateStatus();
  });
});

const getDownloadName = (page) => {
  if (page.jsonName) {
    return page.jsonName;
  }
  if (page.imageName) {
    return `${getBaseName(page.imageName)}.json`;
  }
  return "translated-bubbles.json";
};

const downloadJson = () => {
  const page = getCurrentPage();
  if (!page?.jsonData) return;
  const jsonData = page.jsonData;
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getDownloadName(page);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadAllJson = () => {
  pages.forEach((page) => {
    if (!page.jsonData) return;
    const blob = new Blob([JSON.stringify(page.jsonData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getDownloadName(page);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
};

downloadBtn.addEventListener("click", downloadJson);
downloadAllBtn.addEventListener("click", downloadAllJson);

zoomOutBtn.addEventListener("click", () => {
  applyZoom(zoomLevel - ZOOM_STEP);
});

zoomInBtn.addEventListener("click", () => {
  applyZoom(zoomLevel + ZOOM_STEP);
});

zoomResetBtn.addEventListener("click", () => {
  resetZoom();
});

zoomRange.addEventListener("input", (event) => {
  const value = Number(event.target.value) / 100;
  applyZoom(value);
});

const getOverlayScale = () => {
  const jsonData = getCurrentJson();
  if (!jsonData) return null;
  const displayedWidth = mainImage.clientWidth;
  const displayedHeight = mainImage.clientHeight;
  if (!displayedWidth || !displayedHeight) return null;
  return {
    widthScale: displayedWidth / jsonData.image_size.width,
    heightScale: displayedHeight / jsonData.image_size.height,
  };
};

const getStageMetrics = () => {
  const jsonData = getCurrentJson();
  if (!jsonData || !mainImage.src) return null;
  const displayedWidth = mainImage.clientWidth;
  const displayedHeight = mainImage.clientHeight;
  if (!displayedWidth || !displayedHeight) return null;
  return {
    displayedWidth,
    displayedHeight,
    widthScale: displayedWidth / jsonData.image_size.width,
    heightScale: displayedHeight / jsonData.image_size.height,
  };
};

const getPointerImageCoords = (event) => {
  const scale = getOverlayScale();
  if (!scale) return null;
  const rect = overlayLayer.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / zoomLevel;
  const localY = (event.clientY - rect.top) / zoomLevel;
  return {
    x: localX / scale.widthScale,
    y: localY / scale.heightScale,
  };
};

const setItemBbox = (item, bbox) => {
  if (item.bbox_bubble) {
    item.bbox_bubble = { ...bbox };
    return;
  }
  if (item.bbox_text) {
    item.bbox_text = { ...bbox };
    return;
  }
  item.bbox_bubble = { ...bbox };
};

const getResizeBounds = (jsonData) => ({
  minX: 0,
  minY: 0,
  maxX: jsonData.image_size.width,
  maxY: jsonData.image_size.height,
});

const getNextBubbleId = (items) => {
  const lastId = items.at(-1)?.id;
  const lastNumber =
    typeof lastId === "number" ? lastId : Number.parseInt(lastId, 10);
  if (Number.isFinite(lastNumber)) {
    return lastNumber + 1;
  }
  return items.length + 1;
};

const startResize = (event, index, corner) => {
  const jsonData = getCurrentJson();
  if (!jsonData) return;
  const item = jsonData.items[index];
  const bbox = getItemBbox(item);
  if (!bbox) return;
  recordHistory(getCurrentPage(), "resize-bubble");
  const coords = getPointerImageCoords(event);
  if (!coords) return;
  event.stopPropagation();
  isResizing = true;
  resizeCorner = corner;
  resizeStart = {
    pointer: coords,
    bbox: { ...bbox },
    bounds: getResizeBounds(jsonData),
  };
  resizePointerId = event.pointerId;
  resizeTarget = event.currentTarget;
  resizeTarget.setPointerCapture(event.pointerId);
};

const applyResize = (event) => {
  if (!isResizing || !resizeStart || resizePointerId === null) return;
  const jsonData = getCurrentJson();
  if (!jsonData) return;
  const item = jsonData.items[selectedIndex];
  if (!item) return;
  const coords = getPointerImageCoords(event);
  if (!coords) return;
  const { bbox, pointer, bounds } = resizeStart;
  const deltaX = coords.x - pointer.x;
  const deltaY = coords.y - pointer.y;
  let next = { ...bbox };
  if (
    resizeCorner === "nw" ||
    resizeCorner === "sw" ||
    resizeCorner === "w"
  ) {
    next.x_min = clamp(
      bbox.x_min + deltaX,
      bounds.minX,
      bbox.x_max - MIN_BBOX_SIZE,
    );
  }
  if (
    resizeCorner === "ne" ||
    resizeCorner === "se" ||
    resizeCorner === "e"
  ) {
    next.x_max = clamp(
      bbox.x_max + deltaX,
      bbox.x_min + MIN_BBOX_SIZE,
      bounds.maxX,
    );
  }
  if (
    resizeCorner === "nw" ||
    resizeCorner === "ne" ||
    resizeCorner === "n"
  ) {
    next.y_min = clamp(
      bbox.y_min + deltaY,
      bounds.minY,
      bbox.y_max - MIN_BBOX_SIZE,
    );
  }
  if (
    resizeCorner === "sw" ||
    resizeCorner === "se" ||
    resizeCorner === "s"
  ) {
    next.y_max = clamp(
      bbox.y_max + deltaY,
      bbox.y_min + MIN_BBOX_SIZE,
      bounds.maxY,
    );
  }
  setItemBbox(item, next);
  renderOverlays();
};

const stopResize = (event) => {
  if (!isResizing) return;
  if (resizeTarget && resizePointerId !== null) {
    try {
      resizeTarget.releasePointerCapture(resizePointerId);
    } catch (error) {
      // Ignore release errors.
    }
  }
  isResizing = false;
  resizeCorner = null;
  resizeStart = null;
  resizePointerId = null;
  resizeTarget = null;
};

function setDrawingMode(active) {
  isDrawingBubble = active;
  imageWrapper.classList.toggle("drawing", active);
  addBubbleBtn.classList.toggle("is-active", active);
  if (!active) {
    cancelDrawBubble();
  }
}

function cancelDrawBubble() {
  if (drawOverlay) {
    drawOverlay.remove();
    drawOverlay = null;
  }
  drawStart = null;
  if (drawPointerId !== null) {
    try {
      imageWrapper.releasePointerCapture(drawPointerId);
    } catch (error) {
      // Ignore release errors.
    }
  }
  drawPointerId = null;
}

function updateDrawOverlay(start, current) {
  if (!drawOverlay) return;
  const jsonData = getCurrentJson();
  if (!jsonData) return;
  const width = jsonData.image_size.width;
  const height = jsonData.image_size.height;
  const xMin = clamp(Math.min(start.x, current.x), 0, width);
  const xMax = clamp(Math.max(start.x, current.x), 0, width);
  const yMin = clamp(Math.min(start.y, current.y), 0, height);
  const yMax = clamp(Math.max(start.y, current.y), 0, height);
  const scale = getOverlayScale();
  if (!scale) return;
  drawOverlay.style.left = `${xMin * scale.widthScale}px`;
  drawOverlay.style.top = `${yMin * scale.heightScale}px`;
  drawOverlay.style.width = `${Math.max(1, xMax - xMin) * scale.widthScale}px`;
  drawOverlay.style.height = `${Math.max(1, yMax - yMin) * scale.heightScale}px`;
}

function normalizeDrawBounds(start, end, bounds) {
  let xMin = clamp(Math.min(start.x, end.x), bounds.minX, bounds.maxX);
  let xMax = clamp(Math.max(start.x, end.x), bounds.minX, bounds.maxX);
  let yMin = clamp(Math.min(start.y, end.y), bounds.minY, bounds.maxY);
  let yMax = clamp(Math.max(start.y, end.y), bounds.minY, bounds.maxY);

  if (xMax - xMin < MIN_BBOX_SIZE) {
    const adjust = MIN_BBOX_SIZE - (xMax - xMin);
    xMin = clamp(xMin - adjust / 2, bounds.minX, bounds.maxX);
    xMax = clamp(xMin + MIN_BBOX_SIZE, bounds.minX, bounds.maxX);
  }

  if (yMax - yMin < MIN_BBOX_SIZE) {
    const adjust = MIN_BBOX_SIZE - (yMax - yMin);
    yMin = clamp(yMin - adjust / 2, bounds.minY, bounds.maxY);
    yMax = clamp(yMin + MIN_BBOX_SIZE, bounds.minY, bounds.maxY);
  }

  return { xMin, xMax, yMin, yMax };
}

function startDrawBubble(event) {
  const jsonData = getCurrentJson();
  if (!jsonData) return;
  const coords = getPointerImageCoords(event);
  if (!coords) return;
  event.preventDefault();
  drawStart = coords;
  if (!drawOverlay) {
    drawOverlay = document.createElement("div");
    drawOverlay.className = "bubble-overlay drawing";
    overlayLayer.appendChild(drawOverlay);
  }
  updateDrawOverlay(drawStart, coords);
  drawPointerId = event.pointerId;
  imageWrapper.setPointerCapture(event.pointerId);
}

function finalizeDrawBubble(event) {
  const jsonData = getCurrentJson();
  if (!jsonData || !drawStart) return;
  const coords = getPointerImageCoords(event);
  if (!coords) return;
  const bounds = getResizeBounds(jsonData);
  const normalized = normalizeDrawBounds(drawStart, coords, bounds);
  recordHistory(getCurrentPage(), "add-bubble");
  const newItem = {
    id: getNextBubbleId(jsonData.items),
    text_original: "",
    text: "",
    bubble_type: "Standard",
    bbox_bubble: {
      x_min: normalized.xMin,
      y_min: normalized.yMin,
      x_max: normalized.xMax,
      y_max: normalized.yMax,
    },
  };
  jsonData.items.push(newItem);
  ensureBubbleOrders(jsonData);
  cancelDrawBubble();
  setDrawingMode(false);
  selectBubble(jsonData.items.length - 1);
  updateStatus();
}

window.addEventListener("resize", () => {
  renderOverlays();
  updateGrabState();
});

const handleWheelZoom = (event) => {
  if (!mainImage.src) return;
  if (event.target.closest(".image-toolbar")) return;
  event.preventDefault();
  const direction = Math.sign(event.deltaY);
  if (!direction) return;
  const nextZoom =
    direction > 0 ? zoomLevel - ZOOM_STEP : zoomLevel + ZOOM_STEP;
  const rect = imageWrapper.getBoundingClientRect();
  const cursorX = event.clientX - rect.left - rect.width / 2;
  const cursorY = event.clientY - rect.top - rect.height / 2;
  const nextLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  if (Math.abs(nextLevel - zoomLevel) < 0.0001) return;
  const zoomRatio = nextLevel / zoomLevel;
  panX = clampPanX(panX + (1 - zoomRatio) * (cursorX - panX));
  panY = clampPanY(panY + (1 - zoomRatio) * (cursorY - panY));
  applyZoom(nextLevel);
};

imageWrapper.addEventListener("wheel", handleWheelZoom, {
  passive: false,
});

imageWrapper.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest(".image-toolbar")) return;
  if (isDrawingBubble) {
    startDrawBubble(event);
    return;
  }
  if (event.target.closest(".bubble-overlay")) return;
  if (event.target.closest(".bubble-handle")) return;
  if (getPanLimitX() <= 0.5 && getPanLimitY() <= 0.5) return;
  isDragging = true;
  activePointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  panStartX = panX;
  panStartY = panY;
  logDragEvent("start", event, {
    dragStartX,
    dragStartY,
    panStartX,
    panStartY,
  });
  imageWrapper.classList.add("grabbing");
  imageStage.classList.add("is-dragging");
  imageWrapper.setPointerCapture(event.pointerId);
});

const schedulePanUpdate = (nextPanX, nextPanY) => {
  pendingPan = { x: nextPanX, y: nextPanY };
  if (panRaf) return;
  panRaf = requestAnimationFrame(() => {
    if (!pendingPan) return;
    panX = clampPanX(pendingPan.x);
    panY = clampPanY(pendingPan.y);
    updateTransform();
    pendingPan = null;
    panRaf = 0;
  });
};

imageWrapper.addEventListener("pointermove", (event) => {
  if (isDrawingBubble && drawStart) {
    const coords = getPointerImageCoords(event);
    if (coords) {
      updateDrawOverlay(drawStart, coords);
    }
    return;
  }
  if (!isDragging) return;
  if (!event.buttons) {
    logDragEvent("stop-no-buttons", event);
    stopDragging(event);
    return;
  }
  const deltaX = event.clientX - dragStartX;
  const deltaY = event.clientY - dragStartY;
  schedulePanUpdate(panStartX + deltaX, panStartY + deltaY);
});

window.addEventListener("pointermove", (event) => {
  if (!isResizing) return;
  applyResize(event);
});

window.addEventListener("pointerup", (event) => {
  if (!isResizing) return;
  stopResize(event);
});

window.addEventListener("pointercancel", (event) => {
  if (!isResizing) return;
  stopResize(event);
});

const finalizePan = (event) => {
  if (pendingPan) {
    panX = clampPanX(pendingPan.x);
    panY = clampPanY(pendingPan.y);
    updateTransform();
    return;
  }
  if (!event || typeof event.clientX !== "number") return;
  const deltaX = event.clientX - dragStartX;
  const deltaY = event.clientY - dragStartY;
  panX = clampPanX(panStartX + deltaX);
  panY = clampPanY(panStartY + deltaY);
  updateTransform();
};

const stopDragging = (event, reason = "stop") => {
  if (!isDragging) return;
  isDragging = false;
  logDragEvent(reason, event);
  imageWrapper.classList.remove("grabbing");
  imageStage.classList.remove("is-dragging");
  if (panRaf) {
    cancelAnimationFrame(panRaf);
    panRaf = 0;
  }
  finalizePan(event);
  pendingPan = null;
  if (activePointerId !== null) {
    try {
      imageWrapper.releasePointerCapture(activePointerId);
    } catch (error) {
      // Ignore release errors (e.g. capture already released).
    }
  }
  activePointerId = null;
};

const handlePointerLeave = (event) => {
  if (!isDragging) return;
  if (event.buttons) return;
  stopDragging(event, "stop-pointer-leave");
};

imageWrapper.addEventListener("pointerup", (event) => {
  if (isDrawingBubble && drawStart) {
    finalizeDrawBubble(event);
    return;
  }
  stopDragging(event, "stop-pointer-up");
});
imageWrapper.addEventListener("pointercancel", (event) => {
  if (isDrawingBubble && drawStart) {
    cancelDrawBubble();
    setDrawingMode(false);
    return;
  }
  stopDragging(event, "stop-pointer-cancel");
});
imageWrapper.addEventListener("pointerleave", handlePointerLeave);
imageWrapper.addEventListener("lostpointercapture", (event) =>
  stopDragging(event, "stop-lost-pointer-capture"),
);
window.addEventListener("pointerup", (event) => {
  if (isDrawingBubble && drawStart) {
    finalizeDrawBubble(event);
    return;
  }
  stopDragging(event, "stop-window-pointer-up");
});
window.addEventListener("pointercancel", (event) => {
  if (isDrawingBubble && drawStart) {
    cancelDrawBubble();
    setDrawingMode(false);
    return;
  }
  stopDragging(event, "stop-window-pointer-cancel");
});
window.addEventListener("blur", () => stopDragging(null, "stop-blur"));

const ensureBubbleInView = (index) => {
  if (!autoPanEnabled) return;
  const jsonData = getCurrentJson();
  if (!jsonData?.items?.length || index < 0) return;
  const item = jsonData.items[index];
  const edges = getBboxEdges(getItemBbox(item));
  const metrics = getStageMetrics();
  if (!edges || !metrics) return;
  const wrapperWidth = imageWrapper.clientWidth;
  const wrapperHeight = imageWrapper.clientHeight;
  if (!wrapperWidth || !wrapperHeight) return;

  const xMin = edges.xMin * metrics.widthScale;
  const xMax = edges.xMax * metrics.widthScale;
  const yMin = edges.yMin * metrics.heightScale;
  const yMax = edges.yMax * metrics.heightScale;

  const stageCenterX = metrics.displayedWidth / 2;
  const stageCenterY = metrics.displayedHeight / 2;
  const leftEdge = (xMin - stageCenterX) * zoomLevel + panX;
  const rightEdge = (xMax - stageCenterX) * zoomLevel + panX;
  const topEdge = (yMin - stageCenterY) * zoomLevel + panY;
  const bottomEdge = (yMax - stageCenterY) * zoomLevel + panY;

  const margin = bubbleViewMargin;
  const leftBound = -wrapperWidth / 2 + margin;
  const rightBound = wrapperWidth / 2 - margin;
  const topBound = -wrapperHeight / 2 + margin;
  const bottomBound = wrapperHeight / 2 - margin;

  const bubbleWidth = (xMax - xMin) * zoomLevel;
  const bubbleHeight = (yMax - yMin) * zoomLevel;
  const bubbleCenterX = (xMin + xMax) / 2;
  const bubbleCenterY = (yMin + yMax) / 2;

  let nextPanX = panX;
  let nextPanY = panY;

  if (bubbleWidth + margin * 2 > wrapperWidth) {
    nextPanX = -((bubbleCenterX - stageCenterX) * zoomLevel);
  } else if (leftEdge < leftBound) {
    nextPanX += leftBound - leftEdge;
  } else if (rightEdge > rightBound) {
    nextPanX += rightBound - rightEdge;
  }

  if (bubbleHeight + margin * 2 > wrapperHeight) {
    nextPanY = -((bubbleCenterY - stageCenterY) * zoomLevel);
  } else if (topEdge < topBound) {
    nextPanY += topBound - topEdge;
  } else if (bottomEdge > bottomBound) {
    nextPanY += bottomBound - bottomEdge;
  }

  nextPanX = clampPanX(nextPanX);
  nextPanY = clampPanY(nextPanY);
  if (nextPanX === panX && nextPanY === panY) return;
  panX = nextPanX;
  panY = nextPanY;
  updateTransform();
};

const panBy = (deltaX, deltaY) => {
  if (getPanLimitX() <= 0.5 && getPanLimitY() <= 0.5) return;
  panX = clampPanX(panX + deltaX);
  panY = clampPanY(panY + deltaY);
  updateTransform();
};

const isTypingTarget = (eventTarget) => {
  if (!(eventTarget instanceof Element)) return false;
  return (
    eventTarget.closest(
      "input, textarea, select, [contenteditable='true']",
    ) !== null
  );
};

const isKeyboardCombo = (event, codes, keys = []) => {
  const codeMatch = codes.includes(event.code);
  const keyMatch = keys.includes(event.key);
  return codeMatch || keyMatch;
};

document.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  if (
    (event.ctrlKey || event.metaKey) &&
    isKeyboardCombo(event, ["KeyS"], ["s", "S"])
  ) {
    event.preventDefault();
    downloadJson();
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    if (isKeyboardCombo(event, ["KeyZ"], ["z", "Z"])) {
      event.preventDefault();
      if (event.shiftKey) {
        redoChange();
      } else {
        undoChange();
      }
      return;
    }
    if (isKeyboardCombo(event, ["KeyY"], ["y", "Y"])) {
      event.preventDefault();
      redoChange();
      return;
    }
  }
  if (!event.ctrlKey && !event.metaKey) {
    if (isKeyboardCombo(event, ["Equal", "NumpadAdd"], ["+", "="])) {
      event.preventDefault();
      applyZoom(zoomLevel + ZOOM_STEP);
      return;
    }
    if (isKeyboardCombo(event, ["Minus", "NumpadSubtract"], ["-"])) {
      event.preventDefault();
      applyZoom(zoomLevel - ZOOM_STEP);
      return;
    }
    if (isKeyboardCombo(event, ["KeyR"], ["r", "R"])) {
      event.preventDefault();
      resetZoom();
      return;
    }
    if (isKeyboardCombo(event, ["Digit0", "Numpad0"], ["0"])) {
      event.preventDefault();
      resetZoom();
      return;
    }
    if (event.shiftKey && event.key === "ArrowLeft") {
      event.preventDefault();
      panBy(-PAN_STEP, 0);
      return;
    }
    if (event.shiftKey && event.key === "ArrowRight") {
      event.preventDefault();
      panBy(PAN_STEP, 0);
      return;
    }
    if (event.shiftKey && event.key === "ArrowUp") {
      event.preventDefault();
      panBy(0, -PAN_STEP);
      return;
    }
    if (event.shiftKey && event.key === "ArrowDown") {
      event.preventDefault();
      panBy(0, PAN_STEP);
      return;
    }
  }
  const jsonData = getCurrentJson();
  if (!jsonData?.items?.length) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    const orderedIndices = getOrderedBubbleIndices(jsonData);
    const currentPosition = orderedIndices.indexOf(selectedIndex);
    const nextPosition = currentPosition === -1 ? 0 : currentPosition + 1;
    const nextIndex =
      orderedIndices[
        nextPosition >= orderedIndices.length ? 0 : nextPosition
      ];
    if (nextIndex !== undefined) {
      selectBubble(nextIndex);
      ensureBubbleInView(nextIndex);
    }
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    const orderedIndices = getOrderedBubbleIndices(jsonData);
    const currentPosition = orderedIndices.indexOf(selectedIndex);
    const previousPosition =
      currentPosition === -1
        ? orderedIndices.length - 1
        : currentPosition - 1;
    const previousIndex =
      orderedIndices[
        previousPosition < 0
          ? orderedIndices.length - 1
          : previousPosition
      ];
    if (previousIndex !== undefined) {
      selectBubble(previousIndex);
      ensureBubbleInView(previousIndex);
    }
  }
});

addBubbleBtn.addEventListener("click", () => {
  const jsonData = getCurrentJson();
  if (!jsonData) return;
  setDrawingMode(!isDrawingBubble);
});

removeBubbleBtn.addEventListener("click", () => {
  const jsonData = getCurrentJson();
  if (!jsonData || selectedIndex < 0) return;
  recordHistory(getCurrentPage(), "remove-bubble");
  jsonData.items.splice(selectedIndex, 1);
  if (jsonData.items.length) {
    selectBubble(Math.min(selectedIndex, jsonData.items.length - 1));
  } else {
    resetSelection();
    renderBubbleList();
    renderOverlays();
  }
  updateStatus();
  updateBubbleToolState();
});

undoBtn.addEventListener("click", () => undoChange());
redoBtn.addEventListener("click", () => redoChange());
historyUndoBtn.addEventListener("click", () => undoChange());
historyRedoBtn.addEventListener("click", () => redoChange());
historyClearBtn.addEventListener("click", () => clearHistory());

// How to run locally:
// 1) Save this file as index.html.
// 2) Open index.html in your browser.
renderPageList();
applyZoom(1);
updateStatus();
updateBubbleToolState();
    
