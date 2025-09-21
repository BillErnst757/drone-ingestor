# Drone Ingestor Project

This project provides tools for ingesting media and metadata from DJI drone SD cards, goggles, and controllers into a structured archive.  
It is built with strict guardrails to ensure reliability, reproducibility, and STOP-compliance.

---

## Features
- Automatic detection of DJI card types (DRONE_SD, GOGGLES3, RC2).
- Hybrid ingest: media + metadata (`.SRT`, `.LRF`, `.LRV`, `FC*.db`).
- Progress logging every 10 files or 10 seconds.
- Manifest output with checksums for reproducibility.
- GUI and CLI ingest options.

---

## Requirements
- macOS with zsh shell
- `/usr/bin/python3`
- VS Code (recommended)

---

# Operations Guide

Follow these guardrails and workflows to keep ingest runs reproducible.

---

## 1. Guardrails (see WORKFLOW.md for full detail)
- **STOP Protocol:** If user types STOP → acknowledge, halt, and wait.  
- **Environment:** Work only inside `~/code/drone-ingestor/` with `/usr/bin/python3`.  
- **Validation:** Always confirm `pwd`, paths, and tool availability before proposing commands.  
- **Etiquette:** No secrets, no duplicate steps, one exact command per action.

---

## 2. Entry Points
- **Makefile** (canonical commands):
  - `make detect` → dry-run card detection
  - `make ingest PROJECT=Name` → full ingest
  - `make gui` → launch GUI ingest
  - `make logs` → tail logs

- **.vscode/tasks.json** (GUI mirror of Makefile).

---

## 3. Configuration Discipline
- Runtime defaults live in `config/ingest.json`.
- Update ingest settings (input roots, destination, extensions) there before running.
- Keep secrets and API keys out of the repository.

---

## 4. Logging & Outputs
- Logs: `logs/ingest.log`  
- Run outputs: `output/<timestamp>_<Project>/`  
- Manifests: `manifest.json` + `checksums.txt` (sha256)  

---

## 5. Development & Release
- Branches: `feat/*`, `fix/*`  
- Commits: imperative style, e.g. `fix(ingest): improve DRONE_SD detection`  
- Do not commit: API keys or `/output/` artifacts

---

**Quick reminder:**  
- Reference `WORKFLOW.md` for the full guardrails.  
- Use the `Makefile` or `.vscode/tasks.json` to drive ingest runs.  
- Hold to the STOP protocol, directory consistency, and validation steps.  
- Never drift. Never guess. Always validate.