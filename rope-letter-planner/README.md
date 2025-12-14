# Rope Letter Planner

Interactive planning tool for laying out DIN 1451 letterforms on a 6 ft × 8 ft wire grid, routing rope light paths, and estimating lit/blackout lengths.

## Features
- Canvas visualisation of the 6×8 ft grid with configurable 2″/4″ wire spacing and foot markers.
- Upload any DIN 1451 compatible `.ttf`/`.otf` font and type the message to plan.
- Scale a single letter to a target percentage of the usable area (defaults to 80% height).
- Zoom & pan viewport for close-up inspection of tie points.
- Automatically sequences a CNC-style toolpath: outer contours first, then inner counters, inserting blackout jumpers.
- Estimates per-letter lit lengths, blackout travel, and total rope length.
- Highlights blackout runs on the canvas and exposes a JSON export of the routing plan.
- Auto-generates zip-tie markers every foot on straight runs and at wire intersections for curves.
- Fine-adjustment nudges (hold `Shift`) and a panel-boundary toggle help with final alignment tweaks; horizontal/vertical strokes can be grid-fit using the snap tolerance control.
- Fine-adjustment nudges (hold `Shift`), manual snap toggle, and click-to-capture grid points for field measurements.

## Usage
1. Open `index.html` in a modern browser (Chrome, Edge, or Firefox recommended).
2. Click **Upload font** (or drag a DIN 1451 font onto the drop zone) and choose a DIN 1451 Mittelschrift (or compatible) font file.
3. Enter a single letter, then adjust scale and grid spacing (default 2″ × 4″ wires) as needed. Use the **Keep letter within panel** toggle if you need to push geometry slightly outside the frame.
4. Use the zoom (+/− or `Ctrl` + mouse wheel) and drag-to-pan controls to inspect tie points along the grid. Click any wire intersection to log its coordinates; use **Clear points** when you want to start fresh.
5. Review the canvas for letter placement, blackout crossover routing, and entry point.
6. Use the **Snap to grid** button after manual nudging (if needed), then **Export JSON** to capture the routing breakdown for fabrication.

## Notes & Next Steps
- **Font licensing:** Some DIN variants are commercial. Keep the font file outside version control and ensure you have the rights to use it.
- **Routing heuristics:** The blackout connectors currently take simple L-shaped paths. Future work could snap those to the wire grid, avoid overlaps, or add manual editing.
- **Return-to-entry:** If a closed loop back to the top power entry is required, add a final blackout connector in `buildRouting`.
- **Multi-colour rope:** Extend the plan data to support multiple rope channels or colour passes by tagging segments.
- **Print layouts:** Add an export-to-PDF/SVG option that renders the grid at scale for shop-floor templates.
- **Snap tolerance:** Adjust the snap tolerance input to control how aggressively horizontal/vertical runs align to the grid; set to zero to keep the original DIN proportions.
