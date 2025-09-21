# Guard-Railed Workflow

This document establishes mandatory guardrails for all development work in the `~/code/drone-ingestor/` project.
It is adapted from the **Deep Thinking Protocol** and refined to ensure consistency, quality, and trust.

====

## 1. Environment Consistency
- **Interpreter:** Always use `/usr/bin/python3` until explicitly changed.
- **Project Root:** Always work inside `~/code/drone-ingestor/`.
- **Command Rule:** Every command must match the actual working directory (`pwd`).
- **Editor:** VS Code recommended (any editor is fine).
- **System:** macOS + zsh assumed.

====

## 2. File Creation & Placement
- **Complete Artifacts:** All files must be generated as **complete, runnable, saved artifacts**.
- **Designated Folders:** Place files only in project subdirectories (`scripts/`, `logs/`, `output/`, `config/`).
- **No Ad-hoc Paths:** No scratch/hidden temp use without agreement.

**Canonical layout:**
~/code/drone-ingestor/
├─ config/
├─ input/
│  ├─ DRONE_SD/
│  ├─ GOGGLES3/
│  └─ RC2/
├─ logs/
├─ output/
└─ scripts/

====

## 3. Code Execution
- **Single Run Command:** Provide one **exact** command per task.
- **Execution Root:** Assume `~/code/drone-ingestor/`.
- **Absolute Paths:** Use only if outside this directory.

**Examples:** `/usr/bin/python3 scripts/file_ingest.py --test`  
`/usr/bin/python3 scripts/file_ingest.py --project-name "TestDroneIngest"`

====

## 4. Guardrails & Verification
- **STOP Protocol:** If the user types STOP, immediately halt, acknowledge in one line, and await resume.
- **Pre-flight on every command:**
  - Path exists.
  - Required tool installed.
  - `pwd` is correct.

====

## 5. Tooling
- Prefer the provided `Makefile` targets for common operations.
- `.vscode/tasks.json` mirrors those commands for GUI-driven workflows.
- Custom automation scripts belong under `scripts/`.

====

## 6. Error Handling
- **No cards:** Print “No recognizable DJI cards detected.” and list `/Volumes/*`.
- **No staged input:** Print “No staged files under input/.” and suggest exact `cp/rsync`.
- **Auth errors:** Document the message, avoid asking for secrets, and escalate to the operator.

====

## 7. Ingestor Behavior
- **Auto-detect under `/Volumes/*`:**
  - **DRONE_SD:** `DCIM/DJI_*`, `PANORAMA`, `HYPERLAPSE`
  - **GOGGLES3:** `MISC/dji_info*.db`, `DCIM/100MEDIA`
  - **RC2:** `Android/`, `DCIM/`, `MISC/`, `DJI_*`
- **Hybrid ingest:** Copy media + metadata (`.SRT`, `.LRF`, `.LRV`, `FC*.db`) preserving structure.
- **Progress cadence:** Every 10 files or 10s → `[INFO] Copied N of M files`.

====

## 8. Logging & Session Records
- **Console log** mirrored to `logs/ingest.log`.
- **Run manifest** at `output/<timestamp>_<project>/manifest.json`.
- **Resolve CSV**: `resolve_manifest.csv` summarises clips for DaVinci Resolve.
- **Checksums**: `checksums.txt` (sha256) for copied files.
- **Idempotent:** Safe to rerun; skip by size+hash.

====

## 9. Standard Commands
`make detect` → dry-run card detection  
`make ingest PROJECT=MyProject` → full ingest  
`make gui` → launch legacy Tk GUI ingestor  
`make gui_qt` → launch PySide6 GUI ingestor (choose project + destination)  
`make logs` → tail `logs/ingest.log`

====

## 10. Collaboration Etiquette
- Do **not** re-issue completed steps.
- **State echo:** Start each turn with a one-line context summary.
- **No secrets** in repo outputs.
- Provide **one exact command** per action.

====

## 11. Release Hygiene
- **Branches:** `feat/*`, `fix/*`.
- **Commits:** Imperative, e.g., `fix(ingest): improve DRONE_SD detection`.
- **Never commit:** secrets or `/output/` artifacts.

====

## 12. Quick Session Checklist
- [ ] `pwd` → `~/code/drone-ingestor/`
- [ ] `/usr/bin/python3 --version` reports the expected interpreter
- [ ] `logs/` and `output/` directories exist (create if missing)
- [ ] `make detect` lists cards or says none found
- [ ] `make ingest PROJECT=TestIngest` shows progress + writes manifest

====

## 13. Known Gotchas
- **tkinter missing:** Install Homebrew Python (`brew install python-tk`) for GUI runs.
- **Blank GUI:** Run `scripts/ingest_gui.py` directly; verify Tk.
- **Copy stalls:** Use `iostat 2`; safe to Ctrl-C and rerun.
