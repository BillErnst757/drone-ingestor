#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    log_file = project_root / "logs" / "access_test.log"

    msg = f"[{datetime.now().isoformat(timespec='seconds')}] Workspace access test: OK\n"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(msg)

    print("Workspace access test: OK")
    print(f"Wrote log: {log_file.relative_to(project_root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
