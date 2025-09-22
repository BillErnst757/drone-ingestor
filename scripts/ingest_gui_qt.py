#!/usr/bin/env python3
"""Qt-based GUI wrapper for scripts/file_ingest.py with Resolve-centric workflow."""

from __future__ import annotations

import argparse
import json
import sys
import subprocess
from pathlib import Path
from typing import Optional, List

from PySide6.QtCore import QProcess, QTimer, Qt, QProcessEnvironment
from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QCheckBox,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QProgressBar,
    QPlainTextEdit,
    QRadioButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
    QFileDialog,
    QHeaderView,
)

ROOT = Path.home() / "code" / "drone-ingestor"
SCRIPT = ROOT / "scripts" / "file_ingest.py"
HOMEBREW_PY = Path("/opt/homebrew/bin/python3")
SYSTEM_PY = Path("/usr/bin/python3")
MEDIA_EXT = {".jpg", ".jpeg", ".dng", ".mp4", ".mov", ".lrf"}


def default_python() -> str:
    if HOMEBREW_PY.exists():
        return str(HOMEBREW_PY)
    return str(SYSTEM_PY)


def classify_sample(path_str: str) -> str:
    ext = Path(path_str).suffix.lower()
    if ext in MEDIA_EXT:
        return "Media"
    if ext in {".srt", ".bin", ".dat", ".txt"}:
        return "Telemetry"
    return "Misc"


class IngestWindow(QMainWindow):
    def __init__(self, python_exe: str):
        super().__init__()
        self.python_exe = python_exe
        self.process: Optional[QProcess] = None
        self.user_stopped = False
        self.total_files = 0
        self.done_files = 0
        self.detect_results: list[dict] = []
        self.last_run_dir: Optional[Path] = None

        self.setWindowTitle("SkyVault Ingest – Resolve Layout")
        self.resize(1100, 720)

        central = QWidget(self)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        self._build_configuration(main_layout)
        self._build_tabs(main_layout)
        self._build_controls(main_layout)
        self._build_log_console(main_layout)

        self.setCentralWidget(central)

        QTimer.singleShot(800, self.detect_cards)

    # ------------------------------------------------------------------
    def _build_configuration(self, parent_layout: QVBoxLayout):
        config_widget = QWidget()
        layout = QGridLayout(config_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setHorizontalSpacing(12)
        layout.setVerticalSpacing(6)

        layout.addWidget(QLabel("Project Name:"), 0, 0)
        self.project_edit = QLineEdit()
        self.project_edit.setPlaceholderText("Ingest")
        layout.addWidget(self.project_edit, 0, 1)

        layout.addWidget(QLabel("Destination:"), 0, 2)
        default_dest = str(ROOT / "output")
        self.dest_edit = QLineEdit(default_dest)
        self.dest_edit.setPlaceholderText(default_dest)
        layout.addWidget(self.dest_edit, 0, 3)
        self.browse_button = QPushButton("Browse…")
        self.browse_button.clicked.connect(self.choose_destination)
        layout.addWidget(self.browse_button, 0, 4)

        layout.addWidget(QLabel("Gap (min):"), 1, 0)
        self.gap_spin = QSpinBox()
        self.gap_spin.setRange(1, 120)
        self.gap_spin.setValue(10)
        layout.addWidget(self.gap_spin, 1, 1)

        layout.addWidget(QLabel("Mode:"), 1, 2)
        mode_container = QWidget()
        mode_layout = QHBoxLayout(mode_container)
        mode_layout.setContentsMargins(0, 0, 0, 0)
        mode_layout.setSpacing(12)
        self.copy_radio = QRadioButton("Copy")
        self.move_radio = QRadioButton("Move")
        self.copy_radio.setChecked(True)
        self.mode_group = QButtonGroup(self)
        self.mode_group.addButton(self.copy_radio)
        self.mode_group.addButton(self.move_radio)
        mode_layout.addWidget(self.copy_radio)
        mode_layout.addWidget(self.move_radio)
        layout.addWidget(mode_container, 1, 3)

        self.resolve_checkbox = QCheckBox("Resolve layout")
        self.resolve_checkbox.setChecked(True)
        self.resolve_checkbox.setEnabled(False)
        self.resolve_checkbox.setToolTip("Resolve layout is always enabled in this build.")
        layout.addWidget(self.resolve_checkbox, 2, 0, 1, 2)

        self.legacy_checkbox = QCheckBox("Legacy flights structure")
        self.legacy_checkbox.setEnabled(False)
        self.legacy_checkbox.setToolTip("Legacy layout toggle will be available in a future update.")
        layout.addWidget(self.legacy_checkbox, 2, 2, 1, 2)

        layout.setColumnStretch(1, 2)
        layout.setColumnStretch(3, 3)

        parent_layout.addWidget(config_widget)

    def _build_tabs(self, parent_layout: QVBoxLayout):
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)

        # Media Preview tab
        self.media_tab = QWidget()
        media_layout = QHBoxLayout(self.media_tab)
        media_layout.setContentsMargins(0, 0, 0, 0)
        media_layout.setSpacing(12)

        self.source_list = QListWidget()
        self.source_list.currentItemChanged.connect(self._source_selection_changed)
        self.source_list.setMinimumWidth(220)
        media_layout.addWidget(self.source_list, 1)

        right_container = QWidget()
        right_layout = QVBoxLayout(right_container)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(8)

        self.media_table = QTableWidget(0, 4)
        self.media_table.setHorizontalHeaderLabels(["Clip", "Device", "Type", "Mount"])
        self.media_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.media_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.media_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.media_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.media_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.media_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.media_table.itemSelectionChanged.connect(self._media_selection_changed)
        right_layout.addWidget(self.media_table, 3)

        self.preview_text = QPlainTextEdit()
        self.preview_text.setReadOnly(True)
        self.preview_text.setPlaceholderText("Select a clip to view metadata preview.")
        right_layout.addWidget(self.preview_text, 1)

        media_layout.addWidget(right_container, 3)
        self.tabs.addTab(self.media_tab, "Media Preview")

        # Run Summary tab
        self.summary_tab = QWidget()
        summary_layout = QVBoxLayout(self.summary_tab)
        summary_layout.setContentsMargins(0, 0, 0, 0)
        summary_layout.setSpacing(8)

        self.summary_text = QPlainTextEdit()
        self.summary_text.setReadOnly(True)
        self.summary_text.setPlaceholderText("Run details will appear here after ingest completes.")
        summary_layout.addWidget(self.summary_text, 1)

        self.artifact_bar = QHBoxLayout()
        self.artifact_bar.setContentsMargins(0, 0, 0, 0)
        self.artifact_bar.setSpacing(8)
        self.artifact_bar.addStretch(1)
        summary_layout.addLayout(self.artifact_bar)

        self.tabs.addTab(self.summary_tab, "Run Summary")

        parent_layout.addWidget(self.tabs, 1)

    def _build_controls(self, parent_layout: QVBoxLayout):
        button_row = QHBoxLayout()
        button_row.addStretch(1)
        self.detect_button = QPushButton("Detect Cards")
        self.detect_button.clicked.connect(self.detect_cards)
        button_row.addWidget(self.detect_button)

        self.start_button = QPushButton("Start Ingest")
        self.start_button.clicked.connect(self.start_ingest)
        button_row.addWidget(self.start_button)

        self.stop_button = QPushButton("Stop")
        self.stop_button.setEnabled(False)
        self.stop_button.clicked.connect(self.stop_ingest)
        button_row.addWidget(self.stop_button)
        button_row.addStretch(1)

        parent_layout.addLayout(button_row)

        progress_row = QHBoxLayout()
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        progress_row.addWidget(self.progress_bar, 1)
        self.progress_label = QLabel("0 / 0 files")
        progress_row.addWidget(self.progress_label)
        parent_layout.addLayout(progress_row)

        self.status_label = QLabel("Status: Idle.")
        parent_layout.addWidget(self.status_label)

    def _build_log_console(self, parent_layout: QVBoxLayout):
        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setPlaceholderText("Ingest log output will appear here…")
        parent_layout.addWidget(self.log_view, 1)

    # ------------------------------------------------------------------
    def append_log(self, text: str):
        self.log_view.appendPlainText(text)
        self.log_view.ensureCursorVisible()

    def set_status(self, text: str):
        self.status_label.setText(f"Status: {text}")

    def set_running(self, running: bool):
        for widget in (
            self.project_edit,
            self.dest_edit,
            self.browse_button,
            self.gap_spin,
            self.copy_radio,
            self.move_radio,
            self.detect_button,
        ):
            widget.setEnabled(not running)
        self.stop_button.setEnabled(running)

    def current_project(self) -> str:
        text = self.project_edit.text().strip()
        return text or "Ingest"

    def current_destination(self) -> str:
        text = self.dest_edit.text().strip()
        return text or str(ROOT / "output")

    # ------------------------------------------------------------------
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

        stdout = result.stdout or ""
        stderr = result.stderr or ""
        combined = (stdout + "\n" + stderr).strip()
        for line in combined.splitlines():
            self.append_log(line)

        if result.returncode == 0:
            try:
                data = json.loads(stdout)
                self.detect_results = data.get("cards", [])
                self.populate_sources()
                self.set_status(f"Detected {len(self.detect_results)} card(s).")
            except Exception:
                self.set_status("Detection complete (unparsed output).")
        else:
            self.set_status(f"Detection exit {result.returncode}")

    def populate_sources(self):
        self.source_list.clear()
        for card in self.detect_results:
            device = card.get("device", "Unknown")
            count = card.get("file_count", 0)
            mount = card.get("mount_point", "?")
            item = QListWidgetItem(f"{device} ({count} files)")
            item.setData(Qt.UserRole, card)
            item.setToolTip(mount)
            self.source_list.addItem(item)
        if self.source_list.count() > 0:
            self.source_list.setCurrentRow(0)
        else:
            self.media_table.setRowCount(0)
            self.preview_text.clear()

    def _source_selection_changed(self, current: QListWidgetItem, previous: QListWidgetItem):
        card = current.data(Qt.UserRole) if current else None
        self.populate_media_table(card)

    def populate_media_table(self, card: Optional[dict]):
        self.media_table.setRowCount(0)
        self.preview_text.clear()
        if not card:
            return
        samples = card.get("sample", []) or []
        self.media_table.setRowCount(len(samples))
        for row, rel_path in enumerate(samples):
            device = card.get("device", "?")
            mount = card.get("mount_point", "?")
            clip_item = QTableWidgetItem(rel_path)
            device_item = QTableWidgetItem(device)
            type_item = QTableWidgetItem(classify_sample(rel_path))
            mount_item = QTableWidgetItem(mount)
            for item in (clip_item, device_item, type_item, mount_item):
                item.setFlags(item.flags() ^ Qt.ItemIsEditable)
            self.media_table.setItem(row, 0, clip_item)
            self.media_table.setItem(row, 1, device_item)
            self.media_table.setItem(row, 2, type_item)
            self.media_table.setItem(row, 3, mount_item)
        if samples:
            self.media_table.selectRow(0)

    def _media_selection_changed(self):
        selected = self.media_table.selectedItems()
        if not selected:
            self.preview_text.clear()
            return
        clip = selected[0].text()
        device = selected[1].text() if len(selected) > 1 else "?"
        media_type = selected[2].text() if len(selected) > 2 else "?"
        mount = selected[3].text() if len(selected) > 3 else "?"
        preview = (
            f"Clip: {clip}\n"
            f"Device: {device}\n"
            f"Type: {media_type}\n"
            f"Mount Point: {mount}\n"
            "\nSample preview only. Full ingest will copy all clips and generate manifests."
        )
        self.preview_text.setPlainText(preview)

    # ------------------------------------------------------------------
    def start_ingest(self):
        if self.process and self.process.state() != QProcess.NotRunning:
            QMessageBox.warning(self, "Already running", "An ingest task is in progress.")
            return

        if not SCRIPT.exists():
            QMessageBox.critical(self, "Missing Script", f"Cannot find ingest script:\n{SCRIPT}")
            return

        project = self.current_project()
        dest = self.current_destination()
        gap = str(self.gap_spin.value())
        mode = "move" if self.move_radio.isChecked() else "copy"

        cmd = [
            self.python_exe,
            str(SCRIPT),
            "--project-name", project,
            "--dest", dest,
            "--gap", gap,
            "--mode", mode,
        ]
        self.append_log("$ " + " ".join(cmd))
        self.set_status("Ingest running…")
        self.progress_bar.setValue(0)
        self.progress_label.setText("0 / 0 files")
        self.total_files = 0
        self.done_files = 0
        self.summary_text.clear()

        self.process = QProcess(self)
        self.process.setProgram(self.python_exe)
        self.process.setArguments(cmd[1:])
        self.process.setWorkingDirectory(str(ROOT))
        env = QProcessEnvironment.systemEnvironment()
        env.insert("PYTHONUNBUFFERED", "1")
        self.process.setProcessEnvironment(env)
        self.process.setProcessChannelMode(QProcess.MergedChannels)
        self.process.readyReadStandardOutput.connect(self._read_output)
        self.process.finished.connect(self._finished)
        self.process.errorOccurred.connect(self._error)

        self.user_stopped = False
        self.process.start()
        self.set_running(True)
        if not self.process.waitForStarted(3000):
            self.append_log("[ERROR] Failed to start ingest process.")
            self.set_status("Failed to launch ingest.")
            self.set_running(False)

    def stop_ingest(self):
        if not self.process or self.process.state() == QProcess.NotRunning:
            return
        self.user_stopped = True
        self.append_log("[INFO] Terminating ingest…")
        self.process.terminate()
        if not self.process.waitForFinished(2000):
            self.append_log("[WARN] Force killing ingest process.")
            self.process.kill()
            self.process.waitForFinished(2000)
        self.set_status("Stopped by user.")
        self.set_running(False)
        self.process = None

    # ------------------------------------------------------------------
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
                    self.progress_label.setText(f"Copied {self.done_files} / {self.total_files} files")
                except Exception:
                    pass
            elif line.startswith("[DONE] Ingest complete: "):
                path_str = line.split(":", 1)[1].strip()
                self.last_run_dir = Path(path_str)
                self.populate_summary()
                self.tabs.setCurrentWidget(self.summary_tab)

    def _finished(self, code: int, status):
        self.set_running(False)
        stopped = self.user_stopped
        self.user_stopped = False
        self.process = None
        if code == 0 or stopped:
            self.set_status("Ingest finished successfully." if code == 0 else "Stopped by user.")
        else:
            self.set_status(f"Ingest exited with code {code}.")
            self.append_log(f"[WARN] Process exited with code {code}.")

    def _error(self, error):
        if self.user_stopped and error == QProcess.ProcessError.Crashed:
            self.append_log("[INFO] Process terminated after user request.")
            self.user_stopped = False
            return
        self.append_log(f"[ERROR] Process error: {error}")
        self.set_status("Process error (see log).")
        self.set_running(False)
        self.process = None

    # ------------------------------------------------------------------
    def populate_summary(self):
        self.clear_artifacts()
        run_dir = self.last_run_dir
        if not run_dir or not run_dir.exists():
            self.summary_text.setPlainText("Run directory not found.")
            return

        manifest_path = run_dir / "manifest.json"
        csv_path = run_dir / "resolve_manifest.csv"
        media_dir = run_dir / "media"
        proxy_dir = run_dir / "proxies"
        telemetry_dir = run_dir / "telemetry"
        misc_dir = run_dir / "misc"

        lines: list[str] = [f"Run directory: {run_dir}"]
        total_files = self.total_files
        media_count = 0
        proxy_count = 0
        telemetry_count = 0
        misc_count = 0

        if manifest_path.exists():
            try:
                data = json.loads(manifest_path.read_text())
                flights = data.get("flights", [])
                total_files = sum(len(f.get("files", [])) for f in flights)
                for flight in flights:
                    for record in flight.get("files", []):
                        bucket = record.get("bucket")
                        if bucket == "media":
                            media_count += 1
                        elif bucket == "proxies":
                            proxy_count += 1
                        elif bucket == "telemetry":
                            telemetry_count += 1
                        else:
                            misc_count += 1
                lines.append(f"Flights: {len(flights)} | Files: {total_files}")
                lines.append(
                    " • Media: {media}  • Proxies: {proxies}  • Telemetry: {telemetry}  • Misc: {misc}".format(
                        media=media_count,
                        proxies=proxy_count,
                        telemetry=telemetry_count,
                        misc=misc_count,
                    )
                )
            except Exception as exc:
                lines.append(f"Unable to parse manifest: {exc}")
        else:
            lines.append("manifest.json not found.")

        if csv_path.exists():
            lines.append(f"Resolve manifest CSV: {csv_path}")
        else:
            lines.append("resolve_manifest.csv not found.")

        lines.append("Media folder: " + (str(media_dir) if media_dir.exists() else "(missing)"))
        lines.append("Proxies folder: " + (str(proxy_dir) if proxy_dir.exists() else "(missing)"))
        self.summary_text.setPlainText("\n".join(lines))

        artifact_targets = []
        if media_dir.exists():
            artifact_targets.append(("Open Media Folder", media_dir))
        if proxy_dir.exists():
            artifact_targets.append(("Open Proxies", proxy_dir))
        if csv_path.exists():
            artifact_targets.append(("Open resolve_manifest.csv", csv_path))
        checksum_path = run_dir / "checksums.txt"
        if checksum_path.exists():
            artifact_targets.append(("Open checksums.txt", checksum_path))
        if manifest_path.exists():
            artifact_targets.append(("Open manifest.json", manifest_path))
        if telemetry_dir.exists():
            artifact_targets.append(("Open Telemetry", telemetry_dir))
        if misc_dir.exists():
            artifact_targets.append(("Open Misc", misc_dir))

        for label, path in artifact_targets:
            btn = QPushButton(label)
            btn.clicked.connect(lambda checked=False, p=path: self.open_path(p))
            self.artifact_bar.insertWidget(self.artifact_bar.count() - 1, btn)

    def clear_artifacts(self):
        while self.artifact_bar.count() > 1:
            item = self.artifact_bar.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

    def open_path(self, path: Path):
        if not path.exists():
            QMessageBox.warning(self, "Missing Path", f"Path not found:\n{path}")
            return
        try:
            subprocess.Popen(["open", str(path)])
        except Exception as exc:
            QMessageBox.warning(self, "Open Failed", f"Could not open {path}: {exc}")

    # ------------------------------------------------------------------
    def choose_destination(self):
        start_dir = self.dest_edit.text().strip() or str(ROOT)
        chosen = QFileDialog.getExistingDirectory(self, "Select Destination", start_dir)
        if chosen:
            self.dest_edit.setText(chosen)


def run_check(python_exe: str) -> int:
    print(f"Python executable: {python_exe}")
    hb = "yes" if HOMEBREW_PY.exists() else "no"
    print(f"Homebrew python available: {hb}")
    print(f"Ingest script present: {SCRIPT.exists()}")
    try:
        import PySide6  # noqa: F401
        print("PySide6: available")
    except Exception as exc:
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
