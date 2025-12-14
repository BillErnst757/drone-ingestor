const GRID_WIDTH_IN = 72;
const GRID_HEIGHT_IN = 96;
const LETTER_AREA_SCALE = 0.8;
const WORK_WIDTH_IN = GRID_WIDTH_IN * LETTER_AREA_SCALE;
const WORK_HEIGHT_IN = GRID_HEIGHT_IN * LETTER_AREA_SCALE;
const ENTRY_POINT = { x: GRID_WIDTH_IN / 2, y: GRID_HEIGHT_IN };
const PIXELS_PER_INCH = 8;
const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 1e-4;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const THEME_STORAGE_KEY = "ropePlannerTheme";
const DEFAULT_THEME = "dark";
const initialTheme = loadStoredTheme();

const canvas = document.getElementById("plannerCanvas");
const ctx = canvas.getContext("2d");
let DEVICE_PIXEL_RATIO = window.devicePixelRatio || 1;
const overlay = document.getElementById("canvasMessage");
let hiddenSvg = null;
let pathHelper = null;
const opentypeLib = window.opentype || null;

const controls = {
  text: document.getElementById("textInput"),
  letterSpacing: document.getElementById("letterSpacingInput"),
  scale: document.getElementById("scaleSlider"),
  scaleLabel: document.getElementById("scaleValue"),
  gridSpacingX: document.getElementById("gridSpacingXInput"),
  gridSpacingY: document.getElementById("gridSpacingYInput"),
  snapTolerance: document.getElementById("snapToleranceInput"),
  ropeThickness: document.getElementById("ropeThicknessInput"),
  showGrid: document.getElementById("showGridToggle"),
  keepInBounds: document.getElementById("keepInBoundsToggle"),
  strictManualToggle: document.getElementById("strictManualToggle"),
  font: document.getElementById("fontInput"),
  fontStatus: document.getElementById("fontStatus"),
  fontDropZone: document.getElementById("fontDropZone"),
  themeToggle: document.getElementById("themeToggle"),
  nudgeUp: document.getElementById("nudgeUp"),
  nudgeDown: document.getElementById("nudgeDown"),
  nudgeLeft: document.getElementById("nudgeLeft"),
  nudgeRight: document.getElementById("nudgeRight"),
  resetLetter: document.getElementById("resetLetterButton"),
  applySnapButton: document.getElementById("applySnapButton"),
  clearPointsButton: document.getElementById("clearPointsButton"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  zoomReadout: document.getElementById("zoomReadout"),
  canvasViewport: document.getElementById("canvasViewport"),
  nudgeReadout: document.getElementById("nudgeReadout"),
  cursorReadout: document.getElementById("cursorReadout"),
  pointsList: document.getElementById("pointsList"),
  exportButton: document.getElementById("exportButton"),
  totals: {
    lit: document.getElementById("totalLit"),
    blackout: document.getElementById("totalBlackout"),
    overall: document.getElementById("totalOverall"),
  },
  tableBody: document.querySelector("#letterTable tbody"),
};

const state = {
  font: null,
  fontName: "",
  text: controls.text.value.trim().toUpperCase(),
  scalePercent: Number(controls.scale.value),
  letterSpacing: Number(controls.letterSpacing.value),
  gridSpacing: {
    x: Math.max(0.5, Number(controls.gridSpacingX?.value) || 2),
    y: Math.max(0.5, Number(controls.gridSpacingY?.value) || 4),
  },
  snapTolerance: Math.max(0, Number(controls.snapTolerance?.value) || 0.75),
  ropeThickness: Number(controls.ropeThickness.value),
  showGrid: controls.showGrid.checked,
  theme: initialTheme,
  manualOffset: { x: 0, y: 0 },
  zoom: 1,
  keepInBounds: controls.keepInBounds ? controls.keepInBounds.checked : true,
  strictManual: controls.strictManualToggle ? controls.strictManualToggle.checked : false,
  fineNudge: false,
  hoverPoint: null,
  recordedPoints: [],
  plan: null,
};

function init() {
  ensurePathHelper();
  setupCanvas();
  attachListeners();
  updateScaleLabel();
  applyTheme(state.theme);
  updateNudgeReadout();
  updateZoomReadout();
  updateCursorReadout();
  updatePointList();
  updateOverlay("Load a DIN 1451 font to begin.");
  render();
  centerViewportOnCanvas();
}

function setupCanvas() {
  DEVICE_PIXEL_RATIO = window.devicePixelRatio || 1;
  const zoom = state.zoom || 1;
  const cssWidth = GRID_WIDTH_IN * PIXELS_PER_INCH * zoom;
  const cssHeight = GRID_HEIGHT_IN * PIXELS_PER_INCH * zoom;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * DEVICE_PIXEL_RATIO);
  canvas.height = Math.round(cssHeight * DEVICE_PIXEL_RATIO);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function ensurePathHelper() {
  if (pathHelper) return;
  hiddenSvg = document.createElementNS(SVG_NS, "svg");
  hiddenSvg.setAttribute("width", "0");
  hiddenSvg.setAttribute("height", "0");
  hiddenSvg.setAttribute("aria-hidden", "true");
  hiddenSvg.style.position = "absolute";
  hiddenSvg.style.opacity = "0";
  hiddenSvg.style.pointerEvents = "none";

  pathHelper = document.createElementNS(SVG_NS, "path");
  hiddenSvg.appendChild(pathHelper);
  document.body.appendChild(hiddenSvg);
}

function attachListeners() {
  controls.text.addEventListener("input", () => {
    let value = (controls.text.value || "").replace(/\s+/g, "");
    if (value.length > 1) {
      value = value.slice(0, 1);
    }
    value = value.toUpperCase();
    controls.text.value = value;
    state.text = value;
    resetManualOffset();
    recalc();
  });

  controls.letterSpacing.addEventListener("input", () => {
    state.letterSpacing = Number(controls.letterSpacing.value);
    resetManualOffset();
    recalc();
  });

  controls.scale.addEventListener("input", () => {
    state.scalePercent = Number(controls.scale.value);
    resetManualOffset();
    updateScaleLabel();
    recalc();
  });

  const updateGridSpacing = () => {
    const spacingX = Math.max(0.5, Number(controls.gridSpacingX?.value) || state.gridSpacing.x || 2);
    const spacingY = Math.max(0.5, Number(controls.gridSpacingY?.value) || state.gridSpacing.y || 4);
    state.gridSpacing = { x: spacingX, y: spacingY };
    resetManualOffset();
    recalc();
    updateNudgeReadout();
  };

  if (controls.gridSpacingX) {
    controls.gridSpacingX.addEventListener("input", updateGridSpacing);
  }
  if (controls.gridSpacingY) {
    controls.gridSpacingY.addEventListener("input", updateGridSpacing);
  }

  if (controls.snapTolerance) {
    controls.snapTolerance.addEventListener("input", () => {
      state.snapTolerance = Math.max(0, Number(controls.snapTolerance.value) || 0);
      resetManualOffset();
      recalc();
    });
  }

  controls.ropeThickness.addEventListener("input", () => {
    state.ropeThickness = Math.max(0.1, Number(controls.ropeThickness.value));
    recalc();
  });

  controls.showGrid.addEventListener("change", () => {
    state.showGrid = controls.showGrid.checked;
    render();
  });

  if (controls.keepInBounds) {
    controls.keepInBounds.addEventListener("change", () => {
      state.keepInBounds = controls.keepInBounds.checked;
      resetManualOffset();
      recalc();
    });
  }

  if (controls.strictManualToggle) {
    controls.strictManualToggle.addEventListener("change", () => {
      state.strictManual = controls.strictManualToggle.checked;
      updateNudgeReadout();
    });
  }

  controls.font.addEventListener("change", handleFontLoad);
  attachDropZoneHandlers();

  if (controls.themeToggle) {
    controls.themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme(state.theme);
      storeTheme(state.theme);
      render();
    });
  }

  const nudgeMap = [
    { control: controls.nudgeUp, dir: "up" },
    { control: controls.nudgeDown, dir: "down" },
    { control: controls.nudgeLeft, dir: "left" },
    { control: controls.nudgeRight, dir: "right" },
  ];

  nudgeMap.forEach(({ control, dir }) => {
    if (!control) return;
    control.addEventListener("click", () => handleNudge(dir));
  });

  if (controls.resetLetter) {
    controls.resetLetter.addEventListener("click", () => {
      resetManualOffset();
      state.keepInBounds = controls.keepInBounds ? controls.keepInBounds.checked : state.keepInBounds;
      recalc();
      centerViewportOnCanvas();
    });
  }

  if (controls.applySnapButton) {
    controls.applySnapButton.addEventListener("click", () => {
      recalc();
    });
  }

  if (controls.clearPointsButton) {
    controls.clearPointsButton.addEventListener("click", () => {
      state.recordedPoints = [];
      updatePointList();
    });
  }

  const handleZoom = (delta) => {
    applyZoom((state.zoom || 1) + delta);
  };

  if (controls.zoomIn) {
    controls.zoomIn.addEventListener("click", () => handleZoom(0.25));
  }
  if (controls.zoomOut) {
    controls.zoomOut.addEventListener("click", () => handleZoom(-0.25));
  }

  if (controls.canvasViewport) {
    const viewport = controls.canvasViewport;
    viewport.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      handleZoom(delta);
    }, { passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Shift" && !state.fineNudge) {
        state.fineNudge = true;
        updateNudgeReadout();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "Shift" && state.fineNudge) {
        state.fineNudge = false;
        updateNudgeReadout();
      }
    });

    let isDragging = false;
    let dragInitiated = false;
    let dragStart = { x: 0, y: 0 };
    let scrollOrigin = { left: 0, top: 0 };

    const endDrag = () => {
      if (dragInitiated) {
        dragInitiated = false;
        viewport.classList.remove("dragging");
        document.body.style.userSelect = "";
      }
      isDragging = false;
    };

    viewport.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      isDragging = true;
      dragInitiated = false;
      dragStart = { x: event.clientX, y: event.clientY };
      scrollOrigin = { left: viewport.scrollLeft, top: viewport.scrollTop };
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      if (!dragInitiated) {
        const distance = Math.hypot(dx, dy);
        if (distance > 4) {
          dragInitiated = true;
          viewport.classList.add("dragging");
          document.body.style.userSelect = "none";
        } else {
          return;
        }
      }
      viewport.scrollLeft = scrollOrigin.left - dx;
      viewport.scrollTop = scrollOrigin.top - dy;
    });

    window.addEventListener("mouseup", endDrag);
    viewport.addEventListener("mouseleave", endDrag);
  }

  const handleCursorMove = (event) => {
    const coords = getGridCoordinatesFromEvent(event);
    if (coords && coords.x >= -EPSILON && coords.x <= GRID_WIDTH_IN + EPSILON && coords.y >= -EPSILON && coords.y <= GRID_HEIGHT_IN + EPSILON) {
      state.hoverPoint = coords;
    } else {
      state.hoverPoint = null;
    }
    updateCursorReadout();
  };

  const handleCursorLeave = () => {
    state.hoverPoint = null;
    updateCursorReadout();
  };

  const handleCanvasClick = (event) => {
    if (controls.canvasViewport && controls.canvasViewport.classList.contains("dragging")) {
      return;
    }
    const coords = getGridCoordinatesFromEvent(event);
    if (!coords) return;
    if (coords.x < -EPSILON || coords.x > GRID_WIDTH_IN + EPSILON || coords.y < -EPSILON || coords.y > GRID_HEIGHT_IN + EPSILON) {
      return;
    }
    const record = formatPointRecord(coords.x, coords.y);
    state.recordedPoints.push(record);
    updatePointList();
  };

  canvas.addEventListener("mousemove", handleCursorMove);
  canvas.addEventListener("mouseleave", handleCursorLeave);
  canvas.addEventListener("click", handleCanvasClick);

  controls.exportButton.addEventListener("click", () => {
    if (!state.plan) return;
    exportPlan(state.plan);
  });

  window.addEventListener("resize", () => {
    setupCanvas();
    render();
    updateZoomReadout();
    centerViewportOnCanvas();
  });
}

function updateScaleLabel() {
  controls.scaleLabel.textContent = `${state.scalePercent}%`;
}

function handleFontLoad(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  loadFontFile(file);
}

function loadFontFile(file) {
  if (!file) return;

  if (!opentypeLib) {
    console.error("opentype.js not available on window.");
    controls.fontStatus.textContent = "Font engine not loaded. Refresh and try again.";
    controls.fontStatus.classList.remove("status-ok");
    controls.fontStatus.classList.add("status-warn");
    updateOverlay("Font engine not available. Check script load order.");
    return;
  }

  const lowerName = file.name?.toLowerCase() || "";
  if (!lowerName.endsWith(".ttf") && !lowerName.endsWith(".otf")) {
    controls.fontStatus.textContent = "Unsupported file type. Please use .ttf or .otf.";
    controls.fontStatus.classList.remove("status-ok");
    controls.fontStatus.classList.add("status-warn");
    return;
  }

  controls.fontStatus.textContent = `Loading ${file.name}…`;
  controls.fontStatus.classList.remove("status-warn");
  controls.fontStatus.classList.remove("status-ok");

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const fontBuffer = ev.target.result;
      const font = opentypeLib.parse(fontBuffer);
      state.font = font;
      state.fontName = file.name;
      controls.fontStatus.textContent = `Loaded ${file.name}`;
      controls.fontStatus.classList.remove("status-warn");
      controls.fontStatus.classList.add("status-ok");
      updateOverlay(state.text ? "" : "Enter text to plan rope layout.");
      resetManualOffset();
      recalc();
    } catch (error) {
      console.error("Failed to load font", error);
      state.font = null;
      state.plan = null;
      controls.fontStatus.textContent = "Failed to parse font file.";
      controls.fontStatus.classList.remove("status-ok");
      controls.fontStatus.classList.add("status-warn");
      updateOverlay("Font load failed. Please try a different DIN 1451 file.");
      render();
    }
    if (controls.font) {
      controls.font.value = "";
    }
  };
  reader.onerror = () => {
    controls.fontStatus.textContent = "Error reading font file.";
    controls.fontStatus.classList.remove("status-ok");
    controls.fontStatus.classList.add("status-warn");
    if (controls.font) {
      controls.font.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

function attachDropZoneHandlers() {
  const dropZone = controls.fontDropZone;
  if (!dropZone) return;

  const stopDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, stopDefaults, false);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      stopDefaults(event);
      dropZone.classList.add("is-dragover");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      stopDefaults(event);
      dropZone.classList.remove("is-dragover");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    stopDefaults(event);
    dropZone.classList.remove("is-dragover");
    let file = null;
    const dt = event.dataTransfer;
    if (dt?.items && dt.items.length) {
      const item = Array.from(dt.items).find((entry) => entry.kind === "file");
      if (item) {
        file = item.getAsFile();
      }
    } else if (dt?.files && dt.files.length) {
      file = dt.files[0];
    }
    if (file) {
      loadFontFile(file);
    }
  });

  dropZone.addEventListener("click", () => {
    controls.font?.click();
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      controls.font?.click();
    }
  });
}

function recalc() {
  if (!state.font) {
    state.plan = null;
    updateOverlay("Load a DIN 1451 font to begin.");
    updateTotals(null);
    updateTable(null);
    render();
    controls.exportButton.disabled = true;
    return;
  }

  if (!state.text) {
    state.plan = null;
    updateOverlay("Enter text to plan rope layout.");
    updateTotals(null);
    updateTable(null);
    render();
    controls.exportButton.disabled = true;
    return;
  }

  try {
    state.plan = computePlan(state);
    if (state.plan?.metadata?.manualOffsetIn) {
      state.manualOffset = { ...state.plan.metadata.manualOffsetIn };
    }
    updateOverlay("");
    updateTotals(state.plan);
    updateTable(state.plan);
    render();
    controls.exportButton.disabled = false;
    updateNudgeReadout();
  } catch (error) {
    console.error(error);
    state.plan = null;
    updateOverlay("Unable to compute plan for this text.");
    updateTotals(null);
    updateTable(null);
    render();
    controls.exportButton.disabled = true;
    resetManualOffset();
  }
}

function computePlan(currentState) {
  const { font } = currentState;
  const text = currentState.text;
  const path = font.getPath(text, 0, 0, font.unitsPerEm);
  const bbox = path.getBoundingBox();

  if (!Number.isFinite(bbox.x1) || !Number.isFinite(bbox.y1) || !Number.isFinite(bbox.x2) || !Number.isFinite(bbox.y2)) {
    throw new Error("Invalid glyph bounds.");
  }

  const rawWidth = bbox.x2 - bbox.x1;
  const rawHeight = bbox.y2 - bbox.y1;
  if (rawWidth < EPSILON || rawHeight < EPSILON) {
    throw new Error("Glyph bounds are too small.");
  }

  const targetHeight = GRID_HEIGHT_IN * (currentState.scalePercent / 100);
  const targetWidth = GRID_WIDTH_IN;
  const scaleByHeight = targetHeight / rawHeight;
  const scaleByWidth = targetWidth / rawWidth;
  const scale = Math.min(scaleByHeight, scaleByWidth);
  const appliedHeight = rawHeight * scale;
  const appliedWidth = rawWidth * scale;

  const leftMargin = (GRID_WIDTH_IN - WORK_WIDTH_IN) / 2;
  const bottomMargin = (GRID_HEIGHT_IN - WORK_HEIGHT_IN) / 2;
  const areaCenterX = GRID_WIDTH_IN / 2;
  const areaCenterY = GRID_HEIGHT_IN / 2;
  const bboxCenterX = (bbox.x1 + bbox.x2) / 2;
  const bboxCenterY = (bbox.y1 + bbox.y2) / 2;

  const transformX = (value) => (value - bboxCenterX) * scale + areaCenterX;
  const transformY = (value) => (bboxCenterY - value) * scale + areaCenterY;

  const transformedCommands = transformCommands(path.commands, transformX, transformY);

  const letterArea = {
    x: leftMargin,
    y: bottomMargin,
    width: WORK_WIDTH_IN,
    height: WORK_HEIGHT_IN,
  };

  let glyphPlans = [
    {
      char: text,
      glyph: null,
      pathCommands: transformedCommands,
    },
  ];

  computeContoursForPlans(glyphPlans);

  const tolerance = Math.max(0, currentState.strictManual ? 0 : (currentState.snapTolerance || 0));
  if (!currentState.strictManual && tolerance > EPSILON) {
    gridFitGlyphPlans(glyphPlans, tolerance, currentState.gridSpacing);
    computeContoursForPlans(glyphPlans);
  }

  let totalShift = { dx: 0, dy: 0 };

  const snapResult = snapGlyphPlansToGrid(glyphPlans, letterArea, currentState.gridSpacing);
  if (snapResult && (Math.abs(snapResult.dx) > EPSILON || Math.abs(snapResult.dy) > EPSILON)) {
    translateGlyphPlans(glyphPlans, snapResult.dx, snapResult.dy);
    computeContoursForPlans(glyphPlans);
    totalShift.dx += snapResult.dx;
    totalShift.dy += snapResult.dy;
  }

  const manualOffset = currentState.manualOffset || { x: 0, y: 0 };
  let manualShift = { dx: manualOffset.x || 0, dy: manualOffset.y || 0 };
  if (Math.abs(manualShift.dx) > EPSILON || Math.abs(manualShift.dy) > EPSILON) {
    translateGlyphPlans(glyphPlans, manualShift.dx, manualShift.dy);
    computeContoursForPlans(glyphPlans);
    totalShift.dx += manualShift.dx;
    totalShift.dy += manualShift.dy;
  }

  if (currentState.keepInBounds !== false && !currentState.strictManual) {
    const clampResult = clampGlyphPlansToArea(glyphPlans, {
      x: 0,
      y: 0,
      width: GRID_WIDTH_IN,
      height: GRID_HEIGHT_IN,
    });
    if (clampResult && (Math.abs(clampResult.dx) > EPSILON || Math.abs(clampResult.dy) > EPSILON)) {
      translateGlyphPlans(glyphPlans, clampResult.dx, clampResult.dy);
      computeContoursForPlans(glyphPlans);
      totalShift.dx += clampResult.dx;
      totalShift.dy += clampResult.dy;
      manualShift.dx += clampResult.dx;
      manualShift.dy += clampResult.dy;
    }
  }

  const routing = buildRouting(glyphPlans);
  const bounds = measurePlanBounds(glyphPlans);

  return {
    layout: {
      letterArea,
      baseline: transformY(0) + totalShift.dy,
      fontSize: font.unitsPerEm * scale,
      unitScale: scale,
      targetHeight: appliedHeight,
      targetWidth: appliedWidth,
      bounds,
    },
    glyphs: glyphPlans,
    segments: routing.segments,
    letters: routing.letters,
    metrics: routing.metrics,
    entryPoint: { ...ENTRY_POINT },
    metadata: {
      text,
      fontName: currentState.fontName,
      generatedAt: new Date().toISOString(),
      manualOffsetIn: manualShift,
      snapOffsetIn: {
        dx: totalShift.dx - manualShift.dx,
        dy: totalShift.dy - manualShift.dy,
      },
      gridSpacingIn: { ...currentState.gridSpacing },
      keepInBounds: currentState.keepInBounds !== false,
      snapToleranceIn: tolerance,
    },
    tiePoints: computeTiePoints(routing.segments, currentState.gridSpacing),
  };
}

function transformCommands(commands, tx, ty) {
  return commands.map((cmd) => {
    switch (cmd.type) {
      case "M":
      case "L":
        return { ...cmd, x: tx(cmd.x), y: ty(cmd.y) };
      case "C":
        return {
          ...cmd,
          x: tx(cmd.x),
          y: ty(cmd.y),
          x1: tx(cmd.x1),
          y1: ty(cmd.y1),
          x2: tx(cmd.x2),
          y2: ty(cmd.y2),
        };
      case "Q":
        return {
          ...cmd,
          x: tx(cmd.x),
          y: ty(cmd.y),
          x1: tx(cmd.x1),
          y1: ty(cmd.y1),
        };
      default:
        return { ...cmd };
    }
  });
}

function translateGlyphPlans(glyphPlans, dx, dy) {
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return;
  }
  glyphPlans.forEach((plan) => {
    plan.pathCommands = plan.pathCommands.map((cmd) => translateCommand(cmd, dx, dy));
  });
}

function translateCommand(cmd, dx, dy) {
  if (!cmd || typeof cmd !== "object") return cmd;
  const updated = { ...cmd };
  if ("x" in updated) updated.x += dx;
  if ("y" in updated) updated.y += dy;
  if ("x1" in updated) updated.x1 += dx;
  if ("y1" in updated) updated.y1 += dy;
  if ("x2" in updated) updated.x2 += dx;
  if ("y2" in updated) updated.y2 += dy;
  return updated;
}

function createEndpointSetter(cmd) {
  return (x, y) => {
    if (x != null && "x" in cmd) cmd.x = x;
    if (y != null && "y" in cmd) cmd.y = y;
  };
}

function snapValue(value, spacing, tolerance) {
  if (!spacing || spacing < EPSILON) return null;
  const snapped = Math.round(value / spacing) * spacing;
  return Math.abs(snapped - value) <= tolerance ? snapped : null;
}

function gridFitGlyphPlans(glyphPlans, tolerance, gridSpacing) {
  const spacingX = Math.max(gridSpacing?.x || 0, EPSILON);
  const spacingY = Math.max(gridSpacing?.y || 0, EPSILON);
  glyphPlans.forEach((plan) => {
    if (!plan.pathCommands) return;
    snapPathCommandsToGrid(plan.pathCommands, tolerance, spacingX, spacingY);
  });
}

function snapPathCommandsToGrid(commands, tolerance, spacingX, spacingY) {
  if (!commands || !commands.length) return;
  let currentPoint = { x: 0, y: 0 };
  let previousSetter = null;
  let contourStart = null;

  commands.forEach((cmd) => {
    switch (cmd.type) {
      case "M": {
        currentPoint = { x: cmd.x, y: cmd.y };
        previousSetter = createEndpointSetter(cmd);
        contourStart = { point: { ...currentPoint }, setter: previousSetter };
        break;
      }
      case "L": {
        const endPoint = { x: cmd.x, y: cmd.y };
        const startPoint = { ...currentPoint };
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;

        let snapped = false;
        if (Math.abs(dy) <= tolerance && Math.abs(dx) > tolerance) {
          const snappedStart = snapValue(startPoint.y, spacingY, tolerance);
          const snappedEnd = snapValue(endPoint.y, spacingY, tolerance);
          let snappedY = null;
          if (snappedStart != null && snappedEnd != null) {
            snappedY = Math.abs(snappedStart - snappedEnd) <= spacingY ? (snappedStart + snappedEnd) / 2 : snappedStart;
          } else {
            snappedY = snappedStart ?? snappedEnd;
          }
          if (snappedY != null) {
            if (previousSetter) previousSetter(null, snappedY);
            startPoint.y = snappedY;
            endPoint.y = snappedY;
            cmd.y = snappedY;
            if (contourStart && previousSetter === contourStart.setter) {
              contourStart.point = { x: startPoint.x, y: snappedY };
            }
            snapped = true;
          }
        } else if (Math.abs(dx) <= tolerance && Math.abs(dy) > tolerance) {
          const snappedStart = snapValue(startPoint.x, spacingX, tolerance);
          const snappedEnd = snapValue(endPoint.x, spacingX, tolerance);
          let snappedX = null;
          if (snappedStart != null && snappedEnd != null) {
            snappedX = Math.abs(snappedStart - snappedEnd) <= spacingX ? (snappedStart + snappedEnd) / 2 : snappedStart;
          } else {
            snappedX = snappedStart ?? snappedEnd;
          }
          if (snappedX != null) {
            if (previousSetter) previousSetter(snappedX, null);
            startPoint.x = snappedX;
            endPoint.x = snappedX;
            cmd.x = snappedX;
            if (contourStart && previousSetter === contourStart.setter) {
              contourStart.point = { x: snappedX, y: startPoint.y };
            }
            snapped = true;
          }
        }

        if (snapped) {
          currentPoint = { ...endPoint };
        } else {
          currentPoint = endPoint;
        }
        previousSetter = createEndpointSetter(cmd);
        break;
      }
      case "C":
      case "Q": {
        currentPoint = { x: cmd.x, y: cmd.y };
        previousSetter = createEndpointSetter(cmd);
        break;
      }
      case "Z": {
        if (contourStart) {
          currentPoint = { ...contourStart.point };
          previousSetter = contourStart.setter;
        }
        break;
      }
      default:
        break;
    }
  });
}

function snapGlyphPlansToGrid(glyphPlans, letterArea, gridSpacing) {
  const spacingX = Math.max(gridSpacing?.x || 1, EPSILON);
  const spacingY = Math.max(gridSpacing?.y || spacingX, EPSILON);
  if (!spacingX || !spacingY) {
    return null;
  }
  const bounds = measurePlanBounds(glyphPlans);
  if (!bounds) return null;

  const areaLeft = 0;
  const areaRight = GRID_WIDTH_IN;
  const areaBottom = 0;
  const areaTop = GRID_HEIGHT_IN;

  const relativeMinX = bounds.minX - areaLeft;
  const relativeMinY = bounds.minY - areaBottom;

  const snappedRelativeX = Math.round(relativeMinX / spacingX) * spacingX;
  const snappedRelativeY = Math.round(relativeMinY / spacingY) * spacingY;

  let dx = areaLeft + snappedRelativeX - bounds.minX;
  let dy = areaBottom + snappedRelativeY - bounds.minY;

  const newMinX = bounds.minX + dx;
  const newMaxX = bounds.maxX + dx;
  if (newMinX < areaLeft) {
    dx += areaLeft - newMinX;
  }
  if (newMaxX > areaRight) {
    dx -= newMaxX - areaRight;
  }

  const newMinY = bounds.minY + dy;
  if (newMinY < areaBottom) {
    dy += areaBottom - newMinY;
  }
  const newMaxY = bounds.maxY + dy;
  if (newMaxY > areaTop) {
    dy -= newMaxY - areaTop;
  }

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return null;
  }
  return { dx, dy };
}

function clampGlyphPlansToArea(glyphPlans, letterArea) {
  const bounds = measurePlanBounds(glyphPlans);
  if (!bounds) return null;

  let dx = 0;
  let dy = 0;
  const areaRight = GRID_WIDTH_IN;
  const areaTop = GRID_HEIGHT_IN;

  if (bounds.minX < 0) dx += -bounds.minX;
  if (bounds.maxX > areaRight) dx -= bounds.maxX - areaRight;
  if (bounds.minY < 0) dy += -bounds.minY;
  if (bounds.maxY > areaTop) dy -= bounds.maxY - areaTop;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return null;
  return { dx, dy };
}

function updateOverlay(message) {
  if (!overlay) return;
  overlay.textContent = message;
  overlay.style.display = message ? "grid" : "none";
}

function render() {
  clearCanvas();
  drawBackground();
  drawGrid();
  drawPanelTicks();
  drawLetterArea();
  drawGlyphs();
  drawTiePoints();
  drawCapturedPoints();
  drawBlackoutSegments();
  drawEntryPoint();
}

function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawBackground() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getColorVar("--canvas-bg", "#0f1623");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawGrid() {
  if (!state.showGrid) return;
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  const spacingX = Math.max(0.25, state.gridSpacing?.x || 2);
  const spacingY = Math.max(0.25, state.gridSpacing?.y || 4);
  const minorColor = getColorVar("--grid-minor", "rgba(160, 186, 240, 0.3)");
  const majorColor = getColorVar("--grid-major", "rgba(233, 238, 255, 0.65)");
  const minorWidth = 1 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  const majorWidth = 1.8 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  const majorEveryX = Math.max(1, Math.round(12 / spacingX));
  const majorEveryY = Math.max(1, Math.round(12 / spacingY));

  const drawLines = (spacing, majorEvery, orientation) => {
    for (let i = 0; ; i += 1) {
      const pos = i * spacing;
      if (pos > (orientation === "vertical" ? GRID_WIDTH_IN : GRID_HEIGHT_IN) + spacing * 0.25) {
        break;
      }
      const isMajor = i % majorEvery === 0;
      ctx.beginPath();
      ctx.lineWidth = isMajor ? majorWidth : minorWidth;
      ctx.strokeStyle = isMajor ? majorColor : minorColor;
      if (orientation === "vertical") {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, GRID_HEIGHT_IN);
      } else {
        ctx.moveTo(0, pos);
        ctx.lineTo(GRID_WIDTH_IN, pos);
      }
      ctx.stroke();
    }
  };

  drawLines(spacingX, majorEveryX, "vertical");
  drawLines(spacingY, majorEveryY, "horizontal");

  ctx.beginPath();
  ctx.strokeStyle = getColorVar("--grid-frame", "rgba(255, 255, 255, 0.6)");
  ctx.lineWidth = 3.9 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO);
  ctx.rect(0, 0, GRID_WIDTH_IN, GRID_HEIGHT_IN);
  ctx.stroke();
  ctx.restore();
}

function drawPanelTicks() {
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  const minorColor = getColorVar("--panel-tick-minor", "rgba(55,65,81,0.6)");
  const majorColor = getColorVar("--panel-tick-major", "rgba(30,41,59,0.8)");
  const minorLen = 0.3;
  const majorLen = 0.7;
  const minorSpacingX = state.gridSpacing?.x || 2;
  const minorSpacingY = state.gridSpacing?.y || 4;
  const majorSpacingX = 12;
  const majorSpacingY = 12;

  for (let x = 0; x <= GRID_WIDTH_IN + EPSILON; x += minorSpacingX) {
    const isMajor = Math.abs(Math.round(x / majorSpacingX) * majorSpacingX - x) < EPSILON;
    const len = isMajor ? majorLen : minorLen;
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.lineWidth = (isMajor ? 1.0 : 0.65) / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, GRID_HEIGHT_IN);
    ctx.lineTo(x, GRID_HEIGHT_IN - len);
    ctx.stroke();
  }

  for (let y = 0; y <= GRID_HEIGHT_IN + EPSILON; y += minorSpacingY) {
    const isMajor = Math.abs(Math.round(y / majorSpacingY) * majorSpacingY - y) < EPSILON;
    const len = isMajor ? majorLen : minorLen;
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.lineWidth = (isMajor ? 1.0 : 0.65) / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(len, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(GRID_WIDTH_IN, y);
    ctx.lineTo(GRID_WIDTH_IN - len, y);
    ctx.stroke();
  }

  ctx.restore();

  if (zoom >= 0.65) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getColorVar("--panel-tick-text", "rgba(30,41,59,0.85)");
    ctx.font = `${12 * DEVICE_PIXEL_RATIO}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const inchToDevice = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
    const toPixelX = (x) => x * inchToDevice;
    const toPixelY = (y) => canvas.height - y * inchToDevice;
    const topLabelY = Math.max(0, toPixelY(GRID_HEIGHT_IN) + 6);

    for (let ft = 1; ft < GRID_WIDTH_IN / 12; ft += 1) {
      const x = toPixelX(ft * 12);
      ctx.fillText(`${ft} ft`, x, Math.max(0, topLabelY));
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const leftLabelX = toPixelX(0) - 18;
    for (let ft = 1; ft < GRID_HEIGHT_IN / 12; ft += 1) {
      const y = toPixelY(ft * 12);
      ctx.fillText(`${ft} ft`, Math.max(0, leftLabelX), y);
    }
    ctx.restore();
  }
}

function drawLetterArea() {
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  const { x, y, width, height } = state.plan?.layout.letterArea || {
    x: (GRID_WIDTH_IN - WORK_WIDTH_IN) / 2,
    y: (GRID_HEIGHT_IN - WORK_HEIGHT_IN) / 2,
    width: WORK_WIDTH_IN,
    height: WORK_HEIGHT_IN,
  };
  ctx.setLineDash([0.5, 0.3]);
  ctx.strokeStyle = getColorVar("--grid-frame", "rgba(129, 200, 255, 0.75)");
  ctx.lineWidth = 1.8 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawEntryPoint() {
  const pixelX = ENTRY_POINT.x * PIXELS_PER_INCH * DEVICE_PIXEL_RATIO;
  const pixelY = canvas.height - ENTRY_POINT.y * PIXELS_PER_INCH * DEVICE_PIXEL_RATIO;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(pixelX, pixelY, 6 * DEVICE_PIXEL_RATIO, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f8fafc";
  ctx.font = `${12 * DEVICE_PIXEL_RATIO}px sans-serif`;
  ctx.fillText("Power entry", pixelX + 10 * DEVICE_PIXEL_RATIO, pixelY - 10 * DEVICE_PIXEL_RATIO);
  ctx.restore();
}

function drawGlyphs() {
  if (!state.plan?.glyphs?.length) return;
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  const ropeWidth = Math.max(state.ropeThickness, 0.12);
  ctx.lineWidth = ropeWidth;
  ctx.strokeStyle = getColorVar("--rope-lit", "rgba(93, 234, 255, 0.95)");
  ctx.shadowColor = getColorVar("--rope-glow", "rgba(58, 217, 255, 0.55)");
  ctx.shadowBlur = 0.7 * ropeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  state.plan.glyphs.forEach((glyphPlan) => {
    ctx.beginPath();
    glyphPlan.pathCommands.forEach((cmd) => {
      switch (cmd.type) {
        case "M":
          ctx.moveTo(cmd.x, cmd.y);
          break;
        case "L":
          ctx.lineTo(cmd.x, cmd.y);
          break;
        case "C":
          ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          break;
        case "Q":
          ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
          break;
        case "Z":
          ctx.closePath();
          break;
        default:
          break;
      }
    });
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();
}

function drawTiePoints() {
  const tiePoints = state.plan?.tiePoints;
  if (!tiePoints || !tiePoints.length) return;
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  const color = getColorVar("--tie-color", "#facc15");
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  const radius = 4 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  tiePoints.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawCapturedPoints() {
  const points = state.recordedPoints;
  if (!points || !points.length) return;
  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  ctx.fillStyle = getColorVar("--point-capture", "#10b981");
  ctx.strokeStyle = "rgba(4, 120, 87, 0.5)";
  ctx.lineWidth = 1 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  const radius = 4 / (PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom);
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.xIn, point.yIn, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawBlackoutSegments() {
  const blackoutSegments =
    state.plan?.segments?.filter((segment) => segment.type === "blackout") || [];
  if (!blackoutSegments.length) return;

  ctx.save();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * DEVICE_PIXEL_RATIO * zoom;
  ctx.setTransform(scale, 0, 0, -scale, 0, canvas.height);
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.strokeStyle = getColorVar("--rope-blackout", "rgba(255, 255, 255, 0.65)");
  ctx.lineWidth = Math.max(state.ropeThickness * 0.45, 0.09);
  const dash = Math.max(state.ropeThickness * 0.5, 0.16);
  ctx.setLineDash([dash, dash * 0.7]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  blackoutSegments.forEach((segment) => {
    ctx.beginPath();
    segment.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });
  ctx.restore();
}

function updateTotals(plan) {
  if (!plan) {
    controls.totals.lit.textContent = "0 in";
    controls.totals.blackout.textContent = "0 in";
    controls.totals.overall.textContent = "0 in";
    return;
  }
  const lit = plan.metrics?.totalLit || 0;
  const blackout = plan.metrics?.totalBlackout || 0;
  const overall = plan.metrics?.totalOverall ?? lit + blackout;
  controls.totals.lit.textContent = formatLength(lit);
  controls.totals.blackout.textContent = formatLength(blackout);
  controls.totals.overall.textContent = formatLength(overall);
}

function updateTable(plan) {
  const body = controls.tableBody;
  body.innerHTML = "";
  if (!plan?.letters || !plan.letters.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty";
    cell.textContent = "Load a font and enter text to see rope estimates.";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  plan.letters.forEach((letter) => {
    const row = document.createElement("tr");
    const label = letter.char === " " ? "[space]" : letter.char;
    row.innerHTML = `
      <td>${label}</td>
      <td>${formatLength(letter.litLength)}</td>
      <td>${formatLength(letter.blackoutLength)}</td>
      <td>${letter.segmentCount}</td>
    `;
    body.appendChild(row);
  });
}

function formatLength(value) {
  if (!Number.isFinite(value)) return "0 in";
  if (value >= 36) {
    return `${(value / 12).toFixed(2)} ft`;
  }
  return `${value.toFixed(1)} in`;
}

function exportPlan(plan) {
  const exportData = {
    ...plan,
    tiePoints: plan.tiePoints,
    recordedPoints: state.recordedPoints,
    metadata: {
      ...plan.metadata,
      ropeThicknessIn: state.ropeThickness,
      gridSpacingIn: { ...state.gridSpacing },
      snapToleranceIn: state.snapTolerance,
      strictManual: state.strictManual,
      zoom: state.zoom,
    },
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (state.text || "layout").replace(/[^a-z0-9]+/gi, "-");
  link.href = url;
  link.download = `rope-plan-${safeName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

init();

function computeContoursForPlans(glyphPlans) {
  glyphPlans.forEach((plan) => {
    const contours = splitContours(plan.pathCommands).map((contourCommands, contourIndex) =>
      analyzeContour(contourCommands, contourIndex)
    );
    plan.contours = contours;
  });
}

function measurePlanBounds(glyphPlans) {
  if (!glyphPlans.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  glyphPlans.forEach((plan) => {
    (plan.contours || []).forEach((contour) => {
      if (!contour?.bounds) return;
      const { minX: cMinX, maxX: cMaxX, minY: cMinY, maxY: cMaxY } = contour.bounds;
      if (!Number.isFinite(cMinX) || !Number.isFinite(cMaxX) || !Number.isFinite(cMinY) || !Number.isFinite(cMaxY)) {
        return;
      }
      if (cMinX < minX) minX = cMinX;
      if (cMaxX > maxX) maxX = cMaxX;
      if (cMinY < minY) minY = cMinY;
      if (cMaxY > maxY) maxY = cMaxY;
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function splitContours(commands) {
  const contours = [];
  let current = [];
  commands.forEach((cmd) => {
    if (cmd.type === "M") {
      if (current.length) {
        contours.push(current);
      }
      current = [cmd];
    } else {
      current.push(cmd);
      if (cmd.type === "Z") {
        contours.push(current);
        current = [];
      }
    }
  });
  if (current.length) {
    contours.push(current);
  }
  return contours;
}

function analyzeContour(commands, index) {
  const pathString = commandsToPathString(commands);
  if (!pathString) {
    return {
      index,
      commands,
      pathString: "",
      length: 0,
      signedArea: 0,
      start: { x: 0, y: 0 },
      isHole: false,
      bounds: null,
    };
  }

  ensurePathHelper();
  pathHelper.setAttribute("d", pathString);
  const length = pathHelper.getTotalLength();
  const samplesCount = Math.max(16, Math.ceil(length * 8));
  const points = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i <= samplesCount; i += 1) {
    const pos = pathHelper.getPointAtLength((i / samplesCount) * length);
    const x = pos.x;
    const y = pos.y;
    const point = { x, y };
    points.push(point);
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (points.length) {
    points.push({ ...points[0] });
  }

  const signedArea = computeSignedArea(points);
  const startCommand = commands.find((cmd) => cmd.type === "M");
  const start = startCommand
    ? { x: startCommand.x, y: startCommand.y }
    : points[0] || { x: 0, y: 0 };

  return {
    index,
    commands,
    pathString,
    length,
    signedArea,
    start,
    isHole: false,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
    points,
  };
}

function commandsToPathString(commands) {
  const parts = [];
  commands.forEach((cmd) => {
    switch (cmd.type) {
      case "M":
      case "L":
        parts.push(`${cmd.type} ${formatCoord(cmd.x)} ${formatCoord(cmd.y)}`);
        break;
      case "C":
        parts.push(
          `C ${formatCoord(cmd.x1)} ${formatCoord(cmd.y1)} ${formatCoord(
            cmd.x2
          )} ${formatCoord(cmd.y2)} ${formatCoord(cmd.x)} ${formatCoord(cmd.y)}`
        );
        break;
      case "Q":
        parts.push(
          `Q ${formatCoord(cmd.x1)} ${formatCoord(cmd.y1)} ${formatCoord(
            cmd.x
          )} ${formatCoord(cmd.y)}`
        );
        break;
      case "Z":
        parts.push("Z");
        break;
      default:
        break;
    }
  });
  return parts.join(" ");
}

function formatCoord(value) {
  return Number.parseFloat(value.toFixed(5));
}

function computeTiePoints(segments, gridSpacing) {
  const spacingX = Math.max(gridSpacing?.x || 2, EPSILON);
  const spacingY = Math.max(gridSpacing?.y || 4, EPSILON);
  const tiePoints = [];
  const seen = new Set();

  const addTie = (x, y, source) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < -EPSILON || x > GRID_WIDTH_IN + EPSILON) return;
    if (y < -EPSILON || y > GRID_HEIGHT_IN + EPSILON) return;
    const snappedX = Math.round(x * 100) / 100;
    const snappedY = Math.round(y * 100) / 100;
    const key = `${snappedX}:${snappedY}`;
    if (seen.has(key)) return;
    seen.add(key);
    tiePoints.push({ x: snappedX, y: snappedY, source });
  };

  segments.forEach((segment) => {
    if (segment.type !== "lit" || !segment.pathString) return;
    ensurePathHelper();
    pathHelper.setAttribute("d", segment.pathString);
    const length = segment.length || pathHelper.getTotalLength();
    const minSpacing = Math.min(spacingX, spacingY);
    const samples = Math.max(32, Math.ceil(length / Math.max(minSpacing / 2, 0.25)));
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
      const pos = pathHelper.getPointAtLength(Math.min(length, (i / samples) * length));
      points.push({ x: pos.x, y: pos.y });
    }

    const stepCountX = Math.max(1, Math.round(12 / spacingX));
    const stepCountY = Math.max(1, Math.round(12 / spacingY));

    if (points.length) {
      addTie(points[0].x, points[0].y, "start");
      addTie(points[points.length - 1].x, points[points.length - 1].y, "end");
    }

    for (let i = 0; i < points.length - 1; i += 1) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isHorizontal = absDy < 0.05 && absDx > absDy;
      const isVertical = absDx < 0.05 && absDy > absDx;

      if (isHorizontal) {
        const y = (p1.y + p2.y) / 2;
        const start = Math.min(p1.x, p2.x);
        const end = Math.max(p1.x, p2.x);
        const firstWire = Math.ceil((start - EPSILON) / spacingX) * spacingX;
        if (firstWire > end + EPSILON) {
          addTie((start + end) / 2, y, "horizontal-short");
        } else {
          let idx = 0;
          for (let x = firstWire; x <= end + EPSILON; x += spacingX, idx += 1) {
            if (idx % stepCountX === 0) {
              addTie(x, y, "horizontal");
            }
          }
        }
        continue;
      }

      if (isVertical) {
        const x = (p1.x + p2.x) / 2;
        const start = Math.min(p1.y, p2.y);
        const end = Math.max(p1.y, p2.y);
        const firstWire = Math.ceil((start - EPSILON) / spacingY) * spacingY;
        if (firstWire > end + EPSILON) {
          addTie(x, (start + end) / 2, "vertical-short");
        } else {
          let idx = 0;
          for (let y = firstWire; y <= end + EPSILON; y += spacingY, idx += 1) {
            if (idx % stepCountY === 0) {
              addTie(x, y, "vertical");
            }
          }
        }
        continue;
      }

      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      const kStartX = Math.ceil((minX - EPSILON) / spacingX);
      const kEndX = Math.floor((maxX + EPSILON) / spacingX);
      for (let k = kStartX; k <= kEndX; k += 1) {
        const xLine = k * spacingX;
        const denom = dx;
        if (Math.abs(denom) < EPSILON) continue;
        const t = (xLine - p1.x) / denom;
        if (t >= 0 && t <= 1) {
          const y = p1.y + t * dy;
          addTie(xLine, y, "curve");
        }
      }

      const kStartY = Math.ceil((minY - EPSILON) / spacingY);
      const kEndY = Math.floor((maxY + EPSILON) / spacingY);
      for (let k = kStartY; k <= kEndY; k += 1) {
        const yLine = k * spacingY;
        const denom = dy;
        if (Math.abs(denom) < EPSILON) continue;
        const t = (yLine - p1.y) / denom;
        if (t >= 0 && t <= 1) {
          const x = p1.x + t * dx;
          addTie(x, yLine, "curve");
        }
      }
    }
  });

  return tiePoints;
}

function buildRouting(glyphPlans) {
  const segments = [];
  const letters = [];
  let currentPoint = clonePoint(ENTRY_POINT);
  let totalLit = 0;
  let totalBlackout = 0;

  glyphPlans.forEach((glyphPlan, glyphIndex) => {
    const contours = [...(glyphPlan.contours || [])];
    if (!contours.length) {
      letters.push({
        char: glyphPlan.char,
        litLength: 0,
        blackoutLength: 0,
        segmentCount: 0,
      });
      return;
    }

    contours.sort((a, b) => Math.abs(b.signedArea) - Math.abs(a.signedArea));
    const referenceSign = Math.sign(contours[0].signedArea || 1) || 1;
    contours.forEach((contour) => {
      contour.isHole = Math.sign(contour.signedArea || 0) !== referenceSign;
    });
    const outerContours = contours.filter((contour) => !contour.isHole);
    const innerContours = contours.filter((contour) => contour.isHole);

    let letterLit = 0;
    let letterBlackout = 0;
    let letterSegments = 0;

    outerContours.forEach((contour, contourIndex) => {
      const startChoice = chooseStartPoint(contour, currentPoint.x);
      const startPoint = startChoice.point;
      if (!Number.isFinite(contour.length) || contour.length < EPSILON) {
        return;
      }
      const connector = buildConnector(currentPoint, startPoint);
      if (connector) {
        const classification =
          segments.length === 0 ? "entry" : contour.isHole ? "inner-jump" : "travel";
        segments.push({
          type: "blackout",
          char: glyphPlan.char,
          glyphIndex,
          contourIndex,
          length: connector.length,
          points: connector.points,
          from: connector.from,
          to: connector.to,
          classification,
          target: startPoint,
        });
        letterBlackout += connector.length;
        totalBlackout += connector.length;
        letterSegments += 1;
        currentPoint = clonePoint(connector.to);
      }

      segments.push({
        type: "lit",
        char: glyphPlan.char,
        glyphIndex,
        contourIndex,
        length: contour.length,
        pathCommands: contour.commands,
        pathString: contour.pathString,
        classification: contour.isHole ? "inner" : "outer",
        points: extractRepresentativePoints(contour),
        bounds: contour.bounds,
        startPoint,
      });
      letterLit += contour.length;
      totalLit += contour.length;
      letterSegments += 1;
      currentPoint = clonePoint(startPoint);
    });

    innerContours.forEach((contour, contourIndex) => {
      const startChoice = chooseStartPoint(contour, currentPoint.x);
      const startPoint = startChoice.point;
      if (!Number.isFinite(contour.length) || contour.length < EPSILON) {
        return;
      }
      const connector = buildConnector(currentPoint, startPoint);
      if (connector) {
        segments.push({
          type: "blackout",
          char: glyphPlan.char,
          glyphIndex,
          contourIndex,
          length: connector.length,
          points: connector.points,
          from: connector.from,
          to: connector.to,
          classification: "inner-jump",
          target: startPoint,
        });
        letterBlackout += connector.length;
        totalBlackout += connector.length;
        letterSegments += 1;
        currentPoint = clonePoint(connector.to);
      }

      segments.push({
        type: "lit",
        char: glyphPlan.char,
        glyphIndex,
        contourIndex,
        length: contour.length,
        pathCommands: contour.commands,
        pathString: contour.pathString,
        classification: "inner",
        points: extractRepresentativePoints(contour),
        bounds: contour.bounds,
        startPoint,
      });
      letterLit += contour.length;
      totalLit += contour.length;
      letterSegments += 1;
      currentPoint = clonePoint(startPoint);
    });

    if (!pointsAlmostEqual(currentPoint, ENTRY_POINT)) {
      const exitConnector = buildConnector(currentPoint, ENTRY_POINT);
      if (exitConnector) {
        segments.push({
          type: "blackout",
          char: glyphPlan.char,
          glyphIndex,
          contourIndex: null,
          length: exitConnector.length,
          points: exitConnector.points,
          from: exitConnector.from,
          to: exitConnector.to,
          classification: "return",
          target: clonePoint(ENTRY_POINT),
        });
        letterBlackout += exitConnector.length;
        totalBlackout += exitConnector.length;
        letterSegments += 1;
        currentPoint = clonePoint(ENTRY_POINT);
      }
    }

    letters.push({
      char: glyphPlan.char,
      litLength: letterLit,
      blackoutLength: letterBlackout,
      segmentCount: letterSegments,
    });
  });

  return {
    segments,
    letters,
    metrics: {
      totalLit,
      totalBlackout,
      totalOverall: totalLit + totalBlackout,
    },
  };
}

function buildConnector(startPoint, endPoint) {
  if (!startPoint || !endPoint) return null;
  const from = clonePoint(startPoint);
  const to = clonePoint(endPoint);
  if (pointsAlmostEqual(from, to)) {
    return null;
  }

  const points = [from];
  if (!nearlyEqual(from.x, to.x) && !nearlyEqual(from.y, to.y)) {
    points.push({ x: from.x, y: to.y });
  }
  points.push(to);

  return {
    from,
    to,
    points,
    length: polylineLength(points),
  };
}

function chooseStartPoint(contour, preferredX) {
  const points = contour.points || [];
  if (!points.length) {
    return { point: clonePoint(contour.start || { x: 0, y: 0 }), index: 0 };
  }
  let bestIndex = 0;
  let bestY = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  const limit = points.length > 1 ? points.length - 1 : points.length;
  for (let i = 0; i < limit; i += 1) {
    const pt = points[i];
    if (!Number.isFinite(pt.y)) continue;
    if (pt.y > bestY + EPSILON) {
      bestY = pt.y;
      bestIndex = i;
      bestDistance = Math.abs(pt.x - preferredX);
    } else if (Math.abs(pt.y - bestY) <= EPSILON) {
      const dist = Math.abs(pt.x - preferredX);
      if (dist < bestDistance) {
        bestIndex = i;
        bestDistance = dist;
      }
    }
  }
  return { point: clonePoint(points[bestIndex]), index: bestIndex };
}

function extractRepresentativePoints(contour) {
  if (contour.points && contour.points.length) {
    return contour.points;
  }
  const pathString = contour.pathString;
  if (!pathString) return [];

  ensurePathHelper();
  pathHelper.setAttribute("d", pathString);
  const length = contour.length || pathHelper.getTotalLength();
  const samplesCount = Math.max(12, Math.ceil(length * 2));
  const points = [];
  for (let i = 0; i <= samplesCount; i += 1) {
    const pos = pathHelper.getPointAtLength((i / samplesCount) * length);
    points.push({ x: pos.x, y: pos.y });
  }
  return points;
}

function computeSignedArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

function polylineLength(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += distance(points[i], points[i + 1]);
  }
  return total;
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointsAlmostEqual(a, b) {
  return distance(a, b) < EPSILON;
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

function clonePoint(point) {
  return { x: Number(point.x), y: Number(point.y) };
}

function getColorVar(varName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value ? value.trim() : fallback;
}

function clampZoom(value) {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function resetManualOffset() {
  state.manualOffset = { x: 0, y: 0 };
  updateNudgeReadout();
}

function handleNudge(direction) {
  if (!state.plan) return;
  const stepX = Math.max(state.gridSpacing?.x || 1, EPSILON);
  const stepY = Math.max(state.gridSpacing?.y || 1, EPSILON);
  const multiplier = state.fineNudge ? 0.25 : 1;
  let dx = 0;
  let dy = 0;
  switch (direction) {
    case "up":
      dy = stepY * multiplier;
      break;
    case "down":
      dy = -stepY * multiplier;
      break;
    case "left":
      dx = -stepX * multiplier;
      break;
    case "right":
      dx = stepX * multiplier;
      break;
    default:
      break;
  }
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return;
  if (state.strictManual) {
    state.keepInBounds = false;
    if (controls.keepInBounds) controls.keepInBounds.checked = false;
  }
  state.manualOffset = {
    x: (state.manualOffset?.x || 0) + dx,
    y: (state.manualOffset?.y || 0) + dy,
  };
  recalc();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (controls.themeToggle) {
    controls.themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    controls.themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
  updateZoomReadout();
}

function updateNudgeReadout() {
  if (!controls.nudgeReadout) return;
  const x = state.manualOffset?.x || 0;
  const y = state.manualOffset?.y || 0;
  const format = (val) => (Math.abs(val) < 1e-6 ? 0 : val).toFixed(2);
  const mode = state.fineNudge ? "(fine)" : "";
  const strict = state.strictManual ? "[strict]" : "";
  controls.nudgeReadout.textContent = `Offset X: ${format(x)} in, Y: ${format(y)} in ${mode} ${strict}`.replace(/\s+/g, " ").trim();
}

function loadStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  } catch (error) {
    console.warn("Unable to load stored theme", error);
    return DEFAULT_THEME;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Unable to store theme preference", error);
  }
}

function updateZoomReadout() {
  if (controls.zoomReadout) {
    controls.zoomReadout.textContent = `${Math.round((state.zoom || 1) * 100)}%`;
  }
  const epsilon = 1e-6;
  if (controls.zoomIn) {
    controls.zoomIn.disabled = state.zoom >= MAX_ZOOM - epsilon;
  }
  if (controls.zoomOut) {
    controls.zoomOut.disabled = state.zoom <= MIN_ZOOM + epsilon;
  }
}

function applyZoom(newZoom) {
  const viewport = controls.canvasViewport;
  const previousZoom = state.zoom || 1;
  const clamped = clampZoom(newZoom);
  if (Math.abs(clamped - previousZoom) < 1e-6) {
    updateZoomReadout();
    return;
  }

  let anchorX = 0.5;
  let anchorY = 0.5;
  const prevWidth = GRID_WIDTH_IN * PIXELS_PER_INCH * previousZoom;
  const prevHeight = GRID_HEIGHT_IN * PIXELS_PER_INCH * previousZoom;

  if (viewport && prevWidth > 0 && prevHeight > 0) {
    anchorX = (viewport.scrollLeft + viewport.clientWidth / 2) / prevWidth;
    anchorY = (viewport.scrollTop + viewport.clientHeight / 2) / prevHeight;
    anchorX = Math.min(1, Math.max(0, anchorX));
    anchorY = Math.min(1, Math.max(0, anchorY));
  }

  state.zoom = clamped;
  setupCanvas();
  render();
  updateZoomReadout();

  if (viewport) {
    const newWidth = GRID_WIDTH_IN * PIXELS_PER_INCH * state.zoom;
    const newHeight = GRID_HEIGHT_IN * PIXELS_PER_INCH * state.zoom;
    const targetCenterX = anchorX * newWidth;
    const targetCenterY = anchorY * newHeight;
    const newScrollLeft = Math.max(0, targetCenterX - viewport.clientWidth / 2);
    const newScrollTop = Math.max(0, targetCenterY - viewport.clientHeight / 2);
    viewport.scrollLeft = newScrollLeft;
    viewport.scrollTop = newScrollTop;
  }
}

function centerViewportOnCanvas() {
  const viewport = controls.canvasViewport;
  if (!viewport) return;
  const zoom = state.zoom || 1;
  const width = GRID_WIDTH_IN * PIXELS_PER_INCH * zoom;
  const height = GRID_HEIGHT_IN * PIXELS_PER_INCH * zoom;
  const targetLeft = Math.max(0, width / 2 - viewport.clientWidth / 2);
  const targetTop = Math.max(0, height / 2 - viewport.clientHeight / 2);
  viewport.scrollLeft = targetLeft;
  viewport.scrollTop = targetTop;
}

function getGridCoordinatesFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const zoom = state.zoom || 1;
  const scale = PIXELS_PER_INCH * zoom;
  const x = (event.clientX - rect.left) / scale;
  const y = (rect.height - (event.clientY - rect.top)) / scale;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function formatFeetInches(value) {
  const rounded = Math.round(value * 4) / 4;
  const feet = Math.floor(rounded / 12);
  let inches = rounded - feet * 12;
  let fraction = "";
  const quarter = Math.round((inches - Math.floor(inches)) * 4);
  inches = Math.floor(inches);
  if (quarter === 1) fraction = "¼";
  else if (quarter === 2) fraction = "½";
  else if (quarter === 3) fraction = "¾";
  if (feet === 0 && inches === 0 && !fraction) return "0";
  const parts = [];
  if (feet) parts.push(`${feet}′`);
  if (inches || fraction) parts.push(`${inches}${fraction}″`);
  return parts.join(" ");
}

function formatPointRecord(xIn, yIn) {
  return {
    xIn,
    yIn,
    label: `${formatFeetInches(xIn)} right, ${formatFeetInches(yIn)} down`,
  };
}

function updateCursorReadout() {
  if (!controls.cursorReadout) return;
  if (!state.hoverPoint) {
    controls.cursorReadout.textContent = "Cursor: —";
    return;
  }
  const { x, y } = state.hoverPoint;
  controls.cursorReadout.textContent = `Cursor: ${formatFeetInches(x)} right, ${formatFeetInches(y)} down`;
}

function updatePointList() {
  if (!controls.pointsList) return;
  controls.pointsList.innerHTML = "";
  state.recordedPoints.forEach((point, index) => {
    const li = document.createElement("li");
    li.textContent = point.label;
    li.dataset.index = String(index);
    controls.pointsList.appendChild(li);
  });
}
