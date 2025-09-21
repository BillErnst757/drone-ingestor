#!/usr/bin/env python3
"""Qt-based GUI wrapper for scripts/file_ingest.py.

This port preserves the existing workflow while using PySide6 for a
more modern, stable interface on Apple Silicon Macs.
"""

import argparse
import json
import sys
import subprocess
from pathlib import Path

from PySide6.QtCore import QProcess, Qt, QTimer
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QProgressBar,
    QPlainTextEdit,
    QWidget,
    QGridLayout,
)
from typing import Optional, List

ROOT = Path.home() / "code" / "drone-ingestor"
SCRIPT = ROOT / "scripts" / "file_ingest.py"
HOMEBREW_PY = Path("/opt/homebrew/bin/python3")
SYSTEM_PY = Path("/usr/bin/python3")


def default_python() -> str:
    """Pick the preferred Python interpreter for spawning ingest."""
    if HOMEBREW_PY.exists():
        return str(HOMEBREW_PY)
    return str(SYSTEM_PY)


class IngestWindow(QMainWindow):
    def __init__(self, python_exe: str):
        super().__init__()

        self.python_exe = python_exe
        self.process: Optional[QProcess] = None
        self.total_files = 0
        self.done_files = 0

        self.setWindowTitle("Drone Ingestor - Qt")
        self.resize(900, 600)

        central = QWidget(self)
        layout = QGridLayout(central)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        name_label = QLabel("Project name:")
        self.project_edit = QLineEdit()
        self.project_edit.setPlaceholderText("Ingest")
        layout.addWidget(name_label, 0, 0)
        layout.addWidget(self.project_edit, 0, 1, 1, 2)

        self.detect_button = QPushButton("Detect Cards")
        self.detect_button.clicked.connect(self.detect_cards)
        layout.addWidget(self.detect_button, 0, 3)

        self.start_button = QPushButton("Start Ingest")
        self.start_button.clicked.connect(self.start_ingest)
        layout.addWidget(self.start_button, 0, 4)

        self.stop_button = QPushButton("Stop")
        self.stop_button.setEnabled(False)
        self.stop_button.clicked.connect(self.stop_ingest)
        layout.addWidget(self.stop_button, 0, 5)

        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        layout.addWidget(self.progress_bar, 1, 0, 1, 4)

        self.progress_label = QLabel("0 / 0")
        layout.addWidget(self.progress_label, 1, 4, 1, 2)

        status_title = QLabel("Status:")
        layout.addWidget(status_title, 2, 0)
        self.status_label = QLabel("Idle.")
        layout.addWidget(self.status_label, 2, 1, 1, 5)

        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        layout.addWidget(self.log_view, 3, 0, 1, 6)

        layout.setRowStretch(3, 1)
        layout.setColumnStretch(1, 1)

        self.setCentralWidget(central)

        QTimer.singleShot(800, self.detect_cards)

    # --- helpers -----------------------------------------------------
    def append_log(self, text: str):
        self.log_view.appendPlainText(text)
        self.log_view.ensureCursorVisible()

    def set_status(self, text: str):
        self.status_label.setText(text)

    def set_running(self, running: bool):
        self.start_button.setEnabled(not running)
        self.detect_button.setEnabled(not running)
        self.stop_button.setEnabled(running)
        self.project_edit.setEnabled(not running)

    def current_project(self) -> str:
        text = self.project_edit.text().strip()
        return text or "Ingest"

    # --- card detection ----------------------------------------------
    def detect_cards(self):
        if not SCRIPT.exists():
            QMessageBox.critical(self, "Missing Script", f"Cannot find ingest script:\n{SCRIPT}")
            return

        self.set_status("Detecting cards…")
        cmd = [self.python_exe, str(SCRIPT), "--test"]
        self.append_log("$ " + " ".join(cmd))
        try:
            result = subprocess.run(
                cmd,
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Detection Error", str(exc))
            self.set_status("Detection failed.")
            return

        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        for line in output.strip().splitlines():
            self.append_log(line)
        if result.returncode == 0:
            try:
                data = json.loads(result.stdout)
                cards = data.get("cards", [])
                self.set_status(f"Detected {len(cards)} card(s).")
            except Exception:
                self.set_status("Detection complete.")
        else:
            self.set_status(f"Detection exit {result.returncode}")

    # --- ingest ------------------------------------------------------
    def start_ingest(self):
        if self.process and self.process.state() != QProcess.NotRunning:
            QMessageBox.warning(self, "Already running", "An ingest task is in progress.")
            return

        if not SCRIPT.exists():
            QMessageBox.critical(self, "Missing Script", f"Cannot find ingest script:\n{SCRIPT}")
            return

        cmd = [self.python_exe, str(SCRIPT), "--project-name", self.current_project()]
        self.append_log("$ " + " ".join(cmd))
        self.set_status("Ingest running…")
        self.progress_bar.setValue(0)
        self.progress_label.setText("0 / 0")
        self.total_files = 0
        self.done_files = 0

        self.process = QProcess(self)
        self.process.setProgram(self.python_exe)
        self.process.setArguments([str(SCRIPT), "--project-name", self.current_project()])
        self.process.setWorkingDirectory(str(ROOT))
        self.process.setProcessChannelMode(QProcess.MergedChannels)
        self.process.readyReadStandardOutput.connect(self._read_output)
        self.process.finished.connect(self._finished)
        self.process.errorOccurred.connect(self._error)

        self.process.start()
        self.set_running(True)
        if not self.process.waitForStarted(3000):
            self.append_log("[ERROR] Failed to start ingest process.")
            self.set_status("Failed to launch ingest.")
            self.set_running(False)

    def stop_ingest(self):
        if not self.process or self.process.state() == QProcess.NotRunning:
            return
        self.append_log("[INFO] Terminating ingest…")
        self.process.terminate()
        if not self.process.waitForFinished(2000):
            self.append_log("[WARN] Force killing ingest process.")
            self.process.kill()
            self.process.waitForFinished(2000)
        self.set_status("Stopped by user.")
        self.set_running(False)
        self.process = None

    # --- qprocess handlers ------------------------------------------
    def _read_output(self):
        if not self.process:
            return
        data = bytes(self.process.readAllStandardOutput()).decode("utf-8", errors="replace")
        for raw_line in data.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            self.append_log(line)
            if line.startswith("[INFO] Copied") and " of " in line:
                try:
                    seg = line.replace("[INFO] Copied", "").strip()
                    done_str, rest = seg.split(" of ", 1)
                    total_str = rest.split()[0]
                    self.done_files = int(done_str)
                    self.total_files = max(self.total_files, int(total_str))
                    pct = int((self.done_files / self.total_files) * 100) if self.total_files else 0
                    self.progress_bar.setValue(pct)
                    self.progress_label.setText(f"{self.done_files} / {self.total_files}")
                except Exception:
                    pass
            elif line.startswith("[DONE]"):
                self.set_status("Ingest complete.")

    def _finished(self, code: int, status):  # status is QProcess.ExitStatus
        self.set_running(False)
        self.process = None
        if code == 0:
            self.set_status("Ingest finished successfully.")
        else:
            self.set_status(f"Ingest exited with code {code}.")

    def _error(self, error):  # error is QProcess.ProcessError
        self.append_log(f"[ERROR] Process error: {error}")
        self.set_status("Process error (see log).")
        self.set_running(False)
        self.process = None


def run_check(python_exe: str) -> int:
    print(f"Python executable: {python_exe}")
    hb = "yes" if HOMEBREW_PY.exists() else "no"
    print(f"Homebrew python available: {hb}")
    print(f"Ingest script present: {SCRIPT.exists()}")
    try:
        import PySide6  # noqa: F401
        print("PySide6: available")
    except Exception as exc:  # pragma: no cover - prints diagnostic
        print(f"PySide6: ERROR {exc}")
        return 1
    return 0 if SCRIPT.exists() else 1


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Drone Ingestor GUI (PySide6)")
    parser.add_argument("--check", action="store_true", help="Run environment diagnostics and exit")
    parser.add_argument("--python", help="Override python interpreter for subprocess")
    args = parser.parse_args(argv)

    python_exe = args.python or default_python()

    if args.check:
        return run_check(python_exe)

    if not ROOT.exists():
        print(f"Workspace not found: {ROOT}")
        return 1

    app = QApplication(sys.argv)
    window = IngestWindow(python_exe)
    window.project_edit.setText("Ingest")
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
