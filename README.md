# Drone Ingestor

This repository is back to being a clean home for the **Drone Ingestor** project. The rope planner app was moved out to its own folder.

## Intent (high-level)

The ingest idea focuses on safely copying DJI drone, goggles, and controller media into a reproducible archive:

- Detect card types (DRONE_SD, GOGGLES3, RC2) automatically.
- Copy media and metadata (`.SRT`, `.LRF`, `.LRV`, `FC*.db`) while logging progress.
- Produce manifests and checksums suitable for DaVinci Resolve workflows.
- Offer either a GUI or CLI entry point with strict STOP/validation guardrails.

## Project layout

```
config/        Project configuration and settings
data/
  raw/         Source media dumps (ignored by git)
  processed/   Cleaned/organized outputs (ignored by git)
  reference/   Small reference files you want to keep
docs/          Notes, docs, and specs
logs/          Run logs (ignored by git)
notebooks/     Jupyter notebooks and experiments
output/        Generated artifacts (ignored by git)
scripts/       CLI tools and helpers
tmp/           Scratch space (ignored by git)
```

## Next Steps

- Add ingest scripts under `scripts/` as you revive the project.
- Use `docs/` for workflows and checklists.
