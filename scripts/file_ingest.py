#!/usr/bin/env python3
import os, sys, json, shutil, hashlib, time, csv
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path.home() / "code" / "drone-ingestor"
OUTPUT = ROOT / "output"
LOGS = ROOT / "logs"

SIGNATURES = {
    "DRONE_SD": ["DCIM", "MISC", "dji_info.db", "DJI_001_HOME", "PANORAMA", "HYPERLAPSE"],
    "GOGGLES3": ["goshare"],
    "RC2": ["Android", "Notifications", "Ringtones"]
}

MEDIA_EXT = {".jpg", ".jpeg", ".dng", ".mp4", ".mov", ".lrf"}
TELEM_EXT = {".srt", ".dat", ".txt", ".bin"}

class Tee:
    def __init__(self, *streams):
        self.streams = streams
    def write(self, data: str):
        for s in self.streams:
            try:
                s.write(data)
            except Exception:
                pass
    def flush(self):
        for s in self.streams:
            try:
                s.flush()
            except Exception:
                pass

_TEE_FILE = None

def setup_log_mirror():
    """Mirror console output to logs/ingest.log as per workflow spec."""
    global _TEE_FILE
    LOGS.mkdir(parents=True, exist_ok=True)
    _TEE_FILE = open(LOGS / "ingest.log", "a", encoding="utf-8")
    sys.stdout = Tee(sys.__stdout__, _TEE_FILE)
    sys.stderr = Tee(sys.__stderr__, _TEE_FILE)

def volumes_listing():
    vols = Path("/Volumes")
    if not vols.exists():
        return []
    try:
        return sorted([p.name for p in vols.iterdir()])
    except Exception:
        return []

def print_volumes():
    names = volumes_listing()
    if names:
        print("/Volumes -> " + ", ".join(f"/Volumes/{n}" for n in names))
    else:
        print("/Volumes -> (none)")

def sha256_of(p: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(chunk_size)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def should_skip(src: Path, dst: Path) -> bool:
    """Skip copy if destination exists and size+sha256 match."""
    try:
        if not dst.exists():
            return False
        if src.stat().st_size != dst.stat().st_size:
            return False
        return sha256_of(src) == sha256_of(dst)
    except Exception:
        return False

def classify_bucket(p: Path) -> str:
    ext = p.suffix.lower()
    if ext in MEDIA_EXT: return "media"
    if ext in TELEM_EXT: return "telemetry"
    return "misc"

def file_ts(p: Path):
    try:
        return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)

def detect_device(mount_point: Path):
    entries = {p.name for p in mount_point.iterdir() if p.is_dir() or p.is_file()}
    for device, markers in SIGNATURES.items():
        if any(marker in entries for marker in markers):
            return device
    return None

def find_sd_cards():
    vols = Path("/Volumes")
    if not vols.exists(): return []
    return [p for p in vols.iterdir() if p.is_dir()]

def gather_files(root: Path):
    all_files = []
    for base, _, files in os.walk(root):
        for name in files:
            full = Path(base) / name
            try:
                if full.is_file(): all_files.append(full)
            except Exception: continue
    return all_files

def cluster_by_time(records, gap_minutes):
    if not records: return []
    recs = sorted(records, key=lambda r: r["timestamp"])
    clusters, cur = [], [recs[0]]
    gap = timedelta(minutes=gap_minutes)
    for r in recs[1:]:
        if r["timestamp"] - cur[-1]["timestamp"] > gap:
            clusters.append(cur); cur = [r]
        else:
            cur.append(r)
    clusters.append(cur)
    return clusters

def copy_or_move(src: Path, dst: Path, mode: str, counter: dict, checksums_fh=None):
    dst.parent.mkdir(parents=True, exist_ok=True)

    if should_skip(src, dst):
        print(f"[INFO] Skip (exists, same size+hash): {dst}")
    else:
        if mode == "move":
            shutil.move(str(src), str(dst))
        else:
            shutil.copy2(str(src), str(dst))
        if checksums_fh is not None:
            try:
                digest = sha256_of(dst)
                checksums_fh.write(f"{digest}  {dst}\n")
                checksums_fh.flush()
            except Exception:
                pass

    counter["done"] += 1
    now = time.time()
    if (
        counter["done"] % 10 == 0
        or counter["done"] == counter["total"]
        or now - counter.get("last_time", 0) >= 10
    ):
        print(f"[INFO] Copied {counter['done']} of {counter['total']} files")
        counter["last_time"] = now

def run_test(device_override=None):
    cards = find_sd_cards()
    results = []

    if cards:
        for c in cards:
            dev = detect_device(c) if not device_override else device_override
            if not dev:
                continue
            files = gather_files(c)
            results.append({
                "device": dev,
                "mount_point": str(c),
                "file_count": len(files),
                "sample": [str(f.relative_to(c)) for f in files[:5]]
            })

    if not results:
        print("No recognizable DJI cards detected.")
        print_volumes()
        sys.exit(2)

    print(json.dumps({"status": "READY", "cards": results}, indent=2))
    sys.exit(0)

def run_ingest(project_name, mode, gap, device_override=None, dest_root: Path = OUTPUT):
    cards = find_sd_cards()

    all_records = []
    if cards:
        for c in cards:
            dev = detect_device(c) if not device_override else device_override
            if not dev:
                continue
            files = gather_files(c)
            for p in files:
                all_records.append({
                    "device": dev,
                    "path": p,
                    "bucket": classify_bucket(p),
                    "timestamp": file_ts(p),
                    "mount_point": str(c)
                })

    if not all_records:
        print("No recognizable DJI cards detected.")
        print_volumes()
        sys.exit(2)

    clusters = cluster_by_time(all_records, gap)
    if not clusters:
        clusters = [all_records]

    now_local = datetime.now()
    run_dir = dest_root / (now_local.strftime("%Y-%m-%d_%H%M%S") + f"_{project_name}")
    run_dir.mkdir(parents=True, exist_ok=True)

    media_root = run_dir / "media"
    telemetry_root = run_dir / "telemetry"
    misc_root = run_dir / "misc"
    summary_path = run_dir / "resolve_manifest.csv"

    bucket_root_map = {
        "media": media_root,
        "telemetry": telemetry_root,
        "misc": misc_root,
    }

    manifest = {
        "run": {
            "created_local": now_local.isoformat(timespec="seconds"),
            "project_name": project_name,
            "mode": mode,
            "dest_root": str(dest_root),
            "layout": "resolve",
            "flight_gap_minutes": gap,
        },
        "flights": []
    }

    total_files = len(all_records)
    counter = {"done": 0, "total": total_files, "last_time": time.time()}

    checksums_path = run_dir / "checksums.txt"
    with open(checksums_path, "a", encoding="utf-8") as chksum_fh, \
         open(summary_path, "w", encoding="utf-8", newline="") as summary_fh:
        summary_writer = csv.writer(summary_fh)
        summary_writer.writerow(["flight_id", "device", "bucket", "dest_rel", "timestamp", "source"])

        for i, cluster in enumerate(clusters, start=1):
            fid = f"flight_{i:03d}"
            moved = []
            for r in cluster:
                bucket_root = bucket_root_map.get(r["bucket"], misc_root) / r["device"]
                dst = bucket_root / r["path"].name
                copy_or_move(r["path"], dst, mode, counter, checksums_fh=chksum_fh)
                dest_rel = str(dst.relative_to(run_dir))
                entry = {
                    "device": r["device"],
                    "bucket": r["bucket"],
                    "src": str(r["path"]),
                    "dst": str(dst),
                    "dest_rel": dest_rel,
                    "timestamp": r["timestamp"].isoformat()
                }
                moved.append(entry)
                summary_writer.writerow([fid, entry["device"], entry["bucket"], entry["dest_rel"], entry["timestamp"], entry["src"]])
            manifest["flights"].append({
                "flight_id": fid,
                "mode": "telemetry_anchored" if any(r["bucket"] == "telemetry" for r in cluster) else "media_only",
                "start": min(x["timestamp"] for x in cluster).isoformat(),
                "end":   max(x["timestamp"] for x in cluster).isoformat(),
                "count": len(cluster),
                "files": [
                    {
                        "device": entry["device"],
                        "bucket": entry["bucket"],
                        "src": entry["src"],
                        "dst": entry["dst"],
                        "dest_rel": entry["dest_rel"],
                        "timestamp": entry["timestamp"],
                    }
                    for entry in moved
                ]
            })

    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[INFO] Resolve manifest CSV: {summary_path}")
    with (LOGS / "ingest.log").open("a") as lf:
        lf.write(f'{now_local.isoformat()} | run={run_dir.name} flights={len(manifest["flights"])} files={sum(f["count"] for f in manifest["flights"])}\n')

    print(f"[DONE] Ingest complete: {run_dir}")

def main():
    import argparse
    setup_log_mirror()

    parser = argparse.ArgumentParser(description="Hybrid DJI ingest")
    parser.add_argument("--test", action="store_true", help="Detect cards and show counts only")
    parser.add_argument("--project-name", default="Ingest")
    parser.add_argument("--mode", choices=["copy", "move"], default="copy")
    parser.add_argument("--gap", type=int, default=10, help="Minutes gap between flights")
    parser.add_argument("--device", choices=["DRONE_SD", "GOGGLES3", "RC2"],
                        help="Force device type (override auto-detect)")
    parser.add_argument("--dest", default=str(OUTPUT), help="Destination root for output (e.g., /Volumes/NVME/ingests)")
    args = parser.parse_args()

    if args.test:
        run_test(args.device)
    else:
        dest_root = Path(args.dest).expanduser()
        dest_root.mkdir(parents=True, exist_ok=True)
        run_ingest(args.project_name, args.mode, args.gap, args.device, dest_root)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
