#!/usr/bin/env bash
# Regenerate the seven narration lines at a chosen speed.
#
# The bundled audio.mjs forwards `speed` into its request object, but the kokoro
# path it delegates to does not consume it, so a 30s cut kept coming out at 36s.
# Driving `hyperframes tts` directly is the only way to actually set the rate.
set -euo pipefail

SPEED="${1:-1.25}"
HERE="$(cd "$(dirname "$0")" && pwd)"

export HYPERFRAMES_PYTHON="${HYPERFRAMES_PYTHON:?set HYPERFRAMES_PYTHON to a python with kokoro-onnx}"
export ESPEAK_DATA_PATH="${ESPEAK_DATA_PATH:?set ESPEAK_DATA_PATH to the espeak-ng data dir}"

python3 - "$HERE/SCRIPT.md" "$HERE" "$SPEED" <<'PY'
import re, subprocess, sys, pathlib

script, here, speed = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
out = pathlib.Path(here) / "assets" / "voice"
out.mkdir(parents=True, exist_ok=True)

text = script.read_text()
lines = re.findall(r"^## Line \d+ .*?\(Frame (\d+)\).*?^\s{4}(.+?)$", text, re.M | re.S)
if not lines:
    sys.exit("no spoken lines parsed from SCRIPT.md")

for frame, spoken in lines:
    spoken = " ".join(spoken.split())
    dest = out / f"{int(frame):02d}.wav"
    print(f"  line {frame}: {spoken[:52]}…", flush=True)
    subprocess.run(
        ["npx", "hyperframes", "tts", spoken, "--voice", "am_michael",
         "--speed", speed, "-o", str(dest)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

import wave
total = 0.0
for f in sorted(out.glob("*.wav")):
    w = wave.open(str(f))
    d = w.getnframes() / w.getframerate()
    total += d
    print(f"    {f.name}: {d:.2f}s")
print(f"  total {total:.2f}s")
PY
