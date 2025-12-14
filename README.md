# Repository Overview

This repository now serves two purposes:

1. Preserve the original intent of the **Drone Ingestor** concept.
2. Host the active **Rope Letter Planner** project that lives in `rope-letter-planner/`.

All legacy ingest code and tooling have been removed to keep the workspace lean while still documenting what the drone project set out to accomplish.

---

## Drone Ingestor (Archived Intent Only)

The ingest idea focused on safely copying DJI drone, goggles, and controller media into a reproducible archive. The high-level requirements we are keeping for reference:

- Detect card types (DRONE_SD, GOGGLES3, RC2) automatically.
- Copy media *and* metadata (`.SRT`, `.LRF`, `.LRV`, `FC*.db`) while logging progress.
- Produce manifests and checksums suitable for DaVinci Resolve workflows.
- Offer either a GUI or CLI entry point with strict STOP/validation guardrails.

If the ingest effort is revived in the future, these bullets describe the scope without dragging along the old implementation.

---

## Rope Letter Planner

The active project now is a lightweight app for planning rope letters (see `rope-letter-planner/`). To work on it:

1. Open the folder in VS Code (`File → Open Folder… → rope-letter-planner`).
2. Use a simple static-server or the VS Code Live Preview extension to view `index.html`.
3. Update `app.js`, `styles.css`, or assets as needed; changes sync automatically if the folder lives in Google Drive or another synced location.

`rope-letter-planner/` is self-contained (HTML/JS/CSS). No build tooling is required.

---

## Next Steps

- If you need Drive syncing, open the Google Drive-backed folder directly in VS Code.
- Should the Drone Ingestor effort restart, reintroduce code under a new subdirectory while keeping this README as the intent document.
