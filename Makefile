PY := /usr/bin/python3

.PHONY: detect ingest gui gui_qt logs clean verify

detect:
	$(PY) scripts/file_ingest.py --test

ingest:
	@[ -n "$$PROJECT" ] || (echo "[ABORT] Set PROJECT=<name>"; exit 1)
	$(PY) scripts/file_ingest.py --project-name "$$PROJECT" --dest "$$DEST"

gui:
	$(PY) scripts/ingest_gui_qt.py

gui_qt: gui

logs:
	tail -n 200 -f logs/ingest.log

verify:
	$(PY) scripts/access_test.py || true

clean:
	rm -rf output/* logs/* || true
