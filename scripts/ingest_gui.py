#!/usr/bin/env python3
# GUI wrapper for scripts/file_ingest.py (hybrid auto-ingest with guardrails)

import os
import sys
import json
import queue
import threading
import subprocess
from pathlib import Path
from tkinter import Tk, StringVar, N, S, E, W, END, DISABLED, NORMAL, Text, messagebox
from tkinter import ttk

ROOT = Path.home() / "code" / "drone-ingestor"
SCRIPT = ROOT / "scripts" / "file_ingest.py"
PYTHON = "/opt/homebrew/bin/python3"  # Preferred Python for GUI on macOS


class IngestGUI:
    def __init__(self, master: Tk):
        self.master = master
        master.title("Drone Ingestor - Hybrid (GUI)")
        master.geometry("900x600")

        self.project_name = StringVar(value="Ingest")
        self.status = StringVar(value="Idle.")
        self.progress_var = StringVar(value="0 / 0")
        self.total_files = 0
        self.done_files = 0

        self.proc = None
        self.reader_thread = None
        self.queue = queue.Queue()

        # Frame
        frm = ttk.Frame(master, padding=12)
        frm.grid(row=0, column=0, sticky=(N, S, E, W))  # type: ignore
        master.columnconfigure(0, weight=1)
        master.rowconfigure(0, weight=1)

        # Project name
        ttk.Label(frm, text="Project name:").grid(row=0, column=0, sticky=W, padx=(0, 8))  # type: ignore
        self.ent_project = ttk.Entry(frm, textvariable=self.project_name, width=40)
        self.ent_project.grid(row=0, column=1, sticky=W)  # type: ignore

        # Buttons
        self.btn_detect = ttk.Button(frm, text="Detect Cards", command=self.detect_cards)
        self.btn_detect.grid(row=0, column=2, padx=8)  # type: ignore

        self.btn_start = ttk.Button(frm, text="Start Ingest", command=self.start_ingest)
        self.btn_start.grid(row=0, column=3, padx=8)  # type: ignore

        self.btn_stop = ttk.Button(frm, text="Stop", command=self.stop_ingest, state=DISABLED)
        self.btn_stop.grid(row=0, column=4, padx=8)  # type: ignore

        # Progress bar
        self.pb = ttk.Progressbar(frm, mode="determinate", maximum=100, length=400)
        self.pb.grid(row=1, column=0, columnspan=3, pady=(10, 6), sticky=W)  # type: ignore
        self.lbl_prog = ttk.Label(frm, textvariable=self.progress_var)
        self.lbl_prog.grid(row=1, column=3, columnspan=2, sticky=W)  # type: ignore

        # Status
        ttk.Label(frm, text="Status:").grid(row=2, column=0, sticky=W, pady=(6, 0))  # type: ignore
        self.lbl_status = ttk.Label(frm, textvariable=self.status)
        self.lbl_status.grid(row=2, column=1, columnspan=4, sticky=W, pady=(6, 0))  # type: ignore

        # Log text
        self.txt = Text(frm, height=24, wrap="word")
        self.txt.grid(row=3, column=0, columnspan=5, sticky=(N, S, E, W), pady=(10, 0))  # type: ignore
        self.txt.configure(state=DISABLED)

        scroll = ttk.Scrollbar(frm, command=self.txt.yview)
        scroll.grid(row=3, column=5, sticky=(N, S))  # type: ignore
        self.txt["yscrollcommand"] = scroll.set

        frm.columnconfigure(1, weight=1)
        frm.rowconfigure(3, weight=1)

        self.master.after(100, self._drain_queue)

        # ✅ Auto-detect cards on startup
        self.master.after(500, self.detect_cards)

    # --- Log/status
    def _append_log(self, line: str):
        self.txt.configure(state=NORMAL)
        self.txt.insert(END, line + "\n")
        self.txt.see(END)
        self.txt.configure(state=DISABLED)

    def _set_status(self, s: str):
        self.status.set(s)

    def _enable_controls(self, running: bool):
        if running:
            self.btn_start.config(state=DISABLED)
            self.btn_detect.config(state=DISABLED)
            self.btn_stop.config(state=NORMAL)
            self.ent_project.config(state=DISABLED)
        else:
            self.btn_start.config(state=NORMAL)
            self.btn_detect.config(state=NORMAL)
            self.btn_stop.config(state=DISABLED)
            self.ent_project.config(state=NORMAL)

    # --- Detect
    def detect_cards(self):
        if not SCRIPT.exists():
            messagebox.showerror("Error", f"Script not found:\n{SCRIPT}")
            return
        self._set_status("Detecting cards…")
        self._append_log(f"$ {PYTHON} {SCRIPT} --test")
        try:
            out = subprocess.check_output(
                [PYTHON, str(SCRIPT), "--test"], stderr=subprocess.STDOUT, text=True
            )
            self._append_log(out.strip())
            try:
                data = json.loads(out)
                cards = data.get("cards", [])
                self._set_status(f"Detected {len(cards)} card(s).")
            except Exception:
                self._set_status("Detection complete.")
        except subprocess.CalledProcessError as e:
            self._append_log(e.output.strip())
            self._set_status("Detection failed.")

    # --- Ingest
    def start_ingest(self):
        if not SCRIPT.exists():
            messagebox.showerror("Error", f"Script not found:\n{SCRIPT}")
            return
        proj = (self.project_name.get() or "Ingest").strip()
        cmd = [PYTHON, str(SCRIPT), "--project-name", proj]
        self._append_log(f"$ {' '.join(cmd)}")
        self._set_status("Ingest running…")
        self.total_files = 0
        self.done_files = 0
        self.pb["value"] = 0
        self.progress_var.set("0 / 0")

        self._enable_controls(True)

        def _run():
            try:
                self.proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
                proc = self.proc
                stdout = proc.stdout
                if stdout is None:
                    self.queue.put(("error", "Subprocess stdout is None; cannot stream output."))
                    code = proc.wait()
                    self.queue.put(("exit", code))
                    return
                for raw in stdout:
                    line = raw.rstrip("\n")
                    self.queue.put(("log", line))
                    if line.startswith("[INFO] Copied ") and " of " in line:
                        try:
                            seg = line.replace("[INFO] Copied ", "")
                            x_str, y_part = seg.split(" of ", 1)
                            x = int(x_str.strip())
                            y = int(y_part.strip().split()[0])
                            self.queue.put(("progress", (x, y)))
                        except Exception:
                            pass
                    elif line.startswith("[DONE]"):
                        self.queue.put(("done", line))
                code = proc.wait()
                self.queue.put(("exit", code))
            except Exception as ex:
                self.queue.put(("error", str(ex)))

        self.reader_thread = threading.Thread(target=_run, daemon=True)
        self.reader_thread.start()

    def stop_ingest(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            self._append_log("[INFO] Terminated by user.")
            self._set_status("Stopped by user.")
        self._enable_controls(False)

    # --- Drain queue
    def _drain_queue(self):
        try:
            while True:
                item = self.queue.get_nowait()
                if not item:
                    break
                kind, payload = item
                if kind == "log":
                    self._append_log(str(payload))
                elif kind == "progress":
                    try:
                        x, y = payload
                        x = int(x)
                        y = int(y)
                    except Exception:
                        x, y = 0, 0
                    self.done_files = x
                    self.total_files = max(self.total_files, y)
                    pct = int((self.done_files / self.total_files) * 100) if self.total_files > 0 else 0
                    self.pb["value"] = pct
                    self.progress_var.set(f"{self.done_files} / {self.total_files}")
                elif kind == "done":
                    self._append_log(str(payload))
                    self._set_status("Done.")
                elif kind == "exit":
                    code = int(payload) if payload is not None else 1
                    if code == 0:
                        self._set_status("Ingest finished successfully.")
                    else:
                        self._set_status(f"Ingest exited with code {code}.")
                    self._enable_controls(False)
                elif kind == "error":
                    self._append_log(f"[ERROR] {payload}")
                    self._set_status("Error (see log).")
                    self._enable_controls(False)
        except queue.Empty:
            pass
        self.master.after(100, self._drain_queue)


def check_env():
    print(f"Python executable: {sys.executable}")
    # tkinter availability
    try:
        import tkinter  # noqa: F401
        from tkinter import Tcl
        v = Tcl().eval('info patchlevel')
        print(f"tkinter: available (Tcl/Tk {v})")
    except Exception as e:
        print(f"tkinter: ERROR: {e}")
    # ingest script presence
    exists = SCRIPT.exists()
    print(f"Ingest script: {SCRIPT} -> {'OK' if exists else 'MISSING'}")
    # subprocess python for ingest
    py_ok = Path(PYTHON).exists()
    print(f"Subprocess Python (for ingest): {PYTHON} -> {'FOUND' if py_ok else 'NOT FOUND'}")
    if sys.executable.startswith('/usr/bin/python3'):
        print("Note: Running under system Python. If GUI issues occur, use Homebrew Python.")
    return 0 if exists else 1


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Drone Ingestor GUI")
    parser.add_argument("--check", action="store_true", help="Run environment checks and exit")
    args = parser.parse_args()

    if args.check:
        raise SystemExit(check_env())

    # Guardrail: advise against system Python Tk on macOS for GUI runtime (soft warning)
    if sys.executable.startswith("/usr/bin/python3"):
        try:
            root = Tk()
            root.withdraw()
            messagebox.showwarning(
                "Interpreter Warning",
                "System Python Tk may be unstable on macOS.\n\n"
                "Recommended:\n/opt/homebrew/bin/python3 scripts/ingest_gui.py\n\n"
                "Continuing anyway..."
            )
            root.destroy()
        except Exception:
            print("Warning: System Python Tk may be unstable on macOS. Continuing...")

    if not ROOT.exists():
        messagebox.showerror("Error", f"Workspace not found:\n{ROOT}")
        return
    if not SCRIPT.exists():
        messagebox.showerror("Error", f"Ingest script not found:\n{SCRIPT}")
        return
    app = Tk()
    IngestGUI(app)
    app.mainloop()


if __name__ == "__main__":
    main()