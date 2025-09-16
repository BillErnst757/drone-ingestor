PY := /usr/bin/python3

.PHONY: detect ingest gui gui_hb logs clean verify

detect:
	$(PY) scripts/file_ingest.py --test

ingest:
	@[ -n "$$PROJECT" ] || (echo "[ABORT] Set PROJECT=<name>"; exit 1)
	$(PY) scripts/file_ingest.py --project-name "$$PROJECT" --dest "$$DEST"

gui:
	$(PY) scripts/ingest_gui.py

gui_hb:
	/opt/homebrew/bin/python3 scripts/ingest_gui.py

logs:
	tail -n 200 -f logs/ingest.log

verify:
	$(PY) -m pip show openai httpx || true
	$(PY) scripts/check_continue.py || true

clean:
	rm -rf output/* logs/* || true