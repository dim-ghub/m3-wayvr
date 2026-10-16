#!/usr/bin/env python3
"""Renders the layouts to transparent PNGs in renders/.

Uses WayVR's uidev testbed with render/uidev-offscreen.patch applied (against
WayVR v26.8.0). The patch adds an offscreen mode that draws the layout into an
image and saves it as a PNG (uidev still opens a window for a moment to get a
Vulkan device), loads .json palettes, and reads ROUND (ui_round_multiplier).

    git clone --branch v26.8.0 https://github.com/wayvr-org/wayvr && cd wayvr
    git apply /path/to/m3-wayvr/render/uidev-offscreen.patch
    for d in edit icons keyboard watch; do cp -rn wayvr/src/assets/$d uidev/assets/; done
    cargo build -p uidev
    UIDEV=$PWD/target/debug/uidev python3 /path/to/m3-wayvr/render/render.py
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "renders"
UIDEV = os.environ.get("UIDEV") or sys.exit("set UIDEV to the patched uidev binary")
SCALE = os.environ.get("RENDER_SCALE", "2")
MARGIN = 24  # px of transparent border kept around the trimmed render

# (output name, layout, palette); "caelestia" = palette synced from the current wallpaper
SHOTS = [
    ("watch", "watch", "caelestia"),
    ("keyboard", "keyboard", "caelestia"),
    ("toast", "toast", "caelestia"),
    ("watch-violet", "watch", "m3-expressive-violet-dark.json"),
    ("watch-coral", "watch", "m3-expressive-coral-dark.json"),
]


def trim(path: Path):
    """Drop the layouts' built-in padding (tooltip/gaze room), keep a small margin."""
    img = Image.open(path)
    content = img.crop(img.getchannel("A").getbbox())
    out = Image.new("RGBA", (content.width + 2 * MARGIN, content.height + 2 * MARGIN), (0, 0, 0, 0))
    out.paste(content, (MARGIN, MARGIN))
    out.save(path)


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        theme = tmp / "theme"
        subprocess.run([sys.executable, ROOT / "render/prepare.py", theme], check=True, stdout=subprocess.DEVNULL)
        caelestia = tmp / "caelestia.json"
        caelestia.write_bytes(subprocess.check_output(["bun", ROOT / "sync-caelestia.ts", "--print"]))

        for name, layout, palette in SHOTS:
            out = OUT / f"{name}.png"
            pal = caelestia if palette == "caelestia" else ROOT / "palettes" / palette
            env = dict(os.environ, TESTBED=f"gui/{layout}.xml", PALETTE=str(pal), ROUND="2.0",
                       RENDER_PNG=str(out), RENDER_SCALE=SCALE, RUST_LOG="error")
            subprocess.run([UIDEV], cwd=theme, env=env, check=True, timeout=60,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            trim(out)
            print(out.relative_to(ROOT), Image.open(out).size)


if __name__ == "__main__":
    main()
