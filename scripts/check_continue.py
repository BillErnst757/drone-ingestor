#!/usr/bin/env python3
import os, re, sys, textwrap

repo_cfg = os.path.expanduser("~/code/drone-ingestor/.continue/config.yaml")
global_cfg = os.path.expanduser("~/.continue/config.yaml")

def read(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None

repo_txt = read(repo_cfg)
glob_txt = read(global_cfg)

def line(msg): print(msg)
def ok(msg): line(f"[OK] {msg}")
def err(msg): line(f"[ERROR] {msg}")

line("== Continue Config Check ==")
line(f"Repo config:   {repo_cfg}")
line(f"Global config: {global_cfg}")
line("")

# Repo config checks
if repo_txt is None:
    err("Repo-level .continue/config.yaml is missing.")
else:
    ok("Repo-level .continue/config.yaml exists.")
    if "apiKey:" in repo_txt:
        err("Repo config contains an apiKey (should NOT contain secrets).")
    else:
        ok("Repo config contains NO apiKey (good).")

# Global config checks
if glob_txt is None:
    err("Global ~/.continue/config.yaml is missing (should hold your API key).")
else:
    ok("Global ~/.continue/config.yaml exists.")
    has_key = "apiKey:" in glob_txt
    if not has_key:
        err("Global config has NO apiKey. Add your OpenAI key there.")
    else:
        masked = re.sub(r"(apiKey:\s*)(sk-[^\s]+)", r"\1sk-****", glob_txt)
        ok("Global config includes an apiKey (masked preview below).")
        sample = "\n".join([ln for ln in masked.splitlines() if "apiKey:" in ln][:1])
        line(f"  {sample}")

line("")
line("Next:")
line("  1) In VS Code, open the Continue panel and select 'Local Agent'.")
line("  2) Run a quick prompt to confirm responses are working.")
line("  3) If you see auth errors, ensure the apiKey is ONLY in ~/.continue/config.yaml.")